import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProgressRecord } from '@/types/progress';

import { API_BASE_URL } from './client';
import { deleteProgress, fetchAllProgress, saveProgress } from './progress';

const record: ProgressRecord = {
  id: 'p1',
  challengeId: 'selection-query-basics',
  status: 'solved',
  attempts: 2,
  solvedAt: '2026-08-09T10:00:00.000Z',
  revealedAt: null,
  lastCode: 'x',
  updatedAt: '2026-08-09T10:00:00.000Z',
};

/** Parses a fetch RequestInit body, failing loudly instead of casting when it isn't a string. */
function parseJsonBody(body: BodyInit | null | undefined): unknown {
  if (typeof body !== 'string') throw new Error('expected a JSON string request body');
  return JSON.parse(body);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchAllProgress', () => {
  it('returns the parsed list', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify([record]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchAllProgress()).resolves.toEqual([record]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${API_BASE_URL}/progress`);
    expect(init?.method).toBeUndefined();
  });

  it('throws with the status when the request fails', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('nope', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchAllProgress()).rejects.toThrow('500');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('saveProgress', () => {
  it('patches the existing row at its own id when a record for the challenge already exists', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify([record]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(record), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await saveProgress(record);

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [lookupUrl] = fetchMock.mock.calls[0] ?? [];
    expect(lookupUrl).toBe(`${API_BASE_URL}/progress?challengeId=selection-query-basics`);

    const [patchUrl, patchInit] = fetchMock.mock.calls[1] ?? [];
    expect(patchUrl).toBe(`${API_BASE_URL}/progress/p1`);
    expect(patchInit?.method).toBe('PATCH');
    expect(parseJsonBody(patchInit?.body)).toEqual({ ...record, id: 'p1' });
  });

  it('rewrites the lookup id onto the payload when the existing row was stored under a different id', async () => {
    const existingUnderOtherId: ProgressRecord = { ...record, id: 'legacy-row-id' };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify([existingUnderOtherId]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(existingUnderOtherId), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await saveProgress(record);

    const [patchUrl, patchInit] = fetchMock.mock.calls[1] ?? [];
    expect(patchUrl).toBe(`${API_BASE_URL}/progress/legacy-row-id`);
    expect(patchInit?.method).toBe('PATCH');
    expect(parseJsonBody(patchInit?.body)).toEqual({ ...record, id: 'legacy-row-id' });
  });

  it('posts a new row when no record exists yet for the challenge', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(record), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await saveProgress(record);

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [lookupUrl] = fetchMock.mock.calls[0] ?? [];
    expect(lookupUrl).toBe(`${API_BASE_URL}/progress?challengeId=selection-query-basics`);

    const [postUrl, postInit] = fetchMock.mock.calls[1] ?? [];
    expect(postUrl).toBe(`${API_BASE_URL}/progress`);
    expect(postInit?.method).toBe('POST');
    expect(parseJsonBody(postInit?.body)).toEqual(record);
  });
});

describe('deleteProgress', () => {
  it('issues a DELETE to the record id', async () => {
    // json-server responds to DELETE with an empty JSON object body, not an empty body.
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await deleteProgress('p1');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe(`${API_BASE_URL}/progress/p1`);
    expect(init?.method).toBe('DELETE');
  });
});
