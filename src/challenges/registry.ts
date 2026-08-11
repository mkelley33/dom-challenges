import type { CategoryId, ChallengeEntry, ChallengeMeta, Difficulty } from '@/types/challenge';

import { asyncEntries } from './async';
import { attributesEntries } from './attributes';
import { creationEntries } from './creation';
import { observersEntries } from './observers';
import { performanceEntries } from './performance';
import { selectionEntries } from './selection';
import { storageEntries } from './storage';
import { stylesEntries } from './styles';
import { webApisEntries } from './web-apis';

export const CATEGORY_META: Record<CategoryId, { title: string; blurb: string }> = {
  selection: { title: 'Selection & Traversal', blurb: 'Finding elements and walking the tree.' },
  creation: { title: 'Create, Insert & Remove', blurb: 'Building and placing nodes efficiently.' },
  attributes: { title: 'Attributes, Properties & Data', blurb: 'The attribute/property split and datasets.' },
  styles: { title: 'Classes, Styles & CSSOM', blurb: 'classList, custom properties, computed styles.' },
  events: { title: 'Events', blurb: 'Propagation, delegation, custom events, AbortController.' },
  forms: { title: 'Forms & Validation', blurb: 'FormData and the Constraint Validation API.' },
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
  ...byAscendingDifficulty(observersEntries),
  ...byAscendingDifficulty(performanceEntries),
  ...byAscendingDifficulty(asyncEntries),
  ...byAscendingDifficulty(storageEntries),
  ...byAscendingDifficulty(webApisEntries),
];

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
