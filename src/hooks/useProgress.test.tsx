import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { API_BASE_URL } from '@/api/client';
import { fetchAllProgress } from '@/api/progress';
import type { ProgressRecord } from '@/types/progress';

import {
  emptyProgress,
  findChallengeProgress,
  isUnrecorded,
  PROGRESS_QUERY_KEY,
  useChallengeProgress,
  useClearProgress,
  useProgressQuery,
  useSaveProgress,
} from './useProgress';

const solved: ProgressRecord = {
  id: 'selection-query-basics',
  challengeId: 'selection-query-basics',
  status: 'solved',
  attempts: 1,
  solvedAt: '2026-08-09T10:00:00.000Z',
  revealedAt: null,
  lastCode: null,
  updatedAt: '2026-08-09T10:00:00.000Z',
};

/** A row for some other challenge, distinguishable from `solved` by every field a caller reads. */
function otherRecord(challengeId: string): ProgressRecord {
  return {
    id: `row-${challengeId}`,
    challengeId,
    status: 'attempted',
    attempts: 4,
    solvedAt: null,
    revealedAt: '2026-08-08T09:00:00.000Z',
    lastCode: '// someone else',
    updatedAt: '2026-08-08T09:00:00.000Z',
  };
}

/**
 * A learner three challenges in, opening a fourth. The wanted row is neither first nor last, and
 * every other row differs from it in `status`, `attempts`, `solvedAt` and `revealedAt` -- so a
 * lookup that returns a position rather than a match is wrong in a way an assertion can see.
 */
