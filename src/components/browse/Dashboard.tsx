import { useId, useMemo } from 'react';
import { Link } from 'react-router';

import {
  CATEGORY_META,
  DIFFICULTIES,
  DIFFICULTY_LABELS,
  SHIPPING_CATEGORY_IDS,
  shippingEntries,
} from '@/challenges/registry';
import { Progress, ProgressLabel, ProgressValue } from '@/components/ui/progress';
import { useProgressQuery } from '@/hooks/useProgress';
import { summarise } from '@/lib/progressSummary';

export function Dashboard() {
  const difficultyHeadingId = useId();
  const { data } = useProgressQuery();
  // `data` is a fresh array on every refetch, so memoising on it is what keeps the fold from
  // re-running for renders the records did not change in.
  //
  // Measured against `shippingEntries`, not the whole index: every figure on this page is a
  // fraction of something a learner is being invited to finish, and counting challenges no card
  // links to is a bar that cannot fill. The challenges of an unshipped category are still
  // registered and still reachable by URL -- they are simply not part of what this page promises.
  const summary = useMemo(() => summarise(shippingEntries, data ?? []), [data]);

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold">Your progress</h1>

      {/* Guarded the same way the tiers and the category cards are: a bar over nothing is a
          measurement of nothing, and "0 of 0 solved" reads as a broken counter. Unreachable while
          the registry has challenges in it -- which is the point of guarding it rather than
          leaving the one renderer on this page that would produce a degenerate bar. */}
      {summary.total === 0 ? (
        <p className="mt-6 text-sm text-muted">No challenges yet</p>
      ) : (
        <>
          <Progress value={summary.solved} max={summary.total} className="mt-6 max-w-md">
            {/* Both halves of the bar's accessible identity: `ProgressLabel` becomes its
                `aria-labelledby`, and value/max become `aria-valuenow`/`aria-valuemax`. A bar with
                a percentage and no name announces a number nobody can attribute to anything. */}
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
        </>
      )}

      {/* Ordered by `DIFFICULTIES`, which is ordered by `DIFFICULTY_LABELS`' own declaration --
          novice first. The tiers are a ladder, and a learner reading this wants to know which
          rung they are on, so alphabetical or object-key order would be actively misleading. */}
      <section aria-labelledby={difficultyHeadingId} className="mt-8">
        <h2 id={difficultyHeadingId} className="text-sm font-medium">
          By difficulty
        </h2>
        <ul className="mt-3 grid max-w-md gap-3">
          {DIFFICULTIES.map((level) => {
            const bucket = summary.byDifficulty[level];
            const label = DIFFICULTY_LABELS[level];

            return (
              <li key={level}>
                {bucket.total === 0 ? (
                  <>
                    <span className="text-sm">{label}</span>
                    {/* No bar for an empty tier. `max={0}` gives `aria-valuemax="0"` and an
                        `aria-valuetext` Base UI clamps from the resulting NaN to "0%", over an
                        indicator rendered 0% wide -- a control that announces a measurement of
                        nothing. (It also computes `status: 'complete'`, but that surfaces only as
                        `data-complete`, which nothing here styles or reads.) "0 of 0 solved" reads
                        as a broken counter, the same reason the category cards below say this. */}
                    <p className="text-sm text-muted">No challenges yet</p>
                  </>
                ) : (
                  <>
                    <Progress value={bucket.solved} max={bucket.total}>
                      <ProgressLabel>{label}</ProgressLabel>
                      <ProgressValue />
                    </Progress>
                    <p className="mt-1 text-sm text-muted">
                      {bucket.solved} of {bucket.total} solved
                    </p>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* The categories that ship, in declaration order -- not every category the union names.
            Six of the others hold a single reconnaissance challenge each, and a card advertising
            one of those is an invitation to a category nobody can finish. See AGENTS.md §10. */}
        {SHIPPING_CATEGORY_IDS.map((categoryId) => {
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
                  {/* Unreachable through the real registry today -- every shipping category has
                      content (registry.test.ts). It guards a category flipped on (`shipping: true`)
                      before its first challenge is authored, so "0 of 0 solved" never reads as a
                      broken counter instead of an empty shelf. Covered by
                      Dashboard.emptyRegistry.test.tsx, the file for states the real registry cannot
                      reach. See AGENTS.md §10. */}
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
