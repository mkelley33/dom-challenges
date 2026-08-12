import type { ChallengeContent } from '@/types/challenge';

import { createRecorder, requireElement, requireIn } from './support';

type WatchTasks = (tasks: HTMLElement, onDone: (taskId: string) => void) => void;

/**
 * Appends a task the submitted code has never seen, and hands back its Done button.
 *
 * **The test does this, not the learner.** A challenge whose own function both wires the list and
 * grows it can pass by re-running its own wiring, which is exactly the answer this challenge exists
 * to reject -- the row must not exist until `watchTasks` has already returned.
 */
function appendTask(doc: Document, id: string, label: string): Element {
  const tasks = requireElement(doc, 'tasks');
  const task = doc.createElement('li');
  task.className = 'task';
  task.dataset.taskId = id;
  task.innerHTML = `<button class="done" type="button"><span class="tick">y</span> Done</button> ${label}`;
  tasks.append(task);
  return requireIn(task, '.done');
}

export const delegateOneListener: ChallengeContent = {
  prompt: [
    'A task list. Every task carries a Done button, and the list grows while the page is open.',
    '',
    'Export `watchTasks(tasks, onDone)`. When a Done button inside `tasks` is clicked, call',
    '`onDone` **once**, with that task’s `data-task-id`. A click anywhere else must call nothing —',
    'the task’s own text, the padding around the tasks, or a Done button in the Archive list further',
    'down the page, which is a different list and not your business.',
    '',
    'Two things the tests do that your code cannot:',
    '',
    '- they append a task **after** `watchTasks` has returned, and click its Done button;',
    '- they click the `<span class="tick">` **inside** a Done button, which is what a real click on',
    '  an icon does.',
    '',
    'The starter wires up every button it can find. It is the answer everyone writes first.',
  ].join('\n'),
  html: [
    '<div id="board">',
    '  <h2 id="heading">Backlog</h2>',
    '  <ul id="tasks">',
    '    <li class="task" data-task-id="t-1"><button class="done" type="button"><span class="tick">y</span> Done</button> Write the brief</li>',
    '    <li class="task" data-task-id="t-2"><button class="done" type="button"><span class="tick">y</span> Done</button> Draft the spec</li>',
    '  </ul>',
    '  <h2 id="archive-heading">Archive</h2>',
    '  <ul id="archive">',
    '    <li class="task" data-task-id="a-1"><button class="done" type="button"><span class="tick">y</span> Done</button> Old thing</li>',
    '  </ul>',
    '</div>',
  ].join('\n'),
  starterCode: [
    'export function watchTasks(tasks: HTMLElement, onDone: (taskId: string) => void): void {',
    "  for (const button of tasks.querySelectorAll<HTMLElement>('.done')) {",
    "    button.addEventListener('click', (event) => {",
    "      const task = (event.target as HTMLElement).closest<HTMLElement>('.task');",
    '      if (task?.dataset.taskId) onDone(task.dataset.taskId);',
    '    });',
    '  }',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'clicking a Done button reports that task, exactly once',
      run: ({ doc, fire, fn, expect }) => {
        const tasks = requireElement(doc, 'tasks');
        const done = createRecorder<string>();
        fn<WatchTasks>('watchTasks')(tasks, done.record);

        fire.click(requireIn(doc, '[data-task-id="t-2"] .done'));

        // The count is half the assertion. A listener on every button *and* one on the list is a
        // common belt-and-braces answer, and it reports the same id twice for one click.
        expect(done.entries).toEqual(['t-2']);
      },
    },
    {
      name: 'clicking the icon inside a Done button reports the same task',
      run: ({ doc, fire, fn, expect }) => {
        const tasks = requireElement(doc, 'tasks');
        const done = createRecorder<string>();
        fn<WatchTasks>('watchTasks')(tasks, done.record);

        // `event.target` is the deepest element the event started at -- the `<span>`, not the
        // button, and certainly not the task. Anything that reads `event.target.dataset` directly
        // gets nothing here, and this is what a click on an icon really looks like.
        fire.click(requireIn(doc, '[data-task-id="t-1"] .tick'));

        expect(done.entries).toEqual(['t-1']);
      },
    },
    {
      name: 'a task appended after watchTasks returned is handled too',
      run: ({ doc, fire, fn, expect }) => {
        const tasks = requireElement(doc, 'tasks');
        const done = createRecorder<string>();
        fn<WatchTasks>('watchTasks')(tasks, done.record);

        // The row does not exist until the call above has returned, so nothing that enumerated the
        // buttons at wiring time can reach it.
        fire.click(appendTask(doc, 't-3', 'Ship it'));

        expect(done.entries).toEqual(['t-3']);
      },
    },
    {
      name: 'clicks that are not on a Done button report nothing',
      run: ({ doc, fire, fn, expect }) => {
        const tasks = requireElement(doc, 'tasks');
        const done = createRecorder<string>();
        fn<WatchTasks>('watchTasks')(tasks, done.record);

        // Three clicks that pass through the list without landing on a button: the task itself, the
        // list's own padding, and a heading outside it entirely. A solution that walks from
        // `event.target` to the nearest `.task` and stops there reports the first two.
        fire.click(requireIn(doc, '[data-task-id="t-1"]'));
        fire.click(tasks);
        fire.click(requireElement(doc, 'heading'));

        expect(done.entries).toEqual([]);
      },
    },
    {
      name: 'a Done button in a different list is not this list’s business',
      run: ({ doc, fire, fn, expect }) => {
        const tasks = requireElement(doc, 'tasks');
        const done = createRecorder<string>();
        fn<WatchTasks>('watchTasks')(tasks, done.record);

        // `#archive` is a second list with the same markup, and the click never passes through
        // `#tasks`. A listener on `tasks` cannot see it; a listener on the document sees every click
        // in the page and has to put the scope back itself, because `closest` climbs past whatever
        // container you had in mind.
        fire.click(requireIn(doc, '#archive .done'));

        expect(done.entries).toEqual([]);
      },
    },
    {
      name: 'each Done button reports its own task, and the list keeps working after a removal',
      run: ({ doc, fire, fn, expect }) => {
        const tasks = requireElement(doc, 'tasks');
        const done = createRecorder<string>();
        fn<WatchTasks>('watchTasks')(tasks, done.record);

        const third = appendTask(doc, 't-3', 'Ship it');
        requireIn(doc, '[data-task-id="t-1"]').remove();

        fire.click(third);
        fire.click(requireIn(doc, '[data-task-id="t-2"] .done'));

        // Order matters here: it is the evidence that each click resolved its *own* task rather
        // than a task remembered at wiring time.
        expect(done.entries).toEqual(['t-3', 't-2']);
      },
    },
  ],
  solutions: [
    {
      label: 'One listener on the list',
      code: [
        'export function watchTasks(tasks: HTMLElement, onDone: (taskId: string) => void): void {',
        "  tasks.addEventListener('click', (event) => {",
        '    const target = event.target;',
        '    if (!(target instanceof HTMLElement)) return;',
        '',
        "    const button = target.closest('.done');",
        '    if (!button) return;',
        '',
        "    const taskId = button.closest<HTMLElement>('.task')?.dataset.taskId;",
        '    if (taskId) onDone(taskId);',
        '  });',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'One listener, on the container, for every task that exists now and every task that will',
        'exist later. That is event delegation, and it works because a click does not happen *at* an',
        'element — it travels.',
        '',
        'A click on the tick inside a Done button visits, in order: the `<span>`, the `<button>`, the',
        '`<li>`, the `<ul>`, the `<div>`, the `<body>`, the document, the window. Every listener along',
        'that path runs. So a listener on the `<ul>` hears about a click on anything inside it,',
        'including elements that did not exist when the listener was attached — the listener is',
        'attached to the container, and the container is what the event passes through.',
        '',
        'Two properties tell you where you are, and confusing them is the bug this challenge is built',
        'around:',
        '',
        '- **`event.target`** — the deepest element the event started at. For a click on the icon that',
        '  is the `<span>`. It is the same object at every listener on the path.',
        '- **`event.currentTarget`** — the element whose listener is running right now. Inside this',
        '  handler it is always `tasks`, whatever was clicked.',
        '',
        '`target.closest(selector)` walks up from the target through its ancestors and returns the',
        'first match, or `null`. That is what turns "the span was clicked" into "the Done button was',
        'clicked", and the `null` branch is what makes a click on the list’s padding report nothing.',
        'Both `closest` calls are needed: the first asks *was this a Done click*, the second asks',
        '*which task*.',
      ].join('\n'),
      tradeoffs: [
        'This is the default for any repeated control, and the reasons stack up:',
        '',
        '- **One listener instead of N.** A thousand rows cost one registration.',
        '- **New rows need no wiring.** Nothing has to remember to re-attach after a render.',
        '- **Removed rows need no teardown.** The listener belongs to the container, so a removed row',
        '  takes no registration with it.',
        '',
        'What it costs, and when to reach for a per-element listener instead:',
        '',
        '- **The handler runs for every click in the container**, so it must be cheap and it must',
        '  reject non-matches — that `if (!button) return;` is not defensive noise, it is the filter.',
        '- **Events that do not bubble cannot be delegated this way.** `focus`, `blur`, `mouseenter`',
        '  and `mouseleave` never reach the container in the bubbling phase. Their bubbling twins',
        '  (`focusin`, `focusout`, `mouseover`, `mouseout`) exist for exactly this reason, and the',
        '  capture phase is the other way round it.',
        '- **A listener directly on the element is clearer when there is exactly one of it.** Delegation',
        '  for a single Save button buys nothing and hides where the behaviour lives.',
        '',
        'One sharp edge: `closest` climbs past the container. If you delegate from the document, a',
        'click in a *different* list still finds a `.task` — so check `event.currentTarget.contains(...)`',
        'or scope the selector when the listener is not on the container itself.',
      ].join('\n'),
    },
    {
      label: 'Delegate from the document instead',
      code: [
        'export function watchTasks(tasks: HTMLElement, onDone: (taskId: string) => void): void {',
        "  tasks.ownerDocument.addEventListener('click', (event) => {",
        '    const target = event.target;',
        '    if (!(target instanceof HTMLElement)) return;',
        '',
        "    const button = target.closest('.done');",
        '    if (!button || !tasks.contains(button)) return;',
        '',
        "    const taskId = button.closest<HTMLElement>('.task')?.dataset.taskId;",
        '    if (taskId) onDone(taskId);',
        '  });',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The same idea, moved one level out. The listener now lives on the document, which every click',
        'in the page passes through, and `tasks.contains(button)` is what puts the scope back.',
        '',
        'That containment check is the whole difference, and it is not optional. `closest` does not',
        'know about your container: it walks all the way to the root, so a Done button in some other',
        'list — a second board, a modal, a preview pane — matches just as well. `contains` is the',
        'question the listener’s position no longer answers for you. (`tasks.contains(tasks)` is',
        '`true`, which is usually what you want; `!==` plus `contains` is the spelling for "strictly',
        'inside".)',
        '',
        '`tasks.ownerDocument` rather than the global `document`: the element might live in a different',
        'document — a `<template>`’s, an iframe’s — and a listener on the wrong one never fires. It is',
        'the same discipline as reaching for `event.view` or `element.ownerDocument.defaultView`',
        'instead of assuming there is one window.',
      ].join('\n'),
      tradeoffs: [
        'Prefer this when **the container itself is replaced**. A listener on `#tasks` dies the moment',
        'something does `board.innerHTML = …`; a listener on the document survives every re-render',
        'underneath it. Frameworks that re-create DOM on each update are the usual reason, and it is',
        'why React attaches its listeners at the root rather than to your elements.',
        '',
        'It costs three things:',
        '',
        '- **Every click in the page runs your handler.** With a handful of these it is nothing; with a',
        '  hundred it is a real cost on every pointer interaction.',
        '- **It is easy to leak.** A document listener outlives whatever it was written for unless it is',
        '  explicitly removed, and the closure keeps `tasks` — and therefore the whole detached',
        '  subtree — alive. A listener on the container is collected with the container.',
        '- **Anything that calls `stopPropagation()` between the button and the document silences it.**',
        '  Third-party widgets do this. The closer to the target you listen, the less can intercept you.',
        '',
        'A third shape worth knowing when neither fits: put the id on the button itself',
        '(`data-task-id` on the `.done`) and skip the second walk. Cheaper, and it duplicates the id in',
        'the markup — which is a real maintenance cost the moment the two disagree.',
      ].join('\n'),
    },
  ],
};
