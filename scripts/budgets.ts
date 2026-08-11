/**
 * The route budgets `scripts/routeBudget.ts` checks, and the challenge count all three are derived
 * from.
 *
 * Separate from the check itself so the numbers can be tested: `routeBudget.ts` reads a build
 * manifest and calls `process.exit` at module scope, which is not something a test can import.
 */
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The two files in a category directory that are not a challenge: the registration index, which is
 * eager by design, and the shared test helpers, which ride along inside the challenge chunks that
 * use them. Everything else in there is content and must reach the browser only on demand.
 */
const NON_CHALLENGE_MODULES = new Set(['index.ts', 'support.ts']);

export interface RouteBudget {
  route: string;
  /** The module a `React.lazy` call reaches for, or `null` when the route is in the entry chunk. */
  lazyKey: string | null;
  maxBytes: number;
}

/**
 * `/`'s eager JavaScript with the one populated category emptied out, measured -- and the part of
 * the other two routes' closures that is `/`'s, since both contain it whole.
 *
 * `pnpm build`, empty `selectionEntries`, rebuild -- §7's method and the only trustworthy one here.
 * This is the part of every route that has nothing to do with how many challenges exist.
 *
 * **A zero-challenge build is not this line's intercept, and whoever re-measures this needs to know
 * why.** With no `import()` left in any category index there is no preload helper chunk and no
 * split-chunk runtime, so a zero-challenge build is a structurally different one -- which is the
 * whole reason the split routes below looked like they paid more per challenge than `/`. Fitted to
 * builds from 1 to 104 challenges instead, `/`'s intercept is about 365,560 B, so this constant runs
 * ~445 B low. Left as measured: it is charged against the fixed slack, in the safe direction, and it
 * stops mattering as the count grows. Do not raise it to "correct" it -- that is a re-baseline of
 * the one number this arrangement exists to stop anyone re-baselining.
 */
const SHARED_FLOOR_BYTES = 365_115;

/**
 * What one challenge costs **every** route: its index entry, and nothing else.
 *
 * `/` measures 370,500 B with 13 challenges registered and 365,115 B with none, so 5,385/13 =
 * 414.2 B. Rounded down, which runs the model ~0.2 B per challenge tight -- 23 B at the ~103
 * challenges this project targets, against slack measured in thousands.
 *
 * One coefficient for three routes is a measurement, not an assumption. Registering a challenge
 * moves exactly one chunk in the whole build -- the one the index compiles into, which every route's
 * closure already contains -- and moves no other chunk by a byte, checked file by file at eleven
 * challenge counts. A real challenge's entry averaged 365.6 B over the 23 in the tree, so 414 stays
 * on the generous side of measurement across the range.
 *
 * Not to be confused with what a challenge module going *eager* costs, which is a different
 * measurement of a different thing: 2,178 B to 9,224 B across this category. `assertChallengesAreLazy`
 * is what sees that; see the note on `routeBudgets` below.
 */
const CHALLENGE_INDEX_ENTRY_BYTES = 414;

/**
 * Room on each route for everything that is not a challenge: a dependency bump, a component added
 * to the shell, a router upgrade.
 *
 * Fixed, and it has to be. Slack that grew with the library would stop being a ceiling. 9,500 B
 * puts the derived budget at 379,997 B for the 13 challenges the tree held when this was set --
 * three bytes under the 380,000 B literal it replaced, with the measured 370,500 B sitting 9,497 B
 * below it.
 *
 * The same 9,500 B on all three routes, not a share of each route's size: the question it answers is
 * how much unexplained growth to absorb before saying something, and that does not get a larger
 * answer because a route is larger.
 */
const ROUTE_SLACK_BYTES = 9_500;

/**
 * What `/category/:categoryId` fetches that `/` does not, measured: `ChallengeList` and the three
 * chunks it drags in (`useScrollLock`, `createLucideIcon`, `editorStore`).
 *
 * **Fixed, and measured to be fixed.** These four chunks are byte-identical at 1, 2, 11, 13, 14, 17,
 * 20, 24, 34, 54 and 104 registered challenges -- the whole index compiles into one chunk, that
 * chunk is already in `/`'s closure, and nothing a challenge adds lands anywhere else. So this route
 * pays exactly `/`'s per-challenge cost and exactly this much more.
 *
 * This is what the 427.8 B per-challenge figure recorded in Phase 2 actually was. That measurement
 * subtracted a build with **zero** challenges registered, and zero is a structurally different
 * build: with no `import()` anywhere in the category indexes there is no preload helper and no
 * split-chunk runtime, so every chunk that would import them is a few tens of bytes smaller. Going
 * from zero challenges to one costs this route 176 B **once**; 176/13 = 13.5, and 414.2 + 13.5 =
 * 427.7. The excess was a one-time re-chunking cost amortised across thirteen challenges, exactly as
 * suspected, and not a per-challenge term at all. It cannot recur: the library never returns to
 * empty, and the step is measured only at the 0 -> 1 boundary.
 */
const CATEGORY_ROUTE_ONLY_BYTES = 166_155;

