import type { ChallengeContent } from '@/types/challenge';

import { createRecorder, requireElement, requireInput } from './support';

type TryCancel = (event: Event) => boolean;

/** Everything one dispatch is asked about, including whether the listener ran at all. */
interface Outcome {
  ran: boolean;
  reported: unknown;
  returned: boolean;
  defaultPrevented: boolean;
}

/**
 * Registers one listener on `target`, calls the submitted function from inside it, and reports
 * every answer the platform gives back about that dispatch.
 *
 * **The listener and its options belong to the test.** `passive` is a property of the
 * *registration*, not of the event or of the handler, so it is not something submitted code can
 * choose or detect -- which is the whole point of the third test.
 *
 * `ran` is the positive control. Without it a `reported` of `undefined` would be ambiguous between
 * "the function returned nothing" and "the listener never fired", and the second is not something
 * a test asserting on an absence may leave open (AGENTS.md §5).
 */
function cancelDuring(
  target: EventTarget,
  event: Event,
  tryCancel: TryCancel,
  options?: AddEventListenerOptions,
): Outcome {
  let ran = false;
  let reported: unknown;

  const listener = (received: Event): void => {
    ran = true;
    reported = tryCancel(received);
  };

  target.addEventListener(event.type, listener, options);
  const returned = target.dispatchEvent(event);
  target.removeEventListener(event.type, listener, options);

  return { ran, reported, returned, defaultPrevented: event.defaultPrevented };
}

