import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as RegistryModule from '@/challenges/registry';
import { allChallenges, CATEGORY_META } from '@/challenges/registry';
import type { Challenge } from '@/types/challenge';
import type { ProgressRecord } from '@/types/progress';

import { Dashboard } from './Dashboard';

/**
 * The real registry currently holds one category, which would leave every per-category count equal
 * to the overall count -- a dashboard that put the global figures on every card would pass. Two
 * challenges in a second category are appended so the two can disagree, and the registry's own
 * challenges and metadata are kept so the wiring under test is still the real one.
 *
 * Built inside the factory rather than referenced from the file body: `vi.mock` is hoisted above
 * every import, so a module-level fixture would still be in its temporal dead zone here.
 */
vi.mock('@/challenges/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof RegistryModule>();
  const extra: Challenge[] = ['events-delegation', 'events-custom'].map((id) => ({
    id,
    slug: id,
    title: id,
    category: 'events',
    difficulty: 'intermediate',
    prompt: '',
    html: '',
    starterCode: '',
    tests: [],
    solutions: [],
    concepts: [],
    relatedIds: [],
  }));

  return { ...actual, allChallenges: [...actual.allChallenges, ...extra] };
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
function challengeAt(index: number): Challenge {
  const challenge = allChallenges[index];
  if (!challenge) throw new Error(`the registry has no challenge at index ${index}`);
  return challenge;
}

function countIn(category: Challenge['category']): number {
  return allChallenges.filter((challenge) => challenge.category === category).length;
}

/** One solve in each of the two populated categories, so no single number can stand in for both. */
const SOLVED_IN_SELECTION = 0;
const SOLVED_IN_EVENTS = 3;

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

/** Both solves land in the fixture's two populated tiers, one each. */
function stubOneSolvePerPopulatedTier(): void {
  stubProgress([
    makeRecord(challengeAt(SOLVED_IN_SELECTION).id, { status: 'solved', solvedAt: SOLVED_AT }),
    makeRecord(challengeAt(SOLVED_IN_EVENTS).id, { status: 'solved', solvedAt: SOLVED_AT }),
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
    stubProgress([
      makeRecord(challengeAt(SOLVED_IN_SELECTION).id, { status: 'solved', solvedAt: SOLVED_AT }),
      makeRecord(challengeAt(SOLVED_IN_EVENTS).id, { status: 'solved', solvedAt: SOLVED_AT }),
    ]);

    renderDashboard();

    const bar = await overallBar();
    await waitFor(() => {
      expect(bar).toHaveAttribute('aria-valuenow', '2');
    });
    // A bar carrying a percentage with no maximum tells a screen reader "40%" and nothing about
    // how many challenges that is; the pair is what makes the figure readable.
    expect(bar).toHaveAttribute('aria-valuemax', String(allChallenges.length));
  });

  it('links to each category and counts the solves inside that category, not overall', async () => {
    stubProgress([
      makeRecord(challengeAt(SOLVED_IN_SELECTION).id, { status: 'solved', solvedAt: SOLVED_AT }),
      makeRecord(challengeAt(SOLVED_IN_EVENTS).id, { status: 'solved', solvedAt: SOLVED_AT }),
    ]);

    renderDashboard();

    const selection = await screen.findByRole('link', { name: new RegExp(CATEGORY_META.selection.title, 'i') });
    const events = screen.getByRole('link', { name: new RegExp(CATEGORY_META.events.title, 'i') });
    expect(selection).toHaveAttribute('href', '/category/selection');
    expect(events).toHaveAttribute('href', '/category/events');

    // Two solves out of five overall, but one out of three here and one out of two there. A card
    // handed the global summary would read "2 of 5 solved" on both.
    await waitFor(() => {
      expect(selection).toHaveTextContent(`1 of ${countIn('selection')} solved`);
    });
    expect(events).toHaveTextContent(`1 of ${countIn('events')} solved`);
    expect(selection).not.toHaveTextContent(`of ${allChallenges.length} solved`);
  });

  it('breaks the totals down by difficulty, ascending, not in alphabetical order', async () => {
    stubOneSolvePerPopulatedTier();

    renderDashboard();
    await screen.findByRole('region', { name: 'By difficulty' });

    // Read only once the records have landed. Every tier shows 0 solved on the first paint, so
    // rows snapshotted before this wait would agree with a dashboard that never reads them.
    await waitFor(() => {
      expect(difficultyRows()[0]).toContain('1 of 1 solved');
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

    // The fixture gives all four tiers different shapes on purpose: one fully cleared, one part
    // way, one untouched, one empty. A row rendering the overall figure would read "2 of 5" four
    // times over.
    expect(intermediate).toContain('1 of 3 solved');
    expect(advanced).toContain('0 of 1 solved');
    expect(expert).toContain('No challenges yet');
  });

  it('names each difficulty bar and gives it that tier’s own value and maximum', async () => {
    stubOneSolvePerPopulatedTier();

    renderDashboard();

    const intermediate = await screen.findByRole('progressbar', { name: 'Intermediate' });
    // Gated on the tier's own value: every bar reads 0 until the records land, so asserting the
    // maximum alone would pass against a dashboard that never reads them.
    await waitFor(() => {
      expect(intermediate).toHaveAttribute('aria-valuenow', '1');
    });
    expect(intermediate).toHaveAttribute('aria-valuemax', '3');

    const novice = screen.getByRole('progressbar', { name: 'Novice' });
    expect(novice).toHaveAttribute('aria-valuenow', '1');
    expect(novice).toHaveAttribute('aria-valuemax', '1');

    // An empty tier gets no bar at all rather than one whose maximum is zero, which announces as
    // complete the moment it appears.
    expect(screen.queryByRole('progressbar', { name: 'Expert' })).not.toBeInTheDocument();
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
