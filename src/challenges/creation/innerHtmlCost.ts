import type { ChallengeContent } from '@/types/challenge';

import { requireElement, requireIn } from './support';

type AddRow = (list: HTMLElement, label: string) => void;

export const innerHtmlCost: ChallengeContent = {
  prompt: [
    'The list holds two rows, each one a Pick button and a label:',
    '',
    '```html',
    '<li class="row"><button class="pick">Pick</button><span class="label">Alpha</span></li>',
    '```',
    '',
    'Export `addRow(list, label)` that adds one more row of exactly that shape, with the label as its',
    'text, at the end of the list.',
    '',
    'The rows that were already there have to come through it untouched — as the **same elements**,',
    'with anything attached to them still attached. One test wires a listener to the first row’s',
    'button, clicks it to prove the wiring works, adds a row, and clicks that button again.',
    '',
    'The starter is the one-liner everybody reaches for. It renders the right picture and fails three',
    'of the five tests.',
  ].join('\n'),
  html: [
    '<ul id="list">',
    '  <li class="row"><button class="pick">Pick</button><span class="label">Alpha</span></li>',
    '  <li class="row"><button class="pick">Pick</button><span class="label">Beta</span></li>',
    '</ul>',
  ].join('\n'),
  starterCode: [
    'export function addRow(list: HTMLElement, label: string): void {',
    '  const markup = `<li class="row"><button class="pick">Pick</button><span class="label">${label}</span></li>`;',
    '',
    '  list.innerHTML += markup;',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'the new row has the same shape as the others',
      run: ({ doc, fn, expect }) => {
        const list = requireElement(doc, 'list');
        fn<AddRow>('addRow')(list, 'Gamma');

        expect(list.children).toHaveLength(3);

        const added = list.lastElementChild;
        if (!added) throw new Error('the list is empty');
        expect(added).toHaveClass('row');
        expect(requireIn(added, '.pick')).toHaveTextContent('Pick');
        expect(requireIn(added, '.label')).toHaveTextContent('Gamma');
      },
    },
    {
      name: 'the rows that were already there are still the same elements',
      run: ({ doc, fn, expect }) => {
        const list = requireElement(doc, 'list');
        const first = list.firstElementChild;
        if (!first) throw new Error('the list should start with two rows');
        fn<AddRow>('addRow')(list, 'Gamma');

        // `list.innerHTML += x` is `list.innerHTML = list.innerHTML + x`: a read of the whole
        // container, a *destruction* of everything in it, and a reparse. The rows that come back look
        // identical and are new objects, so the one this test is holding ends up detached.
        expect(first.parentElement).toBe(list);
        expect(list.firstElementChild).toBe(first);
      },
    },
    {
      name: 'a listener on an existing row still fires after a row is added',
      run: ({ doc, fire, fn, expect }) => {
        const list = requireElement(doc, 'list');
        const clicks: string[] = [];
        requireIn(list, '.row .pick').addEventListener('click', () => clicks.push('pick'));

        // Proven live first, in this document at this moment: whatever the assertion below reports,
        // it is not "the click never arrived". AGENTS.md section 5.
        fire.click(requireIn(list, '.row .pick'));
        expect(clicks).toHaveLength(1);

        fn<AddRow>('addRow')(list, 'Gamma');

        // Re-read from the list rather than reused from above, so the button clicked is whichever one
        // is in the document *now*. A rebuilt list answers with a new button that was never wired up.
        fire.click(requireIn(list, '.row .pick'));
        expect(clicks).toHaveLength(2);
      },
    },
    {
      name: 'a label that looks like markup is inserted as text',
      run: ({ doc, fn, expect }) => {
        const list = requireElement(doc, 'list');
        fn<AddRow>('addRow')(list, '<b>bold</b>');

        expect(list.querySelectorAll('b')).toHaveLength(0);
        expect(requireIn(list, '.row:last-child .label')).toHaveTextContent('<b>bold</b>');
      },
    },
    {
      name: 'adding two rows keeps both, in order',
      run: ({ doc, fn, expect }) => {
        const list = requireElement(doc, 'list');
        const addRow = fn<AddRow>('addRow');

        addRow(list, 'Gamma');
        addRow(list, 'Delta');

        expect([...list.querySelectorAll('.label')].map((label) => label.textContent)).toEqual([
          'Alpha',
          'Beta',
          'Gamma',
          'Delta',
        ]);
      },
    },
  ],
  solutions: [
    {
      label: 'Build the row and append it',
      code: [
        'export function addRow(list: HTMLElement, label: string): void {',
        "  const row = document.createElement('li');",
        "  row.className = 'row';",
        '',
        "  const pick = document.createElement('button');",
        "  pick.className = 'pick';",
        "  pick.textContent = 'Pick';",
        '',
        "  const text = document.createElement('span');",
        "  text.className = 'label';",
        '  text.textContent = label;',
        '',
        '  row.append(pick, text);',
        '  list.append(row);',
        '}',
        '',
      ].join('\n'),
      explanation: [
        '`list.innerHTML += markup` looks like an append and is not one. `+=` expands to',
        '`list.innerHTML = list.innerHTML + markup`, and that is three separate operations:',
        '',
        '1. **serialise** every node in the list back into a string;',
        '2. **destroy** every node in the list;',
        '3. **parse** the concatenated string and build a whole new set of nodes.',
        '',
        'The picture on screen is the same afterwards, and nothing else is. Everything that was not',
        'expressible as markup is gone with the nodes that held it:',
        '',
        '- **listeners** added with `addEventListener` — the failure this challenge is built around;',
        '- **references** any script was holding, which now point at detached nodes that will never be',
        '  in the document again;',
        '- **form state** — a typed-in `value`, a ticked checkbox, the caret position, and the user’s',
        '  text selection;',
        '- **scroll positions**, playing media, loaded `<iframe>` documents, running animations, and any',
        '  custom element’s state, since each one is disconnected and rebuilt from scratch.',
        '',
        'And the cost is proportional to what was already there rather than to what you are adding, so',
        'the loop that adds a hundred rows this way is quadratic.',
        '',
        'Building the nodes avoids all of it, because nothing existing is read, written or reparsed. The',
        'one call that touches the document is `list.append(row)`, and it adds a node next to the ones',
        'that are already there rather than replacing them.',
        '',
        '`row.append(pick, text)` takes both children in one call, and the row is assembled while it is',
        'still detached — no layout, no paint, nothing to see until the last line puts it in.',
      ].join('\n'),
      tradeoffs: [
        'Verbose, and the verbosity is the only real complaint: eleven lines describe a row that one',
        'line of HTML describes better. When the shape is fixed, a `<template>` says it in markup and',
        '`cloneNode(true)` stamps it out — which is the same tradeoff this category’s template challenge',
        'is about.',
        '',
        'What this shape buys is worth the lines when any of it matters:',
        '',
        '- you keep references to the pieces (`pick` is right there, no query, nothing to keep in step',
        '  with a class name);',
        '- there is no HTML string, so there is no escaping question to get wrong, ever;',
        '- the cost of adding one row does not depend on how many rows are already there.',
        '',
        'One note on `innerHTML` in general: assigning it is a perfectly good way to **clear** a',
        'container or to replace all of it at once, and the objections above are about the read-modify-',
        'write. `list.replaceChildren()` is the better clear, since it neither serialises nor parses.',
      ].join('\n'),
    },
    {
      label: 'insertAdjacentHTML, which adds without rebuilding',
      code: [
        'function escapeHtml(value: string): string {',
        "  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');",
        '}',
        '',
        'export function addRow(list: HTMLElement, label: string): void {',
        '  const row = `<button class="pick">Pick</button><span class="label">${escapeHtml(label)}</span>`;',
        '',
        '  list.insertAdjacentHTML(\'beforeend\', `<li class="row">${row}</li>`);',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The string route, done in a way that does not throw the list away. This is the direct',
        'comparison the starter is missing: both of these build the row from markup, and only one of',
        'them touches what was already in the container.',
        '',
        '`insertAdjacentHTML` parses its argument and **inserts** the result. It never reads the',
        'container back out, so there is nothing to serialise and nothing to destroy — the existing rows',
        'are not involved in the operation at all, and every listener on them survives.',
        '',
        '`beforeend` is the position that means "inside this element, after its last child", which is',
        'what `append` means for a node.',
        '',
        'The escaping is now yours, and `textContent` is no longer doing it for you. Ampersand first,',
        'or the replacement re-escapes the ampersands the other two just introduced.',
      ].join('\n'),
      tradeoffs: [
        'This is the right answer when the shape is markup-shaped and the values are yours: a fixed row,',
        'nothing user-supplied, and a reader who can see the row’s structure in one line.',
        '',
        'It is also the one to reach for when the volume is real. Building a thousand rows means a',
        'thousand `createElement` calls and a thousand insertions, where one `insertAdjacentHTML` with a',
        'thousand rows joined into it is a single parse and a single insertion. (A `DocumentFragment`',
        'gets the node-building route back to one insertion, but not to one parse — because it never',
        'parsed anything.)',
        '',
        'What it costs is the obligation. The three replacements above are enough between tags and not',
        'enough inside an attribute, where a value carrying a quote closes it early; every future edit',
        'to this function inherits that, and the failure is silent until someone types a `<`. If the',
        'label came from a person, prefer the version that has no HTML in it.',
      ].join('\n'),
    },
  ],
};
