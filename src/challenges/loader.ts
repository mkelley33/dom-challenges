import type { Challenge, ChallengeEntry } from '@/types/challenge';

/**
 * The challenge each entry has already been asked for, keyed by id.
 *
 * Two reasons, and only one of them is about the network. React's `use` -- which is how
 * `ChallengePage` reads this -- requires the *same* promise on every render of the component that
 * reads it; a loader handing back a fresh promise each time suspends forever and warns about an
 * uncached promise on every attempt. The second is the ordinary one: a learner returning to a
 * challenge they have already opened should not wait for it twice.
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

  // A rejected promise must not be what the next caller gets. A dropped chunk request is transient
  // and a cached rejection is not: it would make one failed fetch a permanently broken challenge
  // for the rest of the session, on a page that offers no way to retry but a reload.
  const guarded = pending.catch((error: unknown) => {
    loaded.delete(entry.id);
    throw error;
  });

  loaded.set(entry.id, guarded);
  return guarded;
}
