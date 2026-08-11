import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as RegistryModule from '@/challenges/registry';

import { Dashboard } from './Dashboard';

/**
 * A file of its own because `vi.mock` is file-scoped and an empty registry contradicts every other
 * dashboard test. The state is unreachable through the real registry, which is exactly why it is
 * worth pinning: the tier renderer and the category cards both guard `total === 0`, and a guard
 * the overall bar lacked would only ever show up here.
 */
vi.mock('@/challenges/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof RegistryModule>();
  return { ...actual, allChallenges: [] };
});

function renderDashboard() {
  const router = createMemoryRouter([{ path: '/', element: <Dashboard /> }], { initialEntries: ['/'] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Dashboard with an empty registry', () => {
  it('shows no progress bar at all rather than one whose maximum is zero', async () => {
    renderDashboard();

    // No wait is needed and none would help: with no challenges the counts are zero whatever the
    // records say, so there is no later state for an assertion to race.
    expect(await screen.findByRole('heading', { level: 1, name: /your progress/i })).toBeInTheDocument();

    // `max={0}` yields `aria-valuemax="0"` on a bar whose `aria-valuetext` Base UI clamps to "0%"
    // -- a control that announces a measurement of nothing. The tiers and the category cards
    // already refuse that; the overall bar has to as well.
    expect(screen.queryAllByRole('progressbar')).toHaveLength(0);
    expect(screen.queryByText(/0 of 0/)).not.toBeInTheDocument();
  });
});
