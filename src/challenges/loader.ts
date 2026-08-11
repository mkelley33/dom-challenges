import type { Challenge, ChallengeEntry } from '@/types/challenge';

/**
 * The challenge each entry has already been asked for, keyed by id -- **settled either way**.
 *
 * Two reasons, and only one of them is about the network. React's `use` -- which is how
 * `ChallengePage` reads this -- requires the *same* promise on every render of the component that
 * reads it; a loader handing back a fresh promise each time suspends forever and warns about an
 * uncached promise on every attempt. The second is the ordinary one: a learner returning to a
 * challenge they have already opened should not wait for it twice.
 *
 * A **failure** stays here for the first reason, and the cost of getting that wrong is measured:
 * evicting a rejected promise so the next caller could retry meant the retry render `use` schedules
 * called `load()` again, got a fresh pending promise, and suspended again -- 21,528 imports in two
 * seconds, the page pinned to the loading fallback, and the error boundary never reached. A cached
 * rejection is what lets the failure settle into a throw `RouteError` can catch.
 *
 * Nor would evicting buy a retry. Per the HTML module map a repeat `import()` of a specifier that
 * already failed resolves to the recorded failure without re-fetching, which is the same conclusion
 * `routes.errorElement.test.tsx` reached for `lazy`: only a fresh document re-issues the request,
 * which is exactly what `RouteError`'s reload button does. An in-session retry would have to be its
 * own entry point that the error UI calls deliberately -- never the path a render reads.
 */
const loaded = new Map<string, Promise<Challenge>>();

/**
 * Fetches a challenge's content module and joins it to the metadata already in the index.
 *
 * Takes the entry rather than a slug so that the result is a `Challenge` and never
 * `Challenge | undefined`: "is there such a challenge" is answered synchronously against the index
 * by `entryBySlug`, before anything is fetched, which is what lets an unknown slug render the
 * not-found page immediately instead of suspending first and finding nothing afterwards.
 */
export function loadChallenge(entry: ChallengeEntry): Promise<Challenge> {
  const cached = loaded.get(entry.id);
  if (cached !== undefined) return cached;

  const pending = entry.load().then((content) => ({
    // Copied field by field rather than spread from `entry`, which would put `load` on the
    // challenge handed to the runner and the editor. Listing them also means a new `ChallengeMeta`
    // field is a compile error here until it is carried across, rather than a silently missing one.
    id: entry.id,
    slug: entry.slug,
    title: entry.title,
    category: entry.category,
    difficulty: entry.difficulty,
    concepts: entry.concepts,
    relatedIds: entry.relatedIds,
    ...content,
  }));

  loaded.set(entry.id, pending);
  return pending;
}
