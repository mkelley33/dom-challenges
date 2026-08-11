import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as RegistryModule from '@/challenges/registry';

import { Dashboard } from './Dashboard';

/**
 * A file of its own because `vi.mock` is file-scoped and this one has to contradict
 * `Dashboard.test.tsx`: there, the tiers are asserted to read novice-first, which is what the real
 * `DIFFICULTIES` gives.
 *
 * `DIFFICULTIES` is scrambled here while `DIFFICULTY_LABELS` is left alone, which is what separates
 * the two. `summarise` seeds `byDifficulty` from `DIFFICULTY_LABELS`, so `Object.keys` of the
 * summary still yields declaration order (novice, intermediate, advanced, expert) -- and a
 * breakdown walking the summary's own keys renders that, while one walking `DIFFICULTIES` renders
 * the scramble. Without this the two sequences are identical and no assertion can tell them apart.
 */
const SCRAMBLED = ['expert', 'advanced', 'novice', 'intermediate'] as const;

vi.mock('@/challenges/registry', async (importOriginal) => {
  const actual = await importOriginal<typeof RegistryModule>();
  return { ...actual, DIFFICULTIES: ['expert', 'advanced', 'novice', 'intermediate'] };
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

describe('Dashboard difficulty order', () => {
  it('walks DIFFICULTIES, not the order the summary happens to have built its buckets in', async () => {
    renderDashboard();

    const region = await screen.findByRole('region', { name: 'By difficulty' });
    const rows = within(region)
      .getAllByRole('listitem')
      .map((item) => item.textContent ?? '');

    // Labels come from the untouched `DIFFICULTY_LABELS`, so each row is still named normally --
    // only the sequence moves. Capitalised to match the rendered labels.
    expect(rows).toEqual(
      SCRAMBLED.map((level) => expect.stringContaining(`${level[0]?.toUpperCase() ?? ''}${level.slice(1)}`)),
    );
  });
});
