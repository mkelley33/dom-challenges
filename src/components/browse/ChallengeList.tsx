import { useMemo } from 'react';
import { Link, useParams } from 'react-router';

import { CATEGORY_META, challengesInCategory, isCategoryId } from '@/challenges/registry';
import { FilterBar } from '@/components/browse/FilterBar';
import { NotFound } from '@/components/NotFound';
import { useProgressQuery } from '@/hooks/useProgress';
import { cn } from '@/lib/utils';
import type { ChallengeFilters } from '@/store/editorStore';
import { useEditorStore } from '@/store/editorStore';
import type { Challenge } from '@/types/challenge';
import type { ProgressRecord } from '@/types/progress';

/**
 * Matches the search box against the title *and* the concepts. Concepts are what a learner
 * actually types -- `closest`, `MutationObserver` -- and no title contains them, so a title-only
 * search answers "no such challenge" to the most likely query there is.
 */
function matchesQuery(challenge: Challenge, needle: string): boolean {
  if (needle === '') return true;
  if (challenge.title.toLowerCase().includes(needle)) return true;
  return challenge.concepts.some((concept) => concept.toLowerCase().includes(needle));
}

function applyFilters(
  challenges: readonly Challenge[],
  filters: ChallengeFilters,
  records: ProgressRecord[],
): Challenge[] {
  const needle = filters.query.trim().toLowerCase();
  // Status, not mere presence of a row: a row exists as soon as a learner runs the tests once, and
  // hiding on that would hide exactly the challenges they are still in the middle of.
  const solvedIds = new Set(records.filter((record) => record.status === 'solved').map((record) => record.challengeId));

  return challenges.filter((challenge) => {
    if (filters.difficulty !== 'all' && challenge.difficulty !== filters.difficulty) return false;
    if (filters.hideSolved && solvedIds.has(challenge.id)) return false;
    return matchesQuery(challenge, needle);
  });
}

/**
 * The message for an empty listing, or `null` when there is something to list. Returning `null`
 * rather than an empty string keeps "say nothing" and "say this" one decision, made once, so the
 * live region's content and the list's presence cannot disagree.
 */
function emptyStateFor(challengeCount: number, visibleCount: number): string | null {
  if (visibleCount > 0) return null;
  if (challengeCount === 0) return 'No challenges in this category yet.';
  return 'No challenges match these filters. Clear the search or widen the difficulty to see more.';
}

export function ChallengeList() {
  const { categoryId } = useParams();
  const filters = useEditorStore((state) => state.filters);
  const { data } = useProgressQuery();

  /**
   * A route param arrives untyped as `string | undefined`. Checking it against the registry's own
   * categories at runtime -- rather than casting -- is what lets TypeScript narrow it, and it is
   * resolved before the early return below so every hook above runs on every render.
   */
  const category = categoryId !== undefined && isCategoryId(categoryId) ? categoryId : null;

  const challenges = useMemo(() => (category === null ? [] : challengesInCategory(category)), [category]);
  const visible = useMemo(() => applyFilters(challenges, filters, data ?? []), [challenges, filters, data]);

  if (category === null) {
    return <NotFound message="Unknown category." />;
  }

  const meta = CATEGORY_META[category];
  const emptyMessage = emptyStateFor(challenges.length, visible.length);

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold">{meta.title}</h1>
      <p className="mt-1 text-sm text-muted">{meta.blurb}</p>

      <FilterBar />

      {/* `<output>`, which carries role="status" and a polite live region natively -- and rendered
          unconditionally, empty, rather than only when there is something to say. A live region
          that enters the DOM in the same commit as its text is announced inconsistently: Safari
          with VoiceOver and JAWS have no region to observe at the moment of the mutation and
          routinely stay silent. Filtering everything out is a change the learner caused and cannot
          see, so best-effort is not good enough here. The margin is conditional because an empty
          region still occupies its own margin box. */}
      <output className={cn('block text-sm text-muted', emptyMessage !== null && 'mt-6')}>{emptyMessage}</output>

      {emptyMessage === null && (
        <ul className="mt-6 space-y-2">
          {visible.map((challenge) => (
            <li key={challenge.id}>
              <Link to={`/challenge/${challenge.slug}`} className="text-accent hover:underline">
                {challenge.title}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
