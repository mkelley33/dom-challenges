import { CATEGORY_META, DIFFICULTY_LABELS } from '@/challenges/registry';
import type { CategoryId, ChallengeMeta, Difficulty } from '@/types/challenge';
import type { ProgressRecord } from '@/types/progress';

export interface ProgressBucket {
  total: number;
  solved: number;
}

export interface ProgressSummary {
  total: number;
  solved: number;
  /**
   * How many challenges the learner has looked at a solution for, whether or not they went on to
   * solve them. Deliberately overlapping with `solved` rather than partitioning it: a completion
   * figure that hides the reveals is the one number on this dashboard a learner could fool
   * themselves with.
   */
  revealed: number;
  byCategory: Record<CategoryId, ProgressBucket>;
  byDifficulty: Record<Difficulty, ProgressBucket>;
}

/**
 * A zero bucket for every key of `source`.
 *
 * Driven by an existing total record -- `CATEGORY_META`, `DIFFICULTY_LABELS` -- rather than by a
 * separate list of ids, so the result is total by construction: whatever keys the union has, that
 * record already has, because its own type says so. A category with no challenges written yet
 * still gets a bucket, which is what lets the dashboard render a card per category without
 * reading `undefined`.
 */
function emptyBuckets<K extends string>(source: Record<K, unknown>): Record<K, ProgressBucket> {
  const buckets: Record<string, ProgressBucket> = {};
  for (const key of Object.keys(source)) buckets[key] = { total: 0, solved: 0 };
  return buckets;
}

/**
 * Folds progress records into the counts the dashboard renders.
 *
 * Iterates `challenges` and looks each one's record up, rather than iterating `records` -- which is
 * what makes a stale row harmless. Progress rows outlive the challenges they belong to: a renamed
 * id or a deleted challenge leaves a row on the server that nothing will ever clear, and a fold
 * over records would count it, reporting more solved challenges than exist.
 */
export function summarise(challenges: readonly ChallengeMeta[], records: ProgressRecord[]): ProgressSummary {
  const byChallengeId = new Map(records.map((record) => [record.challengeId, record]));

  const summary: ProgressSummary = {
    total: challenges.length,
    solved: 0,
    revealed: 0,
    byCategory: emptyBuckets(CATEGORY_META),
    byDifficulty: emptyBuckets(DIFFICULTY_LABELS),
  };

  for (const challenge of challenges) {
    const record = byChallengeId.get(challenge.id);
    // Solved is sticky: a later failing run leaves the status alone, so the stored status is the
    // whole question here and "did the most recent run pass" is not part of it.
    const solved = record?.status === 'solved';
    const category = summary.byCategory[challenge.category];
    const difficulty = summary.byDifficulty[challenge.difficulty];

    category.total += 1;
    difficulty.total += 1;

    if (solved) {
      summary.solved += 1;
      category.solved += 1;
      difficulty.solved += 1;
    }

    if (record?.revealedAt != null) summary.revealed += 1;
  }

  return summary;
}
