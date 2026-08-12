import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CATEGORY_META, SHIPPING_CATEGORY_IDS } from '@/challenges/registry';
import type * as RegistryModule from '@/challenges/registry';

import { Dashboard } from './Dashboard';

/**
 * A file of its own because `vi.mock` is file-scoped and an empty registry contradicts every other
 * dashboard test. The state is unreachable through the real registry, which is exactly why it is
 * worth pinning: the tier renderer and the category cards both guard `total === 0`, and a guard
 * the overall bar lacked would only ever show up here.
 *
 * Both lists are emptied. The dashboard reads `shippingEntries`; `challengeIndex` is emptied with
 * it so the fixture is a coherent registry rather than one whose two lists contradict each other.
 */
vi.mock('@/challenges/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof RegistryModule>();
  return { ...actual, challengeIndex: [], shippingEntries: [] };
});

function firstShippingCategory(): string {
  const [category] = SHIPPING_CATEGORY_IDS;
  if (category === undefined) throw new Error('no category ships, so there is no card to assert on');
  return CATEGORY_META[category].title;
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

  it('says a category with nothing written yet has no challenges rather than showing 0 of 0', async () => {
    // This lived in `Dashboard.test.tsx` against `react`, a declared category with no content, until
    // shipping became opt-in and `react` stopped being rendered at all. The guard it covers is not
    // dead -- a category flipped on before its first challenge is authored lands in exactly this
    // state, and the flag makes that a one-word edit -- so the coverage moves here, to the file
    // whose whole subject is states the real registry cannot reach.
    renderDashboard();

    const link = await screen.findByRole('link', { name: new RegExp(firstShippingCategory(), 'i') });
    expect(link).toHaveTextContent(/no challenges yet/i);
    expect(link).not.toHaveTextContent(/0 of 0/);
  });
});
