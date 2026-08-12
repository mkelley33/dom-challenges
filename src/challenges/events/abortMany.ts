import type { ChallengeContent } from '@/types/challenge';

import type { Recorder } from './support';
import { createRecorder, requireElement } from './support';

type StartDrag = (handle: HTMLElement, onMove: (event: Event) => void, onEnd: () => void) => void;

/** Just the two halves of the harness context these tests dispatch through. */
interface DragContext {
  doc: Document;
  win: Window & typeof globalThis;
}

/**
 * Moves the pointer somewhere that is **not** the handle, which is where a drag mostly happens.
 *
 * Dispatched from an element with `bubbles: true` rather than at the document or the window
 * directly, so a solution that listens on either of them is accepted -- the challenge is about
 * listening somewhere that sees the whole page, not about picking one of the two.
 */
function movePointer(ctx: DragContext): void {
  requireElement(ctx.doc, 'elsewhere').dispatchEvent(new ctx.win.Event('pointermove', { bubbles: true }));
}

function releasePointer(ctx: DragContext): void {
  requireElement(ctx.doc, 'elsewhere').dispatchEvent(new ctx.win.Event('pointerup', { bubbles: true }));
}

/** Starts a drag and hands back the two logs the tests read. */
function beginDrag(ctx: DragContext, startDrag: StartDrag): { moves: Recorder<string>; ends: Recorder<string> } {
  const moves = createRecorder<string>();
  const ends = createRecorder<string>();
  startDrag(
    requireElement(ctx.doc, 'handle'),
    (event) => moves.record(event.type),
    () => ends.record('end'),
  );
  return { moves, ends };
}

