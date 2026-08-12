import type { ChallengeContent } from '@/types/challenge';

import type { Recorder } from './support';
import { createRecorder, requireElement } from './support';

interface RatingDetail {
  value: number;
  source: string;
}

type SetRating = (strip: HTMLElement, detail: RatingDetail) => void;

/**
 * What a listener saw, so a test can assert on the event without holding the event itself.
 *
 * `target` and `currentTarget` are kept as the objects they are rather than reduced to ids: the
 * tests compare them with `toBe` against nodes they are already holding, which is realm-safe where
 * `target instanceof Element` in this file would not be (AGENTS.md §3).
 */
interface Heard {
  type: string;
  detail: unknown;
  target: EventTarget | null;
  currentTarget: EventTarget | null;
  ratingWhenHeard: string | null;
}

/**
 * Listens for `rating-change` at `where` and records every one that arrives.
 *
 * The **test** attaches this, and it is the only listener in play: the challenge is "announce it so
 * somebody else can hear", and a challenge whose own code both fires and hears the event can agree
 * with itself while the event never leaves the element it was dispatched at.
 *
 * `ratingWhenHeard` is read from `strip` *inside* the listener rather than after the call returns,
 * which is what makes "set the state, then announce it" an assertable order rather than a style
 * note. `detail` comes through `Reflect.get` because a bare `Event` has no such member at all --
 * which is exactly the case one of the wrong answers produces.
 */
/**
 * Reads one field off whatever arrived as the detail, without assuming it is an object.
 *
 * A wrong answer can put anything there -- `undefined` from a bare `Event`, a JSON string -- and a
 * plain property access on those either throws or reads as a puzzle. Handing the value straight
 * back when it is not an object is what makes the assertion print the string that arrived.
 */
function detailField(detail: unknown, field: string): unknown {
  return typeof detail === 'object' && detail !== null ? Reflect.get(detail, field) : detail;
}

function listenFor(where: EventTarget, strip: Element, heard: Recorder<Heard>): void {
  where.addEventListener('rating-change', (event) => {
    heard.record({
      type: event.type,
      detail: Reflect.get(event, 'detail'),
      target: event.target,
      currentTarget: event.currentTarget,
      ratingWhenHeard: strip.getAttribute('data-rating'),
    });
  });
}

