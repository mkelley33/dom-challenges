import type { ChallengeEntry } from '@/types/challenge';

/**
 * The Async & Scheduling category, as metadata plus one dynamic import each.
 *
 * `requestIdleCallback` is absent from the pinned happy-dom, so nothing here may depend on it --
 * `requestAnimationFrame`, microtasks, timers and `AbortController` are the schedulers this category
 * can be built on. Ordering *between* those schedulers is not a fact this project can assert
 * either: a `setTimeout(0)` scheduled alongside a frame runs before it in Chrome and after it under
 * happy-dom, which models frames with `setImmediate`. See AGENTS.md §3 and §10.
 */
export const asyncEntries: ChallengeEntry[] = [
  {
    id: 'async-frame-batch',
    slug: 'frame-batch',
    title: 'Coalesce many calls into one frame',
    category: 'async',
    difficulty: 'advanced',
    concepts: ['requestAnimationFrame', 'cancelAnimationFrame', 'coalescing', 'microtask', 'closures'],
    relatedIds: ['performance-layout-thrash'],
    load: () => import('./frameBatch').then((module) => module.frameBatch),
  },
];
