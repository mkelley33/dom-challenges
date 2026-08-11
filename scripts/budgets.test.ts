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
  it("raises `/`'s budget by one index entry per challenge", () => {
    const three = budgetFor('/', repoWithChallenges({ selection: challengeFiles(3) }));
    const four = budgetFor('/', repoWithChallenges({ selection: challengeFiles(4) }));

    // The whole point of deriving this number: authoring a challenge costs `/` 414 B and buys back
    // exactly 414 B of ceiling, so ordinary growth never needs a re-baseline -- and a re-baseline,
    // which is indistinguishable from raising the number to bury a regression, stops being routine.
    expect(four - three).toBe(414);
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

  it('holds the two split routes at their measured literals, whatever the challenge count', () => {
    const few = repoWithChallenges({ selection: challengeFiles(1) });
    const many = repoWithChallenges({ selection: challengeFiles(40) });

    // Two things at once, and both are load-bearing.
    //
    // That these do not move with the challenge count is the deliberate asymmetry with `/`: their
    // closures contain the entry chunk, so they really do pay per challenge, but at 427.8 B and
    // 438.2 B rather than `/`'s clean 414 B. The excess is re-chunking rather than a mechanism, and
    // deriving a ceiling from a coefficient nobody can explain would be the unchecked number this
    // file exists to remove, wearing a formula.
    //
    // That they are *these* numbers is the friction `/` gets from being derived, extended to the
    // routes that could not have it. Until this line existed, a silent 550,000 -> 600,000 passed
    // every gate in the repository -- which is the whole defect, still open on two routes of three.
    // The values are written out here rather than imported, or the assertion would be the constant
    // compared with itself.
    expect(budgetFor('/category/:categoryId', few)).toBe(550_000);
    expect(budgetFor('/category/:categoryId', many)).toBe(550_000);
    expect(budgetFor('/challenge/:slug', few)).toBe(805_000);
    expect(budgetFor('/challenge/:slug', many)).toBe(805_000);
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
