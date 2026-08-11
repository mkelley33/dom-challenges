import type { Challenge } from '@/types/challenge';

import { requireElement } from './support';

export const siblingTraversal: Challenge = {
  id: 'selection-sibling-traversal',
  slug: 'sibling-traversal',
  title: 'The row before and the row after',
  category: 'selection',
  difficulty: 'intermediate',
  concepts: ['nextElementSibling', 'previousElementSibling', 'nextSibling', 'text nodes'],
  relatedIds: ['selection-first-element-child'],
  prompt: [
    'A keyboard handler needs to move the selection up and down this list. Export two functions,',
    'each taking the row the user is on:',
    '',
    '- `nextRowId(current)` — the `id` of the row after it, or `null` if it is the last one;',
    '- `previousRowId(current)` — the `id` of the row before it, or `null` if it is the first one.',
    '',
    'Running off either end is normal — the user pressing Down on the last row is not an error, so',
    'neither function may throw there.',
  ].join('\n'),
  html: [
    '<ul id="rows">',
    '  <li id="row-1">One</li>',
    '  <li id="row-2">Two</li>',
    '  <li id="row-3">Three</li>',
    '</ul>',
  ].join('\n'),
  starterCode: [
    'export function nextRowId(current: Element): string | null {',
    '  return null;',
    '}',
    '',
    'export function previousRowId(current: Element): string | null {',
    '  return null;',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'the row after the first one is the second',
      run: ({ doc, fn, expect }) => {
        // The rows are on separate lines, so `#row-1.nextSibling` is the whitespace between them.
        // A text node has no `id`, so that route returns `undefined` here rather than "row-2".
        expect(fn<(current: Element) => string | null>('nextRowId')(requireElement(doc, 'row-1'))).toBe('row-2');
      },
    },
    {
      name: 'the row before the last one is the middle one',
      run: ({ doc, fn, expect }) => {
        expect(fn<(current: Element) => string | null>('previousRowId')(requireElement(doc, 'row-3'))).toBe('row-2');
      },
    },
    {
      name: 'there is no row after the last one',
      run: ({ doc, fn, expect }) => {
        // The end of the list is still a whitespace text node, so a `nextSibling` walk reports
        // `undefined` -- not `null` -- and a non-null assertion throws instead of answering.
        expect(fn<(current: Element) => string | null>('nextRowId')(requireElement(doc, 'row-3'))).toBeNull();
      },
    },
    {
      name: 'there is no row before the first one',
      run: ({ doc, fn, expect }) => {
        expect(fn<(current: Element) => string | null>('previousRowId')(requireElement(doc, 'row-1'))).toBeNull();
      },
    },
    {
      name: 'follows the list as it is now, not the order it was written in',
      run: ({ doc, fn, expect }) => {
        const inserted = doc.createElement('li');
        inserted.id = 'row-1a';
        inserted.textContent = 'One and a half';
        requireElement(doc, 'row-1').after(inserted);

        expect(fn<(current: Element) => string | null>('nextRowId')(requireElement(doc, 'row-1'))).toBe('row-1a');
        expect(fn<(current: Element) => string | null>('previousRowId')(requireElement(doc, 'row-2'))).toBe('row-1a');
      },
    },
  ],
  solutions: [
    {
      label: 'nextElementSibling and previousElementSibling',
      code: [
        'export function nextRowId(current: Element): string | null {',
        '  return current.nextElementSibling?.id ?? null;',
        '}',
        '',
        'export function previousRowId(current: Element): string | null {',
        '  return current.previousElementSibling?.id ?? null;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'Two traps, and the element-level properties disarm both.',
        '',
        'The first is `nextSibling`. It is the next *node*, and between two `<li>` elements written on',
        'separate lines that node is the line break — a text node with no `id`, no `classList`, and no',
        '`matches`. `current.nextSibling.id` is `undefined`, which is not `"row-2"` and is not `null`',
        'either, so it fails both kinds of assertion in this challenge. Minify the same markup and the',
        'text nodes vanish, so code built on `nextSibling` works in production and breaks in',
        'development, or the other way round.',
        '',
        'The second is the end of the list. `nextElementSibling` is `null` there, and the whole job of',
        '`?.` followed by `?? null` is to carry that `null` through the `.id` without a branch. Writing',
        '`current.nextElementSibling!.id` instead swaps a `null` return for a `TypeError` the first time',
        'a user presses Down on the last row — a crash on the most ordinary keystroke there is.',
        '',
        '`?? null` rather than `|| null` matters for the same reason it usually does: an `id` of `""` is',
        'falsy, and `||` would report a row with no id as no row at all.',
      ].join('\n'),
      tradeoffs: [
        'This is the version to write. It is O(1), it reads as the sentence it implements, and it has',
        'the same shape in both directions.',
        '',
        'Its one limitation is that "next" means the next sibling, not the next row *anywhere*. When',
        'the list is split across `<tbody>` elements or wrapped in groups, the last row of one group',
        'has no next sibling even though there is visibly a row below it. At that point the question',
        'is about the flattened list, not about siblings, and the index-based version below is closer',
        'to what you need.',
      ].join('\n'),
    },
    {
      label: 'Walk nextSibling and skip the non-elements',
      code: [
        'function nextElement(node: Node): Element | null {',
        '  let candidate: Node | null = node.nextSibling;',
        '  while (candidate !== null && candidate.nodeType !== Node.ELEMENT_NODE) {',
        '    candidate = candidate.nextSibling;',
        '  }',
        '  return candidate as Element | null;',
        '}',
        '',
        'function previousElement(node: Node): Element | null {',
        '  let candidate: Node | null = node.previousSibling;',
        '  while (candidate !== null && candidate.nodeType !== Node.ELEMENT_NODE) {',
        '    candidate = candidate.previousSibling;',
        '  }',
        '  return candidate as Element | null;',
        '}',
        '',
        'export function nextRowId(current: Element): string | null {',
        '  return nextElement(current)?.id ?? null;',
        '}',
        '',
        'export function previousRowId(current: Element): string | null {',
        '  return previousElement(current)?.id ?? null;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        '`nextElementSibling` written out by hand: step along `nextSibling` until the node is an',
        'element or the siblings run out. Worth reading once, because it shows that the element',
        'properties are not a different traversal — they are the same one with the text and comment',
        'nodes skipped.',
        '',
        'The loop condition tests `candidate !== null` before touching `nodeType`, which is what makes',
        'reaching the end of the list return `null` instead of throwing. `nodeType !== 1` is the',
        'structural test for "not an element"; it reads the same for a node from any window, where',
        "`instanceof Element` compares against one window's constructor.",
        '',
        'The cast on the return is the one thing TypeScript cannot work out for itself: the loop only',
        'exits when the node is an element or is `null`, and that is a fact about the loop, not',
        'something the type of `nextSibling` records.',
      ].join('\n'),
      tradeoffs: [
        'Fourteen lines for what two properties already do, so this is for understanding rather than',
        'for shipping. It becomes the right shape only when the predicate is not "is an element" —',
        '"the next sibling that is visible", "the next one that is not a group header" — where the',
        'built-in property has no hook for the extra condition.',
      ].join('\n'),
    },
    {
      label: 'Index into the parent’s children',
      code: [
        'function siblingsOf(element: Element): Element[] {',
        '  return Array.from(element.parentElement?.children ?? []);',
        '}',
        '',
        'export function nextRowId(current: Element): string | null {',
        '  const siblings = siblingsOf(current);',
        '  return siblings[siblings.indexOf(current) + 1]?.id ?? null;',
        '}',
        '',
        'export function previousRowId(current: Element): string | null {',
        '  const siblings = siblingsOf(current);',
        '  const index = siblings.indexOf(current);',
        '  return index <= 0 ? null : (siblings[index - 1]?.id ?? null);',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'Materialise the element children, find where the current row sits, and step one place. The',
        'conversion to an array is what makes `indexOf` available — `children` is an `HTMLCollection`',
        'and has no `indexOf` of its own.',
        '',
        'The guard in `previousRowId` is the reason this version is worth writing out: `indexOf`',
        'returns `0` for the first row, and `siblings[-1]` is `undefined`, which happens to give the',
        'right answer. But `indexOf` also returns `-1` when the element is not in the list at all, and',
        '`siblings[-2]` is `undefined` too — so the accidental success hides the case where the input',
        'was detached from the document. `index <= 0` handles both deliberately.',
      ].join('\n'),
      tradeoffs: [
        'Linear where the sibling properties are constant-time, and it allocates an array on every',
        'call. For a list of ten rows that is nothing; inside a keydown handler on a table of ten',
        'thousand it is an array of ten thousand elements per keystroke.',
        '',
        'What it buys is arithmetic. Wrapping around at the ends (`(index + 1) % siblings.length`),',
        'jumping a page at a time, or moving to the first or last row are all one expression here and',
        'all awkward with the sibling properties. It is also the version that generalises when the',
        'rows are not siblings at all — build the array with a `querySelectorAll` over the whole table',
        'and the same index arithmetic crosses group boundaries.',
      ].join('\n'),
    },
  ],
};