export const customEventDetail: ChallengeContent = {
  prompt: [
    'A star strip inside a card. When the rating changes, the rest of the page has to find out —',
    'and the page must not have to know anything about how the strip works.',
    '',
    'Export `setRating(strip, detail)`, which does two things in this order:',
    '',
    '1. writes the new value to the strip as `data-rating`;',
    '2. announces it by dispatching an event named `rating-change` **from the strip**, carrying',
    '   `detail` and reaching listeners on the strip’s ancestors.',
    '',
    'The `detail` a listener reads must be **the very object you were handed**, not a copy of it.',
    '',
    'The tests attach the listeners — on the strip, and on `#page` well above it — and then call your',
    'function. The starter dispatches something. Whether anything useful arrives is the question.',
  ].join('\n'),
  html: [
    '<div id="page">',
    '  <section id="card">',
    '    <div id="stars" class="strip" data-rating="0">',
    '      <button class="star" type="button" data-value="1">1</button>',
    '      <button class="star" type="button" data-value="2">2</button>',
    '      <button class="star" type="button" data-value="3">3</button>',
    '    </div>',
    '  </section>',
    '</div>',
  ].join('\n'),
  starterCode: [
    'export interface RatingDetail {',
    '  value: number;',
    '  source: string;',
    '}',
    '',
    'export function setRating(strip: HTMLElement, detail: RatingDetail): void {',
    "  strip.dispatchEvent(new CustomEvent('rating-change', { detail }));",
    '  strip.dataset.rating = String(detail.value);',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'a listener on the strip hears one rating-change carrying the detail',
      run: ({ doc, fn, expect }) => {
        const strip = requireElement(doc, 'stars');
        const heard = createRecorder<Heard>();
        listenFor(strip, strip, heard);

        fn<SetRating>('setRating')(strip, { value: 3, source: 'pointer' });

        // Synchronous: `dispatchEvent` runs every listener before it returns, so there is nothing
        // to await here and an empty list means the event never happened.
        expect(heard.entries).toHaveLength(1);
        expect(heard.entries[0]?.type).toBe('rating-change');
        expect(heard.entries[0]?.detail).toEqual({ value: 3, source: 'pointer' });
      },
    },
    {
      name: 'the detail a listener reads is the object that was handed in, not a copy',
      run: ({ doc, fn, expect }) => {
        const strip = requireElement(doc, 'stars');
        const heard = createRecorder<Heard>();
        listenFor(strip, strip, heard);

        const detail: RatingDetail = { value: 2, source: 'keyboard' };
        fn<SetRating>('setRating')(strip, detail);
        detail.source = 'edited after the dispatch';

        // Asked as "does the listener's detail show my edit" rather than as "is that object this
        // one". Both are the same claim, and only this one fails legibly: `toBe` between two
        // objects that compare equal prints `Expected {...} to be {...}`, which reads as a thing
        // not being itself. This prints the stale value the listener actually kept.
        expect(detailField(heard.entries[0]?.detail, 'source')).toBe('edited after the dispatch');
        // The strict backstop, reached only once the mutation has already proved the two are the
        // same object. `toEqual` could never say this: it compares own keys, and a spread copy has
        // exactly the same ones.
        expect(heard.entries[0]?.detail).toBe(detail);
      },
    },
    {
      name: 'a listener on an ancestor hears it too',
      run: ({ doc, fn, expect }) => {
        const strip = requireElement(doc, 'stars');
        const page = requireElement(doc, 'page');
        const heard = createRecorder<Heard>();
        // `#page` is two levels above the strip and has no idea the strip exists.
        listenFor(page, strip, heard);

        fn<SetRating>('setRating')(strip, { value: 1, source: 'pointer' });

        expect(heard.entries).toHaveLength(1);
        // `target` is where the event was dispatched and is the same at every listener;
        // `currentTarget` is whose listener is running. An event announced from the document
        // instead of the strip never passes through `#page` at all.
        expect(heard.entries[0]?.target).toBe(strip);
        expect(heard.entries[0]?.currentTarget).toBe(page);
      },
    },
    {
      name: 'the strip already carries the new rating by the time the listener runs',
      run: ({ doc, fn, expect }) => {
        const strip = requireElement(doc, 'stars');
        const heard = createRecorder<Heard>();
        listenFor(requireElement(doc, 'page'), strip, heard);

        fn<SetRating>('setRating')(strip, { value: 3, source: 'pointer' });

        // Read inside the listener. Because dispatch is synchronous, a listener sees exactly the
        // state that existed at the instant `dispatchEvent` was called -- announce first and every
        // listener reads the *old* value, while an assertion made after the call returns cannot
        // tell the two orders apart.
        expect(heard.entries[0]?.ratingWhenHeard).toBe('3');
        expect(strip).toHaveAttribute('data-rating', '3');
      },
    },
    {
      name: 'two changes arrive as two events, each with its own detail',
      run: ({ doc, fn, expect }) => {
        const strip = requireElement(doc, 'stars');
        const heard = createRecorder<Heard>();
        listenFor(requireElement(doc, 'page'), strip, heard);

        const setRating = fn<SetRating>('setRating');
        const first: RatingDetail = { value: 1, source: 'pointer' };
        const second: RatingDetail = { value: 3, source: 'keyboard' };
        setRating(strip, first);
        setRating(strip, second);

        // One event object built up front and re-dispatched carries whatever detail it was built
        // with, both times. Re-dispatching is legal -- it is the staleness that is the bug.
        expect(heard.entries.map((entry) => entry.detail)).toEqual([first, second]);
        expect(heard.entries.map((entry) => entry.ratingWhenHeard)).toEqual(['1', '3']);
      },
    },
  ],
  solutions: [
    {
      label: 'CustomEvent with a detail',
      code: [
        'export interface RatingDetail {',
        '  value: number;',
        '  source: string;',
        '}',
        '',
        'export function setRating(strip: HTMLElement, detail: RatingDetail): void {',
        '  strip.dataset.rating = String(detail.value);',
        "  strip.dispatchEvent(new CustomEvent<RatingDetail>('rating-change', { detail, bubbles: true }));",
        '}',
        '',
      ].join('\n'),
      explanation: [
        'Three decisions, and the starter gets all three wrong.',
        '',
        '**`CustomEvent`, not `Event`.** `detail` is not part of `EventInit`; it is `CustomEvent`’s one',
        'addition to it. `new Event("x", { detail })` is not an error — the extra key is simply ignored,',
        'because dictionary members that are not in the definition are dropped. The event dispatches',
        'happily and arrives carrying nothing, which is why the starter looks like it works.',
        '',
        '**`bubbles: true`, or nobody upstairs hears it.** Every flag on a constructed event defaults to',
        '`false`: `bubbles`, `cancelable`, `composed`. A `CustomEvent` you build and dispatch with no',
        'options reaches listeners on that element and stops there. Built-in events set their own',
        'defaults — `click` bubbles, `focus` does not — but a constructed one is exactly what you asked',
        'for and nothing else.',
        '',
        '**State first, announce second.** `dispatchEvent` is synchronous: it runs every listener on the',
        'path and only then returns. So the listeners see whatever is true at the moment you call it. A',
        'listener that reads `strip.dataset.rating` — and a rating widget’s listeners always read',
        'something — gets the old value if you announce before you write.',
        '',
        'The detail itself is passed by reference, like any other JavaScript value. Every listener gets',
        'the same object, so one listener can mutate what the next one sees, and the sender can compare',
        'it by identity afterwards.',
      ].join('\n'),
      tradeoffs: [
        'This is the standard way for a component to talk to the page, and it is worth being clear',
        'about what it buys: the listener does not have to know the component exists. Anything can',
        'listen, nothing has to be registered with the strip, and the strip holds no references to its',
        'listeners at all.',
        '',
        'Four things to decide each time:',
        '',
        '- **What goes in `detail`.** Passing the object by reference is fast and makes it a shared,',
        '  mutable channel. That is a feature for a "collect a veto" pattern and a hazard everywhere',
        '  else — a listener can change what later listeners see. `Object.freeze(detail)` costs nothing',
        '  and removes the surprise. Never put a DOM node from inside a component in there unless you',
        '  mean to expose it forever.',
        '- **Whether to bubble.** Bubbling makes the event delegatable and makes the whole page a',
        '  potential listener; a non-bubbling event is a deliberate "this is for whoever is holding',
        '  this element". Prefer non-bubbling for events that are really about the element itself.',
        '- **Whether it is `composed`.** Left `false`, the event stops at the shadow boundary — which is',
        '  usually right for a component that wants to be its own world, and wrong for something like a',
        '  `close` request the host page is meant to handle.',
        '- **Whether it is `cancelable`.** A cancelable custom event, plus checking `dispatchEvent`’s',
        '  return value, is how you let a listener veto the thing you were about to do. It only means',
        '  something if you actually check.',
        '',
        'The naming convention matters more than it looks: built-in event types are lowercase and',
        'unhyphenated (`click`, `pointerdown`), so a hyphenated custom name can never collide with a',
        'future platform event.',
      ].join('\n'),
    },
    {
      label: 'A typed Event subclass',
      code: [
        'export interface RatingDetail {',
        '  value: number;',
        '  source: string;',
        '}',
        '',
        'export class RatingChangeEvent extends Event {',
        '  readonly detail: RatingDetail;',
        '',
        '  constructor(detail: RatingDetail) {',
        "    super('rating-change', { bubbles: true });",
        '    this.detail = detail;',
        '  }',
        '}',
        '',
        'export function setRating(strip: HTMLElement, detail: RatingDetail): void {',
        '  strip.dataset.rating = String(detail.value);',
        '  strip.dispatchEvent(new RatingChangeEvent(detail));',
        '}',
        '',
      ].join('\n'),
      explanation: [
        '`Event` is an ordinary class, and `dispatchEvent` takes any instance of it. So a component can',
        'ship its own event type with its own fields, instead of packing everything into a bag called',
        '`detail`.',
        '',
        'What that changes:',
        '',
        '- **The type name lives in one place.** `super("rating-change", …)` is written once instead of',
        '  at every dispatch site, so the string cannot drift.',
        '- **The payload is named.** `event.value` and `event.source` read better than',
        '  `event.detail.value`, and a consumer in TypeScript gets them without a cast or a generic',
        '  parameter — `CustomEvent<T>`’s type argument is erased at run time and is only as true as the',
        '  person who wrote it.',
        '- **Extra fields are natural.** A `preventDefault`-style veto, a timestamp, a method — anything',
        '  a class can carry, this event can carry.',
        '',
        'This is what the platform’s own events are: `MouseEvent`, `SubmitEvent` and `PointerEvent` are',
        'all `Event` subclasses with named fields, and none of them has a `detail` bag.',
      ].join('\n'),
      tradeoffs: [
        'Reach for this when the event is part of a component’s **published interface** — a design',
        'system control, a library, anything with consumers you do not control. The class is the',
        'documentation, and it is importable.',
        '',
        'Three real costs:',
        '',
        '- **The consumer needs the class to get the types**, which means an import, which means the',
        '  event is no longer a purely stringly-typed contract. That coupling is the point, and it is',
        '  still coupling.',
        '- **`instanceof` is not a safe check on the receiving end.** Two copies of your library, or an',
        '  event that crossed an iframe boundary, give you an object that behaves right and fails',
        '  `instanceof`. Check `event.type` instead — which is what you would have done with',
        '  `CustomEvent` anyway.',
        '- **Everyone expects `detail`.** Tooling, tutorials and existing listeners all reach for it, so',
        '  a subclass that omits it surprises people. The version above keeps a `detail` field for',
        '  exactly that reason; a subclass with only `value` would fail this challenge’s tests and',
        '  annoy real users in the same way.',
        '',
        'For a one-off event inside an application you own, `CustomEvent` is less machinery for the',
        'same result. The subclass earns its keep at a boundary.',
      ].join('\n'),
    },
  ],
};
