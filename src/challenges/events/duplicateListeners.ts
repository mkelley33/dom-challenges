import type { ChallengeContent } from '@/types/challenge';

import { createRecorder, requireElement } from './support';

type Connect = (panel: HTMLElement, onPress: () => void) => void;

export const duplicateListeners: ChallengeContent = {
  prompt: [
    'A panel component whose `connect` runs on every render — which is to say, a lot. Today it stacks',
    'up a handler each time, and after five renders one click fires five times.',
    '',
    'Export `connect(panel, onPress)` such that:',
    '',
    '- **however many times it is called with the same `onPress`, one click calls it once**;',
    '- **connecting again does not reshuffle anything.** A listener the page registered after the',
    '  first `connect` must still run *after* `onPress`, because it reads what `onPress` wrote;',
    '- two different callbacks on one panel are two subscriptions, both of which run, in the order',
    '  they were connected;',
    '- panels are independent.',
    '',
    'The tests do the connecting, the clicking, and the registering of the page’s own listener.',
    '',
    'The starter wraps the callback, which is the reflex that causes the bug it is trying to fix.',
  ].join('\n'),
  html: [
    '<div id="board">',
    '  <section id="panel-a" class="panel"><button id="a-press" type="button">Press A</button></section>',
    '  <section id="panel-b" class="panel"><button id="b-press" type="button">Press B</button></section>',
    '</div>',
  ].join('\n'),
  starterCode: [
    'export function connect(panel: HTMLElement, onPress: () => void): void {',
    "  panel.addEventListener('click', () => onPress());",
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'connecting three times with the same callback fires once per click, on every click',
      run: ({ doc, fire, fn, expect }) => {
        const panel = requireElement(doc, 'panel-a');
        const log = createRecorder<string>();
        const connect = fn<Connect>('connect');

        const onPress = (): void => log.record('press');
        connect(panel, onPress);
        connect(panel, onPress);
        connect(panel, onPress);

        fire.click(requireElement(doc, 'a-press'));
        // The second click is what separates "de-duplicated" from "spent". Registering with
        // `{ once: true }` also collapses three connects into one call -- and then the panel stops
        // responding for ever, which one click cannot see.
        fire.click(requireElement(doc, 'a-press'));

        expect(log.entries).toEqual(['press', 'press']);
      },
    },
    {
      name: 'reconnecting does not move the panel’s handler behind the page’s',
      run: ({ doc, fire, fn, expect }) => {
        const panel = requireElement(doc, 'panel-a');
        const log = createRecorder<string>();
        const connect = fn<Connect>('connect');

        const onPress = (): void => log.record('panel');
        connect(panel, onPress);
        // The page registers its own listener in between, and it depends on running second.
        panel.addEventListener('click', () => log.record('page'));
        connect(panel, onPress);

        fire.click(requireElement(doc, 'a-press'));

        // Remove-then-add keeps the count right and puts the panel's handler at the back of the
        // list, which is a reordering nothing in the calling code asked for and nothing reports.
        expect(log.entries).toEqual(['panel', 'page']);
      },
    },
    {
      name: 'two different callbacks on one panel are two subscriptions',
      run: ({ doc, fire, fn, expect }) => {
        const panel = requireElement(doc, 'panel-a');
        const log = createRecorder<string>();
        const connect = fn<Connect>('connect');

        const first = (): void => log.record('first');
        const second = (): void => log.record('second');
        connect(panel, first);
        connect(panel, second);
        connect(panel, first);
        connect(panel, second);

        fire.click(requireElement(doc, 'a-press'));

        // A single `panel.onclick` slot holds one function, so the second connect overwrites the
        // first rather than joining it.
        expect(log.entries).toEqual(['first', 'second']);
      },
    },
    {
      name: 'panels do not know about each other',
      run: ({ doc, fire, fn, expect }) => {
        const log = createRecorder<string>();
        const connect = fn<Connect>('connect');

        const pressA = (): void => log.record('a');
        const pressB = (): void => log.record('b');
        connect(requireElement(doc, 'panel-a'), pressA);
        connect(requireElement(doc, 'panel-b'), pressB);
        connect(requireElement(doc, 'panel-a'), pressA);

        fire.click(requireElement(doc, 'b-press'));
        fire.click(requireElement(doc, 'a-press'));

        // A module-level "already connected" flag connects the first panel and quietly abandons
        // every panel after it.
        expect(log.entries).toEqual(['b', 'a']);
      },
    },
  ],
  solutions: [
    {
      label: 'Let addEventListener de-duplicate',
      code: [
        'export function connect(panel: HTMLElement, onPress: () => void): void {',
        "  panel.addEventListener('click', onPress);",
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The fix is to delete the wrapper. `addEventListener` already does this.',
        '',
        'A registration is identified by **`(type, callback, capture)`**, and adding one that matches',
        'an existing registration is **ignored entirely**. Not appended, not replaced — ignored. So',
        'calling `connect` a hundred times with the same function leaves exactly one registration.',
        '',
        '"Ignored entirely" has three consequences worth holding on to:',
        '',
        '- **Position is kept.** The registration stays where it was, so a listener added after the',
        '  first `connect` still runs after it. This is what makes reconnecting safe and what',
        '  remove-then-add gets wrong: removing and re-adding *does* move the listener to the end of',
        '  the list, silently reordering handlers that were relying on each other.',
        '- **Options are not updated.** A second `addEventListener` with `{ once: true }` on an existing',
        '  registration does not make it once-only, and adding it again *without* `once` does not clear',
        '  a `once` already there. The only way to change a registration is to remove it and add it',
        '  back — with the reordering that implies.',
        '- **`capture` is part of the identity, and nothing else is.** The same function registered for',
        '  the same type in both phases is two registrations. `once`, `passive` and `signal` are not',
        '  part of it.',
        '',
        'The starter fails because `() => onPress()` is a **new function every call**. Three calls, three',
        'different callbacks as far as the platform is concerned, three registrations, three calls per',
        'click. Every "why does this fire N times" bug is this, and the fix is nearly always to stop',
        'creating the function inside the thing that runs repeatedly.',
        '',
        'Listeners on one element run in **registration order**, whatever the order they were spread',
        'across the code, so preserving that order is preserving something real.',
      ].join('\n'),
      tradeoffs: [
        'This is free and it is exactly right — **as long as the callback is a stable reference.** That',
        'is the entire condition, and it is the one that breaks in practice:',
        '',
        '- a callback defined inside a render function is a new one every render;',
        '- `onPress.bind(this)` is a new one every call;',
        '- a callback that closes over changing state has to be recreated to see the new state.',
        '',
        'In every one of those, de-duplication silently does not happen and you are back to stacking',
        'listeners. The usual answers, in order of preference: hoist the function so it really is',
        'stable; keep one stable listener that reads the changing part out of a variable',
        '(`const handler = () => latest.current()`); or keep an explicit registry, as below.',
        '',
        'Two more limits:',
        '',
        '- **You cannot ask how many listeners an element has.** There is no API for it, so "did that',
        '  de-duplicate" is not a question you can answer at run time — only `getEventListeners()` in',
        '  devtools can see it, and only by hand.',
        '- **Registering the caller’s function directly means the caller can remove it**, and means you',
        '  cannot wrap it later without breaking their removals. Where `connect` is a public API, that',
        '  coupling is real: the wrapper you deleted was also an abstraction boundary.',
      ].join('\n'),
    },
    {
      label: 'Keep the subscribers yourself',
      code: [
        'const subscribers = new WeakMap<HTMLElement, Set<() => void>>();',
        '',
        'export function connect(panel: HTMLElement, onPress: () => void): void {',
        '  const existing = subscribers.get(panel);',
        '',
        '  if (existing) {',
        '    existing.add(onPress);',
        '    return;',
        '  }',
        '',
        '  const callbacks = new Set([onPress]);',
        '  subscribers.set(panel, callbacks);',
        "  panel.addEventListener('click', () => {",
        '    for (const callback of [...callbacks]) callback();',
        '  });',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'One real listener per panel, and a `Set` of callbacks behind it. The de-duplication is now',
        'the `Set`’s job, and the listener’s position is fixed the first time and never touched again.',
        '',
        '`WeakMap` rather than `Map` for the outer store: the key is a DOM node, and a `Map` would hold',
        'every panel the page has ever rendered alive for ever. A `WeakMap` entry disappears when the',
        'panel does.',
        '',
        '`[...callbacks]` in the listener is not decoration. Iterating a `Set` while a callback adds to',
        'it or removes from it is a live iteration, so a subscriber that unsubscribes during dispatch',
        'changes what runs after it. Copying first gives every dispatch a stable list — which is',
        'exactly what the platform does with its own listener list, for the same reason.',
        '',
        'What this buys that the platform does not offer: you can **count** the subscribers, iterate',
        'them, run them in a priority order of your choosing, wrap each one in error handling so a',
        'throw does not skip the rest, or hand back an unsubscribe token.',
      ].join('\n'),
      tradeoffs: [
        'Reach for this when the callbacks are **not stable references** — which is most component',
        'code — or when you need something the platform’s listener list will not give you: a count, an',
        'ordering rule, per-subscriber error isolation, a "notify everyone" method.',
        '',
        'It is also the shape to reach for when one element would otherwise carry hundreds of',
        'registrations: one listener plus a data structure is easier to reason about, and easier to',
        'tear down, than a listener list you cannot inspect.',
        '',
        'What it costs:',
        '',
        '- **You are reimplementing a platform feature**, including the parts that are easy to miss —',
        '  the iteration copy above, and the fact that a callback which throws would otherwise take',
        '  the rest of the list with it (the platform reports each listener’s exception and carries on).',
        '- **The bookkeeping is now yours to leak.** Nothing removes the real listener, and nothing',
        '  empties the `Set`. A `disconnect` is a second function you now have to write and callers now',
        '  have to remember.',
        '- **A `Set` de-duplicates by reference too**, so it solves nothing that `addEventListener` did',
        '  not already solve for a stable callback. If that is the whole problem, the first solution is',
        '  the answer and this is machinery for its own sake.',
      ].join('\n'),
    },
  ],
};
