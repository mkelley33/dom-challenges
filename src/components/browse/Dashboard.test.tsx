import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as RegistryModule from '@/challenges/registry';
import { CATEGORY_META, challengeIndex, DIFFICULTIES, DIFFICULTY_LABELS } from '@/challenges/registry';
import type { ChallengeEntry, Difficulty } from '@/types/challenge';
import type { ProgressRecord } from '@/types/progress';

import { Dashboard } from './Dashboard';

/**
 * The real registry currently holds one category, which would leave every per-category count equal
 * to the overall count -- a dashboard that put the global figures on every card would pass. Two
 * challenges in a second category are appended so the two can disagree, and the registry's own
 * entries and metadata are kept so the wiring under test is still the real one.
 *
 * Built inside the factory rather than referenced from the file body: `vi.mock` is hoisted above
 * every import, so a module-level fixture would still be in its temporal dead zone here.
 */
vi.mock('@/challenges/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof RegistryModule>();
  const extra: ChallengeEntry[] = ['events-delegation', 'events-custom'].map((id) => ({
    id,
    slug: id,
    title: id,
    category: 'events',
    difficulty: 'intermediate',
    concepts: [],
    relatedIds: [],
    // The dashboard renders counts and titles and must never open a challenge. Throwing here rather
    // than resolving something empty means a `Dashboard` that started loading content fails this
    // file loudly instead of quietly costing every visitor the whole library.
    load: () => {
      throw new Error('the dashboard loaded a challenge module');
    },
  }));

  return { ...actual, challengeIndex: [...actual.challengeIndex, ...extra] };
});

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

/** The registry is the dashboard's own input, so the fixtures point at whatever is really in it. */
function challengeAt(index: number): ChallengeEntry {
  const challenge = challengeIndex[index];
  if (!challenge) throw new Error(`the registry has no challenge at index ${index}`);
  return challenge;
}

function countIn(category: ChallengeEntry['category']): number {
  return challengeIndex.filter((challenge) => challenge.category === category).length;
}

function firstIn(category: ChallengeEntry['category']): ChallengeEntry {
  const challenge = challengeIndex.find((entry) => entry.category === category);
  if (!challenge) throw new Error(`the registry has no ${category} challenge`);
  return challenge;
}

/**
 * One solve in each of the two populated categories, so no single number can stand in for both.
 *
 * Chosen by category rather than by position: an index that meant "the first events challenge" on
 * the day it was written comes to mean something else the moment the registry grows, and the
 * fixture would go on solving *a* challenge while the test's reason for solving that one is gone.
 */
const SOLVED_IN_SELECTION = firstIn('selection');
const SOLVED_IN_EVENTS = firstIn('events');
const SOLVED_IDS = new Set([SOLVED_IN_SELECTION.id, SOLVED_IN_EVENTS.id]);

/**
 * A tier one of the fixtures really solves in, so the bar it gates on has a value that must move
 * off zero.
 *
 * Derived from the fixture rather than named, for the reason the fixtures themselves are chosen by
 * category: which tier the first challenge in a category sits in changes as content is authored --
 * this was `'intermediate'` until the Events category gained a real, expert challenge and the
 * fixture stopped landing there. A hardcoded tier does not fail when that happens; it silently
 * turns the wait below into a no-op, which is exactly the failure the assertion under it exists to
 * prevent. It fails loudly here only because that assertion was written to catch it.
 */
const GATED_TIER: Difficulty = SOLVED_IN_EVENTS.difficulty;

function totalInTier(level: Difficulty): number {
  return challengeIndex.filter((challenge) => challenge.difficulty === level).length;
}

function solvedInTier(level: Difficulty): number {
  return challengeIndex.filter((challenge) => challenge.difficulty === level && SOLVED_IDS.has(challenge.id)).length;
}

/**
 * What a tier's row reads once the fixture's records have landed -- derived, because every one of
 * these figures moves whenever a challenge is written. Hard-coding them makes writing content
 * break a dashboard test, which then gets "fixed" by pasting in the new numbers, and the assertion
 * stops describing anything.
 */
function tierText(level: Difficulty): string {
  const total = totalInTier(level);
  return total === 0 ? 'No challenges yet' : `${solvedInTier(level)} of ${total} solved`;
}

