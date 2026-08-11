import type { Challenge } from '@/types/challenge';

import { requireElement } from './support';

/** The shape `counts()` hands back. */
interface Counts {
  children: number;
  childNodes: number;
}

export const childrenVsChildNodes: Challenge = {
  id: 'selection-children-vs-childnodes',
  slug: 'children-vs-childnodes',
  title: 'Whitespace between the tags is a node',
  category: 'selection',
  difficulty: 'intermediate',
  concepts: ['children', 'childNodes', 'text nodes', 'nodeType', 'childElementCount'],
  relatedIds: ['selection-scoped-query'],
  prompt: [
    'The list below is written across several lines, with a comment in the middle of it — ordinary,',
    'readable markup.',
    '',
    'Export a function `counts()` that returns how many children `#list` has, counted two ways:',
    '',
    '```ts',
    '{ children: number; childNodes: number }',
    '```',
    '',
    'The two numbers are not the same, and the gap between them is the point. Read them from the',
    'document — the test changes the list before it asks.',
  ].join('\n'),
  html: [
    '<ul id="list">',
    '  <li>One</li>',
    '  <li>Two</li>',
    '  <!-- a note between the items -->',
    '  <li>Three</li>',
    '</ul>',
  ].join('\n'),
  starterCode: [
    'export interface Counts {',
    '  children: number;',
    '  childNodes: number;',
    '}',
    '',
    'export function counts(): Counts {',
    '  return { children: 0, childNodes: 0 };',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'counts the three element children',
      run: ({ fn, expect }) => {
        expect(fn<() => Counts>('counts')().children).toBe(3);
      },
    },
    {
      name: 'counts every child node: five runs of whitespace and a comment as well as the three items',
      run: ({ fn, expect }) => {
        // 3 elements + 1 comment + 5 text nodes. The text nodes are the line breaks and indentation
        // between the tags: one before each item, one before the comment, one after the last item.
        expect(fn<() => Counts>('counts')().childNodes).toBe(9);
      },
    },
    {
      name: 'reads the list rather than reporting two numbers written by hand',
      run: ({ doc, fn, expect }) => {
        const item = doc.createElement('li');
        item.textContent = 'Four';
        // Appended with no whitespace around it, so this adds exactly one node -- and it is an
        // element, so it lands in both counts.
        requireElement(doc, 'list').append(item);

        const result = fn<() => Counts>('counts')();
        expect(result.children).toBe(4);
        expect(result.childNodes).toBe(10);
      },
    },
  ],
  solutions: [
    {
      label: 'children and childNodes',
      code: [
        'export interface Counts {',
        '  children: number;',
        '  childNodes: number;',
        '}',
        '',
        'export function counts(): Counts {',
        "  const list = document.getElementById('list');",
        '  if (!list) return { children: 0, childNodes: 0 };',
        '',
        '  return { children: list.children.length, childNodes: list.childNodes.length };',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'Nine child nodes for a list with three items, because a DOM tree contains everything that was',
        'in the markup — not only the tags:',
        '',
        '- three `<li>` **element** nodes;',
        '- one **comment** node;',
        '- five **text** nodes, each one a line break plus the indentation that follows it. There is one',
        '  between every pair of siblings, one before the first, and one after the last.',
        '',
        'Nothing here is whitespace the browser "ignores". CSS decides whether whitespace is *rendered*;',
        'the parser has already put it in the tree either way, and the DOM API sees all of it.',
        '',
        '`children` is the element-only view: an `HTMLCollection` holding the three `<li>` elements and',
        'nothing else. `childNodes` is everything: a `NodeList` of all nine. `childElementCount` is the',
        'same number as `children.length` without materialising the collection.',
        '',
        'This one fact is behind a whole family of bugs. `firstChild` is a text node, not your first',
        'item. `childNodes[1]` is the *first* `<li>` in this markup and the *second* in markup written',
        'without line breaks, so any code that indexes `childNodes` breaks when someone reformats a',
        'template — or when a minifier strips the whitespace in production but not in development.',
      ].join('\n'),
      tradeoffs: [
        'Reach for `children` — and `firstElementChild`, `lastElementChild`, `nextElementSibling` —',
        'for anything structural. That is nearly always what "child" means when you say it out loud.',
        '',
        'Reach for `childNodes` when you actually care about content: reading or rewriting text,',
        'walking a document to extract it, sanitising, or counting what a range covers. Text nodes are',
        'invisible to the element APIs, and the whole point of a `TreeWalker` is to visit them.',
        '',
        'Both collections are live, so both re-read the tree on every access. Caching `list.children`',
        'in a variable does not freeze it: appending an item changes the length of the value you are',
        'already holding.',
      ].join('\n'),
    },
    {
      label: 'Filter childNodes by nodeType',
      code: [
        'export interface Counts {',
        '  children: number;',
        '  childNodes: number;',
        '}',
        '',
        'export function counts(): Counts {',
        "  const list = document.getElementById('list');",
        '  if (!list) return { children: 0, childNodes: 0 };',
        '',
        '  const all = Array.from(list.childNodes);',
        '  const elements = all.filter((node) => node.nodeType === Node.ELEMENT_NODE);',
        '',
        '  return { children: elements.length, childNodes: all.length };',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The same two numbers, derived from one collection, which is worth writing once because it says',
        'what `children` *is*: exactly the `childNodes` whose `nodeType` is `1`.',
        '',
        'The node types you meet in practice are `Node.ELEMENT_NODE` (1), `Node.TEXT_NODE` (3),',
        '`Node.COMMENT_NODE` (8), `Node.DOCUMENT_NODE` (9), and `Node.DOCUMENT_FRAGMENT_NODE` (11).',
        'Filtering for `3` here would give five, for `8` one.',
        '',
        '`nodeType` is worth preferring to `instanceof Element` when the node might have come from',
        'somewhere else — an `<iframe>`, a popup, a template in another document. Each window has its',
        "own `Element` constructor, so an element from one fails `instanceof` against another's; the",
        'numbers are the same everywhere.',
      ].join('\n'),
      tradeoffs: [
        'Slower and longer than reading `children.length`, and it produces a snapshot rather than the',
        'live collection — occasionally the point, usually not.',
        '',
        'It earns its place when the predicate is finer than "is an element": counting only',
        'non-empty text nodes, or only comments, or elements of one tag. At that point you are already',
        'walking `childNodes`, and reaching for `children` as well would mean walking the list twice.',
      ].join('\n'),
    },
  ],
};
