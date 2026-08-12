import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { routeDefinitions } from '@/routes';

/**
 * A file of its own because `vi.mock` is file-scoped and this one makes a challenge module
 * unloadable, which every other test of this page needs to work.
 *
 * A factory that throws is how a module is made unloadable here -- the same technique
 * `routes.errorElement.test.tsx` uses for a route chunk -- so the `import()` inside the entry's
 * `load` rejects exactly as it does when a chunk 404s after a redeploy. Nothing else is stubbed:
 * the real index, the real loader, the real `use` and the real boundary, because the defect this
 * covers lives in how those four compose and in none of them alone.
 */
vi.mock('@/challenges/selection/queryBasics', () => {
  throw new Error('unloadable');
});

// Not made to fail -- the editor must be able to load, or a passing assertion below would not say
// which of the two chunks the boundary caught.
vi.mock('@monaco-editor/react', async () => {
  const { createMonacoReactMock } = await import('@/test/monacoMock');
  return createMonacoReactMock();
});

vi.mock('@/lib/monaco', async () => {
  const { createMonacoLibMock } = await import('@/test/monacoMock');
  return createMonacoLibMock();
});

beforeEach(() => {
  // react-router logs every error it catches, and a caught error is what this test arranges.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('a challenge whose content will not load', () => {
  it('reaches the error boundary instead of sitting on the loading fallback', async () => {
    const router = createMemoryRouter(routeDefinitions, { initialEntries: ['/challenge/query-basics'] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    // `ChallengePage` reads the load with `use`, so a rejection has to *settle* into a throw the
    // boundary can catch. A loader that dropped the failed promise instead hands the retry render a
    // fresh pending one, suspends again, and never gets here -- the page spins on "Loading…" at
    // thousands of renders a second, which is worse than the failure it was trying to soften.
    expect(await screen.findByRole('heading', { level: 1, name: /could not be loaded/i })).toBeInTheDocument();
    // The way back has to survive it, which is the whole reason the boundary sits below the shell.
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });
});
