import type { ChallengeContent, TestContext } from '@/types/challenge';

import { requireElement } from './support';

/**
 * `Element` rather than `HTMLTableRowElement`: the tests read `tagName`, children and text, none of
 * which needs the narrower type, and `requireElement` never has to be narrowed to match it. The
 * prompt says `HTMLTableRowElement`, which is what a learner's own signature should say.
 */
type RowFrom = (cells: string[]) => Element;

/**
 * Calls the submitted function and insists it handed back a node.
 *
 * The wrong answer this challenge exists to reject returns **`null`** -- a `<tr>` parsed inside a
 * `<div>` is dropped, so `wrapper.firstElementChild` is nothing at all. Without this, every test
 * would fail with "Cannot read properties of null", which points at the test rather than at the
 * return value. Naming the value is what makes the failure the function's.
 *
 * `fn` is typed as `TestContext['fn']` rather than spelled out: writing `<T>(name: string) => T`
 * here re-declares a type parameter used once, which `no-unnecessary-type-parameters` rejects.
 */
function rowFrom(fn: TestContext['fn'], cells: string[]): Element {
  const row = fn<RowFrom>('rowFrom')(cells);
  if (!row) throw new Error(`rowFrom returned ${String(row)} rather than a <tr>`);
  return row;
}

export const tableContext: ChallengeContent = {
  prompt: [
    'A table with a header and an empty body. Export `rowFrom(cells)` that **builds and returns** one',
    '`<tr>` holding one `<td>` per string — and inserts nothing. The test puts the row into the table',
    'itself.',
    '',
    'This is the ordinary "turn some markup into an element" job, and the ordinary way to do it does',
    'not work here. Run the starter first: it is the helper that lives in every codebase, it returns',
    '`null`, and no error is raised anywhere.',
  ].join('\n'),
  html: [
    '<table id="grid">',
    '  <thead>',
    '    <tr id="head"><th>Name</th><th>Role</th></tr>',
    '  </thead>',
    '  <tbody id="body"></tbody>',
    '</table>',
  ].join('\n'),
  starterCode: [
    'export function rowFrom(cells: string[]): HTMLTableRowElement {',
    "  const markup = `<tr>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`;",
    '',
    "  const wrapper = document.createElement('div');",
    '  wrapper.innerHTML = markup;',
    '',
    '  return wrapper.firstElementChild as HTMLTableRowElement;',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'hands back a tr holding one td per cell',
      run: ({ fn, expect }) => {
        const row = rowFrom(fn, ['Ada', 'Engineer']);

        expect(row.tagName).toBe('TR');
        expect(row.children).toHaveLength(2);
        expect([...row.children].map((cell) => cell.tagName)).toEqual(['TD', 'TD']);
        expect([...row.children].map((cell) => cell.textContent)).toEqual(['Ada', 'Engineer']);
      },
    },
    {
      name: 'the row it hands back is the row that lands in the table',
      run: ({ doc, fn, expect }) => {
        const body = requireElement(doc, 'body');
        const row = rowFrom(fn, ['Ada', 'Engineer']);

        // Nothing is inserted by the function: the test owns the insertion, which is what stops a
        // solution from writing into the real `<tbody>` and calling that a row it built.
        expect(body.children).toHaveLength(0);

        body.append(row);

        expect(row.parentElement).toBe(body);
        expect(doc.querySelectorAll('#body tr')).toHaveLength(1);
        expect(doc.querySelectorAll('#body td')).toHaveLength(2);
      },
    },
    {
      name: 'a cell that looks like markup is inserted as text',
      run: ({ doc, fn, expect }) => {
        const body = requireElement(doc, 'body');
        body.append(rowFrom(fn, ['<b>bold</b>', 'Engineer']));

        expect(doc.querySelectorAll('#body b')).toHaveLength(0);
        expect(doc.querySelector('#body td')).toHaveTextContent('<b>bold</b>');
      },
    },
    {
      name: 'it reads the array it was given',
      run: ({ doc, fn, expect }) => {
        const body = requireElement(doc, 'body');
        body.append(rowFrom(fn, ['Grace', 'Admiral', 'COBOL']));

        expect([...(doc.querySelector('#body tr')?.children ?? [])].map((cell) => cell.textContent)).toEqual([
          'Grace',
          'Admiral',
          'COBOL',
        ]);
      },
    },
    {
      name: 'the header row and its cells are the same nodes afterwards',
      run: ({ doc, fn, expect }) => {
        const grid = requireElement(doc, 'grid');
        const head = requireElement(doc, 'head');
        const [nameCell, roleCell] = [...head.children];
        if (!nameCell || !roleCell) throw new Error('the header should start with two cells');
        requireElement(doc, 'body').append(rowFrom(fn, ['Ada', 'Engineer']));

        // Every assertion here is an identity read against a node that is still expected to be in
        // the *document*, and both halves of that matter.
        //
        // Anchoring on the header's own ancestor instead -- `head.parentElement?.tagName` -- proves
        // nothing: a `#grid` rebuild detaches the whole `<thead>` with this row still inside it, so
        // the parent is a `<thead>` either way. Walking up to `#grid`, which the test is holding, is
        // what makes the detachment visible.
        //
        // And the cells are compared with `toBe`, never `toEqual`: `deepEqual` compares own
        // enumerable keys, DOM elements have none, so *any* two nodes are `toEqual` -- a `<div>`
        // equals an `<li>`, and a text node equals an element. See AGENTS.md section 8.
        expect(head.parentElement?.parentElement).toBe(grid);
        expect(nameCell.parentElement).toBe(head);
        expect(roleCell.parentElement).toBe(head);
      },
    },
  ],
  solutions: [
    {
      label: 'Build the row with createElement',
      code: [
        'export function rowFrom(cells: string[]): HTMLTableRowElement {',
        "  const row = document.createElement('tr');",
        '',
        '  for (const cell of cells) {',
        "    const td = document.createElement('td');",
        '    td.textContent = cell;',
        '    row.append(td);',
        '  }',
        '',
        '  return row;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The starter is the helper that lives in every codebase — make a `<div>`, set its `innerHTML`,',
        'take the first child — and for a table row it hands back `null`.',
        '',
        '`innerHTML` does not "make elements from a string". It runs the **fragment parsing algorithm**,',
        'and that algorithm starts in an insertion mode chosen by the **context element** — the element',
        'whose `innerHTML` you assigned. A `<div>` puts the parser "in body", and in that mode a `<tr>`',
        'start tag is not an error and not an unknown element: it is **ignored**, while the text inside',
        'it is foster-parented out to where the parser thinks it belongs. Measured, both engines:',
        '',
        '```js',
        "div.innerHTML = '<tr><td>x</td></tr>';",
        'div.childElementCount; // 0',
        'div.innerHTML;         // "x"',
        '```',
        '',
        'The same disappearance happens to `<td>`, `<th>`, `<tbody>`, `<caption>` and `<col>`.',
        '`<li>` and `<option>` come through a `<div>` intact — which is exactly why this bug survives',
        'so long: the generic helper works for everything its author happened to try.',
        '',
        '`createElement` has no parser, no string and no context. It creates precisely the element you',
        'named, wherever you are, and the row it returns is a real `<tr>` that behaves like one the',
        'moment it is inserted into a table.',
        '',
        'Note what is *not* broken here: `tbody.innerHTML = "<tr>…"` works perfectly, because then the',
        'context element really is a `<tbody>`. The bug only appears when the row is built somewhere',
        'else first — which is what a reusable helper always does.',
      ].join('\n'),
      tradeoffs: [
        'Everywhere else in this category, "build the nodes" versus "write the markup" is a judgement',
        'call — escaping, listeners, reparsing, readability. **Here it is not a judgement call.** The',
        'string route through a neutral container cannot express a table row at all, so this is the',
        'one place where building the nodes strictly beats writing the markup.',
        '',
        'The usual cost still applies: it is longer, and a row that is more than a handful of cells',
        'reads better as HTML. The template below is how to get that back without the context problem.',
        '',
        'If you write a generic `htmlToElement(markup)` helper for your codebase, this is the case that',
        'decides its implementation. A `<div>` is the obvious container and the wrong one.',
      ].join('\n'),
    },
    {
      label: 'Parse it inside a <template>',
      code: [
        'function escapeHtml(value: string): string {',
        "  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');",
        '}',
        '',
        'export function rowFrom(cells: string[]): HTMLTableRowElement {',
        "  const tds = cells.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('');",
        '',
        "  const parser = document.createElement('template');",
        '  parser.innerHTML = `<tr>${tds}</tr>`;',
        '',
        '  const row = parser.content.firstElementChild;',
        "  if (!(row instanceof HTMLTableRowElement)) throw new Error('the row did not parse');",
        '',
        '  return row;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The string route, in the one container that can hold anything.',
        '',
        'A `<template>` has its own insertion mode in the parser, and its content model is deliberately',
        'unrestricted — a template may contain a table row, a list item, a cell, or anything else,',
        'because it is markup being *stored* rather than markup being *placed*. So the same string that',
        'vanishes in a `<div>` survives here:',
        '',
        '```js',
        "parser.innerHTML = '<tr><td>x</td></tr>';",
        'parser.content.firstElementChild; // <tr>',
        '```',
        '',
        'This is the second reason `<template>` exists, alongside holding a shape to stamp out: it is',
        'the **correct generic container** for turning a string into nodes. A helper written this way',
        'has no context to get wrong, for any element.',
        '',
        'Taking the row out of `parser.content` is a plain read; returning it hands the caller a node',
        "that is still a child of the fragment, and the caller's insertion moves it out — which is fine",
        'here because the template was made for this one call and is thrown away with it.',
      ].join('\n'),
      tradeoffs: [
        'Choose this when the shape is genuinely markup-shaped and there is a lot of it: one parse for',
        'a whole row beats one `createElement` per cell, and a nine-element row reads far better as',
        'HTML than as nine variables.',
        '',
        'What it costs is the escaping, and it is the same bargain as everywhere else in this category:',
        'the moment a cell comes from a person, `escapeHtml` is a promise you are making forever, and',
        'the three replacements above are enough between tags and not enough inside an attribute.',
        '',
        'Two smaller notes:',
        '',
        '- **The template is disposable here.** Reusing one across calls means the node you return is',
        "  moved out of it by the caller's insertion, and the second call finds it empty — the trap the",
        '  fragment challenge is about. Make a fresh one, or clone what you take.',
        '- `instanceof HTMLTableRowElement` is a safe narrowing in this code because the element and the',
        '  check share a window. Written inside a challenge *test* it would be wrong, since the element',
        '  comes from the preview frame and the constructor from the app.',
      ].join('\n'),
    },
  ],
};
