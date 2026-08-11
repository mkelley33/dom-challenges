import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Profiler } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { challengesInCategory } from '@/challenges/registry';
import { useEditorStore } from '@/store/editorStore';
import type { Challenge } from '@/types/challenge';
import type { ProgressRecord } from '@/types/progress';

import { ChallengeList } from './ChallengeList';

/**
 * The bar is never used on its own -- it exists to steer the list beside it -- so every test here
 * drives the real composition rather than a harness that could agree with a bar wired to nothing.
 */
const challenges: Challenge[] = challengesInCategory('selection');

function challengeAt(index: number): Challenge {
  const challenge = challenges[index];
  if (!challenge) throw new Error(`the selection category has no challenge at index ${index}`);
  return challenge;
}

function solvedRecord(challengeId: string): ProgressRecord {
  return {
    id: `row-${challengeId}`,
    challengeId,
    status: 'solved',
    attempts: 2,
    solvedAt: '2026-01-02T00:00:00.000Z',
    revealedAt: null,
    lastCode: null,
    updatedAt: '2026-01-02T00:00:00.000Z',
  };
}

function stubProgress(records: ProgressRecord[]): void {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify(records), { status: 200 }))),
  );
}

let commits = 0;
function countCommit(): void {
  commits += 1;
}

function renderCategory() {
  const router = createMemoryRouter(
    [
      {
        path: '/category/:categoryId',
        element: (
          <Profiler id="browse" onRender={countCommit}>
            <ChallengeList />
          </Profiler>
        ),
      },
    ],
    { initialEntries: ['/category/selection'] },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function storedFilters() {
  return useEditorStore.getState().filters;
}

/**
 * Counts writes that actually replace `filters`. `setFilters` spreads into a new object every
 * call, so one write per call is exactly what a subscriber sees -- which is the cost being
 * measured, since persist serialises on each one.
 */
function countFilterWrites() {
  let count = 0;
  const unsubscribe = useEditorStore.subscribe((state, previous) => {
    if (state.filters !== previous.filters) count += 1;
  });

  return {
    count: () => count,
    stop: unsubscribe,
  };
}

beforeEach(() => {
  commits = 0;
  stubProgress([]);
  useEditorStore.setState({ filters: { category: 'all', difficulty: 'all', query: '', hideSolved: false } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  useEditorStore.setState({ filters: { category: 'all', difficulty: 'all', query: '', hideSolved: false } });
});

describe('FilterBar', () => {
  it('gives every control a name a screen reader can announce', async () => {
    renderCategory();

    // By role and accessible name only: a control found by class or test id proves the element
    // exists, not that anyone navigating by keyboard or screen reader could identify it.
    expect(await screen.findByRole('textbox', { name: 'Search challenges' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Difficulty' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Hide solved' })).toBeInTheDocument();
  });

  it('writes what the learner types into the stored filters', async () => {
    const user = userEvent.setup();
    renderCategory();

    await user.type(await screen.findByRole('textbox', { name: 'Search challenges' }), 'closest');

    await waitFor(() => {
      expect(storedFilters().query).toBe('closest');
    });
  });

  it('writes the search box to the store once for a burst of typing, not once per character', async () => {
    const user = userEvent.setup();
    renderCategory();
    const field = await screen.findByRole('textbox', { name: 'Search challenges' });

    const writes = countFilterWrites();
    await user.type(field, 'closest');
    await waitFor(() => {
      expect(storedFilters().query).toBe('closest');
    });

    // Seven characters. Every `setFilters` makes zustand's persist middleware serialise the whole
    // payload synchronously -- and that payload carries `drafts`, which holds a full editor buffer
    // per challenge the learner has opened. Undebounced, a dozen challenges in, each keystroke
    // stringifies all of them.
    expect(writes.count()).toBeLessThanOrEqual(2);
    writes.stop();
  });

  it('flushes a pending search write when the bar unmounts mid-burst', async () => {
    const user = userEvent.setup();
    const { unmount } = renderCategory();

    await user.type(await screen.findByRole('textbox', { name: 'Search challenges' }), 'c');

    // The precondition that makes the rest of this mean anything: the write has not landed yet, so
    // whatever the store holds after `unmount()` came from the cleanup and nowhere else.
    expect(storedFilters().query).toBe('');

    unmount();

    // Dropping the pending timer instead of flushing it would make whether a learner's search
    // survives depend on how fast they clicked into a challenge after typing it.
    expect(storedFilters().query).toBe('c');
  });

  it('applies a discrete control immediately rather than waiting out the search debounce', async () => {
    const user = userEvent.setup();
    renderCategory();
    await screen.findByRole('switch', { name: 'Hide solved' });

    const writes = countFilterWrites();
    await user.click(screen.getByRole('switch', { name: 'Hide solved' }));

    // The debounce exists for the one control that fires per keystroke. A switch is a single
    // decision, and holding its effect back reads as a laggy control -- so this settles on the
    // first check rather than after a wait, which a debounced write cannot do.
    expect(storedFilters().hideSolved).toBe(true);
    expect(writes.count()).toBe(1);
    writes.stop();
  });

  it('does not spiral into a render loop when a single character is typed', async () => {
    const user = userEvent.setup();
    renderCategory();

    const field = await screen.findByRole('textbox', { name: 'Search challenges' });
    const before = commits;

    await user.type(field, 'a');
    await waitFor(() => {
      expect(storedFilters().query).toBe('a');
    });

    // The shape this guards against: `watch()` read during render and pushed to the store from an
    // effect. `watch()` returns a fresh object every render and the store hands back a fresh
    // `filters` object on every `setFilters`, so the two re-trigger each other until React gives
    // up with "Maximum update depth exceeded". A keystroke costs 2 commits as written; the bound
    // leaves room for React's batching to shift without leaving room for a regression to hide.
    expect(commits - before).toBeLessThanOrEqual(4);
  });

  it('takes a solved challenge out of the list when hide-solved is switched on', async () => {
    const user = userEvent.setup();
    const solved = challengeAt(0);
    stubProgress([solvedRecord(solved.id)]);

    renderCategory();
    expect(await screen.findByRole('link', { name: solved.title })).toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: 'Hide solved' }));

    // Waiting on the shorter list, not on the switch's own checked state: the switch flips whether
    // or not anything is wired to it, so `not.toBeInTheDocument()` after that wait would pass
    // against a bar that writes nowhere. A list that has actually lost an entry cannot.
    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(challenges.length - 1);
    });
    expect(screen.queryByRole('link', { name: solved.title })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: challengeAt(1).title })).toBeInTheDocument();
    expect(storedFilters().hideSolved).toBe(true);
  });

  it('writes the chosen difficulty into the stored filters and narrows the list to it', async () => {
    const user = userEvent.setup();
    renderCategory();

    await user.click(await screen.findByRole('combobox', { name: 'Difficulty' }));
    await user.click(await screen.findByRole('option', { name: 'Advanced' }));

    await waitFor(() => {
      expect(storedFilters().difficulty).toBe('advanced');
    });
    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(1);
    });
    expect(screen.getByRole('link', { name: challengeAt(2).title })).toBeInTheDocument();
  });

  it('starts from the filters the store was already holding', async () => {
    useEditorStore.setState({
      filters: { category: 'all', difficulty: 'all', query: challengeAt(1).title, hideSolved: false },
    });

    renderCategory();

    // A form seeded from constants instead of the store would show an empty box here, and the
    // filters a learner set before navigating away would be silently discarded on the way back.
    expect(await screen.findByRole('textbox', { name: 'Search challenges' })).toHaveValue(challengeAt(1).title);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });
});
