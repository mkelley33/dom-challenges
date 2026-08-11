import type { CategoryId, Challenge, Difficulty } from '@/types/challenge';

import { selectionChallenges } from './selection';

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
 * these predicates recovers the union through real narrowing instead of an unchecked assertion,
 * and the same predicates narrow the untyped strings that arrive from a route param or a select.
 */
export function isCategoryId(id: string): id is CategoryId {
  return Object.prototype.hasOwnProperty.call(CATEGORY_META, id);
}

export function isDifficulty(value: string): value is Difficulty {
  return Object.prototype.hasOwnProperty.call(DIFFICULTY_LABELS, value);
}

export const CATEGORY_IDS: readonly CategoryId[] = Object.keys(CATEGORY_META).filter(isCategoryId);

export const DIFFICULTIES: readonly Difficulty[] = Object.keys(DIFFICULTY_LABELS).filter(isDifficulty);

export const allChallenges: readonly Challenge[] = [...selectionChallenges];

const byId = new Map(allChallenges.map((challenge) => [challenge.id, challenge]));
const bySlug = new Map(allChallenges.map((challenge) => [challenge.slug, challenge]));

export function challengeById(id: string): Challenge | undefined {
  return byId.get(id);
}

export function challengeBySlug(slug: string): Challenge | undefined {
  return bySlug.get(slug);
}

export function challengesInCategory(category: CategoryId): Challenge[] {
  return allChallenges.filter((challenge) => challenge.category === category);
}

/**
 * Structural checks that a set of challenges is internally consistent. Returns every problem
 * found rather than throwing on the first one, so a test can assert on the full list at once.
 * Duplicate slugs and dangling `relatedIds` are silent bugs -- a duplicate slug shadows one
 * challenge behind another at lookup time, and a dangling `relatedIds` entry breaks a "related
 * challenges" link -- without this, neither surfaces until someone notices by hand.
 */
export function validateRegistry(challenges: readonly Challenge[]): string[] {
  const problems: string[] = [];
  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();
  const knownIds = new Set(challenges.map((challenge) => challenge.id));

  for (const challenge of challenges) {
    const label = `${challenge.category}/${challenge.slug}`;

    if (seenIds.has(challenge.id)) problems.push(`${label}: duplicate id "${challenge.id}"`);
    seenIds.add(challenge.id);

    if (seenSlugs.has(challenge.slug)) problems.push(`${label}: duplicate slug "${challenge.slug}"`);
    seenSlugs.add(challenge.slug);

    if (challenge.tests.length === 0) problems.push(`${label}: has no tests`);
    if (challenge.solutions.length === 0) problems.push(`${label}: has no solutions`);

    for (const relatedId of challenge.relatedIds) {
      if (!knownIds.has(relatedId)) problems.push(`${label}: relatedIds points at unknown challenge "${relatedId}"`);
    }
  }

  return problems;
}
