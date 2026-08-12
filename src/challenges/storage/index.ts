import type { ChallengeEntry } from '@/types/challenge';

/**
 * The Storage, URL & History category, as metadata plus one dynamic import each.
 *
 * Two of the three things the category is named for are unavailable, in opposite directions, and
 * both were measured rather than reasoned about:
 *
 * - **IndexedDB** is absent from the pinned happy-dom (`typeof indexedDB === 'undefined'`), so a
 *   challenge on it cannot be validated by the content suite at all.
 * - **History** is present in *both* hosts and unusable in the real one. The preview frame is a
 *   `srcdoc` document whose URL is `about:srcdoc`, and Chrome rejects `pushState`/`replaceState`
 *   with a URL argument there: `SecurityError: A history state object with URL '...' cannot be
 *   created in a document with origin '...' and URL 'about:srcdoc'`. happy-dom accepts the same call
 *   happily, because its host document has a real URL -- so a History challenge is the shape that
 *   passes the suite and throws for the learner. The state-only forms (`pushState(state, '')`) do
 *   work in both, but they push entries onto the tab's joint session history, which puts the app's
 *   own back button inside the preview frame.
 *
 * What is left -- `localStorage`, `URL` and `URLSearchParams` -- behaves identically in both hosts,
 * down to the escaping. See AGENTS.md §3 and §10.
 */
export const storageEntries: ChallengeEntry[] = [
  {
    id: 'storage-filter-state',
    slug: 'filter-state',
    title: 'Everything in storage is a string',
    category: 'storage',
    difficulty: 'intermediate',
    concepts: ['localStorage', 'JSON', 'URLSearchParams', 'serialisation', 'defensive parsing'],
    relatedIds: [],
    load: () => import('./filterState').then((module) => module.filterState),
  },
];
