import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CATEGORY_META, challengeIndex, SHIPPING_CATEGORY_IDS } from '@/challenges/registry';
import type { ChallengeEntry } from '@/types/challenge';

import { routeDefinitions } from './routes';

/**
 * The URLs of a category the dashboard no longer advertises still have to work.
 *
 * Hiding a category is a browse-layer decision and nothing else (AGENTS.md §10): the six
 * reconnaissance challenges are still registered, still opened by `content.test.ts`, and still
 * reachable by anyone who bookmarked one. Unshipped is not withdrawn.
 *
 * **A file of its own, and not by preference.** A test file can mount the challenge *route* for
 * exactly one distinct challenge: a second one never comes out of suspense, and the page sits on the
 * shell's "Loading…" until the test times out. Measured, with two controls that separate the causes
 * -- re-mounting the *same* challenge resolves from `loadChallenge`'s cache in ~13 ms, and awaiting
 * the second challenge's `load()` directly resolves in ~3 ms, so the module import is not what
 * stalls. `routes.test.tsx` already spends its one mount on `query-basics`, so this had to go
 * somewhere else or one of the two would hang. See AGENTS.md §8.
 */
vi.mock('@monaco-editor/react', async () => {
  const { createMonacoReactMock } = await import('@/test/monacoMock');
  return createMonacoReactMock();
});

vi.mock('@/lib/monaco', async () => {
  const { createMonacoLibMock } = await import('@/test/monacoMock');
  return createMonacoLibMock();
});

// The challenge route reads progress. Without a stub the query reaches for the real json-server on
// port 4000 and prints a connection error into an otherwise clean run.
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

/**
 * A challenge in a category that does not ship.
 *
 * Derived rather than named, and it throws rather than skipping when every category ships: both
 * tests below assert that a page renders, so a fixture that quietly evaporated would leave two
 * assertions about nothing behind it.
 */
function unshippedEntry(): ChallengeEntry {
  const entry = challengeIndex.find((candidate) => !SHIPPING_CATEGORY_IDS.includes(candidate.category));
  if (!entry) throw new Error('every category ships, so there is no unshipped URL left to test');
  return entry;
}

describe('the URLs of a category that does not ship', () => {
  it('still opens the challenge itself', async () => {
    // `PromptPanel` renders the challenge's own title as the `h1`, so this fails as "we sent them to
    // the not-found page" rather than as "something rendered".
    const entry = unshippedEntry();
    renderAt(`/challenge/${entry.slug}`);

    expect(await screen.findByRole('heading', { level: 1, name: entry.title })).toBeInTheDocument();
  });

  it('still renders the category listing, with the challenge on it', async () => {
    // The same decision one level up. Nothing in the app links here any more -- that is the point of
    // the change -- and a URL that used to work continuing to work is what keeps "not advertised"
    // from meaning "deleted". The link is asserted as well as the heading: a listing that rendered
    // its own title and filtered its contents to nothing would satisfy the heading alone.
    const entry = unshippedEntry();
    renderAt(`/category/${entry.category}`);

    expect(
      await screen.findByRole('heading', { level: 1, name: CATEGORY_META[entry.category].title }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: entry.title })).toBeInTheDocument();
  });
});
