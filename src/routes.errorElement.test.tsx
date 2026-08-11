import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { routeDefinitions } from './routes';

const RENDER_FAILURE = 'A component gave up mid-render';

// Both mocks reproduce the same production event -- a chunk that will not download -- at the two
// depths the app splits at. `@monaco-editor/react` is loaded from inside `EditorPanel`, several
// components below the route element; `ChallengeList` *is* a route element. One boundary has to
// cover both, and a boundary placed on the wrong route covers neither without taking the shell
// down with it.
//
// A factory that throws is how a module is made unloadable here, so the `import()` inside `lazy`
// rejects exactly as it does when a chunk 404s after a redeploy. Vitest replaces the thrown error
// with one of its own, so these two are not the place to assert on wording -- the `*` route below,
// whose component throws on render, is.
vi.mock('@monaco-editor/react', () => {
  throw new Error('unloadable');
});

vi.mock('./components/browse/ChallengeList', () => {
  throw new Error('unloadable');
});

vi.mock('./components/NotFound', () => ({
  NotFound: () => {
    throw new Error(RENDER_FAILURE);
  },
}));

// `EditorPanel` loads this one alongside Monaco; without the stand-in its `?worker` imports, which
// resolve only under Vite's client build, would fail first and for an unrelated reason.
vi.mock('@/lib/monaco', async () => {
  const { createMonacoLibMock } = await import('@/test/monacoMock');
  return createMonacoLibMock();
});

/**
 * react-router logs every error it catches through `console.error`, and a caught error is what each
 * test here is arranging. Silenced so a passing run stays readable -- and restored afterwards, so a
 * later unexpected error is still loud.
 */
beforeEach(() => {
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

function renderAt(path: string) {
  const router = createMemoryRouter(routeDefinitions, { initialEntries: [path] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

/** The one thing that must survive any failure: the way back to a page that works. */
function shellNav(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Main' });
}

describe('the route error boundary', () => {
  it('keeps the shell and its navigation when a route-level chunk will not load', async () => {
    renderAt('/category/selection');

    // Without an `errorElement` inside the shell, react-router's own default boundary renders at
    // the root instead and takes the header, the nav and the way home with it.
    expect(await screen.findByRole('heading', { level: 1, name: /could not be loaded/i })).toBeInTheDocument();
    expect(shellNav()).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('keeps the shell when a chunk loaded from deep inside the page will not load', async () => {
    renderAt('/challenge/query-basics');

    expect(await screen.findByRole('heading', { level: 1, name: /could not be loaded/i })).toBeInTheDocument();
    expect(shellNav()).toBeInTheDocument();
  });

  it('offers a retry that actually reloads, since a rejected lazy import stays rejected', async () => {
    // Spied on the real `Location` rather than replaced with a lookalike: happy-dom's `reload`
    // navigates, and a stand-in built by spreading the instance would drop the prototype every
    // other member of it lives on.
    const reload = vi.spyOn(window.location, 'reload').mockImplementation(() => undefined);

    renderAt('/category/selection');

    await userEvent.click(await screen.findByRole('button', { name: /reload/i }));

    // A button that only looked like a retry would pass every assertion above it. React caches a
    // rejected `lazy` payload for the life of the module registry, so re-rendering cannot recover:
    // a fresh document is the only thing that re-issues the import.
    expect(reload).toHaveBeenCalledOnce();
  });

  it('names what failed, so the message is not the same sentence for every fault', async () => {
    renderAt('/nothing-here');

    // Carried through from the error itself, not hardcoded copy: a boundary that only ever printed
    // its own sentence would leave a learner -- and whoever they report it to -- with nothing to go
    // on beyond "something broke".
    expect(await screen.findByText(new RegExp(RENDER_FAILURE, 'i'))).toBeInTheDocument();
    expect(shellNav()).toBeInTheDocument();
  });

  it('leaves a route that renders perfectly well alone', async () => {
    renderAt('/');

    // The boundary wraps every child route, so a boundary that rendered unconditionally -- or one
    // latched by an earlier failure -- would replace the dashboard too.
    expect(await screen.findByRole('heading', { name: /your progress/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1, name: /could not be loaded/i })).not.toBeInTheDocument();
  });
});
