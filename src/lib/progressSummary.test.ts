import { describe, expect, it } from 'vitest';

import { CATEGORY_META } from '@/challenges/registry';
import type { CategoryId, Challenge, Difficulty } from '@/types/challenge';
import type { ProgressRecord } from '@/types/progress';

import { summarise } from './progressSummary';

/**
 * Built by hand rather than taken from the registry: the registry currently holds one category's
 * worth of challenges, so counting against it could not tell "grouped by category" apart from
 * "put everything in one bucket".
 */
function makeChallenge(id: string, category: CategoryId, difficulty: Difficulty): Challenge {
  return {
    id,
    slug: id,
    title: id,
    category,
    difficulty,
    prompt: '',
    html: '',
    starterCode: '',
    tests: [],
    solutions: [],
    concepts: [],
    relatedIds: [],
  };
}

function makeRecord(challengeId: string, overrides: Partial<ProgressRecord> = {}): ProgressRecord {
  return {
    id: `row-${challengeId}`,
    challengeId,
    status: 'attempted',
    attempts: 1,
    solvedAt: null,
    revealedAt: null,
    lastCode: null,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const SOLVED_AT = '2026-01-02T00:00:00.000Z';
const REVEALED_AT = '2026-01-03T00:00:00.000Z';

/** Two categories x two difficulties, so neither grouping can be faked by the other. */
const challenges: readonly Challenge[] = [
  makeChallenge('sel-novice', 'selection', 'novice'),
  makeChallenge('sel-advanced', 'selection', 'advanced'),
  makeChallenge('evt-novice', 'events', 'novice'),
  makeChallenge('evt-advanced', 'events', 'advanced'),
];

const liveRecords: ProgressRecord[] = [
  // Solved without ever looking at a solution.
  makeRecord('sel-novice', { status: 'solved', solvedAt: SOLVED_AT }),
  // Revealed and still not solved.
  makeRecord('sel-advanced', { revealedAt: REVEALED_AT }),
  // Both at once -- the case that makes "solved" and "revealed" overlapping counts, not buckets.
  makeRecord('evt-novice', { status: 'solved', solvedAt: SOLVED_AT, revealedAt: REVEALED_AT }),
];

/**
 * Rows left behind by challenges that no longer exist, both solved and revealed. There are two of
 * them, and only three live rows against four challenges, so `records.length` (5) differs from
 * `challenges.length` (4) in both directions -- a `total` taken from the wrong array cannot
 * coincidentally match.
 */
const staleRecords: ProgressRecord[] = [
  makeRecord('deleted-challenge', { status: 'solved', solvedAt: SOLVED_AT, revealedAt: REVEALED_AT }),
  makeRecord('renamed-challenge', { status: 'solved', solvedAt: SOLVED_AT, revealedAt: REVEALED_AT }),
];

const records: ProgressRecord[] = [...liveRecords, ...staleRecords];

// `evt-advanced` deliberately has no record at all: a summary that assumed one row per challenge
// would throw or undercount rather than treating "no row" as unattempted.

describe('summarise', () => {
  it('counts the challenges, not the progress records', () => {
    expect(records).toHaveLength(5);
    expect(summarise(challenges, records).total).toBe(4);
  });

  it("counts only records whose status is 'solved'", () => {
    // Four of the five records say 'solved'; only two of those belong to a challenge that exists.
    expect(summarise(challenges, records).solved).toBe(2);
  });

  it('ignores a record for a challenge id the registry does not have', () => {
    const summary = summarise(challenges, records);
    const withoutStale = summarise(challenges, liveRecords);

    expect(summary).toEqual(withoutStale);
    // Spelled out as well as compared, so a summary that inflated *both* sides identically -- by
    // folding over records in both calls -- still fails here.
    expect(summary.total).toBe(4);
    expect(summary.solved).toBe(2);
    expect(summary.revealed).toBe(2);
  });

  it('counts a non-null revealedAt whether or not the challenge was also solved', () => {
    // `sel-advanced` is revealed and unsolved; `evt-novice` is revealed *and* solved. Treating the
    // two as exclusive buckets -- counting a reveal only when the challenge is not solved -- gives
    // 1 here, and quietly overstates how much of the dashboard's completion figure was earned.
    expect(summarise(challenges, records).revealed).toBe(2);
  });

  it('groups by category so the per-category totals sum back to the overall total', () => {
    const summary = summarise(challenges, records);

    expect(summary.byCategory.selection).toEqual({ total: 2, solved: 1 });
    expect(summary.byCategory.events).toEqual({ total: 2, solved: 1 });

    const buckets = Object.values(summary.byCategory);
    expect(buckets.reduce((sum, bucket) => sum + bucket.total, 0)).toBe(summary.total);
    expect(buckets.reduce((sum, bucket) => sum + bucket.solved, 0)).toBe(summary.solved);
  });

  it('groups by difficulty so the per-difficulty totals sum back to the overall total', () => {
    const summary = summarise(challenges, records);

    expect(summary.byDifficulty.novice).toEqual({ total: 2, solved: 2 });
    expect(summary.byDifficulty.advanced).toEqual({ total: 2, solved: 0 });

    const buckets = Object.values(summary.byDifficulty);
    expect(buckets.reduce((sum, bucket) => sum + bucket.total, 0)).toBe(summary.total);
    expect(buckets.reduce((sum, bucket) => sum + bucket.solved, 0)).toBe(summary.solved);
  });

  it('gives every known category and difficulty a bucket, including the ones with no challenges', () => {
    const summary = summarise(challenges, records);

    // The dashboard renders a card per category by walking CATEGORY_META. A summary that only
    // created buckets it saw challenges for would hand it `undefined` for the other eleven.
    expect(Object.keys(summary.byCategory).toSorted()).toEqual(Object.keys(CATEGORY_META).toSorted());
    expect(summary.byCategory.storage).toEqual({ total: 0, solved: 0 });
    expect(summary.byDifficulty.intermediate).toEqual({ total: 0, solved: 0 });
    expect(summary.byDifficulty.expert).toEqual({ total: 0, solved: 0 });
  });

  it('reports zeroes rather than throwing when nothing has been attempted', () => {
    const summary = summarise(challenges, []);

    expect(summary).toMatchObject({ total: 4, solved: 0, revealed: 0 });
    expect(summary.byCategory.selection).toEqual({ total: 2, solved: 0 });
  });
});
