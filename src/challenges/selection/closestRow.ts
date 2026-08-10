import type { Challenge } from '@/types/challenge';

export const closestRow: Challenge = {
  id: 'selection-closest-row',
  slug: 'closest-row',
  title: 'Walk up to the containing row',
  category: 'selection',
  difficulty: 'intermediate',
  concepts: ['closest', 'parentElement', 'matches', 'event delegation'],
  relatedIds: ['selection-query-basics'],
  prompt: [
    'One click handler on the table has to serve every row. The event target it receives is',
    'whatever the user actually pressed — usually the `<span>` inside a cell, sometimes the `<td>`,',
    'sometimes the `<tr>` itself — but the handler only cares about the row that contains it.',
    '',
    'Export a function `findRow(start)` that takes an `Element` and returns:',
    '',
    '- the nearest `<tr>` at or above `start` — the search includes `start` itself;',
    '- `null` when there is no `<tr>` above `start` at all.',
  ].join('\n'),
  html: [
    '<table id="grid">',
    '  <tbody>',
    '    <tr id="row-1"><td><span id="cell-a">A1</span></td><td>B1</td></tr>',
    '    <tr id="row-2"><td><span id="cell-b">A2</span></td><td>B2</td></tr>',
    '  </tbody>',
    '</table>',
    '<p id="outside">not in the table</p>',
  ].join('\n'),
  starterCode: ['export function findRow(start: Element): HTMLElement | null {', '  return null;', '}', ''].join('\n'),
  tests: [
    {
      name: 'finds the row from a deeply nested cell',
      run: ({ doc, fn, expect }) => {
        const findRow = fn<(start: Element) => HTMLElement | null>('findRow');
        const cell = doc.getElementById('cell-b');
        expect(cell).not.toBeNull();
        if (!cell) return;
        expect(findRow(cell)?.id).toBe('row-2');
      },
    },
    {
      name: 'returns the element itself when it is already a row',
      run: ({ doc, fn, expect }) => {
        const findRow = fn<(start: Element) => HTMLElement | null>('findRow');
        const row = doc.getElementById('row-1');
        expect(row).not.toBeNull();
        if (!row) return;
        expect(findRow(row)?.id).toBe('row-1');
      },
    },
    {
      name: 'returns null when there is no row above the element',
      run: ({ doc, fn, expect }) => {
        const findRow = fn<(start: Element) => HTMLElement | null>('findRow');
        const outside = doc.getElementById('outside');
        expect(outside).not.toBeNull();
        if (!outside) return;
        expect(findRow(outside)).toBeNull();
      },
    },
  ],
  solutions: [
    {
      label: 'closest',
      code: [
        'export function findRow(start: Element): HTMLElement | null {',
        "  return start.closest('tr');",
        '}',
        '',
      ].join('\n'),
      explanation: [
        '`closest` tests the element *itself* first and only then walks up through its ancestors.',
        'That first test is the whole reason the second case works: hand it a `<tr>` and you get the',
        'same row back, not the row above it — there is no row above it.',
        '',
        'The walk is native and stops at the document root, where it returns `null` rather than',
        'running off the top of the tree. And because it takes a full CSS selector, the same call',
        "shape covers `closest('[data-row-id]')` or `closest('.row:not(.header)')` unchanged.",
      ].join('\n'),
      tradeoffs: [
        'This is the one to reach for in real code: in a delegated handler it is usually the entire',
        'body of the function.',
        '',
        'Two limits worth knowing. It climbs as far as the document, so with nested tables the',
        'nearest `<tr>` may belong to an inner table rather than yours — narrow the selector',
        "(`closest('#grid > tbody > tr')`) when that distinction matters. And it does not cross a",
        'shadow boundary: called on an element inside a shadow root it stops at the root and returns',
        '`null`, even when a matching ancestor exists in the light DOM outside the component.',
      ].join('\n'),
    },
    {
      label: 'Manual parent walk',
      code: [
        'export function findRow(start: Element): HTMLElement | null {',
        '  let node: Element | null = start;',
        '  while (node) {',
        "    if (node.tagName === 'TR') return node as HTMLElement;",
        '    node = node.parentElement;',
        '  }',
        '  return null;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'This is `closest` written out by hand, and it is worth writing once to see the shape: test',
        'the current node, then step up, and let the loop end when there is nothing left above.',
        '',
        '`tagName` is uppercase for HTML elements in an HTML document, hence `TR` rather than `tr`.',
        '',
        'The `as HTMLElement` is deliberate. `node` is typed `Element`, and the narrowing that looks',
        'right — `if (node instanceof HTMLElement)` — is the one thing you must not write here: code',
        'you submit runs inside a sandboxed frame, and `instanceof` compares against the `HTMLElement`',
        'of the realm the *check* was written in. Two realms, two separate class objects, so the test',
        'is `false` for elements that are perfectly good `HTMLElement`s from the other side of the',
        'boundary. The `tagName` comparison above is a structural test that reads the same in every',
        'realm, and the assertion only tells the compiler what that test already established. Prefer',
        'the same order anywhere DOM values cross a frame: check a structural property, then assert.',
        '',
        'The load-bearing choice is `parentElement`, not `parentNode`. `parentElement` is `null` once',
        'you reach `<html>`, so the loop ends exactly at the top of the element tree. `parentNode`',
        'climbs one step further, into the `Document` node — which is not an `Element` and has no',
        '`matches`, `classList`, or `closest`. The tag comparison above happens to survive that extra',
        'step, but any richer condition throws on it. That is the classic off-by-one in this pattern.',
      ].join('\n'),
      tradeoffs: [
        'Reach for the explicit walk when the stopping condition is not expressible as a selector —',
        '"climb until an ancestor has a `data-row-id`", or "stop at the first scroll container" — and',
        'when you need to do something at every level on the way up rather than only at the match.',
        '',
        'Otherwise it costs you: five lines instead of one, and it is tag-only. Generalising it to',
        '`.row[data-id]` means hand-rolling the matching that `closest` already does. The uppercase',
        '`tagName` comparison is also a quiet assumption — SVG and XML elements keep their original',
        "case, so `tagName === 'TR'` silently stops matching outside HTML.",
      ].join('\n'),
    },
    {
      label: 'matches loop',
      code: [
        'export function findRow(start: Element): HTMLElement | null {',
        '  let node: Element | null = start;',
        "  while (node && !node.matches('tr')) node = node.parentElement;",
        '  return node as HTMLElement | null;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        '`matches` tests one element against a selector, so putting it in the loop condition buys back',
        "the selector generality the manual walk gave up: swap `'tr'` for `'.row[data-id]'` and nothing",
        'else changes.',
        '',
        'Two details carry the whole function. The condition is evaluated before the first climb, which',
        'is what returns `start` unchanged when it is already a row. And `node &&` short-circuits the',
        '`matches` call, so reaching the top of the tree exits the loop with `node === null` — which is',
        'exactly the value the caller should get.',
        '',
        '`as HTMLElement | null` closes the same gap as in the manual walk, for the same reason: the',
        "loop only exits once `matches('tr')` has held (or `node` is `null`), which is a structural",
        'fact `Element` does not carry in its type. An `instanceof HTMLElement` guard would look safer',
        'and be wrong — submitted code runs in its own realm with its own DOM classes, so the check',
        'fails on exactly the elements it is meant to accept.',
      ].join('\n'),
      tradeoffs: [
        'This is `closest` with two ways to get it wrong, which is mostly what it is good for:',
        'understanding what you are being handed for free.',
        '',
        'Move the climb above the test — a `do…while`, or an innocent-looking `node = node.parentElement`',
        'before the loop — and an element that is already a row returns the row above it instead of',
        'itself. Drop the `node &&` guard and it throws `Cannot read properties of null` the moment',
        'nothing matches, which is the failing path nobody exercises by hand.',
        '',
        'Worth writing only where `closest` is unavailable, or where the predicate is *almost* a',
        'selector but needs one extra check per level that a selector cannot express.',
      ].join('\n'),
    },
  ],
};