export const preventDefault: ChallengeContent = {
  prompt: [
    'Export `tryCancel(event)`. It must cancel the browser’s default action for `event`, and return',
    '`true` only if the cancellation **actually took effect**.',
    '',
    'There are three ways a cancellation silently does nothing, and the tests use all three:',
    '',
    '- the event was constructed with `cancelable: false`;',
    '- the listener you are running inside was registered as `passive`, which is a property of the',
    '  registration and nothing you can see from the event;',
    '- you never cancelled anything in the first place.',
    '',
    '`tryCancel` must not stop the event travelling — cancelling and propagating are different',
    'things, and code above you is still entitled to hear about the click.',
    '',
    'The starter cancels and says it worked. It is right two times in three, which is the worst kind',
    'of wrong.',
  ].join('\n'),
  html: [
    '<div id="page">',
    '  <input id="pick" type="checkbox">',
    '  <button id="go" type="button">Go</button>',
    '</div>',
  ].join('\n'),
  starterCode: [
    'export function tryCancel(event: Event): boolean {',
    '  event.preventDefault();',
    '  return true;',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'a cancelable event is cancelled, and the cancellation is reported',
      run: ({ doc, win, fn, expect }) => {
        const go = requireElement(doc, 'go');
        const outcome = cancelDuring(go, new win.Event('go', { cancelable: true }), fn<TryCancel>('tryCancel'));

        expect(outcome.ran).toBe(true);
        expect(outcome.reported).toBe(true);
        expect(outcome.defaultPrevented).toBe(true);
        // `dispatchEvent` returns false when the default was prevented. It is the answer the code
        // that dispatched the event reads, and the only one it gets.
        expect(outcome.returned).toBe(false);
      },
    },
    {
      name: 'an event that is not cancelable reports honestly that nothing happened',
      run: ({ doc, win, fn, expect }) => {
        const go = requireElement(doc, 'go');
        // `cancelable` defaults to false, so this is what every hand-built event is unless it says
        // otherwise -- and what most built-in events are: `scroll`, `focus`, `input`, `load`.
        const outcome = cancelDuring(go, new win.Event('go', { cancelable: false }), fn<TryCancel>('tryCancel'));

        expect(outcome.ran).toBe(true);
        expect(outcome.reported).toBe(false);
        // `preventDefault()` on a non-cancelable event is a no-op. Not an error, not a warning --
        // nothing at all.
        expect(outcome.defaultPrevented).toBe(false);
        expect(outcome.returned).toBe(true);
      },
    },
    {
      name: 'a passive listener cannot cancel, whatever the event says',
      run: ({ doc, win, fn, expect }) => {
        const go = requireElement(doc, 'go');
        const outcome = cancelDuring(go, new win.Event('go', { cancelable: true }), fn<TryCancel>('tryCancel'), {
          passive: true,
        });

        // The event *is* cancelable here, so anything that answers by reading `event.cancelable`
        // says yes and is wrong. The only honest question is what the event looks like after the
        // call.
        expect(outcome.ran).toBe(true);
        expect(outcome.reported).toBe(false);
        expect(outcome.defaultPrevented).toBe(false);
        expect(outcome.returned).toBe(true);
      },
    },
    {
      name: 'cancelling a click on a checkbox really does stop it ticking',
      run: ({ doc, win, fn, expect }) => {
        const pick = requireInput(doc, 'pick');
        const before = pick.checked;

        const outcome = cancelDuring(
          pick,
          new win.MouseEvent('click', { bubbles: true, cancelable: true }),
          fn<TryCancel>('tryCancel'),
        );

        // The default action for a click on a checkbox is to toggle it, and this is the assertion
        // that `preventDefault` was really called rather than its effects merely reported.
        expect(before).toBe(false);
        expect(pick.checked).toBe(false);
        expect(outcome.reported).toBe(true);
      },
    },
    {
      name: 'cancelling does not stop the event travelling',
      run: ({ doc, win, fn, expect }) => {
        const page = requireElement(doc, 'page');
        const go = requireElement(doc, 'go');
        const heard = createRecorder<string>();
        page.addEventListener('go', () => heard.record('page'));

        const outcome = cancelDuring(
          go,
          new win.Event('go', { bubbles: true, cancelable: true }),
          fn<TryCancel>('tryCancel'),
        );

        // Two independent facts about one event: it was cancelled, and it still went everywhere it
        // was going to go. An ancestor listener reads `defaultPrevented` and decides for itself.
        expect(heard.entries).toEqual(['page']);
        expect(outcome.defaultPrevented).toBe(true);
      },
    },
  ],
  solutions: [
    {
      label: 'Cancel, then ask the event what happened',
      code: [
        'export function tryCancel(event: Event): boolean {',
        '  event.preventDefault();',
        '  return event.defaultPrevented;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'Two lines, and the second one is the whole lesson: **`preventDefault()` tells you nothing, so',
        'ask the event afterwards.**',
        '',
        'The call is a request, and it is refused silently in two different ways:',
        '',
        '- **The event is not cancelable.** `event.cancelable` is decided when the event is',
        '  constructed and never changes. Many built-in events are `false` — `scroll`, `focus`,',
        '  `blur`, `input`, `load` — because there is nothing to cancel: they are announcements that',
        '  something has already happened. Every hand-built event is `false` unless its init says',
        '  otherwise.',
        '- **The listener is passive.** `addEventListener(type, fn, { passive: true })` is a promise to',
        '  the browser that this listener will not cancel anything, which lets it start scrolling',
        '  without waiting to find out. Break the promise and the call is ignored (Chrome logs a',
        '  console warning and carries on). Passive is the *default* for `touchstart`, `touchmove`,',
        '  `wheel` and `mousewheel` on the window, the document and the body — so the most likely place',
        '  to hit this is the exact code that wants to cancel a scroll.',
        '',
        '`event.defaultPrevented` is the flag the platform actually set, so reading it after the call',
        'covers both cases and any future one. `dispatchEvent`’s return value says the same thing to',
        'whoever dispatched the event: `false` means "somebody cancelled it".',
        '',
        'Two more things that do not cancel anything, both of which people write:',
        '',
        '- **`return false` from an `addEventListener` listener.** It works in an inline `onclick=`',
        '  attribute and in jQuery, and it does nothing here. The return value is discarded.',
        '- **`stopPropagation()`.** Different axis entirely. The event stops travelling and the browser',
        '  still does what it was going to do.',
      ].join('\n'),
      tradeoffs: [
        'This shape — call, then verify — is the right default whenever the answer matters. Reach past',
        'it in two directions:',
        '',
        '- **Do not check when nothing depends on it.** `submit` handlers call `preventDefault()`',
        '  unconditionally and get on with it; the event is always cancelable and the code has no',
        '  branch to take. A check nobody reads is noise.',
        '- **Check `event.cancelable` *first* when you want to know before you act.** Reading it before',
        '  the call answers "was this event ever cancellable", which is a genuinely different question',
        '  from "did my cancellation take". It cannot see the passive case, so it is not a substitute',
        '  for the check above — it is a way to skip work you know cannot matter.',
        '',
        'Where cancelling is the whole point, know what you are cancelling:',
        '',
        '- **`submit`** — the navigation. The single most common `preventDefault` on the web.',
        '- **`click` on a link or a checkbox** — the navigation, the tick.',
        '- **`keydown`** — the character being typed, the space bar scrolling the page, the arrow key',
        '  moving the caret. Cancel `keydown`, never `keyup`, which is announced after the fact.',
        '- **`contextmenu`, `dragover`, `paste`** — the menu, the "not allowed" cursor, the insertion.',
        '',
        'And know what you cannot: closing a window, focusing, scrolling from a passive listener, or',
        'anything a browser reserves to the user. Those are refusals by design, not gaps.',
      ].join('\n'),
    },
    {
      label: 'Report through dispatchEvent’s answer instead',
      code: [
        'export function tryCancel(event: Event): boolean {',
        '  if (!event.cancelable) return false;',
        '',
        '  event.preventDefault();',
        '  // Same flag `dispatchEvent` reads to build its own return value.',
        '  return event.defaultPrevented;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The same answer with an early exit, and it is worth writing out because of what the early',
        'exit does *not* buy.',
        '',
        '`event.cancelable === false` is a definite no: the call cannot possibly work, so returning',
        'early skips it. That is a real optimisation in a hot handler — `pointermove`, `scroll` — and',
        'it makes the impossible case explicit rather than inferred from a flag that stayed false.',
        '',
        'What it does not do is replace the check underneath it. A passive listener is passive whatever',
        '`cancelable` says, so an answer that returns `event.cancelable` reports success for exactly the',
        'case that is hardest to debug. The early exit narrows the question; only `defaultPrevented`',
        'answers it.',
        '',
        'That flag is also what the dispatcher sees. `dispatchEvent` returns `!event.defaultPrevented`,',
        'so these are two views of one bit — and where you own the dispatch, reading the return value',
        'is the cleaner half of the pair:',
        '',
        '```js',
        'if (!strip.dispatchEvent(new CustomEvent("rating-change", { cancelable: true, detail }))) {',
        '  return; // a listener vetoed it',
        '}',
        '```',
      ].join('\n'),
      tradeoffs: [
        'Prefer the shorter version by default: two lines, no branch, and one less place for the',
        'condition to drift from the thing it is guarding.',
        '',
        'Prefer this one when either half earns its keep:',
        '',
        '- **The handler is hot.** A `wheel` or `pointermove` listener runs hundreds of times a second,',
        '  and skipping a call plus a property read is measurable in a way almost nothing else in this',
        '  file is.',
        '- **The impossible case needs saying.** `if (!event.cancelable) return false;` documents that',
        '  the author knew about non-cancelable events. The short version handles it correctly and',
        '  silently, which is worse for the next reader.',
        '',
        'The cost is the trap it sets: it reads as though `cancelable` were the whole answer, and the',
        'next edit that "simplifies" it to `return event.cancelable` passes every test that does not',
        'use a passive listener. If you write this version, the `defaultPrevented` line needs a comment',
        'saying why it is still there.',
      ].join('\n'),
    },
  ],
};
