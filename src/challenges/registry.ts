import type { CategoryId, ChallengeEntry, ChallengeMeta, Difficulty } from '@/types/challenge';

import { a11yEntries } from './a11y';
import { asyncEntries } from './async';
import { attributesEntries } from './attributes';
import { creationEntries } from './creation';
import { eventsEntries } from './events';
import { formsEntries } from './forms';
import { observersEntries } from './observers';
import { performanceEntries } from './performance';
import { selectionEntries } from './selection';
import { storageEntries } from './storage';
import { stylesEntries } from './styles';
import { webApisEntries } from './web-apis';

export interface CategoryMeta {
  title: string;
  blurb: string;
  /**
   * Whether a learner is offered this category at all. **Absent means no**, and that default is the
   * whole point of the flag.
   *
   * A category is half-finished for as long as it takes to author it, and a half-finished category
   * on the dashboard is a promise the app cannot keep: six of the thirteen below hold a single
   * reconnaissance challenge each, which is the precise opposite of "a learner can finish this".
   * Opt-in means the only way to advertise a category is to say so, and saying so is a line a
   * reviewer can see.
   *
   * It hides a category from *browsing* and from nothing else. The challenges of an unshipped
   * category stay registered in `challengeIndex`, stay opened by `content.test.ts` (AGENTS.md §10),
   * and stay reachable by URL -- unshipped is not withdrawn, and a stale bookmark should not break.
   */
  shipping?: boolean;
}

export const CATEGORY_META: Record<CategoryId, CategoryMeta> = {
  selection: { title: 'Selection & Traversal', blurb: 'Finding elements and walking the tree.', shipping: true },
  creation: { title: 'Create, Insert & Remove', blurb: 'Building and placing nodes efficiently.', shipping: true },
  attributes: {
    title: 'Attributes, Properties & Data',
    blurb: 'The attribute/property split and datasets.',
    shipping: true,
  },
  styles: { title: 'Classes, Styles & CSSOM', blurb: 'classList, custom properties, computed styles.', shipping: true },
  events: { title: 'Events', blurb: 'Propagation, delegation, custom events, AbortController.', shipping: true },
  forms: { title: 'Forms & Validation', blurb: 'FormData and the Constraint Validation API.', shipping: true },
  observers: { title: 'Observers', blurb: 'Mutation, Intersection, and Resize observers.' },
  async: { title: 'Async & Scheduling', blurb: 'Frames, microtasks, idle callbacks, throttling.' },
  storage: { title: 'Storage, URL & History', blurb: 'localStorage, IndexedDB, URL and History APIs.' },
  'web-apis': { title: 'Web APIs', blurb: 'Shadow DOM, Clipboard, Canvas, Drag & Drop, fetch.' },
  performance: { title: 'Performance', blurb: 'Layout thrashing, batching, virtualization.' },
  a11y: { title: 'Accessibility', blurb: 'Focus management, ARIA state, keyboard navigation.' },
  react: { title: 'React', blurb: 'The same problems, solved the React way.' },
};

/**
 * The human-readable name for each difficulty, in the order a learner would climb them.
 *
 * A `Record` keyed by `Difficulty` rather than an array of ids: adding a member to the union is a
 * compile error here until it is given a label, where an array would simply omit it -- and an
 * omitted difficulty is a filter option nobody can pick and a summary bucket that never appears.
 */
export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  novice: 'Novice',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  expert: 'Expert',
};

/**
 * `Object.keys` types as `string[]` however narrow the object's own key type is -- a known gap in
 * the standard library's types, not something these objects' shapes leave in doubt. Filtering with
 * these predicates recovers the union through real narrowing instead of an unchecked assertion.
 *
 * `isCategoryId` is exported for a second reason: a route param arrives as `string | undefined`,
 * and `ChallengeList` narrows it with this rather than casting.
 */
export function isCategoryId(id: string): id is CategoryId {
  return Object.prototype.hasOwnProperty.call(CATEGORY_META, id);
}

/** Not exported: deriving `DIFFICULTIES` below is the only thing that needs it. */
function isDifficulty(value: string): value is Difficulty {
  return Object.prototype.hasOwnProperty.call(DIFFICULTY_LABELS, value);
}

export const CATEGORY_IDS: readonly CategoryId[] = Object.keys(CATEGORY_META).filter(isCategoryId);

export const DIFFICULTIES: readonly Difficulty[] = Object.keys(DIFFICULTY_LABELS).filter(isDifficulty);

/**
 * The categories a given metadata record advertises, in declaration order.
 *
 * Takes the record rather than reading `CATEGORY_META` directly so that the flag's semantics --
 * `shipping === true` and nothing else, absence meaning hidden -- are stated in one testable place.
 * Walks `CATEGORY_IDS` rather than `Object.keys(meta)`: the parameter's type says the key set is
 * exactly `CategoryId`, so this needs no narrowing and cannot be handed a key the union lacks.
 */
export function shippingCategoryIds(meta: Record<CategoryId, CategoryMeta>): CategoryId[] {
  return CATEGORY_IDS.filter((id) => meta[id].shipping === true);
}

