import type { ChallengeContent } from '@/types/challenge';

import { createRecorder, requireElement } from './support';

type Attach = (button: HTMLElement, onPress: () => void) => () => void;

export const listenerIdentity: ChallengeContent = {
  prompt: [
    'Export `attach(button, onPress)`. It wires `onPress` to the button’s clicks and returns a',
    '**teardown** function that really unwires it.',
    '',
    'Each call to `attach` is its own independent subscription:',
    '',
    '- two `attach` calls mean two calls to their callbacks per click, **even when both were handed',
    '  the same function**;',
    '- a teardown undoes exactly the subscription it came from and nothing else;',
    '- calling a teardown twice is harmless;',
    '- a subscription takes its turn — it runs after listeners the caller registered before it, and',
    '  before ones registered after.',
    '',
    'The tests do all the clicking, and they call the teardowns. The starter looks symmetrical and',
    'removes nothing at all — which is the single most common way to leak a listener.',
  ].join('\n'),
  html: [
    '<div id="toolbar">',
    '  <button id="save" type="button">Save</button>',
    '  <button id="undo" type="button">Undo</button>',
    '</div>',
  ].join('\n'),
  starterCode: [
    'export function attach(button: HTMLElement, onPress: () => void): () => void {',
    "  button.addEventListener('click', () => onPress());",
    '',
    '  return () => {',
    "    button.removeEventListener('click', () => onPress());",
    '  };',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'the teardown stops the callback being called',
      run: ({ doc, fire, fn, expect }) => {
        const save = requireElement(doc, 'save');
        const pressed = createRecorder<string>();
        const detach = fn<Attach>('attach')(save, () => pressed.record('press'));

        // The first click is the positive control: it proves the wiring worked, so an empty log
        // after the teardown means the teardown did something rather than that nothing ever did.
        fire.click(save);
        expect(pressed.entries).toEqual(['press']);

        detach();
        fire.click(save);
        expect(pressed.entries).toEqual(['press']);
      },
    },
    {
      name: 'one teardown leaves the other subscription on the same button alone',
      run: ({ doc, fire, fn, expect }) => {
        const save = requireElement(doc, 'save');
        const pressed = createRecorder<string>();
        const attach = fn<Attach>('attach');

        const detachFirst = attach(save, () => pressed.record('first'));
        attach(save, () => pressed.record('second'));

        fire.click(save);
        expect(pressed.entries).toEqual(['first', 'second']);

        detachFirst();
        fire.click(save);
        // Both subscriptions live on one element, so an answer that keeps a single "current
        // listener" in a module variable -- or that assigns `button.onclick` -- has already lost
        // the first one before the teardown is called.
        expect(pressed.entries).toEqual(['first', 'second', 'second']);
      },
    },
    {
      name: 'the same callback attached twice is two subscriptions',
      run: ({ doc, fire, fn, expect }) => {
        const save = requireElement(doc, 'save');
        const pressed = createRecorder<string>();
        const attach = fn<Attach>('attach');

        const onPress = (): void => pressed.record('press');
        const detachFirst = attach(save, onPress);
        attach(save, onPress);

        // `addEventListener` de-duplicates: the same function, for the same type, in the same
        // phase, registered twice, is one registration. Handing it the caller's function directly
        // therefore silently merges two subscriptions into one.
        fire.click(save);
        expect(pressed.entries).toEqual(['press', 'press']);

        detachFirst();
        fire.click(save);
        expect(pressed.entries).toEqual(['press', 'press', 'press']);
      },
    },
    {
      name: 'a subscription takes its turn in the button’s listener list',
      run: ({ doc, fire, fn, expect }) => {
        const save = requireElement(doc, 'save');
        const log = createRecorder<string>();

        // The learner's subscription is bracketed by two the test owns, so the log says exactly
        // where it landed in the list.
        save.addEventListener('click', () => log.record('before'));
        const detach = fn<Attach>('attach')(save, () => log.record('subscription'));
        save.addEventListener('click', () => log.record('after'));

        fire.click(save);
        expect(log.entries).toEqual(['before', 'subscription', 'after']);

        detach();
        fire.click(save);
        expect(log.entries).toEqual(['before', 'subscription', 'after', 'before', 'after']);
      },
    },
    {
      name: 'a teardown called twice changes nothing',
      run: ({ doc, fire, fn, expect }) => {
        const save = requireElement(doc, 'save');
        const undo = requireElement(doc, 'undo');
        const pressed = createRecorder<string>();
        const attach = fn<Attach>('attach');

        const detachSave = attach(save, () => pressed.record('save'));
        attach(undo, () => pressed.record('undo'));

        detachSave();
        detachSave();

        fire.click(save);
        fire.click(undo);

        // Removing a listener that is not there is a no-op, not an error -- and a teardown that
        // aborts a controller can be called any number of times too. Both are worth knowing,
        // because callers do call teardowns twice.
        expect(pressed.entries).toEqual(['undo']);
      },
    },
  ],
  solutions: [
    {
      label: 'Keep the reference you registered',
      code: [
        'export function attach(button: HTMLElement, onPress: () => void): () => void {',
        '  const listener = (): void => {',
        '    onPress();',
        '  };',
        '',
        "  button.addEventListener('click', listener);",
        '',
        "  return () => button.removeEventListener('click', listener);",
        '}',
        '',
      ].join('\n'),
      explanation: [
        'A registration is identified by the triple **`(type, callback, capture)`**, and `callback` is',
        'compared by reference. So `removeEventListener` can only remove a listener you can still',
        'point at.',
        '',
        'The starter builds a *new function* in the teardown. It has the same source text as the one',
        'that was registered and it is a different object, so the removal matches nothing and silently',
        'succeeds — `removeEventListener` never reports failure, because "there was no such listener"',
        'is a legitimate outcome. The listener stays, the closure stays, and everything the closure',
        'captured stays with it.',
        '',
        'Three spellings that produce the same bug:',
        '',
        '- **`() => onPress()`** built twice, as here.',
        '- **`onPress.bind(this)`** built twice. `bind` returns a fresh function on every call, so',
        '  `add(fn.bind(x))` followed by `remove(fn.bind(x))` removes nothing. This one is especially',
        '  common in class components.',
        '- **A method reference through a proxy or a decorator** that wraps on each access.',
        '',
        'The wrapper is not incidental, either. Registering `onPress` directly would make `attach`',
        'inherit `addEventListener`’s **de-duplication**: the same function registered twice for the',
        'same type and phase is one registration, so two subscriptions would collapse into one and one',
        'teardown would cancel both. One wrapper per call is what gives each subscription its own',
        'identity.',
      ].join('\n'),
      tradeoffs: [
        'This is the portable answer — it works in every browser, in Node, and on any `EventTarget` —',
        'and its cost is bookkeeping. One reference per registration, kept alive for as long as the',
        'subscription lasts, and every one of them has to be reachable at teardown time. Three',
        'listeners on three different objects is three references and three `removeEventListener`',
        'calls that must all agree with their `addEventListener` calls on type, reference **and**',
        'capture flag.',
        '',
        'That last one is worth calling out, and it bites in both directions:',
        '`addEventListener(type, fn, true)` paired with `removeEventListener(type, fn)` does not',
        'match, and neither does `addEventListener(type, fn)` paired with',
        '`removeEventListener(type, fn, true)`. The flag is part of the registration’s identity, so',
        'either mismatch removes nothing, silently, exactly like the starter.',
        '',
        'A subscription that registers in the capture phase is caught by the ordering test above',
        'rather than by its teardown — it would run *before* listeners the caller registered first.',
        'That is a different property from the removal, and it is the one an outside observer can',
        'actually see. The other pairing — register plain, remove with `true` — has no such',
        'signature: it behaves correctly in every way a test can watch, right up until the teardown',
        'quietly does nothing. Nothing on this page can reject it, and your browser will.',
        '',
        'There is a shape that passes every test in this challenge and should not be trusted:',
        '',
        '```js',
        'let live = true;',
        "button.addEventListener('click', () => { if (live) onPress(); });",
        'return () => { live = false; };',
        '```',
        '',
        'Nothing observable happens after the teardown, so no test here can tell it from a real',
        'removal — and that is the point. The listener is still registered, still runs on every click,',
        'and still holds its closure. Do it for a thousand rows and you have a thousand dead listeners',
        'the garbage collector cannot touch, and a profiler is the only thing that will ever tell you.',
        'The flag is a reasonable *addition* to a real removal (it closes the window where an event is',
        'already mid-dispatch); it is not a substitute for one.',
      ].join('\n'),
    },
    {
      label: 'One AbortController per subscription',
      code: [
        'export function attach(button: HTMLElement, onPress: () => void): () => void {',
        '  const controller = new AbortController();',
        '',
        "  button.addEventListener('click', () => onPress(), { signal: controller.signal });",
        '',
        '  return () => controller.abort();',
        '}',
        '',
      ].join('\n'),
      explanation: [
        '`addEventListener` takes a `signal` option, and when that signal aborts, the listener is',
        'removed. No reference to keep, nothing to match, nothing to get wrong.',
        '',
        'What disappears with the bookkeeping:',
        '',
        '- **The reference.** The arrow function is anonymous and unreachable, and that is now fine.',
        '- **The type string.** It is written once instead of twice, so a typo in a removal cannot',
        '  quietly do nothing.',
        '- **The capture flag.** It cannot disagree with itself.',
        '- **The idempotence.** `abort()` on an already-aborted controller is a no-op, so the "called',
        '  twice" requirement is free rather than something to think about.',
        '',
        'And one signal can be handed to any number of registrations, on any number of targets, so a',
        'whole interaction — `pointermove` on the document, `pointerup` on the window, `keydown` for',
        'Escape — is torn down by one call.',
      ].join('\n'),
      tradeoffs: [
        'Prefer this whenever a teardown has more than one listener to undo, and whenever the removal',
        'is far from the registration in the code. It is the modern default, it is supported',
        'everywhere that matters, and it removes an entire class of silent bug.',
        '',
        'Four things to weigh:',
        '',
        '- **A controller is one-shot.** Once aborted it stays aborted, so it cannot be used to',
        '  re-attach. A subscription that needs to stop and start again needs a new controller each',
        '  time.',
        '- **Attaching with an already-aborted signal attaches nothing** — the listener is never',
        '  registered at all. Usually what you want, occasionally a puzzle.',
        '- **It is all or nothing.** Every listener sharing a signal goes together. Where the teardowns',
        '  are genuinely independent, that is one controller per subscription, as above, and then the',
        '  controller is doing no more than a kept reference would.',
        '- **It reaches beyond events.** The same signal cancels `fetch`, and `AbortSignal.timeout()`',
        '  and `AbortSignal.any()` compose them. Where a component has a lifetime, one controller for',
        '  the lifetime is often the whole cleanup story.',
        '',
        'The one case for the kept reference: removing *one* listener while leaving others attached to',
        'the same signal. A signal cannot do that.',
      ].join('\n'),
    },
  ],
};
