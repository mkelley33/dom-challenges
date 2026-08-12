import type { ChallengeContent } from '@/types/challenge';

import { requireElement } from './support';

export const firstElementChild: ChallengeContent = {
  prompt: [
    'Export a function `firstTag(container)` that takes an `Element` and returns the tag name of its',
    'first **element** child, in lower case — `"li"`, `"span"` — or `null` when it has no element',
    'child at all.',
    '',
    'The containers below are written across several lines, and one of them starts with a comment.',
  ].join('\n'),
  html: [
    '<ul id="list">',
    '  <li>One</li>',
    '  <li>Two</li>',
    '</ul>',
    '<section id="commented">',
    '  <!-- the note comes first -->',
    '  <span>Hello</span>',
    '</section>',
    '<div id="text-only">',
    '  just words, no elements',
    '</div>',
  ].join('\n'),
  starterCode: ['export function firstTag(container: Element): string | null {', '  return null;', '}', ''].join('\n'),
  tests: [
    {
      name: 'returns the first element, not the whitespace in front of it',
      run: ({ doc, fn, expect }) => {
        // `#list` starts with a text node -- the line break and indentation after `<ul>`. A text
        // node has no `tagName` at all, so `firstChild.tagName` is `undefined` and calling
        // `.toLowerCase()` on it throws.
        expect(fn<(container: Element) => string | null>('firstTag')(requireElement(doc, 'list'))).toBe('li');
      },
    },
    {
      name: 'skips a comment as well',
      run: ({ doc, fn, expect }) => {
        expect(fn<(container: Element) => string | null>('firstTag')(requireElement(doc, 'commented'))).toBe('span');
      },
    },
    {
      name: 'returns null when the container holds no element at all',
      run: ({ doc, fn, expect }) => {
        // Text inside, so `firstChild` is a node and only `firstElementChild` is `null`.
        expect(fn<(container: Element) => string | null>('firstTag')(requireElement(doc, 'text-only'))).toBeNull();
      },
    },
    {
      name: 'reads the container each time rather than answering from memory',
      run: ({ doc, fn, expect }) => {
        const paragraph = doc.createElement('p');
        paragraph.textContent = 'Inserted first';
        requireElement(doc, 'list').prepend(paragraph);

        expect(fn<(container: Element) => string | null>('firstTag')(requireElement(doc, 'list'))).toBe('p');
      },
    },
  ],
  solutions: [
    {
      label: 'firstElementChild',
      code: [
        'export function firstTag(container: Element): string | null {',
        '  return container.firstElementChild?.tagName.toLowerCase() ?? null;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        '`firstChild` is the first *node*, and in markup written across more than one line that node is',
        'the whitespace between the opening tag and the first child element. Text nodes have no',
        '`tagName`, so `container.firstChild.tagName` is `undefined` — and `undefined.toLowerCase()`',
        'throws `Cannot read properties of undefined`. Reaching for `nodeName` instead does not help:',
        'for a text node it is the literal string `#text`.',
        '',
        '`firstElementChild` skips text and comment nodes and hands back the first `Element`, which is',
        'what "first child" almost always means when a person says it. It is `null` for a container',
        'with no element inside, which is what the third case needs — and `?.` plus `?? null` is how',
        'that `null` survives the `.tagName` without a branch.',
        '',
        '`tagName` is upper case for HTML elements in an HTML document (`LI`, not `li`), a leftover',
        'from HTML being case-insensitive, so the lower-casing is not optional. `localName` is the',
        'lower-case version and needs no conversion.',
      ].join('\n'),
      tradeoffs: [
        'The direct answer, and it has a matching family: `lastElementChild`, `nextElementSibling`,',
        '`previousElementSibling`, `childElementCount`, `children`. Learn them as a set — each one is',
        'the element-only counterpart of a node-level property that will hand you whitespace.',
        '',
        'Use the node-level `firstChild` deliberately, when text is what you are after: reading the',
        'label out of `<td>Total</td>`, or normalising the whitespace in a paragraph. Then the text',
        'node is the subject, not an obstacle.',
      ].join('\n'),
    },
    {
      label: 'children[0]',
      code: [
        'export function firstTag(container: Element): string | null {',
        '  const first = container.children[0];',
        '  return first ? first.tagName.toLowerCase() : null;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        '`children` is the element-only collection, so its first entry is the same node',
        '`firstElementChild` returns. Indexing past the end of an `HTMLCollection` gives `undefined`,',
        'which the ternary turns into the `null` the contract asks for.',
        '',
        'Worth writing when the index is not always zero — `children[1]`, or `children[children.length',
        '- 1]` — where the named properties run out. For the first one, `firstElementChild` says it',
        'better.',
      ].join('\n'),
      tradeoffs: [
        'Equivalent here, with one thing to watch: the `undefined` from an out-of-range index is easy',
        'to forget, because the type says `Element` in some configurations. TypeScript only reports it',
        'with `noUncheckedIndexedAccess` on — this project has it on, which is why the ternary is',
        'required rather than merely advisable. `firstElementChild` is typed `Element | null` whatever',
        'the compiler settings, so the empty case is impossible to miss.',
        '',
        '`children` also builds (or at least exposes) a live collection to answer a question about one',
        'element. Nothing measurable for a page, but it is more machinery than the question needs.',
      ].join('\n'),
    },
  ],
};
