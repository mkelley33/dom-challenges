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
 * `requestAnimationFrame` within 500ms -- and repeated. Both runs identical: **26 solution runs, 0
 * failures; 13 starters, all running cleanly and all failing a named assertion; 62 hand-written
 * wrong solutions, all rejected; `localStorage` 0 keys -> 0 keys.** Twenty-four direct DOM probes in
 * the same frame agreed with happy-dom on all but one (below), including the four this category's
 * assertions actually rest on:
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
 * **A second divergence, found while authoring `svg-namespace`.** `insertAdjacentHTML` into an
 * `<svg>` element parses as **HTML rather than as foreign content** here: Chrome gives an
 * SVG-namespaced `circle`, happy-dom an `HTMLUnknownElement` named `CIRCLE` that renders nothing. A
 * challenge on that route would be green in the suite and broken for the learner, so nothing here
 * uses or asserts it. Pinned with two controls in `src/test/happyDomGaps.test.ts`. Everything else
 * about namespaces matches: `createElement` gives XHTML/`CIRCLE`/`HTMLUnknownElement`,
 * `createElementNS` gives SVG/`circle`/`SVGCircleElement`, parsed markup and `innerHTML` inside the
 * tree give SVG, `cloneNode` keeps the namespace, and a `<template>` holding an `<svg>` wrapper
 * parses its contents as foreign content.
 *
 * Table context also matches exactly, which is what makes `table-context` authorable: in a `<div>`,
 * `<tr>`, `<td>`, `<th>`, `<tbody>`, `<caption>` and `<col>` are all dropped and their text
 * foster-parented out (`childElementCount` 0), while `<li>` and `<option>` survive; the same markup
 * in a `<template>`, in a `<tbody>`, or in a freshly created `<table>` comes through intact.
 *
 * Three behaviours worth recording because a challenge's prose asserts them and no test does: on an
 * element with no parent, `insertAdjacentHTML('beforebegin', …)` throws `NoModificationAllowedError`
 * while `before()` is a **silent no-op**; and an SVG element's `className` is an `SVGAnimatedString`
 * rather than a string. Measured in Chrome, twice.
 *
 * **Why the category stops at thirteen, one past the expected range.** Ten to twelve was the target,
 * and the thirteenth is here because a review measured two ideas this docblock had excluded by
 * assertion rather than by measurement. HTML's context-sensitive parsing was called "a parser lesson
 * rather than a creation one"; it is fully authorable in both engines and its payload is
 * creation-shaped -- the one case where building the nodes *strictly* beats writing the markup,
 * which is the argument `create-and-append` and `inner-html-cost` both make on softer grounds.
 * Namespace-aware creation had simply been missed, and it is a `createElement` trap. Both are now
 * written. What remains excluded, and why: batching is the divergence above; `<template>` inertness
 * is `template-rows` plus `selection/template-content`; `DOMParser` and `createContextualFragment`
 * are the same "parse a string into nodes" lesson `inner-html-cost` teaches with the cost attached.
 *
 * What the thirteen cost, by §7's route-level delta -- build, empty this array, rebuild, subtract:
 * **5,354 B on every route, 411.8 B an entry**, inside the 414 B `scripts/budgets.ts` allows for
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
