import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { challengeModuleKeys, routeBudgets } from './budgets.ts';

const fixtureRoots: string[] = [];

afterEach(() => {
  for (const root of fixtureRoots) rmSync(root, { recursive: true, force: true });
  fixtureRoots.length = 0;
});

/**
 * A repository root containing nothing but a `src/challenges` tree with the given files in it.
 *
 * Counting a real directory rather than passing a number is what makes these tests cover the whole
 * path the check uses -- scan, filter, count, derive -- instead of the arithmetic alone.
 */
function repoWithChallenges(categories: Record<string, string[]>): string {
  const root = mkdtempSync(join(tmpdir(), 'route-budget-'));
  fixtureRoots.push(root);

  for (const [category, files] of Object.entries(categories)) {
    const dir = join(root, 'src', 'challenges', category);
    mkdirSync(dir, { recursive: true });
    for (const file of files) writeFileSync(join(dir, file), '');
  }

  return root;
}

/** `n` challenge module names, for fixtures where only the count matters. */
function challengeFiles(n: number): string[] {
  return Array.from({ length: n }, (_, index) => `challenge${String(index)}.ts`);
}

function budgetFor(route: string, rootDir?: string): number {
  const budget = routeBudgets(rootDir).find((candidate) => candidate.route === route);
  if (budget === undefined) throw new Error(`no budget for ${route}`);
  return budget.maxBytes;
}

describe('routeBudgets', () => {
  it('raises every route budget by one index entry per challenge', () => {
    const three = repoWithChallenges({ selection: challengeFiles(3) });
    const four = repoWithChallenges({ selection: challengeFiles(4) });

    // The whole point of deriving these numbers: authoring a challenge costs 414 B and buys back
    // exactly 414 B of ceiling, so ordinary growth never needs a re-baseline -- and a re-baseline,
    // which is indistinguishable from raising the number to bury a regression, stops being routine.
    //
    // All three move by the *same* 414 B because the whole index compiles into one chunk and that
    // chunk is in all three closures; measured across 1 to 104 challenges, no other chunk in any
    // route's closure moves by a byte when a challenge is registered. Asserted as one object rather
    // than in a loop so a failure names the route that broke, and so a route disappearing from the
    // list fails here rather than silently going unbudgeted.
    const deltas = Object.fromEntries(
      routeBudgets(four).map(({ route, maxBytes }) => [route, maxBytes - budgetFor(route, three)]),
    );

    expect(deltas).toEqual({ '/': 414, '/category/:categoryId': 414, '/challenge/:slug': 414 });
  });

  it("puts `/`'s budget where the committed literal was, at the challenge count that was measured", () => {
    // The literal this replaced was 380,000 B, against a measured 370,500 B at the 13 challenges in
    // the tree when it was set. The derived number has to land there, or the change quietly
    // re-baselined the very thing it exists to stop anyone re-baselining.
    expect(budgetFor('/', repoWithChallenges({ selection: challengeFiles(13) }))).toBe(379_997);
  });

  it('counts only challenge modules, so no other file buys budget', () => {
    const bare = budgetFor('/', repoWithChallenges({ selection: ['queryBasics.ts'] }));
    const padded = budgetFor(
      '/',
      repoWithChallenges({
        selection: ['queryBasics.ts', 'index.ts', 'support.ts', 'queryBasics.test.ts', 'notes.md'],
      }),
    );

    // A category index, its shared helpers, a test file and a non-module are not challenges, and
    // none of them costs `/` an index entry. Counting one would hand out ceiling for free.
    expect(padded).toBe(bare);
  });

  it('sums the challenge count across categories', () => {
    const split = budgetFor('/', repoWithChallenges({ selection: challengeFiles(2), forms: challengeFiles(3) }));
    const together = budgetFor('/', repoWithChallenges({ selection: challengeFiles(5) }));

    // Twelve categories are about to be populated. A count that stopped at the first directory
    // would under-budget `/` by every challenge after it, and would do so silently.
    expect(split).toBe(together);
  });

  it('holds each split route a fixed measured distance above `/`, at every challenge count', () => {
    // The measurement the derivation rests on, and the one that overturned the 427.8 B and 438.2 B
    // per-challenge coefficients the split routes were once thought to pay. Those were the 0 -> 1
    // structural step -- 176 B and 311 B, one-time -- divided across thirteen challenges. Above
    // zero, each split route's extra chunks are byte-identical whatever the count:
    //
    //     challenges     1       2      13      24      54     104
    //     cat  - `/`   166,155 ... unchanged at every one of eleven measured counts
    //     chal - `/`   415,218 ... likewise
    //
    // Three counts here rather than two: one just past the step, today's, and the ~104 this project
    // targets, which is the extrapolation the derivation actually has to survive. The count is put
    // in the compared object so a failure names which one drifted rather than only the byte figure.
    for (const count of [1, 24, 104]) {
      const root = repoWithChallenges({ selection: challengeFiles(count) });
      const home = budgetFor('/', root);

      const offsets = {
        count,
        '/category/:categoryId': budgetFor('/category/:categoryId', root) - home,
        '/challenge/:slug': budgetFor('/challenge/:slug', root) - home,
      };

      expect(offsets).toEqual({ count, '/category/:categoryId': 166_155, '/challenge/:slug': 415_218 });
    }
  });

  it('puts the split-route ceilings where a build of the tree as it stands can be checked against them', () => {
    const today = repoWithChallenges({ selection: challengeFiles(24) });

    // `pnpm build` reports 374,334 B, 540,489 B and 789,552 B for the 24 challenges in the tree.
    // These ceilings sit a uniform 10,217 B above each of those -- the fixed 9,500 B of slack plus
    // the 717 B by which a rounded 414 B outruns what those 24 entries actually cost. Written out
    // rather than recomputed from the constants, because an assertion that rebuilt the formula
    // would agree with any formula.
    //
    // The literals these replace were 550,000 B and 805,000 B: round numbers, not measurements, and
    // unequally generous (9,511 B and 15,448 B of headroom). Deriving lowers `/challenge/:slug` by
    // 5,231 B and raises `/category/:categoryId` by 706 B -- not extra room granted to that route,
    // but `/`'s own rounding, now applied to all three alike.
    expect(budgetFor('/category/:categoryId', today)).toBe(550_706);
    expect(budgetFor('/challenge/:slug', today)).toBe(799_769);
  });
});

describe('challengeModuleKeys', () => {
  it("finds this repository's challenge modules when given no root", () => {
    const keys = challengeModuleKeys();

    // Both checks in `routeBudget.ts` read this set: the budget derives `/`'s ceiling from its size
    // and `assertChallengesAreLazy` walks it. A default root that resolved somewhere without a
    // `src/challenges` in it would leave the set empty, and an empty set makes both checks pass
    // without looking at anything -- the shape AGENTS.md §8 calls a vacuous assertion.
    expect(keys).toContain('src/challenges/selection/queryBasics.ts');
    expect(keys.length).toBeGreaterThanOrEqual(13);
  });
});
