import type { Challenge } from '@/types/challenge';

import { requireElement } from './support';

/**
 * Reads the ids out of whatever the learner returned.
 *
 * Ids rather than elements: comparing arrays of ids gives a readable failure -- `["direct-1",
 * "deep-1"]` names the paragraph that should not be there -- where comparing elements prints
 * `<p>` twice and says nothing about which ones.
 */
function idsOf(elements: Element[]): string[] {
  return elements.map((element) => element.id);
}

export const scopedQuery: Challenge = {
  id: 'selection-scoped-query',
  slug: 'scoped-query',
  title: 'Paragraphs one level down, and no deeper',
  category: 'selection',
  difficulty: 'intermediate',
  concepts: [':scope', 'querySelectorAll', 'children', 'child combinator'],
  relatedIds: ['selection-query-all'],
  prompt: [
    'Export a function `directParagraphs(container)` that takes an `Element` and returns an',
    '`Element[]` of every `<p>` that is a **direct child** of it, in document order.',
    '',
    'A paragraph nested deeper inside the container — inside a `<blockquote>`, or a `<section>`, or',
    'anything else — is not a direct child and must not appear in the result.',
    '',
    'The function is called with more than one container, so it has to search whichever one it is',
    'handed rather than a container named in your selector.',
  ].join('\n'),
  html: [
    '<div id="outer">',
    '  <div id="panel">',
    '    <p id="direct-1">first</p>',
    '    <blockquote><p id="deep-1">quoted</p></blockquote>',
    '    <p id="direct-2">second</p>',
    '    <section id="aside"><div><p id="deep-2">nested</p></div></section>',
    '  </div>',
    '  <p id="outside">outside the panel</p>',
    '</div>',
  ].join('\n'),
  starterCode: ['export function directParagraphs(container: Element): Element[] {', '  return [];', '}', ''].join(
    '\n',
  ),
  tests: [
    {
      name: 'returns an array of only the paragraphs that are direct children',
      run: ({ doc, fn, expect }) => {
        const directParagraphs = fn<(container: Element) => Element[]>('directParagraphs');
        const found = directParagraphs(requireElement(doc, 'panel'));
        // Named before the comparison so a `NodeList` handed straight back from `querySelectorAll`
        // fails as "not an Array" rather than as a TypeError inside the id mapping below.
        expect(Array.isArray(found)).toBe(true);
        // `#panel` is itself a `<div>` inside another `<div>`, so `'div p'` matches all four
        // paragraphs in this subtree and `'p'` matches all four as well.
        expect(idsOf(found)).toEqual(['direct-1', 'direct-2']);
      },
    },
    {
      name: 'searches the container it is handed, not the one the selector was written for',
      run: ({ doc, fn, expect }) => {
        const directParagraphs = fn<(container: Element) => Element[]>('directParagraphs');
        // `#outer` has exactly one paragraph directly inside it, and the two the previous test
        // wanted are now a level too deep. A selector that names `#panel`, or a query that starts
        // at `document`, answers this one with the wrong list.
        expect(idsOf(directParagraphs(requireElement(doc, 'outer')))).toEqual(['outside']);
      },
    },
    {
      name: 'returns an empty array for a container with no paragraph directly inside it',
      run: ({ doc, fn, expect }) => {
        const directParagraphs = fn<(container: Element) => Element[]>('directParagraphs');
        // `#aside` does contain a paragraph, two levels down. Anything that searches descendants
        // returns it here.
        expect(directParagraphs(requireElement(doc, 'aside'))).toHaveLength(0);
      },
    },
  ],
  solutions: [
    {
      label: ':scope > p',
      code: [
        'export function directParagraphs(container: Element): Element[] {',
        "  return Array.from(container.querySelectorAll(':scope > p'));",
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The surprise this challenge is built on: `container.querySelectorAll(selector)` does **not**',
        'evaluate the selector relative to `container`. The selector is matched against the whole',
        'document, and only then is the result filtered down to the elements that happen to be',
        'descendants of `container`.',
        '',
        "That is why `panel.querySelectorAll('div p')` returns all four paragraphs here. `#deep-1`",
        'sits inside a `<blockquote>`, not a `<div>` — but it is a descendant of `#panel` and of',
        '`#outer`, both of which are `<div>` elements, so it matches `div p` in the document, and it is',
        'inside the container, so it survives the filter. The rule shows itself even more plainly with',
        "`panel.querySelectorAll('#outer p')`, which happily matches on an ancestor that is outside the",
        'container entirely.',
        '',
        '`:scope` is the fix. It refers to the element the query was called on, so `:scope > p` is a',
        'complete selector — child combinator and all — anchored at `container`. Without it there is no',
        'way to write "a direct child of the thing I called this on" as a selector at all; a leading',
        "`'> p'` is a syntax error in `querySelectorAll`.",
        '',
        '`Array.from` is there because `querySelectorAll` returns a `NodeList`, and the contract asks',
        'for an `Element[]`.',
      ].join('\n'),
      tradeoffs: [
        'The one to reach for whenever the search is scoped to an element and the selector needs',
        'structure — `:scope > li`, `:scope > .row:not(.header)`, `:scope > * > input`. It keeps the',
        'whole condition in one selector string, which is what makes it composable.',
        '',
        'What it costs is a lookup that has to consider the document before narrowing. For a query',
        'that is only ever "the element children that are `<p>`", walking `children` directly is both',
        'cheaper and impossible to get wrong. And `:scope` is the piece people forget: reviewers read',
        "`container.querySelectorAll('div p')` as scoped because the call is scoped, which is exactly",
        'the misreading that ships the bug.',
      ].join('\n'),
    },
    {
      label: 'Filter the children',
      code: [
        'export function directParagraphs(container: Element): Element[] {',
        "  return Array.from(container.children).filter((child) => child.tagName === 'P');",
        '}',
        '',
      ].join('\n'),
      explanation: [
        '`children` is every element child, one level down and no further, so the depth problem never',
        'arises — there is nothing deeper in the list to exclude. All that is left is picking the',
        'paragraphs out.',
        '',
        '`tagName` is uppercase for HTML elements in an HTML document, hence `P`. `children` is an',
        '`HTMLCollection`, which has no `filter` of its own, so the `Array.from` is doing the same job',
        'it did in the other solution.',
        '',
        'This is also the version that keeps working when the condition stops being expressible as a',
        "selector: `filter((child) => child.tagName === 'P' && child.textContent!.length > 40)` is a",
        'small edit here and not a selector at all.',
      ].join('\n'),
      tradeoffs: [
        'Direct, cheap, and it reads as exactly what it does. Two things to keep in mind.',
        '',
        'The tag comparison is case-sensitive against an uppercased name, which quietly stops matching',
        'for SVG and XML elements, where `tagName` keeps the case it was written in.',
        "`child.matches('p')` sidesteps that and takes any selector, at the cost of a matching engine",
        'call per child.',
        '',
        'And `children` skips text and comment nodes, which is what you want here — but note it is not',
        '`childNodes`, which does not. Reaching for `childNodes` and filtering by `tagName` mostly works',
        'and then throws the first time a text node makes it into the callback with no `tagName` at all.',
      ].join('\n'),
    },
    {
      label: 'Query descendants, then keep the direct ones',
      code: [
        'export function directParagraphs(container: Element): Element[] {',
        "  const paragraphs = container.querySelectorAll('p');",
        '  return Array.from(paragraphs).filter((paragraph) => paragraph.parentElement === container);',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'Collect every paragraph in the subtree, then keep the ones whose parent *is* the container.',
        'The identity comparison is what does the scoping here, and it cannot be fooled by an ancestor',
        'outside the container the way a compound selector can.',
        '',
        'Worth writing out once because it makes the earlier trap concrete: the filter is doing by hand',
        'what `:scope >` expresses in two characters, and seeing them side by side is what makes the',
        'difference between `div p` and `:scope > p` stop being arbitrary.',
      ].join('\n'),
      tradeoffs: [
        'The most work of the three: it visits every paragraph in the subtree, including ones nested',
        'ten levels deep in a container that has thousands, only to discard them. On a large table that',
        'is a real cost, and `children` never looks below the first level at all.',
        '',
        'It does generalise in a direction the others do not. Swap the predicate for',
        '`paragraph.parentElement?.closest(SELECTOR) === container` and you have "the nearest',
        'container-like ancestor is this one" — a rule about the ancestor chain rather than about a',
        'single hop, which no selector expresses.',
      ].join('\n'),
    },
  ],
};