/**
 * The categories the browse UI offers: the dashboard's cards, and the challenges its counters are
 * measured against. Everything else in the app -- the index, the loader, the routes, the content
 * suite -- reads `challengeIndex` and knows nothing about this. See AGENTS.md §10.
 */
export const SHIPPING_CATEGORY_IDS: readonly CategoryId[] = shippingCategoryIds(CATEGORY_META);

/**
 * Orders one category's challenges the way a learner should meet them: easiest first.
 *
 * `ChallengeList` renders a category top to bottom in this order, so registration order *is* the
 * reading order -- and challenges are authored in whatever sequence the work happened, which put an
 * expert challenge above a novice one. The rank comes from `DIFFICULTIES`, itself
 * `DIFFICULTY_LABELS`' declaration order, so the ladder is defined in exactly one place.
 *
 * `toSorted` is stable and copies, so challenges of equal difficulty keep the order they were
 * written in -- the only other ordering signal the content carries -- and the category's own array
 * is left alone. Applied per category rather than to the whole concatenation, which would
 * interleave the categories by difficulty instead of keeping each one together.
 */
function byAscendingDifficulty(entries: readonly ChallengeEntry[]): ChallengeEntry[] {
  return entries.toSorted((a, b) => DIFFICULTIES.indexOf(a.difficulty) - DIFFICULTIES.indexOf(b.difficulty));
}

/**
 * Every challenge the app knows about, as metadata and a dynamic import -- never as content.
 *
 * This is the list `/` and `/category/:categoryId` render from, and the reason those pages do not
 * grow with the library: an entry is a title, a difficulty, some concepts and a function, so
 * authoring a challenge adds a couple of hundred bytes to the first paint instead of the ~6.8 kB a
 * whole module used to cost. `loadChallenge` in `./loader` turns an entry into a `Challenge`, and
 * the challenge route is the only thing that asks. See AGENTS.md §10.
 */
export const challengeIndex: readonly ChallengeEntry[] = [
  ...byAscendingDifficulty(selectionEntries),
  ...byAscendingDifficulty(creationEntries),
  ...byAscendingDifficulty(attributesEntries),
  ...byAscendingDifficulty(stylesEntries),
  ...byAscendingDifficulty(eventsEntries),
  ...byAscendingDifficulty(formsEntries),
  ...byAscendingDifficulty(a11yEntries),
  ...byAscendingDifficulty(observersEntries),
  ...byAscendingDifficulty(performanceEntries),
  ...byAscendingDifficulty(asyncEntries),
  ...byAscendingDifficulty(storageEntries),
  ...byAscendingDifficulty(webApisEntries),
];

/**
 * The part of the index a learner can actually reach by browsing.
 *
 * The dashboard's totals are measured against this rather than against `challengeIndex`, and the
 * difference is the honesty this exists for: a bar reading "0 of 74" on a library where only 68 are
 * findable is a bar that can never fill. A learner who follows a stale link into an unshipped
 * challenge and solves it is not counted here -- `summarise` folds over challenges and looks their
 * records up, so an unreachable solve is simply not part of the total it is measured against.
 *
 * A `filter` over the same array the lookups are built from, not a second list to keep in step.
 */
export const shippingEntries: readonly ChallengeEntry[] = challengeIndex.filter((entry) =>
  SHIPPING_CATEGORY_IDS.includes(entry.category),
);

const byId = new Map(challengeIndex.map((entry) => [entry.id, entry]));
const bySlug = new Map(challengeIndex.map((entry) => [entry.slug, entry]));

export function entryById(id: string): ChallengeEntry | undefined {
  return byId.get(id);
}

export function entryBySlug(slug: string): ChallengeEntry | undefined {
  return bySlug.get(slug);
}

export function entriesInCategory(category: CategoryId): ChallengeEntry[] {
  return challengeIndex.filter((entry) => entry.category === category);
}

/**
 * Structural checks that the index is internally consistent. Returns every problem found rather
 * than throwing on the first one, so a test can assert on the full list at once. Duplicate slugs
 * and dangling `relatedIds` are silent bugs -- a duplicate slug shadows one challenge behind
 * another at lookup time, and a dangling `relatedIds` entry breaks a "related challenges" link --
 * without this, neither surfaces until someone notices by hand.
 *
 * Takes `ChallengeMeta`, so it answers these questions without loading a single challenge module.
 * "Has at least one test" and "has at least one solution" are content questions and belong to
 * `content.test.ts`, which is the suite that opens every challenge anyway.
 */
export function validateRegistry(entries: readonly ChallengeMeta[]): string[] {
  const problems: string[] = [];
  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();
  const knownIds = new Set(entries.map((entry) => entry.id));

  for (const entry of entries) {
    const label = `${entry.category}/${entry.slug}`;

    if (seenIds.has(entry.id)) problems.push(`${label}: duplicate id "${entry.id}"`);
    seenIds.add(entry.id);

    if (seenSlugs.has(entry.slug)) problems.push(`${label}: duplicate slug "${entry.slug}"`);
    seenSlugs.add(entry.slug);

    for (const relatedId of entry.relatedIds) {
      if (!knownIds.has(relatedId)) problems.push(`${label}: relatedIds points at unknown challenge "${relatedId}"`);
    }
  }

  return problems;
}
