import type { ChallengeEntry } from '@/types/challenge';

/**
 * The Performance category, as metadata plus one dynamic import each.
 *
 * Neither host this project runs on can supply real geometry to the content suite -- happy-dom has
 * no layout engine at all -- so a Performance challenge cannot assert on pixels. It can assert on
 * the *order* of the reads and the writes, which is the category's actual subject; see the note on
 * `instrument` in `layoutThrash.ts`. AGENTS.md §3 and §10 cover what this file may contain.
 */
export const performanceEntries: ChallengeEntry[] = [
  {
    id: 'performance-layout-thrash',
    slug: 'layout-thrash',
    title: 'Read everything, then write everything',
    category: 'performance',
    difficulty: 'advanced',
    concepts: ['layout thrashing', 'getBoundingClientRect', 'forced synchronous layout', 'batching', 'reflow'],
    relatedIds: [],
    load: () => import('./layoutThrash').then((module) => module.layoutThrash),
  },
];
