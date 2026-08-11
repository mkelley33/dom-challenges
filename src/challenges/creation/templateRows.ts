import type { ChallengeContent } from '@/types/challenge';

/**
 * Reads an element the challenge markup is supposed to contain, throwing a message that names it.
 *
 * Local rather than in a `support.ts` because this category has one challenge: a helper shared
 * between two of them earns its own file, a helper used by one belongs beside its only caller --
 * the same rule `selection/shadowBoundary.ts` follows for `requireShadowRoot`.
 */
function requireElement(doc: Document, id: string): HTMLElement {
  const element = doc.getElementById(id);
  if (!element) throw new Error(`#${id} is missing from the challenge markup`);
  return element;
}

/**
 * The template's own `DocumentFragment`, for the test that checks it survived being cloned.
 *
 * `querySelector<HTMLTemplateElement>` with the tag name in the selector rather than
 * `getElementById` plus a cast: the generic tells the compiler which element the selector names,
 * and the `template` in the selector is what makes that claim true at run time as well.
 */
function templateFragment(doc: Document, id: string): DocumentFragment {
  const template = doc.querySelector<HTMLTemplateElement>(`template#${id}`);
  if (!template) throw new Error(`#${id} is missing from the challenge markup, or is not a <template>`);
  return template.content;
}

/**
 * Declared over `HTMLElement` rather than `HTMLUListElement`, which is all the tests need and
 * avoids a narrowing assertion at every call. The prompt and the solutions still say
 * `HTMLUListElement`, because that is what a learner's own signature should say.
 */
type RenderRows = (list: HTMLElement, names: string[]) => void;

