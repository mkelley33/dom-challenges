/**
 * The route budgets `scripts/routeBudget.ts` checks, and the challenge count one of them is
 * derived from.
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
 * `/`'s eager JavaScript with the one populated category emptied out, measured.
 *
 * `pnpm build`, empty `selectionEntries`, rebuild -- §7's method and the only trustworthy one here.
 * This is the part of `/` that has nothing to do with how many challenges exist.
 */
const HOME_FLOOR_BYTES = 365_115;

/**
 * What one challenge costs `/`: its index entry, and nothing else.
 *
 * `/` measures 370,500 B with 13 challenges registered and 365,115 B with none, so 5,385/13 =
 * 414.2 B. Rounded down, which runs the model ~0.2 B per challenge tight -- 23 B at the ~103
 * challenges this project targets, against slack measured in thousands.
 *
 * Not to be confused with what a challenge module going *eager* costs, which is a different
 * measurement of a different thing: 2,178 B to 9,224 B across this category. `assertChallengesAreLazy`
 * is what sees that; see the note on `routeBudgets` below.
 */
const CHALLENGE_INDEX_ENTRY_BYTES = 414;

/**
 * Room for everything on `/` that is not a challenge: a dependency bump, a component added to the
 * shell, a router upgrade.
 *
 * Fixed, and it has to be. Slack that grew with the library would stop being a ceiling. 9,500 B
 * puts the derived budget at 379,997 B for the 13 challenges in the tree today -- three bytes under
 * the 380,000 B literal it replaces, with the measured 370,500 B sitting 9,497 B below it.
 */
const HOME_SLACK_BYTES = 9_500;

/**
 * `/category/:categoryId`'s ceiling: committed, not derived.
 *
 * Measured at 536,655 B with the 13 challenges here and 531,094 B with the category emptied, so it
 * pays 5,561/13 = **427.8 B** per challenge -- the same index entry `/` pays, since its closure
 * contains the entry chunk too, plus re-chunking. 13,345 B of headroom, which at its own
 * coefficient is **31 challenges**, not the 32 that `/`'s 414 B would suggest.
 *
 * Not derived, because that needs a floor and a coefficient someone has reproduced, and 427.8 is
 * not the clean 414 -- the excess is re-chunking, not a mechanism, and a fuse should not be built
 * on a coefficient nobody can explain. Pinned by `budgets.test.ts` in the meantime, so moving this
 * number means editing a test that records a measurement rather than editing one digit here.
 */
const CATEGORY_ROUTE_MAX_BYTES = 550_000;

/**
 * `/challenge/:slug`'s ceiling: committed, not derived, for the same reasons.
 *
 * Measured at 784,772 B with 13 challenges and 779,076 B with the category emptied: 5,696/13 =
 * **438.2 B** per challenge, and 20,228 B of headroom, which is **46 challenges** at that
 * coefficient rather than the 48 that `/`'s would give.
 */
const CHALLENGE_ROUTE_MAX_BYTES = 805_000;

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
 * `/`'s budget is derived from the challenge count; the other two are committed literals.
 *
 * A hardcoded ceiling on `/` made re-baselining a routine part of authoring -- 414 B a challenge
 * against 9,500 B of headroom is a re-baseline every twenty-two of them -- and a routine
 * re-baseline is indistinguishable from someone raising the number to make a regression go away.
 * What forbade the lazy version of that was prose in `OVER_BUDGET_GUIDANCE`: manners, not
 * structure. Derived, ordinary authoring needs no edit here at all, and the ceiling can only move
 * when the challenge count moves or when someone edits a measured constant and the test that pins
 * it.
 *
 * **This is still not the laziness check, and deriving it does not make it one.** The byte budget
 * cannot see a challenge going lazy-to-eager at any size: statically importing the most expensive
 * module in the tree puts `/` at 379,724 B, which fits under the derived ceiling exactly as it fit
 * under the literal. `assertChallengesAreLazy` in `routeBudget.ts` is what catches that, it reads
 * the same set of files this count comes from, and it does not depend on a number at all. Nor does
 * the derivation hand an eager module any room: a challenge raises the ceiling by 414 B and the
 * entry by 414 B, so going eager still has to fit inside the fixed slack.
 *
 * `/category/:categoryId` and `/challenge/:slug` stay literals, and their constants above carry
 * their own measurements: 31 and 46 challenges of headroom, computed at each route's own
 * coefficient rather than `/`'s 414 B, because a number whose whole job is to be an early warning
 * takes the conservative one. They will need this same treatment before the first full category is
 * authored, not after one of them goes red. Until then they are pinned by value, which is the
 * friction `/` gets from being derived: neither can be re-baselined without editing a test.
 */
export function routeBudgets(rootDir: string = ROOT_DIR): RouteBudget[] {
  const challengeCount = challengeModuleKeys(rootDir).length;

  return [
    {
      route: '/',
      lazyKey: null,
      maxBytes: HOME_FLOOR_BYTES + CHALLENGE_INDEX_ENTRY_BYTES * challengeCount + HOME_SLACK_BYTES,
    },
    {
      route: '/category/:categoryId',
      lazyKey: 'src/components/browse/ChallengeList.tsx',
      maxBytes: CATEGORY_ROUTE_MAX_BYTES,
    },
    {
      route: '/challenge/:slug',
      lazyKey: 'src/components/challenge/ChallengePage.tsx',
      maxBytes: CHALLENGE_ROUTE_MAX_BYTES,
    },
  ];
}
