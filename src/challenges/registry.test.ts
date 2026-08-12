import { describe, expect, it } from 'vitest';

import type { ChallengeMeta } from '@/types/challenge';

import {
  CATEGORY_IDS,
  CATEGORY_META,
  challengeIndex,
  DIFFICULTIES,
  entriesInCategory,
  entryById,
  entryBySlug,
  SHIPPING_CATEGORY_IDS,
  shippingCategoryIds,
  shippingEntries,
  validateRegistry,
} from './registry';

function stub(overrides: Partial<ChallengeMeta>): ChallengeMeta {
  return {
    id: 'a',
    slug: 'a',
    title: 'A',
    category: 'selection',
    difficulty: 'novice',
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
});

/**
 * The flag's semantics, exercised against a copy of the real metadata rather than a hand-built
 * fixture: a stub record would have to restate all thirteen categories and would stop describing
 * the real one the moment a category was added.
 */
describe('shippingCategoryIds', () => {
  it('omits a category that does not say it ships', () => {
    // The default is what this task exists to establish. A new category is a half-finished one for
    // as long as it takes to author it, and the failure worth preventing is that state appearing on
    // the dashboard by default -- so absence of the flag means hidden, and shipping is opt-in.
    const noneShip = { ...CATEGORY_META, selection: { title: 'Selection', blurb: 'Anything.' } };
    expect(shippingCategoryIds(noneShip)).not.toContain('selection');
  });

  it('includes a category the moment it is flipped on', () => {
    // The other direction, which is what makes the assertion above about the flag rather than about
    // a hardcoded list: nothing but `shipping` distinguishes these two records.
    const a11yShips = { ...CATEGORY_META, a11y: { ...CATEGORY_META.a11y, shipping: true } };
    expect(shippingCategoryIds(a11yShips)).toContain('a11y');
    expect(shippingCategoryIds(CATEGORY_META)).not.toContain('a11y');
  });

  it('reads the flag rather than the presence of the key', () => {
    const explicitlyOff = { ...CATEGORY_META, forms: { ...CATEGORY_META.forms, shipping: false } };
    expect(shippingCategoryIds(explicitlyOff)).not.toContain('forms');
  });
});

describe('the real registry', () => {
  it('is valid', () => {
    expect(validateRegistry(challengeIndex)).toEqual([]);
  });

  it('has exactly one entry for every challenge module on disk', () => {
    // `/`'s byte budget is derived from a count of challenge *files* (`scripts/budgets.ts`), for
    // the plain reason that a Node build script cannot import this index. That substitution is
    // only legitimate while the two counts are equal, and this is what holds them equal from the
    // source side -- `assertChallengesAreLazy` holds the same line from the build side, but only
    // once a build has run.
    //
    // The filter duplicates the build script's, which AGENTS.md §8 permits exactly when both
    // directions of divergence fail loudly: a file one of them counts and the other does not shows
    // up here as a mismatch either way round.
    const modules = Object.keys(import.meta.glob('./*/*.ts')).filter(
      (path) => !path.endsWith('/index.ts') && !path.endsWith('/support.ts') && !path.endsWith('.test.ts'),
    );

    expect(modules.length).toBeGreaterThan(0);
    expect(modules.length).toBe(challengeIndex.length);
  });

  it('looks up a registered challenge by slug', () => {
    expect(entryBySlug('query-basics')?.id).toBe('selection-query-basics');
  });

  it('returns undefined for an unknown slug', () => {
    expect(entryBySlug('no-such-slug')).toBeUndefined();
  });

  it('returns undefined for an unknown id', () => {
    expect(entryById('no-such-id')).toBeUndefined();
  });

  it('filters by category', () => {
    const selection = entriesInCategory('selection');
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
    expect(selection.length).toBe(challengeIndex.filter((c) => c.category === 'selection').length);
    expect(entriesInCategory('react').length).toBe(challengeIndex.filter((c) => c.category === 'react').length);
  });

  it('ships exactly the six categories the owner decided ship', () => {
    // A literal, and deliberately a change-detector. Which categories ship is an owner decision
    // (`AGENTS.md` §9, §10), not something to be re-derived: the flag defaults to off, so flipping
    // one on is a one-word edit in `CATEGORY_META` that nothing else in the app would notice --
    // the dashboard would simply start advertising a category with one challenge in it, which is
    // the exact state this list exists to prevent. Editing this line is how that decision gets
    // made deliberately.
    expect(SHIPPING_CATEGORY_IDS).toEqual(['selection', 'creation', 'attributes', 'styles', 'events', 'forms']);
  });

  it('has challenges in every category it ships', () => {
    // The failure this catches is a category flipped on before its content exists: a card on the
    // dashboard reading "No challenges yet", which is the half-finished-category state again.
    // Collected rather than asserted per category so a failure names all of them at once.
    expect(SHIPPING_CATEGORY_IDS.filter((category) => entriesInCategory(category).length === 0)).toEqual([]);
  });

  it('lists the challenges of the shipping categories, and only those', () => {
    // Both directions. `every` alone is vacuously true on an empty list and the count alone passes
    // for any list of the right length, so neither is worth writing without the other.
    expect(shippingEntries.every((entry) => SHIPPING_CATEGORY_IDS.includes(entry.category))).toBe(true);
    expect(shippingEntries.length).toBe(
      challengeIndex.filter((entry) => SHIPPING_CATEGORY_IDS.includes(entry.category)).length,
    );
    expect(shippingEntries.length).toBeGreaterThan(0);
    // A filter that ignored the flag and returned the whole index would pass every assertion above.
    expect(shippingEntries.length).toBeLessThan(challengeIndex.length);
  });

  it('keeps every unshipped category in the index, so a direct link still resolves', () => {
    // Hiding is a browse-layer decision and nothing else: the six reconnaissance challenges are
    // still registered, still opened by `content.test.ts`, and still reachable by URL. Naming them
    // means deleting one fails here rather than quietly shrinking the library -- which is what
    // `AGENTS.md` §10 relies on when it says the content suite opening every challenge is what
    // keeps the index honest.
    const hidden = new Set(CATEGORY_IDS.filter((category) => !SHIPPING_CATEGORY_IDS.includes(category)));
    const hiddenSlugs = challengeIndex
      .filter((entry) => hidden.has(entry.category))
      .map((entry) => entry.slug)
      .toSorted();

    expect(hiddenSlugs).toEqual(
      ['roving-tabindex', 'frame-batch', 'mutation-batch', 'layout-thrash', 'filter-state', 'copy-handler'].toSorted(),
    );
    for (const slug of hiddenSlugs) expect(entryBySlug(slug)).toBeDefined();
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
      const ranks = entriesInCategory(category).map((entry) => DIFFICULTIES.indexOf(entry.difficulty));
      return ranks.some((rank, index) => index > 0 && rank < (ranks[index - 1] ?? rank));
    });

    expect(misordered).toEqual([]);
    // The check above is vacuous for a registry with one challenge per category, and every category
    // but one is empty today.
    expect(entriesInCategory('selection').length).toBeGreaterThan(1);
  });
});
