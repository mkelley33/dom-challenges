import type { ChallengeEntry } from '@/types/challenge';

/**
 * The Selection & Traversal category, as metadata plus one dynamic import each.
 *
 * This file is the category's whole static footprint: nothing here reaches a challenge module
 * except through `load`, so a challenge's prompt, starter, solutions and test functions are fetched
 * only by the route that renders that one challenge. It is also the only place a challenge is
 * registered, which is why adding one is an edit here and a new module beside it -- see AGENTS.md
 * §3 and §10.
 *
 * Order is registration order, not reading order: `byAscendingDifficulty` in `registry.ts` sorts
 * the category for display and is stable, so equal-difficulty challenges are read in the order they
 * appear here.
 */
export const selectionEntries: ChallengeEntry[] = [
  {
    id: 'selection-query-basics',
    slug: 'query-basics',
    title: 'Find one element and mark it',
    category: 'selection',
    difficulty: 'novice',
    concepts: ['getElementById', 'querySelector', 'classList'],
    relatedIds: [],
    load: () => import('./queryBasics').then((module) => module.queryBasics),
  },
  {
    id: 'selection-closest-row',
    slug: 'closest-row',
    title: 'Walk up to the containing row',
    category: 'selection',
    difficulty: 'intermediate',
    concepts: ['closest', 'parentElement', 'matches', 'event delegation'],
    relatedIds: ['selection-query-basics'],
    load: () => import('./closestRow').then((module) => module.closestRow),
  },
  {
    id: 'selection-live-vs-static',
    slug: 'live-vs-static',
    title: 'Live collections versus static lists',
    category: 'selection',
    difficulty: 'advanced',
    concepts: ['HTMLCollection', 'NodeList', 'getElementsByClassName', 'querySelectorAll'],
    relatedIds: ['selection-query-basics'],
    load: () => import('./liveVsStatic').then((module) => module.liveVsStatic),
  },
  {
    id: 'selection-query-all',
    slug: 'query-all',
    title: 'Collect the text of every item',
    category: 'selection',
    difficulty: 'novice',
    concepts: ['querySelectorAll', 'NodeList', 'Array.from', 'spread', 'textContent'],
    relatedIds: ['selection-query-basics'],
    load: () => import('./queryAll').then((module) => module.queryAll),
  },
  {
    id: 'selection-scoped-query',
    slug: 'scoped-query',
    title: 'Paragraphs one level down, and no deeper',
    category: 'selection',
    difficulty: 'intermediate',
    concepts: [':scope', 'querySelectorAll', 'children', 'child combinator'],
    relatedIds: ['selection-query-all'],
    load: () => import('./scopedQuery').then((module) => module.scopedQuery),
  },
  {
    id: 'selection-attribute-selectors',
    slug: 'attribute-selectors',
    title: 'Match on an attribute without matching too much',
    category: 'selection',
    difficulty: 'intermediate',
    concepts: ['attribute selectors', 'data-*', 'classList', 'getAttribute'],
    relatedIds: ['selection-scoped-query'],
    load: () => import('./attributeSelectors').then((module) => module.attributeSelectors),
  },
  {
    id: 'selection-children-vs-childnodes',
    slug: 'children-vs-childnodes',
    title: 'Whitespace between the tags is a node',
    category: 'selection',
    difficulty: 'intermediate',
    concepts: ['children', 'childNodes', 'text nodes', 'nodeType', 'childElementCount'],
    relatedIds: ['selection-scoped-query'],
    load: () => import('./childrenVsChildNodes').then((module) => module.childrenVsChildNodes),
  },
  {
    id: 'selection-first-element-child',
    slug: 'first-element-child',
    title: 'The first child that is actually an element',
    category: 'selection',
    difficulty: 'novice',
    concepts: ['firstElementChild', 'firstChild', 'children', 'tagName'],
    relatedIds: ['selection-children-vs-childnodes'],
    load: () => import('./firstElementChild').then((module) => module.firstElementChild),
  },
  {
    id: 'selection-sibling-traversal',
    slug: 'sibling-traversal',
    title: 'The row before and the row after',
    category: 'selection',
    difficulty: 'intermediate',
    concepts: ['nextElementSibling', 'previousElementSibling', 'nextSibling', 'text nodes'],
    relatedIds: ['selection-first-element-child'],
    load: () => import('./siblingTraversal').then((module) => module.siblingTraversal),
  },
  {
    id: 'selection-contains-and-position',
    slug: 'contains-and-position',
    title: 'Inside it, and in what order',
    category: 'selection',
    difficulty: 'advanced',
    concepts: ['contains', 'compareDocumentPosition', 'document order', 'bitmask'],
    relatedIds: ['selection-sibling-traversal'],
    load: () => import('./containsAndPosition').then((module) => module.containsAndPosition),
  },
  {
    id: 'selection-tree-walker',
    slug: 'tree-walker',
    title: 'Read the text a reader would see',
    category: 'selection',
    difficulty: 'expert',
    concepts: ['TreeWalker', 'NodeFilter', 'createTreeWalker', 'text nodes'],
    relatedIds: ['selection-children-vs-childnodes'],
    load: () => import('./treeWalker').then((module) => module.treeWalker),
  },
  {
    id: 'selection-template-content',
    slug: 'template-content',
    title: 'The rows the document cannot see',
    category: 'selection',
    difficulty: 'advanced',
    concepts: ['template', 'DocumentFragment', 'content', 'inert markup'],
    relatedIds: ['selection-query-all'],
    load: () => import('./templateContent').then((module) => module.templateContent),
  },
  {
    id: 'selection-shadow-boundary',
    slug: 'shadow-boundary',
    title: 'Behind the shadow boundary',
    category: 'selection',
    difficulty: 'expert',
    concepts: ['attachShadow', 'shadowRoot', 'ShadowRoot', 'encapsulation'],
    relatedIds: [],
    load: () => import('./shadowBoundary').then((module) => module.shadowBoundary),
  },
];