const manyRecords: ProgressRecord[] = [
  otherRecord('selection-closest-row'),
  otherRecord('selection-query-all'),
  solved,
  otherRecord('selection-tree-walker'),
];

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Builds a wrapper around a caller-supplied client so a test can inspect the cache directly. */
function wrapperFor(client: QueryClient) {
  return function ProvidedClientWrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

/** A fetch mock that rejects after `delayMs` instead of immediately.
 *
 * An instantly-rejecting mock can settle -- and trigger a mutation's rollback -- inside the
 * same poll window a test uses to observe the optimistic write, so the write is never seen.
 * Delaying the rejection past the poll interval used below gives the assertions a real window
 * to catch the optimistic state before it is undone.
 */
function rejectingFetch(delayMs: number): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>().mockImplementation(
    () =>
      new Promise<Response>((_resolve, reject) => {
        setTimeout(() => {
          reject(new Error('network down'));
        }, delayMs);
      }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useProgressQuery', () => {
  it('loads progress records via a GET to /progress', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([solved]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useProgressQuery(), { wrapper });
    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual([solved]);
    expect(result.current.data).toHaveLength(1);

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${API_BASE_URL}/progress`);
    expect(init?.method).toBeUndefined();
  });
});

describe('findChallengeProgress', () => {
  // The lookup both writers depend on: `useChallengeRun`'s whole-record write is built from what it
  // returns, and `solutionAccess` gates the solutions panel on it. Returning a neighbour's row
  // unlocks solutions the learner never earned and sends the next PATCH at the wrong challenge.
  it('returns the row matching the challenge, not whichever row happens to be first', () => {
    expect(findChallengeProgress(manyRecords, 'selection-query-basics')).toEqual(solved);
  });

  it('synthesises a placeholder when none of several rows is this challenge', () => {
    const found = findChallengeProgress(manyRecords, 'selection-sibling-traversal');

    expect(found.challengeId).toBe('selection-sibling-traversal');
    expect(isUnrecorded(found)).toBe(true);
  });

  it('synthesises a placeholder when the records have not arrived', () => {
    expect(isUnrecorded(findChallengeProgress(undefined, 'selection-query-basics'))).toBe(true);
  });
});

describe('useChallengeProgress', () => {
  it('synthesises an unattempted record when none exists', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })));
    const { result } = renderHook(() => useChallengeProgress('never-tried'), { wrapper });
    await waitFor(() => {
      expect(result.current.status).toBe('unattempted');
    });
    expect(result.current.id).toBe('never-tried');
    expect(result.current.challengeId).toBe('never-tried');
    expect(result.current.attempts).toBe(0);
    expect(result.current.solvedAt).toBeNull();
    expect(result.current.revealedAt).toBeNull();
  });

  it('returns the stored record when one exists, picked out of a list of several', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(manyRecords), { status: 200 })),
    );
    const { result } = renderHook(() => useChallengeProgress('selection-query-basics'), { wrapper });
    await waitFor(() => {
      expect(result.current.status).toBe('solved');
    });
    expect(result.current).toEqual(solved);
  });
});

describe('isUnrecorded', () => {
  it('recognises the synthesised placeholder', () => {
    expect(isUnrecorded(emptyProgress('never-tried'))).toBe(true);
  });

  it('does not call a row unrecorded for the sake of one empty field', () => {
    const blank = emptyProgress('never-tried');

    // Each of these is a real thing the learner did, on a row the server is holding. Any predicate
    // that reads only `status` and `attempts` calls the reveal case unrecorded -- and that case is
    // reachable: revealing before ever running writes a row with neither a status nor an attempt.
    expect(isUnrecorded({ ...blank, revealedAt: '2026-08-10T09:00:00.000Z' })).toBe(false);
    expect(isUnrecorded({ ...blank, solvedAt: '2026-08-10T09:00:00.000Z' })).toBe(false);
    expect(isUnrecorded({ ...blank, attempts: 1 })).toBe(false);
    expect(isUnrecorded({ ...blank, status: 'attempted' })).toBe(false);
    // Every field of the record, not the four a hand-written chain happened to list: nothing writes
    // `lastCode` without also bumping `attempts` today, and "today" is exactly how a blind spot
    // starts. A row holding the learner's last submission is a row with something in it.
    expect(isUnrecorded({ ...blank, lastCode: '// what I had when I gave up' })).toBe(false);
    expect(isUnrecorded(solved)).toBe(false);
  });

  it('ignores the two fields a stored row is free to differ on', () => {
    const blank = emptyProgress('never-tried');

    // `id`, because the placeholder's is the challenge id while a stored row carries whatever
    // json-server assigned -- comparing it would call every real row recorded. `updatedAt`, because
    // the placeholder stamps `now`, so comparing it would call every row *un*recorded exactly never.
    expect(isUnrecorded({ ...blank, id: 'server-assigned-id' })).toBe(true);
    expect(isUnrecorded({ ...blank, updatedAt: '2020-01-01T00:00:00.000Z' })).toBe(true);
  });
});

describe('useSaveProgress', () => {
  it('applies the update optimistically, then keeps it once the save succeeds', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(PROGRESS_QUERY_KEY, [solved]);

    const next: ProgressRecord = {
      id: 'closest-row',
      challengeId: 'closest-row',
      status: 'attempted',
      attempts: 1,
      solvedAt: null,
      revealedAt: null,
      lastCode: 'code',
      updatedAt: '2026-08-09T11:00:00.000Z',
    };

    const fetchMock = vi
      .fn<typeof fetch>()
      // saveProgress's own existence lookup (no row yet for this challenge)
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(next), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSaveProgress(), { wrapper: wrapperFor(client) });

    result.current.mutate(next);

    // Optimistic write lands in the cache before the network call settles.
    await waitFor(() => {
      expect(client.getQueryData<ProgressRecord[]>(PROGRESS_QUERY_KEY)).toContainEqual(next);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const cached = client.getQueryData<ProgressRecord[]>(PROGRESS_QUERY_KEY) ?? [];
    expect(cached).toHaveLength(2);
    expect(cached).toContainEqual(solved);
    expect(cached).toContainEqual(next);

    const [postUrl, postInit] = fetchMock.mock.calls[1] ?? [];
    expect(postUrl).toBe(`${API_BASE_URL}/progress`);
    expect(postInit?.method).toBe('POST');
  });

  it('refreshes the cache from the server after a create, with nothing observing the query', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

    const next: ProgressRecord = {
      id: 'closest-row',
      challengeId: 'closest-row',
      status: 'attempted',
      attempts: 1,
      solvedAt: null,
      revealedAt: null,
      lastCode: 'code',
      updatedAt: '2026-08-09T11:00:00.000Z',
    };
    // json-server discards the client's `id` on create and assigns its own, so the optimistic
    // record's `id` -- which `emptyProgress` sets to the challenge id -- is not a real row id. Only
    // a read-back replaces it, and `useClearProgress` DELETEs by exactly this value.
    const created: ProgressRecord = { ...next, id: 'id-the-server-chose' };

    let rows: ProgressRecord[] = [];
    const fetchMock = vi.fn<typeof fetch>((_input, init) => {
      if ((init?.method ?? 'GET') === 'POST') {
        rows = [created];
        return Promise.resolve(new Response(JSON.stringify(created), { status: 201 }));
      }
      // Answers saveProgress's existence lookup (still empty at that point, so the write takes the
      // create path) and the collection read alike.
      return Promise.resolve(new Response(JSON.stringify(rows), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    // Seeded the way the run flow seeds it -- imperatively, carrying the queryFn, with no component
    // subscribed. An invalidation left on its 'active' default refetches nothing in this state.
    //
    // The coupling runs the other way too, and this test does not cover that direction: a cache
    // seeded through `setQueryData` carries no queryFn, so its invalidation cannot refetch under
    // *any* `refetchType`. If some later path seeds this key that way -- a prefetch, a push, a test
    // helper -- the read-back below silently stops happening for it while this test keeps passing.
    await client.ensureQueryData({ queryKey: PROGRESS_QUERY_KEY, queryFn: fetchAllProgress });

    const { result } = renderHook(() => useSaveProgress(), { wrapper: wrapperFor(client) });
    result.current.mutate(next);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    await waitFor(() => {
      const cached = client.getQueryData<ProgressRecord[]>(PROGRESS_QUERY_KEY) ?? [];
      expect(cached).toHaveLength(1);
      expect(cached[0]?.id).toBe('id-the-server-chose');
    });
  });

  it('rolls back the optimistic update when the save fails', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const initial: ProgressRecord[] = [solved];
    client.setQueryData(PROGRESS_QUERY_KEY, initial);

    const next: ProgressRecord = {
      id: 'closest-row',
      challengeId: 'closest-row',
      status: 'attempted',
      attempts: 1,
      solvedAt: null,
      revealedAt: null,
      lastCode: 'code',
      updatedAt: '2026-08-09T11:00:00.000Z',
    };

    // Delay (200ms) kept well above the tightened poll interval below (5ms), so there are many
    // chances to observe the optimistic write before it is rolled back.
    const fetchMock = rejectingFetch(200);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useSaveProgress(), { wrapper: wrapperFor(client) });

    result.current.mutate(next);

    // The optimistic write is visible well before the delayed rejection settles...
    await waitFor(
      () => {
        expect(client.getQueryData<ProgressRecord[]>(PROGRESS_QUERY_KEY)).toContainEqual(next);
      },
      { interval: 5, timeout: 150 },
    );

    // ...but is rolled back to exactly the pre-mutation state once the save rejects.
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(client.getQueryData<ProgressRecord[]>(PROGRESS_QUERY_KEY)).toEqual(initial);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('useClearProgress', () => {
  it('optimistically removes the row and issues a DELETE for its id', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const other: ProgressRecord = { ...solved, id: 'closest-row', challengeId: 'closest-row' };
    client.setQueryData(PROGRESS_QUERY_KEY, [solved, other]);

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useClearProgress(), { wrapper: wrapperFor(client) });

    result.current.mutate(solved.id);

    await waitFor(() => {
      const cached = client.getQueryData<ProgressRecord[]>(PROGRESS_QUERY_KEY) ?? [];
      expect(cached).toHaveLength(1);
      expect(cached).toContainEqual(other);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${API_BASE_URL}/progress/${solved.id}`);
    expect(init?.method).toBe('DELETE');
  });

  it('rolls back the removal when the delete fails', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const other: ProgressRecord = { ...solved, id: 'closest-row', challengeId: 'closest-row' };
    const initial: ProgressRecord[] = [solved, other];
    client.setQueryData(PROGRESS_QUERY_KEY, initial);

    const fetchMock = rejectingFetch(200);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useClearProgress(), { wrapper: wrapperFor(client) });

    result.current.mutate(solved.id);

    // Removed well before the delayed rejection settles...
    await waitFor(
      () => {
        const cached = client.getQueryData<ProgressRecord[]>(PROGRESS_QUERY_KEY) ?? [];
        expect(cached).toHaveLength(1);
      },
      { interval: 5, timeout: 150 },
    );

    // ...restored once the delete fails.
    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(client.getQueryData<ProgressRecord[]>(PROGRESS_QUERY_KEY)).toEqual(initial);
  });
});