const SOLVED_AT = '2026-01-02T00:00:00.000Z';
const REVEALED_AT = '2026-01-03T00:00:00.000Z';

function stubProgress(records: ProgressRecord[]): void {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify(records), { status: 200 }))),
  );
}

function renderDashboard() {
  const router = createMemoryRouter([{ path: '/', element: <Dashboard /> }], { initialEntries: ['/'] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function overallBar(): Promise<HTMLElement> {
  return screen.findByRole('progressbar', { name: 'Overall progress' });
}

/** Scoped to the difficulty region: the category cards are a list of their own. */
function difficultyRows(): string[] {
  const region = screen.getByRole('region', { name: 'By difficulty' });
  return within(region)
    .getAllByRole('listitem')
    .map((item) => item.textContent ?? '');
}

/** Both solves land in a different tier from each other, one each. */
function stubOneSolvePerPopulatedTier(): void {
  stubProgress([
    makeRecord(SOLVED_IN_SELECTION.id, { status: 'solved', solvedAt: SOLVED_AT }),
    makeRecord(SOLVED_IN_EVENTS.id, { status: 'solved', solvedAt: SOLVED_AT }),
  ]);
}

beforeEach(() => {
  stubProgress([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Dashboard', () => {
  it('names the overall progress bar and gives it the solved count as its value', async () => {
    stubOneSolvePerPopulatedTier();

    renderDashboard();

    const bar = await overallBar();
    await waitFor(() => {
      expect(bar).toHaveAttribute('aria-valuenow', String(SOLVED_IDS.size));
    });
    // A bar carrying a percentage with no maximum tells a screen reader "40%" and nothing about
    // how many challenges that is; the pair is what makes the figure readable.
    expect(bar).toHaveAttribute('aria-valuemax', String(challengeIndex.length));
  });

  it('links to each category and counts the solves inside that category, not overall', async () => {
    stubOneSolvePerPopulatedTier();

    renderDashboard();

    const selection = await screen.findByRole('link', { name: new RegExp(CATEGORY_META.selection.title, 'i') });
    const events = screen.getByRole('link', { name: new RegExp(CATEGORY_META.events.title, 'i') });
    expect(selection).toHaveAttribute('href', '/category/selection');
    expect(events).toHaveAttribute('href', '/category/events');

    // Two solves overall, one inside each of these two categories. A card handed the global
    // summary would read the same "2 of <everything> solved" on both.
    await waitFor(() => {
      expect(selection).toHaveTextContent(`1 of ${countIn('selection')} solved`);
    });
    expect(events).toHaveTextContent(`1 of ${countIn('events')} solved`);
    expect(selection).not.toHaveTextContent(`of ${challengeIndex.length} solved`);
  });

  it('breaks the totals down by difficulty, ascending, not in alphabetical order', async () => {
    stubOneSolvePerPopulatedTier();

    renderDashboard();
    await screen.findByRole('region', { name: 'By difficulty' });

    // Read only once the records have landed. Every tier shows 0 solved on the first paint, so
    // rows snapshotted before this wait would agree with a dashboard that never reads them --
    // which only holds because the first tier is one of the two the fixture solves in. Pinned,
    // because a fixture that stopped solving there would turn the wait below into a no-op.
    expect(solvedInTier('novice'), 'the first tier must hold one of the solved fixtures').toBe(1);
    await waitFor(() => {
      expect(difficultyRows()[0]).toContain(tierText('novice'));
    });
    const [novice, intermediate, advanced, expert] = difficultyRows();

    // The expected order is written out here rather than derived from `DIFFICULTIES`, so this
    // pins the tiers a learner should read -- easiest first -- independently of the constant. A
    // breakdown walking `Object.keys(...).sort()` gives Advanced, Expert, Intermediate, Novice.
    expect([novice, intermediate, advanced, expert]).toEqual([
      expect.stringContaining('Novice'),
      expect.stringContaining('Intermediate'),
      expect.stringContaining('Advanced'),
      expect.stringContaining('Expert'),
    ]);

    // Each row carries its own tier's figures, derived from the registry the way the summary
    // derives them -- one tier part way through, the others untouched. What makes that an
    // assertion rather than a restatement is the check below: a row rendering the overall figure
    // would read the same string in all four.
    expect(novice).toContain(tierText('novice'));
    expect(intermediate).toContain(tierText('intermediate'));
    expect(advanced).toContain(tierText('advanced'));
    expect(expert).toContain(tierText('expert'));

    const overall = `${SOLVED_IDS.size} of ${challengeIndex.length} solved`;
    for (const row of [novice, intermediate, advanced, expert]) {
      expect(row, `a tier row is showing the overall figure: ${overall}`).not.toContain(overall);
    }
  });

  it('names each difficulty bar and gives it that tier’s own value and maximum', async () => {
    stubOneSolvePerPopulatedTier();

    renderDashboard();

    const gated = await screen.findByRole('progressbar', { name: DIFFICULTY_LABELS[GATED_TIER] });
    // Gated on the tier's own value: every bar reads 0 until the records land, so asserting the
    // maximum alone would pass against a dashboard that never reads them. That gate needs this
    // tier to hold a solve, which is why the count is pinned before the wait rather than after.
    expect(solvedInTier(GATED_TIER), 'the gated tier must hold one of the solved fixtures').toBeGreaterThan(0);
    await waitFor(() => {
      expect(gated).toHaveAttribute('aria-valuenow', String(solvedInTier(GATED_TIER)));
    });

    // Every tier at once, as one table compared against one derived from the registry: each bar
    // carries its own value and its own maximum, and a tier with nothing in it gets no bar at all
    // rather than one whose maximum is zero, which announces as complete the moment it appears.
    // Compared wholesale rather than asserted per tier inside the loop, so the absent-bar case is
    // a value in the table instead of a branch around an assertion.
    //
    // While the registry populates all four tiers the `null` row is unreachable here, and
    // `Dashboard.emptyRegistry.test.tsx` is what holds that line; this covers it again the moment
    // a tier does empty.
    const rendered = DIFFICULTIES.map((level) => {
      const bar = screen.queryByRole('progressbar', { name: DIFFICULTY_LABELS[level] });
      return {
        level,
        now: bar?.getAttribute('aria-valuenow') ?? null,
        max: bar?.getAttribute('aria-valuemax') ?? null,
      };
    });

    expect(rendered).toEqual(
      DIFFICULTIES.map((level) => {
        const total = totalInTier(level);
        return {
          level,
          now: total === 0 ? null : String(solvedInTier(level)),
          max: total === 0 ? null : String(total),
        };
      }),
    );
  });

  it('says a category with nothing written yet has no challenges rather than showing 0 of 0', async () => {
    renderDashboard();

    const link = await screen.findByRole('link', { name: new RegExp(CATEGORY_META.react.title, 'i') });
    expect(link).toHaveTextContent(/no challenges yet/i);
    expect(link).not.toHaveTextContent(/0 of 0/);
  });

  it('surfaces the revealed count so the completion figure is not read as all earned', async () => {
    stubProgress([
      makeRecord(challengeAt(0).id, { status: 'solved', solvedAt: SOLVED_AT, revealedAt: REVEALED_AT }),
      makeRecord(challengeAt(1).id, { revealedAt: REVEALED_AT }),
    ]);

    renderDashboard();

    // Both reveals are counted, including the one on a challenge that was also solved -- that is
    // precisely the one a learner would rather not be reminded of.
    expect(await screen.findByText(/2 solutions revealed/i)).toBeInTheDocument();
  });

  it('leaves the revealed line off entirely when no solution has been revealed', async () => {
    stubProgress([makeRecord(challengeAt(0).id, { status: 'solved', solvedAt: SOLVED_AT })]);

    renderDashboard();

    // Gated on the solve landing, not on the render: the query starts with no data, so every count
    // is zero on the first paint and a bare `queryByText` would pass against a dashboard that never
    // reads the records at all. `aria-valuenow="1"` can only appear once they have been read.
    const bar = await overallBar();
    await waitFor(() => {
      expect(bar).toHaveAttribute('aria-valuenow', '1');
    });
    expect(screen.queryByText(/revealed/i)).not.toBeInTheDocument();
  });
});
