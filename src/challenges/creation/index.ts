import type { ChallengeEntry } from '@/types/challenge';

/**
 * The Create, Insert & Remove category, as metadata plus one dynamic import each.
 *
 * Reconnoitred before anything was authored, and this is the **cleanest** category measured so far:
 * `createElement`, `cloneNode` (deep and shallow), `DocumentFragment` (including being emptied by
 * the insertion), `importNode`, `insertAdjacentHTML` in all four positions, `insertAdjacentElement`,
 * `insertAdjacentText`, `before`/`after`/`replaceWith`/`remove`/`replaceChildren`, `outerHTML`
 * assignment, `DOMParser`, `createContextualFragment`, move-not-copy semantics, and text-node
 * escaping all behave identically in happy-dom and in real Chrome through the production host.
 * `<template>.content` survives the memory host's `innerHTML` assignment intact -- which was the
 * genuine risk here, since that host never executes `<script>` for the same structural reason.
 *
 * **One divergence, and it costs this category its most obvious challenge.** A `DocumentFragment`
 * insertion is *not* observably a batch under happy-dom. Measured, same code both hosts:
 *
 * | insertion                  | Chrome                     | happy-dom                  |
 * | -------------------------- | -------------------------- | -------------------------- |
 * | three separate `append`s   | 3 records, 1 node each     | 3 records, 1 node each     |
 * | one fragment `append`      | **1 record, 3 nodes**      | 3 records, 1 node each     |
 * | `replaceChildren(fragment)`| **1 record, 3 nodes**      | 3 records, 1 node each     |
 * | `innerHTML =`              | **1 record, 3 nodes**      | 3 records, 1 node each     |
 *
 * So "prove you batched your inserts" -- the single most natural challenge in this category -- has
 * no assertion available: through a `MutationObserver`, the fragment and the loop are the same
 * thing here. The observer is not at fault (it delivers one callback in both, and its records match
 * field for field elsewhere); happy-dom queues the record per child rather than per insertion. Any
 * batching challenge needs the browser-only validation route that Observers, Canvas and the async
 * Clipboard API are already waiting on. Pinned by `src/test/happyDomGaps.test.ts`.
 *
 * See AGENTS.md §3 and §10.
 */
export const creationEntries: ChallengeEntry[] = [
  {
    id: 'creation-create-and-append',
    slug: 'create-and-append',
    title: 'Build the note and put it on the page',
    category: 'creation',
    difficulty: 'novice',
    concepts: ['createElement', 'append', 'textContent', 'detached nodes'],
    relatedIds: [],
    load: () => import('./createAndAppend').then((module) => module.createAndAppend),
  },
  {
    id: 'creation-move-not-copy',
    slug: 'move-not-copy',
    title: 'Moving a node, not copying it',
    category: 'creation',
    difficulty: 'novice',
    concepts: ['prepend', 'move semantics', 'one parent', 'remove'],
    relatedIds: ['creation-create-and-append'],
    load: () => import('./moveNotCopy').then((module) => module.moveNotCopy),
  },
  {
    id: 'creation-clone-depth',
    slug: 'clone-depth',
    title: 'What a shallow clone leaves behind',
    category: 'creation',
    difficulty: 'intermediate',
    concepts: ['cloneNode', 'deep versus shallow', 'after', 'outerHTML'],
    relatedIds: ['creation-move-not-copy'],
    load: () => import('./cloneDepth').then((module) => module.cloneDepth),
  },
  {
    id: 'creation-template-rows',
    slug: 'template-rows',
    title: 'Stamp the rows out of a template',
    category: 'creation',
    difficulty: 'intermediate',
    concepts: ['template', 'cloneNode', 'DocumentFragment', 'replaceChildren', 'textContent'],
    relatedIds: ['selection-template-content'],
    load: () => import('./templateRows').then((module) => module.templateRows),
  },
];
