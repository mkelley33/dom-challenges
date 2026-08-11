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
