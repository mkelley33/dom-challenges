import { describe, expect, it } from 'vitest';

import type { ChallengeContent, ChallengeEntry } from '@/types/challenge';

import { loadChallenge } from './loader';
import { challengeIndex, entryBySlug } from './registry';

/**
 * Every key an index entry is allowed to have: the metadata `/` and `/category/:categoryId` render
 * from, plus the function that fetches the rest.
 *
 * Asserted exhaustively rather than as "has a title", because the whole point of the index is what
 * it *omits*. A `{ ...challenge, load }` entry would satisfy every positive assertion in this file
 * and put all 13 challenge modules back in the landing page's static closure -- the exact regression
 * this shape exists to prevent, and one no assertion about titles can see.
 */
const INDEX_KEYS = ['category', 'concepts', 'difficulty', 'id', 'load', 'relatedIds', 'slug', 'title'];

/** The fields that make a challenge module expensive. None of them may reach the index. */
const CONTENT_KEYS = ['prompt', 'html', 'starterCode', 'tests', 'solutions'] as const;

function fakeEntry(id: string, load: () => Promise<ChallengeContent>): ChallengeEntry {
  return {
    id,
    slug: id,
    title: 'A challenge',
    category: 'selection',
    difficulty: 'novice',
    concepts: [],
    relatedIds: [],
    load,
  };
}

describe('the challenge index', () => {
  it('has entries at all', () => {
    // Pinned first: every check below iterates the index, and a `flatMap` over an empty array is an
    // empty array -- so an index that carried nothing would satisfy all of them.
    expect(challengeIndex.length).toBeGreaterThan(0);
  });

  it('carries metadata and a loader, and nothing else', () => {
    // Collected rather than asserted per entry, so a failure names every entry that is wrong and so
    // there is no `expect` inside a loop.
    const shapes = challengeIndex.map((entry) => `${entry.slug}: ${Object.keys(entry).toSorted().join(',')}`);
    const expected = INDEX_KEYS.join(',');

    expect(shapes).toEqual(challengeIndex.map((entry) => `${entry.slug}: ${expected}`));
  });

  it('carries no challenge content', () => {
    // Named separately from the exhaustive check above even though that check subsumes it: this is
    // the assertion whose failure message says *which* expensive field leaked, which is what someone
    // who has just re-added a spread needs to read.
    const leaked = challengeIndex.flatMap((entry) =>
      CONTENT_KEYS.filter((key) => key in entry).map((key) => `${entry.slug}.${key}`),
    );

    expect(leaked).toEqual([]);
  });
});

describe('loadChallenge', () => {
  it('joins an index entry to its content', async () => {
    const entry = entryBySlug('query-basics');
    expect(entry).toBeDefined();

    const challenge = await loadChallenge(entry!);

    // Identity comes from the index, content from the module: both halves have to arrive, and each
    // half is what the other cannot prove on its own.
    expect(challenge.id).toBe(entry!.id);
    expect(challenge.slug).toBe(entry!.slug);
    expect(challenge.title).toBe(entry!.title);
    expect(challenge.concepts).toEqual(entry!.concepts);
    expect(challenge.tests.length).toBeGreaterThan(0);
    expect(challenge.solutions.length).toBeGreaterThan(0);
    expect(challenge.prompt.length).toBeGreaterThan(0);
    expect(challenge.html.length).toBeGreaterThan(0);
    expect(challenge.starterCode.length).toBeGreaterThan(0);
  });

  it('does not carry the loader onto the challenge it produces', async () => {
    const entry = entryBySlug('query-basics');
    expect(entry).toBeDefined();

    const challenge = await loadChallenge(entry!);

    // A `{ ...entry, ...content }` join typechecks and passes every assertion above while leaving a
    // `load` function on the object handed to the runner, the editor and the progress writer. It is
    // the same spread-shaped mistake as above, in the other direction.
    expect(challenge).not.toHaveProperty('load');
  });

  it('hands back the same promise for the same entry', () => {
    const entry = entryBySlug('query-basics');
    expect(entry).toBeDefined();

    // Identity, not equality. `ChallengePage` reads this promise with React's `use`, which requires
    // the *same* promise across renders: a loader that returned a fresh one each time would suspend
    // the route forever and warn about an uncached promise on every render.
    expect(loadChallenge(entry!)).toBe(loadChallenge(entry!));
  });

  it('keeps a failed load, so the render reading it settles instead of asking again', async () => {
    let attempts = 0;
    const entry = fakeEntry('fixture-unloadable-chunk', () => {
      attempts += 1;
      return Promise.reject(new Error('chunk load failed'));
    });

    const failed = loadChallenge(entry);
    await expect(failed).rejects.toThrow('chunk load failed');

    // Identity, *after* the rejection has settled, and the import count beside it. Dropping the
    // failed promise so the next caller could retry looks like the kinder branch and is not: the
    // caller is the retry render `use` schedules, so it gets a fresh pending promise, suspends
    // again, and never reaches the boundary. Measured at 21,528 imports in two seconds, on a page
    // showing nothing but the loading fallback.
    //
    // `ChallengePage.loadFailure.test.tsx` is the other half of this: it renders the real route and
    // waits for the error page. Neither test can see the defect alone -- this one passed against
    // the eviction, because calling `loadChallenge` directly is not composing it with `use`.
    expect(loadChallenge(entry)).toBe(failed);
    await expect(loadChallenge(entry)).rejects.toThrow('chunk load failed');
    expect(attempts).toBe(1);
  });
});
