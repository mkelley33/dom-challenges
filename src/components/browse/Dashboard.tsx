import { useMemo } from 'react';
import { Link } from 'react-router';

import { allChallenges, CATEGORY_IDS, CATEGORY_META } from '@/challenges/registry';
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress';
import { useProgressQuery } from '@/hooks/useProgress';
import { summarise } from '@/lib/progressSummary';

export function Dashboard() {
  const { data } = useProgressQuery();
  // `data` is a fresh array on every refetch, so memoising on it is what keeps the fold from
  // re-running for renders the records did not change in.
  const summary = useMemo(() => summarise(allChallenges, data ?? []), [data]);

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold">Your progress</h1>

      <Progress value={summary.solved} max={summary.total} className="mt-6 max-w-md">
        {/* Both halves of the bar's accessible identity: `ProgressLabel` becomes its
            `aria-labelledby`, and value/max become `aria-valuenow`/`aria-valuemax`. A bar with a
            percentage and no name announces a number nobody can attribute to anything. */}
        <ProgressLabel>Overall progress</ProgressLabel>
        <ProgressValue />
      </Progress>

      <p className="mt-2 text-sm text-muted">
        {summary.solved} of {summary.total} solved
      </p>
      {summary.revealed > 0 && (
        <p className="mt-1 text-sm text-muted">
          {summary.revealed} {summary.revealed === 1 ? 'solution' : 'solutions'} revealed
        </p>
      )}

      <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORY_IDS.map((categoryId) => {
          const meta = CATEGORY_META[categoryId];
          const bucket = summary.byCategory[categoryId];

          return (
            <li key={categoryId}>
              <Link
                to={`/category/${categoryId}`}
                className="block rounded-lg border bg-surface-raised p-4 hover:border-accent"
              >
                <span className="font-medium">{meta.title}</span>
                <p className="mt-1 text-sm text-muted">{meta.blurb}</p>
                <p className="mt-2 text-sm text-muted">
                  {/* Most categories have no challenges written yet, and "0 of 0 solved" reads as
                      a broken counter rather than as an empty shelf. */}
                  {bucket.total === 0 ? 'No challenges yet' : `${bucket.solved} of ${bucket.total} solved`}
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
