import type { ChallengeEntry } from '@/types/challenge';

/**
 * The Observers category, as metadata plus one dynamic import each.
 *
 * Only `MutationObserver` is represented, and that is a measurement rather than an omission:
 * `IntersectionObserver` and `ResizeObserver` are constructors under happy-dom whose callbacks never
 * fire, so a challenge built on either cannot be validated by the content suite at all. See
 * AGENTS.md §3 and §10 for what this file may and may not contain.
 */
export const observersEntries: ChallengeEntry[] = [
  {
    id: 'observers-mutation-batch',
    slug: 'mutation-batch',
    title: 'One callback, many records',
    category: 'observers',
    difficulty: 'advanced',
    concepts: ['MutationObserver', 'MutationRecord', 'childList', 'microtask', 'takeRecords'],
    relatedIds: [],
    load: () => import('./mutationBatch').then((module) => module.mutationBatch),
  },
];
