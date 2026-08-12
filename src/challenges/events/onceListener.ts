import type { ChallengeContent } from '@/types/challenge';

import { createRecorder, requireElement } from './support';

type ArmOnce = (button: HTMLElement, onFirst: () => void) => void;

export const onceListener: ChallengeContent = {
  prompt: [
    'A Place order button. An impatient double-click must not place two orders.',
    '',
    'Export `armOnce(button, onFirst)`. The next click on `button` calls `onFirst`; every click',
    'after that calls nothing.',
    '',
    'Three things that follow from "arm", and that the tests check:',
    '',
    '- **arming twice arms twice.** Two `armOnce` calls before any click mean both callbacks run on',
    '  that click, and neither runs on the next one.',
    '- **it can be re-armed.** After a click has spent an arming, a fresh `armOnce` works again.',
    '- **it is not a reset button.** Other listeners on that element are none of your business and',
    '  must keep firing on every click.',
    '',
    'The starter forgets the "once" part entirely, which is what a rushed fix for a double-submit',
    'bug usually looks like.',
  ].join('\n'),
  html: ['<div id="panel">', '  <button id="place" type="button">Place order</button>', '</div>'].join('\n'),
  starterCode: [
    'export function armOnce(button: HTMLElement, onFirst: () => void): void {',
    "  button.addEventListener('click', () => onFirst());",
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'the callback runs on the first click and on no other',
      run: ({ doc, fire, fn, expect }) => {
        const place = requireElement(doc, 'place');
        const placed = createRecorder<string>();
        fn<ArmOnce>('armOnce')(place, () => placed.record('order'));

        fire.click(place);
        fire.click(place);
        fire.click(place);

        expect(placed.entries).toEqual(['order']);
      },
    },
    {
      name: 'two armings before a click are two armings',
      run: ({ doc, fire, fn, expect }) => {
        const place = requireElement(doc, 'place');
        const placed = createRecorder<string>();
        const armOnce = fn<ArmOnce>('armOnce');

        armOnce(place, () => placed.record('first'));
        armOnce(place, () => placed.record('second'));

        fire.click(place);
        // A module-level "have we fired yet" flag is shared by every arming, so it lets the first
        // callback through and swallows the second -- for ever, on every button in the page.
        expect(placed.entries).toEqual(['first', 'second']);

        fire.click(place);
        expect(placed.entries).toEqual(['first', 'second']);
      },
    },
    {
      name: 'a spent arming can be replaced by a new one',
      run: ({ doc, fire, fn, expect }) => {
        const place = requireElement(doc, 'place');
        const placed = createRecorder<string>();
        const armOnce = fn<ArmOnce>('armOnce');

        armOnce(place, () => placed.record('order'));
        fire.click(place);
        fire.click(place);
        expect(placed.entries).toEqual(['order']);

        // Nothing about the button is permanently spent. A `WeakSet` of already-armed buttons, or
        // any flag that is never cleared, refuses this second arming and reports the same one
        // order.
        armOnce(place, () => placed.record('order'));
        fire.click(place);
        fire.click(place);

        expect(placed.entries).toEqual(['order', 'order']);
      },
    },
    {
      name: 'the button’s other listeners go on working',
      run: ({ doc, fire, fn, expect }) => {
        const place = requireElement(doc, 'place');
        const log = createRecorder<string>();

        // Registered by the test, before and after the arming, so an answer that clears the
        // element's listeners -- or that assigns `onclick` -- loses one of them either way.
        place.addEventListener('click', () => log.record('analytics'));
        fn<ArmOnce>('armOnce')(place, () => log.record('order'));
        place.addEventListener('click', () => log.record('ripple'));

        fire.click(place);
        fire.click(place);

        expect(log.entries).toEqual(['analytics', 'order', 'ripple', 'analytics', 'ripple']);
      },
    },
  ],
  solutions: [
    {
      label: 'The once option',
      code: [
        'export function armOnce(button: HTMLElement, onFirst: () => void): void {',
        "  button.addEventListener('click', () => onFirst(), { once: true });",
        '}',
        '',
      ].join('\n'),
      explanation: [
        '`{ once: true }` tells the platform to **remove the registration after it fires**. Not to skip',
        'the call — to remove it. That distinction is the whole reason to prefer it over a flag.',
        '',
        'It falls out correctly for each requirement:',
        '',
        '- **Arming twice arms twice**, because each call registers a distinct arrow function and each',
        '  registration carries its own `once`. They are two registrations that happen to look alike.',
        '- **Re-arming works**, because there is nothing left after the first one fired. A new',
        '  `addEventListener` is a new registration; the button holds no memory of having been armed.',
        '- **Other listeners are untouched**, because removal is per registration, not per element.',
        '',
        'Per the spec the removal happens **before the callback runs**, which matters more than it',
        'sounds: if `onFirst` throws, or if it dispatches another click at the same button, the',
        'registration is already gone and cannot fire again. A hand-rolled `removeEventListener` at',
        'the *end* of the handler has a window where both are true.',
        '',
        'The throwing half holds everywhere. The re-entrant half is the one place this project cannot',
        'test what it teaches: the engine the automated checks run on invokes the callback first and',
        'removes afterwards, so a `once` listener that re-dispatches its own event **fires twice**',
        'there and once in a browser. Nothing on this page asserts it for that reason, and the same',
        'gap is why "remove yourself *after* calling `onFirst`" — the alternative solution written the',
        'wrong way round — passes every test here. It is still wrong, and the browser you are reading',
        'this in is where it shows.',
        '',
        '`once` sits alongside the other two registration options and composes with them:',
        '`{ once: true, capture: true }` fires once in the capture phase; `{ once: true, signal }` is',
        'removed by whichever comes first, the click or the abort.',
      ].join('\n'),
      tradeoffs: [
        'This is the right answer for anything genuinely one-shot: a `transitionend` you are waiting',
        'for, a first-interaction unlock (audio playback, a lazy import), a `load` on an image, a',
        'confirm-dialog button.',
        '',
        'A per-arming `let spent = false` guard passes every test on this page, because "the listener',
        'was removed" and "the listener ran and returned early" are indistinguishable from outside.',
        'It is still the wrong answer: the registration stays for the life of the element, holding its',
        'closure and everything the closure captured, and it runs on every click for ever. One of',
        'those is a rounding error and a thousand is a leak nobody can find without a profiler.',
        '',
        'The limit is that `once` counts **dispatches, not decisions**. It is spent by the first event',
        'that reaches the listener, whatever the listener then decides:',
        '',
        '```js',
        '// Wrong: the first click anywhere spends the arming.',
        "form.addEventListener('click', (e) => {",
        "  if (e.target.closest('.submit')) placeOrder();",
        '}, { once: true });',
        '```',
        '',
        'Where the handler filters, `once` is the wrong tool and removing yourself — the alternative',
        'below — is the right one, because only the handler knows whether this was the event it was',
        'waiting for.',
        '',
        'Two more edges worth knowing:',
        '',
        '- **A duplicate registration does not update the options.** Registering the same function for',
        '  the same type and phase a second time is ignored entirely, so adding it again *without*',
        '  `once` does not clear the `once` that is already there.',
        '- **`once` is not a debounce.** Two clicks 20 ms apart and two clicks a week apart are the',
        '  same to it. For "not more than once per second", you want a timestamp or a disabled button —',
        '  and for a real double-submit guard, disabling the button is what tells the *user* something',
        'happened, which no listener option can do.',
      ].join('\n'),
    },
    {
      label: 'Remove yourself from inside the handler',
      code: [
        'export function armOnce(button: HTMLElement, onFirst: () => void): void {',
        '  const listener = (): void => {',
        "    button.removeEventListener('click', listener);",
        '    onFirst();',
        '  };',
        '',
        "  button.addEventListener('click', listener);",
        '}',
        '',
      ].join('\n'),
      explanation: [
        'What `once` does, written out — and the reason to know how is that writing it out is the only',
        'way to make the removal **conditional**.',
        '',
        'The named `const listener` is doing the work that makes this possible at all: the handler needs',
        'to name itself, and an anonymous arrow passed straight to `addEventListener` cannot. (A',
        'function *declaration* could use its own name; an arrow assigned to a `const` refers to the',
        'binding, which is initialised by the time any click can happen.)',
        '',
        'The order of the two lines is deliberate. Removing **before** calling `onFirst` is what makes',
        'this equivalent to `once` as the spec defines it:',
        '',
        '- if `onFirst` throws, the listener is already gone;',
        '- if `onFirst` dispatches another click at this button, it does not re-enter;',
        '- if `onFirst` is slow, nothing queues up behind it.',
        '',
        'Written the other way round, every one of those becomes a bug that needs a specific',
        'reproduction to find — and, on the engine behind this project’s automated checks, one that',
        'no test here can catch, because that engine does not remove a `once` registration before',
        'invoking it either. The two orders are only distinguishable in a browser.',
      ].join('\n'),
      tradeoffs: [
        'Prefer `once` whenever "the first event" is the whole condition: it is one word, it cannot be',
        'written in the wrong order, and there is no reference to keep.',
        '',
        'Prefer this shape when the handler has to **decide**:',
        '',
        '```js',
        'const listener = (event) => {',
        "  const submit = event.target.closest('.submit');",
        '  if (!submit) return;              // not the event we were waiting for',
        "  button.removeEventListener('click', listener);",
        '  placeOrder();',
        '};',
        '```',
        '',
        'That is not expressible with `once` at all, and it is the common case for a delegated one-shot',
        '— waiting for the first click *on something specific*, the first `transitionend` for a',
        '*particular* property, the first `message` with a matching id.',
        '',
        'The costs are the ones the previous challenge is about: a reference to keep, a type string',
        'written twice, and a capture flag that has to agree with itself. Get any of them wrong and the',
        'removal silently does nothing, which here means the handler fires for ever — the exact bug',
        'this challenge exists to prevent, reintroduced by the fix for it.',
      ].join('\n'),
    },
  ],
};
