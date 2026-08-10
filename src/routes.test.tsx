import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { routeDefinitions } from './routes';

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