export const templateRows: ChallengeContent = {
  prompt: [
    'The list is empty and the row markup lives in a `<template>`. Export `renderRows(list, names)`,',
    'which fills the list with one row per name — each one a copy of the template’s `<li class="row">`',
    'with the name written into its `.name` span.',
    '',
    'Three things the tests insist on, and each of them is a real bug you can ship without noticing:',
    '',
    '- **The template has to survive.** After rendering, `#row-template` must still hold exactly one',
    '  row, ready for the next call.',
    '- **Rendering again replaces.** Calling `renderRows` a second time leaves only the new names —',
    '  and it has to work as well the second time as it did the first.',
    '- **A name is text, not markup.** A name of `<b>bold</b>` renders those angle brackets on screen.',
  ].join('\n'),
  html: [
    '<ul id="list"></ul>',
    '<template id="row-template">',
    '  <li class="row"><span class="name"></span><button class="remove" type="button">Remove</button></li>',
    '</template>',
  ].join('\n'),
  starterCode: [
    'export function renderRows(list: HTMLUListElement, names: string[]): void {',
    '  // The template is at #row-template. Its rows live in `template.content`.',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'renders one row per name, with the structure the template describes',
      run: ({ doc, fn, expect }) => {
        const list = requireElement(doc, 'list');
        fn<RenderRows>('renderRows')(list, ['Ada', 'Grace', 'Edsger']);

        expect(list.children).toHaveLength(3);
        expect(list.querySelectorAll('.row')).toHaveLength(3);
        expect(list.querySelectorAll('.remove')).toHaveLength(3);
        expect([...list.querySelectorAll('.name')].map((span) => span.textContent)).toEqual(['Ada', 'Grace', 'Edsger']);
      },
    },
    {
      name: 'the template still holds its row, and that row never lands in the document',
      run: ({ doc, fn, expect }) => {
        const content = templateFragment(doc, 'row-template');
        fn<RenderRows>('renderRows')(requireElement(doc, 'list'), ['Ada']);

        // `append(template.content)` *moves* the fragment's children into the list, which empties
        // the template. It renders correctly once and never again, so this is the assertion that
        // separates "cloned" from "worked this time".
        expect(content.children).toHaveLength(1);
        // And the counted rows are all inside the list -- a template's content is inert, so its own
        // copy must never be reachable from the document.
        expect(doc.querySelectorAll('.row')).toHaveLength(1);
      },
    },
    {
      name: 'rendering again replaces the rows, and works as well the second time',
      run: ({ doc, fn, expect }) => {
        const list = requireElement(doc, 'list');
        const renderRows = fn<RenderRows>('renderRows');

        renderRows(list, ['Ada', 'Grace']);
        renderRows(list, ['Linus']);

        expect(list.children).toHaveLength(1);
        expect(list.querySelector('.name')).toHaveTextContent('Linus');
      },
    },
    {
      name: 'a name that looks like markup is inserted as text',
      run: ({ doc, fn, expect }) => {
        const list = requireElement(doc, 'list');
        fn<RenderRows>('renderRows')(list, ['<b>bold</b>']);

        expect(list.querySelectorAll('b')).toHaveLength(0);
        expect(list.querySelector('.name')).toHaveTextContent('<b>bold</b>');
      },
    },
    {
      name: 'an empty list of names clears the rows',
      run: ({ doc, fn, expect }) => {
        const list = requireElement(doc, 'list');
        const renderRows = fn<RenderRows>('renderRows');

        renderRows(list, ['Ada', 'Grace']);
        renderRows(list, []);

        expect(list.children).toHaveLength(0);
      },
    },
  ],
  solutions: [
    {
      label: 'Clone the template into a fragment',
      code: [
        'export function renderRows(list: HTMLUListElement, names: string[]): void {',
        "  const template = document.querySelector<HTMLTemplateElement>('#row-template');",
        '  if (!template) return;',
        '',
        '  const batch = document.createDocumentFragment();',
        '',
        '  for (const name of names) {',
        '    const row = template.content.cloneNode(true) as DocumentFragment;',
        "    const label = row.querySelector('.name');",
        '    if (label) label.textContent = name;',
        '    batch.append(row);',
        '  }',
        '',
        '  list.replaceChildren(batch);',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'A `<template>` is parsed but not rendered. Its children do not live in the document at all —',
        'they live in a `DocumentFragment` hanging off `template.content`, where no selector, no style',
        'rule and no script that walks the document can reach them. That is what makes it a safe place',
        'to keep a shape you intend to stamp out repeatedly.',
        '',
        '`cloneNode(true)` is the whole trick, and the `true` is load-bearing: a shallow clone copies',
        'the fragment and leaves its children behind. What comes back is a **new** fragment holding a',
        'copy of the row, so the template is untouched and can be cloned again on the next call.',
        '',
        'Reach for `template.content.cloneNode(true)` rather than `template.content` itself. Appending',
        'the content directly *moves* those nodes into the document — the same move-not-copy rule that',
        'makes `list.append(existingRow)` relocate a row rather than duplicate it. It renders correctly',
        'exactly once, and then the template is empty and every later render produces nothing.',
        '',
        'The rows are collected into a second fragment before they are inserted. A fragment is a node',
        'with no parent and no document, so building inside one costs nothing, and inserting it splices',
        'its children in and leaves the fragment empty — one insertion instead of one per row.',
        '',
        '`replaceChildren` is the replace half. It removes whatever was there and inserts the new',
        'children in a single call, which is why calling `renderRows` twice leaves only the second set',
        'of names, and why passing an empty array clears the list.',
        '',
        '`textContent = name` writes a text node. The angle brackets in `<b>bold</b>` end up as',
        'characters on screen rather than as an element, which is the difference between rendering a',
        "user's name and letting them run script in your page.",
      ].join('\n'),
      tradeoffs: [
        'The structure of a row lives in the HTML, where it can be read, styled and reviewed alongside',
        'the rest of the markup, and the JavaScript only fills in the parts that vary. That is the',
        'reason to prefer this shape: the shape of a row is not a string buried in a function.',
        '',
        'What it costs:',
        '',
        '- The link between the two halves is a selector. Rename `.name` in the template and nothing',
        '  fails — the row renders blank. `createElement` at least breaks loudly.',
        '- Every clone is a fresh subtree, so re-rendering a thousand rows rebuilds a thousand rows.',
        '  A list that changes one row at a time wants keyed reconciliation, which is the problem React',
        '  and its relatives exist to solve.',
        '- `template.content` is a fragment, so `cloneNode(true)` gives you a fragment, not the `<li>`.',
        '  `template.content.firstElementChild.cloneNode(true)` gives you the element directly, which',
        '  is more convenient when you need a reference to the row you just made.',
        '',
        'The third option is `list.innerHTML = names.map(...).join("")`. It is the shortest and it is',
        'the one that ships cross-site scripting: a name containing `<img onerror=...>` is markup by',
        'the time the parser sees it. If you build HTML from strings you own escaping every',
        'interpolation forever, and the failure is silent until it is not.',
      ].join('\n'),
    },
    {
      label: 'Build each row with createElement',
      code: [
        'export function renderRows(list: HTMLUListElement, names: string[]): void {',
        '  const batch = document.createDocumentFragment();',
        '',
        '  for (const name of names) {',
        "    const row = document.createElement('li');",
        "    row.className = 'row';",
        '',
        "    const label = document.createElement('span');",
        "    label.className = 'name';",
        '    label.textContent = name;',
        '',
        "    const remove = document.createElement('button');",
        "    remove.type = 'button';",
        "    remove.className = 'remove';",
        "    remove.textContent = 'Remove';",
        '',
        '    row.append(label, remove);',
        '    batch.append(row);',
        '  }',
        '',
        '  list.replaceChildren(batch);',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'No template, no cloning: each row is assembled from scratch. `createElement` returns a node',
        'that belongs to the document but is not in it, so nothing is rendered and nothing is measured',
        'until the row is inserted.',
        '',
        '`append` takes several nodes at once, which is why the label and the button go in with one',
        'call, and it accepts strings as well — `row.append(label, remove)` and',
        "`row.append(label, 'Remove')` are both valid, and the string form creates a text node, so it",
        'escapes for the same reason `textContent` does.',
        '',
        'The fragment and the `replaceChildren` at the end do exactly what they do above. That part of',
        'the shape is independent of how the rows were made.',
      ].join('\n'),
      tradeoffs: [
        'Choose this when the row is small, when its structure depends on the data (an optional badge,',
        'a different element per kind), or when you want a direct reference to each node you built —',
        '`label` is right there, with no query to write and nothing to keep in step with the markup.',
        '',
        'Choose the template when the row is bigger than about three elements. Eight lines of',
        '`createElement` and `className` describe a shape that one line of HTML describes better, and',
        'a reviewer reading the JavaScript version has to run it in their head to know what it renders.',
        '',
        'One real advantage over the template: this version cannot render a blank row because a class',
        'name drifted. There is no selector to get wrong — the label is the variable you just made.',
      ].join('\n'),
    },
  ],
};
