import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { routeDefinitions } from './routes';

// The challenge route mounts the editor, so these keep ~3 MB of Monaco -- and `monaco.ts`'s
// `?worker` imports, which resolve only under Vite's client build -- out of a routing test.
vi.mock('@monaco-editor/react', async () => {
  const { createMonacoReactMock } = await import('@/test/monacoMock');
  return createMonacoReactMock();
});

vi.mock('@/lib/monaco', async () => {
  const { createMonacoLibMock } = await import('@/test/monacoMock');
  return createMonacoLibMock();
});

// The challenge route also reads progress. Without a stub the query reaches for the real
// json-server on port 4000 and prints a connection error into an otherwise clean run.
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderAt(path: string) {
  const router = createMemoryRouter(routeDefinitions, { initialEntries: [path] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('routing', () => {
  it('renders the dashboard at the root', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { name: /your progress/i })).toBeInTheDocument();
  });

  it('renders a category listing', async () => {
    renderAt('/category/selection');
    expect(await screen.findByRole('heading', { name: /selection & traversal/i })).toBeInTheDocument();
  });

  it('renders a challenge page by slug', async () => {
    renderAt('/challenge/query-basics');
    expect(await screen.findByRole('heading', { name: /find one element and mark it/i })).toBeInTheDocument();
  });

  it('renders a not-found page for an unknown slug', async () => {
    renderAt('/challenge/does-not-exist');
    expect(await screen.findByText(/couldn't find that challenge/i)).toBeInTheDocument();
  });
});