/**
 * The same quantity for `/challenge/:slug`: `ChallengePage`, `button`, `ccount`, `createLucideIcon`
 * and `editorStore`. Measured constant across the same eleven challenge counts.
 *
 * Its one-time 0 -> 1 step is 311 B, which is where 438.2 came from: 311/13 = 23.9, and 414.2 + 23.9
 * = 438.1.
 *
 * Larger than `/`'s whole floor, and unbudgeted growth in it is the thing this number exists to
 * catch: Monaco, the runner and the markdown pipeline all land here and nowhere else, so a
 * dependency bump that never touches `/` still has to fit in the slack below.
 */
const CHALLENGE_ROUTE_ONLY_BYTES = 415_218;

/**
 * Every challenge module on disk, as the manifest key it would be emitted under.
 *
 * Both checks in `routeBudget.ts` read the set from here, so they cannot come to disagree about
 * what counts as a challenge.
 *
 * **From disk, never from the build manifest**, and for the budget that distinction is the whole
 * point: a challenge module that stopped being lazy vanishes from the manifest, so a
 * manifest-derived count would drop by one -- tightening `/`'s ceiling by 414 B at the exact moment
 * a module added thousands to the entry. Counting files makes the budget independent of anything
 * the bundler did with them.
 *
 * This count stands in for `challengeIndex.length`, which a Node script cannot import. The two are
 * equal, and are held equal from both ends: `assertChallengesAreLazy` fails on a module no index
 * registers, `vite build` fails on an index entry whose `import()` resolves to nothing, and
 * `registry.test.ts` pins the two counts against each other.
 *
 * `rootDir` is a parameter so the count can be exercised against a tree with a known number of
 * challenges in it. Nothing but `budgets.test.ts` passes one.
 */
export function challengeModuleKeys(rootDir: string = ROOT_DIR): string[] {
  const keys: string[] = [];
  const challengesDir = join(rootDir, 'src', 'challenges');

  for (const category of readdirSync(challengesDir, { withFileTypes: true })) {
    if (!category.isDirectory()) continue;
    for (const file of readdirSync(join(challengesDir, category.name))) {
      if (!file.endsWith('.ts') || file.endsWith('.test.ts') || NON_CHALLENGE_MODULES.has(file)) continue;
      keys.push(`src/challenges/${category.name}/${file}`);
    }
  }

  return keys;
}

/**
 * Every route's budget is derived from the challenge count. None of them is a literal.
 *
 * A hardcoded ceiling made re-baselining a routine part of authoring -- 414 B a challenge against
 * 9,500 B of headroom is a re-baseline every twenty-two of them -- and a routine re-baseline is
 * indistinguishable from someone raising the number to make a regression go away. What forbade the
 * lazy version of that was prose in `OVER_BUDGET_GUIDANCE`: manners, not structure. Derived,
 * ordinary authoring needs no edit here at all, and a ceiling can only move when the challenge count
 * moves or when someone edits a measured constant and the test that pins it.
 *
 * The three ceilings share one variable term because the build does: the challenge index compiles
 * into a single chunk that every route's closure already contains, so a registered challenge costs
 * all three routes the same 414 B. What separates them is fixed -- the chunks each split route
 * fetches and `/` does not -- and measuring that at eleven challenge counts from 1 to 104 is what
 * unblocked this. The apparent 427.8 B and 438.2 B those routes were thought to pay per challenge
 * were a one-time 0 -> 1 re-chunking step divided by thirteen; see the two constants above.
 *
 * Slack is the same 9,500 B on each, because slack answers the same question on each: how much
 * non-challenge growth to absorb before saying something. It does not scale with a route's size, so
 * `/challenge/:slug` gets no more room for a Monaco bump than `/` gets for a router bump -- which is
 * intended. The route that grew is the route whose line goes red, and the growth has to be explained
 * rather than accommodated.
 *
 * **This is still not the laziness check, and deriving it does not make it one.** The byte budget
 * cannot see a challenge going lazy-to-eager at any size: statically importing the most expensive
 * module in the tree puts `/` at 379,724 B, which fits under the derived ceiling exactly as it fit
 * under the literal. `assertChallengesAreLazy` in `routeBudget.ts` is what catches that, it reads
 * the same set of files this count comes from, and it does not depend on a number at all. Nor does
 * the derivation hand an eager module any room: a challenge raises the ceiling by 414 B and the
 * entry by 414 B, so going eager still has to fit inside the fixed slack -- and now that the split
 * routes are derived too, that is as true of them as it always was of `/`. The two checks answer
 * different questions and neither one's result should be read as the other's.
 */
export function routeBudgets(rootDir: string = ROOT_DIR): RouteBudget[] {
  const challengeCount = challengeModuleKeys(rootDir).length;
  const sharedBytes = SHARED_FLOOR_BYTES + CHALLENGE_INDEX_ENTRY_BYTES * challengeCount + ROUTE_SLACK_BYTES;

  return [
    {
      route: '/',
      lazyKey: null,
      maxBytes: sharedBytes,
    },
    {
      route: '/category/:categoryId',
      lazyKey: 'src/components/browse/ChallengeList.tsx',
      maxBytes: sharedBytes + CATEGORY_ROUTE_ONLY_BYTES,
    },
    {
      route: '/challenge/:slug',
      lazyKey: 'src/components/challenge/ChallengePage.tsx',
      maxBytes: sharedBytes + CHALLENGE_ROUTE_ONLY_BYTES,
    },
  ];
}