export const abortMany: ChallengeContent = {
  prompt: [
    'A drag handle. A drag is three listeners, and none of them belongs on the handle: once the',
    'pointer is down it will spend the whole gesture somewhere else, and it can be released anywhere.',
    '',
    'Export `startDrag(handle, onMove, onEnd)`, which begins a drag immediately:',
    '',
    '- every `pointermove` anywhere in the document calls `onMove(event)`;',
    '- a `pointerup` anywhere ends the drag;',
    '- `keydown` with `key === "Escape"` also ends the drag. Any other key does not.',
    '',
    'Ending the drag means calling `onEnd()` **once** and leaving nothing behind: after it, no',
    'pointer movement and no key press may reach any of your listeners ever again. A later',
    '`startDrag` starts a fresh drag that behaves the same way.',
    '',
    'The tests dispatch every event, from an element that is nowhere near the handle. The starter',
    'listens on the handle and cleans up half of what it registered.',
  ].join('\n'),
  html: [
    '<div id="page">',
    '  <div id="board"><div id="handle">Drag me</div></div>',
    '  <p id="elsewhere">Somewhere else entirely</p>',
    '</div>',
  ].join('\n'),
  starterCode: [
    'export function startDrag(handle: HTMLElement, onMove: (event: Event) => void, onEnd: () => void): void {',
    "  handle.addEventListener('pointermove', onMove);",
    '',
    "  document.addEventListener('pointerup', () => {",
    "    handle.removeEventListener('pointermove', onMove);",
    '    onEnd();',
    '  });',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'a move that is nowhere near the handle is still a move',
      run: ({ doc, win, fn, expect }) => {
        const { moves } = beginDrag({ doc, win }, fn<StartDrag>('startDrag'));

        movePointer({ doc, win });
        movePointer({ doc, win });

        // A pointer that has left the handle is the normal case, not the edge case: the whole
        // reason a drag listens on the document is that the element under the pointer is not the
        // element the gesture started on.
        expect(moves.entries).toEqual(['pointermove', 'pointermove']);
      },
    },
    {
      name: 'releasing the pointer ends the drag and takes every listener with it',
      run: ({ doc, win, fire, fn, expect }) => {
        const { moves, ends } = beginDrag({ doc, win }, fn<StartDrag>('startDrag'));

        movePointer({ doc, win });
        releasePointer({ doc, win });
        expect(ends.entries).toEqual(['end']);

        // Everything after the release. The first move is the positive control -- it proves the
        // wiring worked -- so this empty tail is a teardown that happened rather than a drag that
        // never started.
        movePointer({ doc, win });
        releasePointer({ doc, win });
        fire.keydown(requireElement(doc, 'elsewhere'), 'Escape');

        expect(moves.entries).toEqual(['pointermove']);
        expect(ends.entries).toEqual(['end']);
      },
    },
    {
      name: 'Escape ends the drag, and other keys do not',
      run: ({ doc, win, fire, fn, expect }) => {
        const { moves, ends } = beginDrag({ doc, win }, fn<StartDrag>('startDrag'));
        const elsewhere = requireElement(doc, 'elsewhere');

        movePointer({ doc, win });
        fire.keydown(elsewhere, 'a');
        movePointer({ doc, win });
        expect(ends.entries).toEqual([]);

        fire.keydown(elsewhere, 'Escape');
        movePointer({ doc, win });

        expect(ends.entries).toEqual(['end']);
        expect(moves.entries).toEqual(['pointermove', 'pointermove']);
      },
    },
    {
      name: 'the teardown happens before onEnd, so onEnd cannot wake it up again',
      run: ({ doc, win, fn, expect }) => {
        const moves = createRecorder<string>();
        const ends = createRecorder<string>();

        // Ending a drag usually changes the DOM, and changing the DOM under a pointer produces
        // more pointer events. So `onEnd` here does what a real one does by accident.
        fn<StartDrag>('startDrag')(
          requireElement(doc, 'handle'),
          (event) => moves.record(event.type),
          () => {
            ends.record('end');
            // A move only. Releasing again here would re-enter `onEnd` on any answer that has not
            // torn down yet, and an assertion whose failure is a thousand-entry array teaches
            // nobody anything.
            movePointer({ doc, win });
          },
        );

        movePointer({ doc, win });
        releasePointer({ doc, win });

        // Only the move before the release. Tearing down *after* calling `onEnd` leaves a window in
        // which the listeners are still live and the drag is over.
        expect(moves.entries).toEqual(['pointermove']);
        expect(ends.entries).toEqual(['end']);
      },
    },
    {
      name: 'two drags in a row each start clean and each end clean',
      run: ({ doc, win, fn, expect }) => {
        const startDrag = fn<StartDrag>('startDrag');

        const first = beginDrag({ doc, win }, startDrag);
        movePointer({ doc, win });
        releasePointer({ doc, win });

        const second = beginDrag({ doc, win }, startDrag);
        // Both halves are asserted, because the two ways of getting this wrong fail different ones:
        // a controller shared by every drag is already aborted by the time the second one starts,
        // and listeners that were never torn down keep answering after the second drag ends.
        movePointer({ doc, win });
        expect(second.moves.entries).toEqual(['pointermove']);

        releasePointer({ doc, win });
        movePointer({ doc, win });

        expect(second.moves.entries).toEqual(['pointermove']);
        expect(second.ends.entries).toEqual(['end']);
        // The first drag ended before the second began and must have stayed ended.
        expect(first.moves.entries).toEqual(['pointermove']);
        expect(first.ends.entries).toEqual(['end']);
      },
    },
  ],
  solutions: [
    {
      label: 'One signal for the whole gesture',
      code: [
        'export function startDrag(handle: HTMLElement, onMove: (event: Event) => void, onEnd: () => void): void {',
        '  const controller = new AbortController();',
        '  const { signal } = controller;',
        '',
        '  const finish = (): void => {',
        '    controller.abort();',
        '    onEnd();',
        '  };',
        '',
        "  document.addEventListener('pointermove', onMove, { signal });",
        "  document.addEventListener('pointerup', finish, { signal });",
        "  document.addEventListener('keydown', (event) => {",
        "    if (event instanceof KeyboardEvent && event.key === 'Escape') finish();",
        '  }, { signal });',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'A gesture is not one listener, it is a **lifetime**. `AbortController` is the platform’s way',
        'of naming a lifetime and ending it in one call.',
        '',
        'Every `addEventListener` that takes the same `signal` is removed when that signal aborts —',
        'whatever type it was, on whatever object, in whatever phase. Three registrations here; it',
        'would be the same one line for thirty. The listener functions never need to be named,',
        'reachable, or matched against anything, which removes the entire class of bug where a removal',
        'silently fails because it disagreed with its registration about the function, the type or the',
        'capture flag.',
        '',
        '`finish` calls `abort()` **before** `onEnd()`, and the order matters: if `onEnd` throws, or',
        'dispatches something, the listeners are already gone. It also makes `finish` naturally',
        'idempotent — a second `pointerup` finds nothing registered, and `abort()` on an',
        'already-aborted controller is a no-op anyway.',
        '',
        'The listeners are on the **document**, not the handle. Once the pointer is down it is over',
        'whatever happens to be under it, so the handle stops receiving moves almost immediately. This',
        'is the oldest bug in drag code and it is why every drag implementation looks like this. (Real',
        'code would reach for `setPointerCapture` instead, which redirects the events back to the',
        'handle — worth knowing, and it does not remove the need to tear the listeners down.)',
        '',
        'One controller per drag, created inside `startDrag`. A controller is single-use: once aborted',
        'it stays aborted for ever, and **a listener registered with an already-aborted signal is never',
        'registered at all**. A controller hoisted to module scope therefore works exactly once.',
      ].join('\n'),
      tradeoffs: [
        'This is the right default for anything with a lifetime: a gesture, a component instance, a',
        'modal, an in-flight request. Where the teardown is more than one line, the signal is what',
        'stops the teardown drifting out of step with the setup.',
        '',
        'It reaches past events, which is most of the point. The same signal cancels a `fetch`, and',
        '`AbortSignal.timeout(ms)` and `AbortSignal.any([...])` compose lifetimes — "this gesture, or',
        'five seconds, whichever ends first" is one expression.',
        '',
        'What it costs:',
        '',
        '- **All or nothing.** Everything on a signal goes together. Removing one listener while',
        '  keeping the rest needs its own controller, or a kept reference.',
        '- **One-shot.** Stop-and-restart means a new controller each time. Reaching for a module-level',
        '  one is the natural mistake and produces a drag that works once and then silently never',
        '  attaches again.',
        '- **The signal must reach every registration.** A listener added later, in a helper that was',
        '  not passed the signal, is a leak with no symptom until the gesture ends.',
        '',
        'A `let live = true` gate in front of each callback passes every test on this page, because a',
        'listener that returns early and a listener that is not there look identical from outside. It',
        'leaves three document-level listeners running for the rest of the session, per drag, and',
        '`pointermove` is the single highest-frequency event on the platform. This is the case where',
        'the leak is not a rounding error.',
        '',
        'For a *long-lived* subscription with no natural end, a signal buys less: something still has',
        'to hold the controller and decide when to abort, which is the same bookkeeping problem wearing',
        'a different hat.',
      ].join('\n'),
    },
    {
      label: 'Three references and a teardown that names them all',
      code: [
        'export function startDrag(handle: HTMLElement, onMove: (event: Event) => void, onEnd: () => void): void {',
        '  const onPointerUp = (): void => finish();',
        '  const onKeyDown = (event: Event): void => {',
        "    if (event instanceof KeyboardEvent && event.key === 'Escape') finish();",
        '  };',
        '',
        '  function finish(): void {',
        "    document.removeEventListener('pointermove', onMove);",
        "    document.removeEventListener('pointerup', onPointerUp);",
        "    document.removeEventListener('keydown', onKeyDown);",
        '    onEnd();',
        '  }',
        '',
        "  document.addEventListener('pointermove', onMove);",
        "  document.addEventListener('pointerup', onPointerUp);",
        "  document.addEventListener('keydown', onKeyDown);",
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The same lifetime, managed by hand. Each listener is a named binding so that `finish` can',
        'point at it, and `finish` is a function *declaration* rather than a `const` so that it can be',
        'referred to by the handlers defined above it — hoisting is doing real work here.',
        '',
        'Read the three removals against the three registrations. Type, function, capture flag: nine',
        'things that have to agree, written twice, in two places that will be edited at different',
        'times. That is the whole argument for the signal, and it is easier to feel by looking at this',
        'version than by being told.',
        '',
        'Removing a listener that is not there is a no-op, so `finish` is safe to call twice — which it',
        'is, if the pointer is released while Escape is held. That is not luck, but it is worth knowing',
        'rather than assuming.',
      ].join('\n'),
      tradeoffs: [
        'Reach for this when you need what the signal cannot do:',
        '',
        '- **Remove one listener and keep the others.** A drag that stops listening for moves once it',
        '  has decided the gesture is a click, say. A signal is all or nothing.',
        '- **Support a target that predates `AbortSignal` in `addEventListener`** — an old embedded',
        '  runtime, a polyfilled `EventTarget`.',
        '- **Re-attach without rebuilding.** The same references can go back on, where an aborted',
        '  controller cannot be reused.',
        '',
        'What it costs is exactly what the first solution removes: every removal is a silent no-op when',
        'it disagrees with its registration, and nothing anywhere reports the mismatch. The failure is',
        'a listener that keeps running after the interaction is over — a drag that still tracks the',
        'pointer, or an Escape key that ends a gesture that finished a minute ago.',
        '',
        'If you write it this way, keep the registrations and the removals adjacent, and add a listener',
        'to both lists in the same edit. A helper that returns its own teardown (`const stop = on(doc,',
        "'pointermove', onMove)`) is the middle ground: it keeps the pairing local, which is the",
        'property the signal gets for free.',
      ].join('\n'),
    },
  ],
};
