import { describe, expect, it } from 'vitest';

import type { Challenge } from '@/types/challenge';

import {
  allChallenges,
  CATEGORY_IDS,
  challengeById,
  challengeBySlug,
  challengesInCategory,
  DIFFICULTIES,
  validateRegistry,
} from './registry';

function stub(overrides: Partial<Challenge>): Challenge {
  return {
    id: 'a',
    slug: 'a',
    title: 'A',
    category: 'selection',
    difficulty: 'novice',
    prompt: 'p',
    html: '<div></div>',
    starterCode: '',
    tests: [{ name: 't', run: () => undefined }],
    solutions: [{ label: 'Canonical', code: '', explanation: 'e', tradeoffs: 't' }],
    concepts: [],
    relatedIds: [],
    ...overrides,
  };
}

describe('validateRegistry', () => {
  it('reports no problems for a sound registry', () => {
    expect(validateRegistry([stub({ id: 'a', slug: 'a' }), stub({ id: 'b', slug: 'b' })])).toEqual([]);
  });

  it('reports duplicate ids', () => {
    const problems = validateRegistry([stub({ id: 'a', slug: 'a' }), stub({ id: 'a', slug: 'b' })]);
    expect(problems.join(' ')).toContain('duplicate id');
  });

  it('reports duplicate slugs', () => {
    const problems = validateRegistry([stub({ id: 'a', slug: 'same' }), stub({ id: 'b', slug: 'same' })]);
    expect(problems.join(' ')).toContain('duplicate slug');
  });

  it('reports relatedIds that point at nothing', () => {
    const problems = validateRegistry([stub({ id: 'a', slug: 'a', relatedIds: ['ghost'] })]);
    expect(problems.join(' ')).toContain('ghost');
  });

  it('does not report relatedIds that resolve to a real challenge in the same list', () => {
    const problems = validateRegistry([stub({ id: 'a', slug: 'a', relatedIds: ['b'] }), stub({ id: 'b', slug: 'b' })]);
    expect(problems).toEqual([]);
  });

  it('reports a challenge with no tests', () => {
    const problems = validateRegistry([stub({ id: 'a', slug: 'a', tests: [] })]);
    expect(problems.join(' ')).toContain('no tests');
  });

  it('reports a challenge with no solutions', () => {
    const problems = validateRegistry([stub({ id: 'a', slug: 'a', solutions: [] })]);
    expect(problems.join(' ')).toContain('no solutions');
  });
});

describe('the real registry', () => {
  it('is valid', () => {
    expect(validateRegistry(allChallenges)).toEqual([]);
  });

  it('looks up a registered challenge by slug', () => {
    expect(challengeBySlug('query-basics')?.id).toBe('selection-query-basics');
  });

  it('returns undefined for an unknown slug', () => {
    expect(challengeBySlug('no-such-slug')).toBeUndefined();
  });

  it('returns undefined for an unknown id', () => {
    expect(challengeById('no-such-id')).toBeUndefined();
  });

  it('filters by category', () => {
    const selection = challengesInCategory('selection');
    // `every` is vacuously true on an empty array, and filtering on `category` only to assert
    // `category` is tautological even on a full one. The membership check and the derived counts
    // are what make this fail for a filter that returns nothing, or everything.
    expect(selection.every((c) => c.category === 'selection')).toBe(true);
    expect(selection.map((c) => c.slug)).toContain('query-basics');
    // Derived from the registry rather than hard-coded. Asserting that a *named* category comes
    // back empty is an assertion with an expiry date: `react` is a declared category with content
    // planned, so `toEqual([])` would break the day it gets its first challenge -- under a test
    // named "filters by category", which is not what would have gone wrong. Counted this way the
    // assertion still fails for a filter that ignores its argument and hands back everything.
    expect(selection.length).toBe(allChallenges.filter((c) => c.category === 'selection').length);
    expect(challengesInCategory('react').length).toBe(allChallenges.filter((c) => c.category === 'react').length);
  });

  it('lists every category from easiest to hardest', () => {
    // `ChallengeList` renders a category in this order, so it is the sequence a learner reads it
    // in. Challenges are authored in whatever order the work happened, which is why the ordering
    // has to be imposed rather than assumed -- appending a novice challenge after an expert one is
    // otherwise invisible until someone browses the page.
    //
    // Collected into one list rather than asserted per category, so a failure names every category
    // that is out of order and so there is no `expect` inside a conditional.
    const misordered = CATEGORY_IDS.filter((category) => {
      const ranks = challengesInCategory(category).map((challenge) => DIFFICULTIES.indexOf(challenge.difficulty));
      return ranks.some((rank, index) => index > 0 && rank < (ranks[index - 1] ?? rank));
    });

    expect(misordered).toEqual([]);
    // The check above is vacuous for a registry with one challenge per category, and every category
    // but one is empty today.
    expect(challengesInCategory('selection').length).toBeGreaterThan(1);
  });
});

/**
 * The number of challenges the *eagerly imported* registry is allowed to carry.
 *
 * Pinned at what the branch shipped. `Dashboard` imports the whole registry, so every challenge
 * module -- prompt, `html`, `starterCode`, every solution's prose, and the test functions -- lands
 * in the landing page's static closure at a measured 6,756 B each (AGENTS.md §10).
 */
const EAGER_REGISTRY_LIMIT = 13;

describe('eager registry scale', () => {
  it('has not outgrown the count the eager registry was measured at', () => {
    // `scripts/routeBudget.ts` guards the same problem from the other end, and is the better
    // instrument for measuring it -- but a byte budget can be satisfied by deleting weight that
    // has nothing to do with challenges. The unused `ui/` components and CSS tokens already on
    // the Phase 2 list would free more than a challenge's worth of headroom on `/` without anyone
    // touching the registry, which would silently disarm it. This assertion cannot be paid off
    // that way: it counts the thing the rule is actually about.
    //
    // `tests` is read as the witness that these are whole challenge modules rather than an index
    // of `{id, slug, title, category, difficulty}`. When the refactor lands, `allChallenges` stops
    // carrying it, this line stops compiling, and whoever did the work is sent here -- which is
    // when this whole block should be deleted rather than renumbered.
    const eagerlyLoaded = allChallenges.filter((challenge) => challenge.tests.length > 0);

    // Pinned first: `filter` over an empty registry is an empty array, and every bound below would
    // hold vacuously for a registry that loaded nothing at all.
    expect(eagerlyLoaded.length).toBeGreaterThan(0);
    expect(eagerlyLoaded).toHaveLength(allChallenges.length);
    expect(
      eagerlyLoaded.length,
      'Another challenge is another ~6.8 kB on the first paint of a page that shows only counts and titles. Do the eager-registry refactor -- a generated index module plus a per-challenge dynamic import -- and delete this test. Raising this number instead is the decision AGENTS.md §10 says to stop making.',
    ).toBeLessThanOrEqual(EAGER_REGISTRY_LIMIT);
  });
});
