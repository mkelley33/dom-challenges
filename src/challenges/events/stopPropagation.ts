import type { ChallengeContent } from '@/types/challenge';

import type { Recorder } from './support';
import { createRecorder, requireElement, requireInput } from './support';

type Stopper = (event: Event) => void;

/** Just the two halves of the harness context these tests dispatch through. */
interface ClickContext {
  doc: Document;
  win: Window & typeof globalThis;
}

/**
 * Wires the listeners the challenge is graded against, in a fixed order, and returns the log.
 *
 * **Every listener here belongs to the test.** The whole subject is which of *other people's*
 * handlers a stop reaches, so submitted code that installed them could pass by installing fewer.
 * The order is the point too: `stop` is called from the second of three listeners on `#more`, so
 * the log distinguishes "ran before the stop" from "ran after it" from "never ran".
 */
function wireListeners(ctx: ClickContext, stop: Stopper): Recorder<string> {
  const log = createRecorder<string>();
  const page = requireElement(ctx.doc, 'page');
  const more = requireElement(ctx.doc, 'more');

  // Runs on the way down, before anything below it. Its entry is the positive control: it proves
  // the click was really dispatched, so an otherwise-empty log cannot be read as "nothing happened".
  page.addEventListener('click', () => log.record('page-capture'), true);
  more.addEventListener('click', () => log.record('more-first'));
  more.addEventListener('click', (event) => {
    log.record('more-stops');
    stop(event);
  });
  more.addEventListener('click', () => log.record('more-last'));
  page.addEventListener('click', () => log.record('page-bubble'));

  return log;
}

/** Dispatches a cancelable click and hands back what `dispatchEvent` made of it. */
function clickAndAsk(ctx: ClickContext, target: Element): { returned: boolean; defaultPrevented: boolean } {
  const event = new ctx.win.MouseEvent('click', { bubbles: true, cancelable: true });
  const returned = target.dispatchEvent(event);
  return { returned, defaultPrevented: event.defaultPrevented };
}

