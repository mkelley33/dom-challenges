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
 * **Re-measured in real Chrome when the category was filled out**, through the production
 * `createIframeHost` on a Vite-served page, in a foregrounded tab (`visibilityState: 'visible'`,
 * `hasFocus(): true`) with a positive control asserted first -- the frame services a
 * `requestAnimationFrame` within 500ms -- and repeated. Both runs identical: **22 solution runs, 0
 * failures; 11 starters, all running cleanly and all failing a named assertion; 45 hand-written
 * wrong solutions, all rejected; `localStorage` 0 keys -> 0 keys.** Seventeen direct DOM probes in
 * the same frame agreed with happy-dom on every one, including the four this category's assertions
 * actually rest on:
 *
 * - a live `HTMLCollection` iterated forwards while removing **skips** -- `for..of` and an indexed
 *   loop both leave the second of two adjacent matches behind, in both engines;
 * - `list.remove(row)` removes the **list** (`remove()` takes no arguments and ignores extras) and
 *   returns `undefined`, with the rows surviving inside the detached list;
 * - assigning `outerHTML` leaves the reference you were holding detached while the element in the
 *   document is a third node the parser built;
 * - `insertAdjacentHTML` in all four positions preserves the surrounding text nodes' identity, and
 *   an `innerHTML` rebuild of the same shape does not.
 *
 * Two behaviours worth recording because a challenge's prose asserts them and no test can: on an
 * element with no parent, `insertAdjacentHTML('beforebegin', …)` throws `NoModificationAllowedError`
 * while `before()` is a **silent no-op**. Measured in Chrome, twice.
 *
 * **Why the category stops at eleven.** The ground is covered and the remaining ideas are either
 * unauthorable here or already taught: batching is the divergence above; `<template>` inertness is
 * `template-rows` plus `selection/template-content`; `DOMParser` and `createContextualFragment` are
 * the same "parse a string into nodes" lesson `inner-html-cost` teaches with the cost attached; and
 * HTML's context-sensitive parsing (a `<tr>` dropped outside a table) is a parser lesson rather than
 * a creation one. A twelfth challenge would repeat a trap already in here.
 *
 * What the eleven cost, by §7's route-level delta -- build, empty this array, rebuild, subtract:
 * **4,533 B on every route, 412.1 B an entry**, inside the 414 B `scripts/budgets.ts` allows for
 * one. All three ceilings moved by the same amount, so nothing here needed a re-baseline.
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
    id: 'creation-insert-at-index',
    slug: 'insert-at-index',
    title: 'Insert it at position n, not near it',
    category: 'creation',
    difficulty: 'intermediate',
    concepts: ['insertBefore', 'before', 'children versus childNodes', 'append'],
    relatedIds: ['selection-children-vs-childnodes'],
    load: () => import('./insertAtIndex').then((module) => module.insertAtIndex),
  },
  {
    id: 'creation-adjacent-positions',
    slug: 'adjacent-positions',
    title: 'Four places around one element',
    category: 'creation',
    difficulty: 'intermediate',
    concepts: ['insertAdjacentHTML', 'before', 'after', 'prepend', 'append'],
    relatedIds: ['creation-create-and-append'],
    load: () => import('./adjacentPositions').then((module) => module.adjacentPositions),
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
  {
    id: 'creation-inner-html-cost',
    slug: 'inner-html-cost',
    title: 'What innerHTML += throws away',
    category: 'creation',
    difficulty: 'advanced',
    concepts: ['innerHTML', 'insertAdjacentHTML', 'event listeners', 'reparsing', 'XSS'],
    relatedIds: ['creation-adjacent-positions', 'creation-create-and-append'],
    load: () => import('./innerHtmlCost').then((module) => module.innerHtmlCost),
  },
  {
    id: 'creation-fragment-is-emptied',
    slug: 'fragment-is-emptied',
    title: 'The fragment you can only use once',
    category: 'creation',
    difficulty: 'advanced',
    concepts: ['DocumentFragment', 'cloneNode', 'replaceChildren', 'one parent'],
    relatedIds: ['creation-move-not-copy', 'creation-template-rows'],
    load: () => import('./fragmentIsEmptied').then((module) => module.fragmentIsEmptied),
  },
  {
    id: 'creation-detach-and-reattach',
    slug: 'detach-and-reattach',
    title: 'A removed node is not a destroyed node',
    category: 'creation',
    difficulty: 'advanced',
    concepts: ['remove', 'removeChild', 'detached nodes', 'node lifetime'],
    relatedIds: ['creation-move-not-copy', 'creation-inner-html-cost'],
    load: () => import('./detachAndReattach').then((module) => module.detachAndReattach),
  },
  {
    id: 'creation-replace-in-place',
    slug: 'replace-in-place',
    title: 'Swap the element, keep the reference',
    category: 'creation',
    difficulty: 'advanced',
    concepts: ['replaceWith', 'replaceChild', 'outerHTML', 'stale references'],
    relatedIds: ['creation-detach-and-reattach', 'creation-inner-html-cost'],
    load: () => import('./replaceInPlace').then((module) => module.replaceInPlace),
  },
  {
    id: 'creation-table-context',
    slug: 'table-context',
    title: 'The row a <div> throws away',
    category: 'creation',
    difficulty: 'advanced',
    concepts: ['innerHTML', 'fragment parsing', 'context element', 'template', 'createElement'],
    relatedIds: ['creation-inner-html-cost', 'creation-template-rows'],
    load: () => import('./tableContext').then((module) => module.tableContext),
  },
  {
    id: 'creation-svg-namespace',
    slug: 'svg-namespace',
    title: 'The circle that never appears',
    category: 'creation',
    difficulty: 'advanced',
    concepts: ['createElementNS', 'namespaceURI', 'SVG', 'cloneNode', 'createElement'],
    relatedIds: ['creation-clone-depth', 'creation-table-context'],
    load: () => import('./svgNamespace').then((module) => module.svgNamespace),
  },
  {
    id: 'creation-remove-while-iterating',
    slug: 'remove-while-iterating',
    title: 'The rows a live collection lets you skip',
    category: 'creation',
    difficulty: 'expert',
    concepts: ['HTMLCollection', 'live collections', 'remove', 'querySelectorAll'],
    relatedIds: ['selection-live-vs-static', 'creation-detach-and-reattach'],
    load: () => import('./removeWhileIterating').then((module) => module.removeWhileIterating),
  },
];