export const stopPropagation: ChallengeContent = {
  prompt: [
    'Two requests that sound the same and are not.',
    '',
    'Export two functions, each called from inside somebody else’s click listener:',
    '',
    '- `swallow(event)` — nothing else reacts to this click. Not the other handlers on the element',
    '  it is on, not anything above it.',
    '- `keepToThisElement(event)` — the element’s **own** handlers all still run; nothing above it',
    '  hears about the click at all.',
    '',
    'Neither may cancel the browser’s default action for the event. A click that lands on a checkbox',
    'still ticks it.',
    '',
    'The tests own every listener. `#more` carries three of them, and yours is called from the',
    'middle one, so the log says exactly who ran before it, who ran after it, and who never ran.',
    '',
    'The starter gives both functions the same body, which is how most people remember this API.',
  ].join('\n'),
  html: [
    '<div id="page">',
    '  <div id="row">',
    '    <button id="more" type="button">More</button>',
    '    <input id="pick" type="checkbox">',
    '  </div>',
    '</div>',
  ].join('\n'),
  starterCode: [
    'export function swallow(event: Event): void {',
    '  event.stopPropagation();',
    '}',
    '',
    'export function keepToThisElement(event: Event): void {',
    '  event.stopPropagation();',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'swallow silences the rest of the element’s own listeners as well as the ancestors',
      run: ({ doc, win, fire, fn, expect }) => {
        const log = wireListeners({ doc, win }, fn<Stopper>('swallow'));

        fire.click(requireElement(doc, 'more'));

        // `more-last` is the entry that separates the two APIs. It is registered on the same
        // element as the listener that stopped, and it has not run yet at the moment of the call.
        expect(log.entries).toEqual(['page-capture', 'more-first', 'more-stops']);
      },
    },
    {
      name: 'keepToThisElement lets the element finish and stops there',
      run: ({ doc, win, fire, fn, expect }) => {
        const log = wireListeners({ doc, win }, fn<Stopper>('keepToThisElement'));

        fire.click(requireElement(doc, 'more'));

        expect(log.entries).toEqual(['page-capture', 'more-first', 'more-stops', 'more-last']);
      },
    },
    {
      name: 'neither one cancels the default action',
      run: ({ doc, win, fn, expect }) => {
        const pick = requireInput(doc, 'pick');
        const swallow = fn<Stopper>('swallow');
        const keepToThisElement = fn<Stopper>('keepToThisElement');

        pick.addEventListener('click', (event) => swallow(event), { once: true });
        const first = clickAndAsk({ doc, win }, pick);
        // Ticking the box is the *default action* for a click on a checkbox, and it is a different
        // axis from propagation entirely. Stopping the event's travel says nothing about it.
        expect(pick.checked).toBe(true);

        pick.addEventListener('click', (event) => keepToThisElement(event), { once: true });
        const second = clickAndAsk({ doc, win }, pick);
        expect(pick.checked).toBe(false);

        // `dispatchEvent` answers "was the default left alone", and it is the only thing that does.
        expect([first.returned, second.returned]).toEqual([true, true]);
        expect([first.defaultPrevented, second.defaultPrevented]).toEqual([false, false]);
      },
    },
    {
      name: 'called on the way down, swallow stops the target from ever seeing the click',
      run: ({ doc, fire, fn, expect }) => {
        const log = createRecorder<string>();
        const page = requireElement(doc, 'page');
        const more = requireElement(doc, 'more');

        page.addEventListener(
          'click',
          (event) => {
            log.record('capture-stops');
            fn<Stopper>('swallow')(event);
          },
          true,
        );
        page.addEventListener('click', () => log.record('capture-last'), true);
        more.addEventListener('click', () => log.record('more'));

        fire.click(more);

        // A stop in the capture phase is the strong one: the event never reaches the target, so the
        // element's own handler does not run. `capture-last` is on the same element as the stopper
        // and is silenced too -- which is the same distinction as the first test, one pass earlier.
        expect(log.entries).toEqual(['capture-stops']);
      },
    },
    {
      name: 'called on the way down, keepToThisElement leaves the rest of that element’s pass alone',
      run: ({ doc, fire, fn, expect }) => {
        const log = createRecorder<string>();
        const page = requireElement(doc, 'page');
        const more = requireElement(doc, 'more');

        page.addEventListener(
          'click',
          (event) => {
            log.record('capture-stops');
            fn<Stopper>('keepToThisElement')(event);
          },
          true,
        );
        page.addEventListener('click', () => log.record('capture-last'), true);
        more.addEventListener('click', () => log.record('more'));

        fire.click(more);

        // The target still never sees it -- `#more` is further along the path than `#page` on the
        // way down -- but `#page`'s own second capture listener does.
        expect(log.entries).toEqual(['capture-stops', 'capture-last']);
      },
    },
  ],
  solutions: [
    {
      label: 'stopImmediatePropagation and stopPropagation',
      code: [
        'export function swallow(event: Event): void {',
        '  event.stopImmediatePropagation();',
        '}',
        '',
        'export function keepToThisElement(event: Event): void {',
        '  event.stopPropagation();',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'An event walks a **path** of objects, and each object has a **list** of listeners for that',
        'type. The two methods stop different things:',
        '',
        '- **`stopPropagation()`** ends the walk after the current object. Every listener already',
        '  registered on *this* object still runs; nothing further along the path does.',
        '- **`stopImmediatePropagation()`** ends the walk *and* the current object’s list, right where',
        '  it is. The listeners after yours on the same element never run.',
        '',
        'Neither is retroactive. Listeners that already ran have already run — `more-first` is in the',
        'log in both tests, and there is no method that could remove it.',
        '',
        'Called from a **capture** listener, either one stops the target’s own handlers, because the',
        'target is further along the path than an ancestor on the way down. That is why the fourth test',
        'shows the same distinction one pass earlier: `stopImmediatePropagation` from `#page`’s capture',
        'listener silences `#page`’s *other* capture listener too, while `stopPropagation` does not.',
        '',
        'And neither has anything to do with the default action. Propagation is "who gets told";',
        '`preventDefault` is "does the browser do its thing". A click on a checkbox that no listener',
        'ever hears about still ticks the box.',
        '',
        'One legacy spelling to recognise but not write: `event.cancelBubble = true` is an old alias',
        'for `stopPropagation()`. It still works, it is in the spec for compatibility, and it says',
        'nothing about which of the two you meant.',
      ].join('\n'),
      tradeoffs: [
        '**Reach for neither by default.** Both are ways of making the rest of the page wrong about',
        'what happened, and the bugs they cause are the hardest kind to find: something *does not*',
        'happen, somewhere else, with no error and no stack.',
        '',
        'The concrete failure is a page-level listener that never fires — "close the menu on any',
        'outside click" stops working the day a component starts stopping its own clicks, and nothing',
        'in either file mentions the other. That is exactly what the capture phase exists to work',
        'around, and it is why an audit or a global shortcut handler should capture rather than bubble.',
        '',
        'When you do need one:',
        '',
        '- **`stopPropagation` for "this is handled here".** A click inside a dropdown that must not',
        '  reach the page-level close handler. The blast radius is everything above you, which is',
        '  usually more than you were thinking about.',
        '- **`stopImmediatePropagation` almost never.** It reaches inside a single element’s listener',
        '  list and silences code that has no relationship to yours beyond sharing an element. If you',
        '  own both listeners, order-dependence between them is the real problem; if you do not, you',
        '  are breaking someone else’s feature on purpose.',
        '',
        'The alternative that avoids the whole category: **do not stop, say something instead**. Have',
        'the inner handler set a flag on the event (`event.handledByMenu = true`) or dispatch its own',
        'custom event, and let outer handlers decide for themselves. Outer code stays in control of',
        'its own behaviour, which is the property `stopPropagation` takes away.',
      ].join('\n'),
    },
    {
      label: 'A flag on the event, and nothing stopped',
      code: [
        'interface Handled extends Event {',
        '  handledBy?: string[];',
        '}',
        '',
        'export function swallow(event: Event): void {',
        '  event.stopImmediatePropagation();',
        '  markHandled(event, "swallow");',
        '}',
        '',
        'export function keepToThisElement(event: Event): void {',
        '  event.stopPropagation();',
        '  markHandled(event, "keep");',
        '}',
        '',
        'function markHandled(event: Event, by: string): void {',
        '  const handled: Handled = event;',
        '  handled.handledBy = [...(handled.handledBy ?? []), by];',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The same stops, plus the thing that makes them survivable: a record, on the event itself, of',
        'who claimed it.',
        '',
        'An `Event` is an ordinary object, so you can put your own property on it. Every listener on',
        'the path holds the same event object, so a note written by one is readable by all the others —',
        'it is the cheapest possible channel between handlers that do not know about each other.',
        '',
        'This is worth doing because `stopPropagation` is invisible from the outside. A handler that',
        'never ran leaves no trace at all: no error, no log, nothing to breakpoint. A flag turns "why',
        'did my listener not fire" into something you can read in the debugger, and it costs one line.',
        '',
        'The pattern generalises past this challenge. Where the outer listeners are yours too, the flag',
        'can replace the stop entirely — every listener still runs, and each one checks',
        '`event.handledBy` and decides for itself whether to act. Nothing is silenced, so nothing',
        'breaks silently.',
      ].join('\n'),
      tradeoffs: [
        'Use the flag **as well as** the stop when you are working in a codebase where propagation is',
        'stopped in more than one place. It costs nothing and it is the only breadcrumb there is.',
        '',
        'Use the flag **instead of** the stop when you own every listener involved. That inverts the',
        'control: instead of one handler deciding for everyone that the event is over, each handler',
        'decides whether it still applies. Outer code that genuinely must always run — analytics, a',
        'focus manager — keeps working.',
        '',
        'Three costs to weigh:',
        '',
        '- **It is a convention, not a mechanism.** Anything that does not check the flag ignores it,',
        '  and there is no way to make checking mandatory. A stop is enforced by the platform.',
        '- **Expando properties on platform objects are untyped and untypeable** without a declaration',
        '  merge or an interface like the one above, and two libraries can pick the same name.',
        '  `Symbol()` keys avoid collisions if you need to be careful.',
        '- **Third-party code will not play.** Where the listener you need to silence is not yours,',
        '  a stop is the only thing that works — and then the flag is documentation rather than',
        '  control.',
      ].join('\n'),
    },
  ],
};
