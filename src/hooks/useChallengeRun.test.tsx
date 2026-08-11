import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode, RefObject } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type * as Harness from '@/runner/harness';
import { HostDisposedError } from '@/runner/iframeHost';
import type { Challenge } from '@/types/challenge';
import type { ProgressRecord } from '@/types/progress';

import { useChallengeRun } from './useChallengeRun';
import { PROGRESS_QUERY_KEY } from './useProgress';

type RunChallengeFn = typeof Harness.runChallenge;

/**
 * Set by the two tests that need `runChallenge` to reject on demand; null everywhere else.
 *
 * The mock delegates to the real harness unless a test opts out, so every other assertion in this
 * file still runs real transpilation, real evaluation and a real iframe host -- a blanket mock
 * would leave the run flow asserting only against itself. What the override buys is the one thing
 * a real host cannot be made to do on cue: reject a run, with an error of the test's choosing,
 * while that run is still the current one.
 */
let runChallengeOverride: RunChallengeFn | null = null;

vi.mock('@/runner/harness', async (importOriginal) => {
  const actual = await importOriginal<typeof Harness>();
  return {
    ...actual,
    runChallenge: (...args: Parameters<RunChallengeFn>) =>
      runChallengeOverride ? runChallengeOverride(...args) : actual.runChallenge(...args),
  };
});

const PASSING = 'document.getElementById("target")?.classList.add("found");';
const FAILING = '// does nothing';

const challenge: Challenge = {
  id: 'c1',
  slug: 'c1',
  title: 'C1',
  category: 'selection',
  difficulty: 'novice',
  prompt: 'p',
  html: '<div id="target"></div>',
  starterCode: '// starter',
  tests: [
    {
      name: 'adds the class',
      run: ({ doc, expect: assert }) => {
        assert(doc.getElementById('target')).toHaveClass('found');
      },
    },
  ],
  solutions: [{ label: 'Canonical', code: '', explanation: 'e', tradeoffs: 't' }],
  concepts: [],
  relatedIds: [],
};

/** A row the learner solved on an earlier visit, in the shape the server hands it back. */
const solvedRecord: ProgressRecord = {
  id: 'stored-row',
  challengeId: challenge.id,
  status: 'solved',
  attempts: 4,
  solvedAt: '2026-01-02T03:04:05.000Z',
  revealedAt: null,
  lastCode: PASSING,
  updatedAt: '2026-01-02T03:04:05.000Z',
};

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>;

/**
 * A fresh `Response` per call, not one shared instance.
 *
 * `mockResolvedValue(new Response(...))` hands the *same* object to every call, and a Response
 * body can only be read once -- the second `apiFetch` to consume it throws instead of resolving.
 * This flow makes at least four calls (the progress query, saveProgress's existence lookup, the
 * write itself, and the post-settle invalidation), so a shared Response would fail the run for a
 * reason that has nothing to do with the code under test.
 */
function stubFetch(): FetchMock {
  const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify([]), { status: 200 })));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** The bodies of every progress write the flow issued, in the order it issued them. */
function writtenProgress(fetchMock: FetchMock): string[] {
  return (
    fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'POST' || init?.method === 'PATCH')
      // Narrowed rather than stringified: `BodyInit` includes Blob and friends, which would
      // stringify to "[object Object]" and make a `toContain` assertion below silently unfalsifiable.
      .map(([, init]) => (typeof init?.body === 'string' ? init.body : ''))
  );
}

/**
 * A fetch stub that echoes the last progress write back to every later read.
 *
 * `stubFetch` always answers `[]`, which quietly hides the round trip the run flow depends on:
 * each run reads the stored record, increments `attempts` and writes it back, so a flow that
 * never sees its own previous write would record attempt 1 forever. Echoing the stored body --
 * as a string, so nothing here has to parse or assert a shape -- is the smallest server that
 * makes that visible.
 */
function stubEchoingProgressServer(): FetchMock {
  let stored: string | null = null;

  const fetchMock = vi.fn<typeof fetch>((_input, init) => {
    const method = init?.method ?? 'GET';
    if ((method === 'POST' || method === 'PATCH') && typeof init?.body === 'string') {
      stored = init.body;
      return Promise.resolve(new Response(stored, { status: 200 }));
    }
    return Promise.resolve(new Response(stored === null ? '[]' : `[${stored}]`, { status: 200 }));
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/**
 * A progress server that answers every read with `records` and echoes every write back.
 *
 * `gate` delays the reads only. Writes are never gated, because by the time the flow issues one
 * the test that opened the gate has already opened it.
 */
function stubProgressServer(records: ProgressRecord[], gate: Promise<void> = Promise.resolve()): FetchMock {
  const fetchMock = vi.fn<typeof fetch>((_input, init) => {
    const method = init?.method ?? 'GET';
    if (method === 'GET') {
      return gate.then(() => new Response(JSON.stringify(records), { status: 200 }));
    }
    return Promise.resolve(new Response(typeof init?.body === 'string' ? init.body : '{}', { status: 200 }));
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/**
 * `apiFetch` always calls `fetch` with a string; the other two forms exist only because `fetch`'s
 * own type allows them. Narrowed on a property rather than with `instanceof`, which is unreliable
 * under happy-dom's shared class table.
 */
function requestUrl(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === 'string') return input;
  return 'url' in input ? input.url : input.href;
}

/**
 * A progress server whose collection read fails, and whose every other request works.
 *
 * Only `GET /progress` -- the read the flow builds its write from -- answers 500. `saveProgress`'s
 * own `?challengeId=` lookup and the write itself still succeed, deliberately: a stub that broke
 * every request would make "nothing was written" hold because the write *failed*, not because it
 * was skipped, and would pass just as happily against a flow that writes a placeholder.
 */
function stubFailingProgressRead(): FetchMock {
  const fetchMock = vi.fn<typeof fetch>((input, init) => {
    const method = init?.method ?? 'GET';
    const isCollectionRead = method === 'GET' && !requestUrl(input).includes('?');
    if (isCollectionRead) {
      return Promise.resolve(new Response('{}', { status: 500 }));
    }
    return Promise.resolve(new Response(typeof init?.body === 'string' ? init.body : '[]', { status: 200 }));
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/**
 * The same server with its reads held until the test releases them.
 *
 * The hazard this exists for is a race -- a cold deep-link where the learner's first run finishes
 * before `GET /progress` answers -- and a test that lets the read settle first cannot see it.
 */
function stubGatedProgressServer(records: ProgressRecord[]): { fetchMock: FetchMock; releaseReads: () => void } {
  // Definitely assigned: a promise executor runs synchronously, so `reads` cannot exist unresolved.
  let releaseReads!: () => void;
  const reads = new Promise<void>((resolve) => {
    releaseReads = resolve;
  });

  return { fetchMock: stubProgressServer(records, reads), releaseReads };
}

const containers: HTMLDivElement[] = [];

/**
 * A ref over a container that is actually connected to the document.
 *
 * Connection is load-bearing: an iframe inside a detached subtree never navigates, so its `load`
 * never fires and every `reset` against it stays pending forever.
 */
function attachedRef(): RefObject<HTMLDivElement | null> {
  const container = document.createElement('div');
  document.body.append(container);
  containers.push(container);
  return { current: container };
}

/** The counterpart: a container left out of the document, so a run cannot finish on its own. */
function detachedRef(): RefObject<HTMLDivElement | null> {
  const container = document.createElement('div');
  containers.push(container);
  return { current: container };
}

function wrapperFor(client: QueryClient) {
  return function Providers({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function newClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

/**
 * Renders the hook, optionally recording the `result` exposed by *every* render.
 *
 * The history matters for the stale-run test: reading `result.current.result` at the end only
 * shows the last value, which cannot distinguish "the superseded run never rendered" from "it
 * rendered and was then overwritten".
 */
function renderRun(ref: RefObject<HTMLDivElement | null>, seen?: (Harness.RunResult | null)[]) {
  const client = newClient();
  const rendered = renderHook(
    () => {
      const run = useChallengeRun(challenge, ref);
      seen?.push(run.result);
      return run;
    },
    { wrapper: wrapperFor(client) },
  );

  return { ...rendered, client };
}

function previewDocument(ref: RefObject<HTMLDivElement | null>): Document | null {
  return ref.current?.querySelector('iframe')?.contentDocument ?? null;
}

afterEach(() => {
  vi.unstubAllGlobals();
  runChallengeOverride = null;
  for (const container of containers.splice(0)) container.remove();
});

describe('useChallengeRun', () => {
  it('reports a pass and records solved progress', async () => {
    const fetchMock = stubFetch();
    const ref = attachedRef();
    const { result } = renderRun(ref);

    await act(async () => {
      await result.current.run(PASSING);
    });

    await waitFor(() => {
      expect(result.current.result?.passed).toBe(true);
    });
    expect(result.current.result?.results).toHaveLength(1);
    expect(result.current.result?.results[0]?.name).toBe('adds the class');
    expect(result.current.isRunning).toBe(false);

    await waitFor(() => {
      expect(writtenProgress(fetchMock)).toHaveLength(1);
    });
    expect(writtenProgress(fetchMock)[0]).toContain('"status":"solved"');
    expect(writtenProgress(fetchMock)[0]).toContain('"attempts":1');
  });

  it('records an attempt when the run fails', async () => {
    const fetchMock = stubFetch();
    const ref = attachedRef();
    const { result } = renderRun(ref);

    await act(async () => {
      await result.current.run(FAILING);
    });

    await waitFor(() => {
      expect(result.current.result?.passed).toBe(false);
    });
    expect(result.current.result?.results).toHaveLength(1);
    expect(result.current.result?.results[0]?.passed).toBe(false);

    await waitFor(() => {
      expect(writtenProgress(fetchMock)).toHaveLength(1);
    });
    expect(writtenProgress(fetchMock)[0]).toContain('"status":"attempted"');
  });

  it('surfaces a compile error as a result rather than throwing it at the caller', async () => {
    const fetchMock = stubFetch();
    const ref = attachedRef();
    const { result } = renderRun(ref);

    await act(async () => {
      await result.current.run('const = = =;');
    });

    await waitFor(() => {
      expect(result.current.result?.error?.phase).toBe('transpile');
    });
    expect(result.current.result?.passed).toBe(false);
    expect(result.current.result?.results).toHaveLength(0);
    expect(result.current.isRunning).toBe(false);

    await waitFor(() => {
      expect(writtenProgress(fetchMock)).toHaveLength(1);
    });
    expect(writtenProgress(fetchMock)[0]).toContain('"status":"attempted"');
  });

  it('leaves the preview showing the dom the submitted code produced, not the last test', async () => {
    stubFetch();
    const ref = attachedRef();
    const { result } = renderRun(ref);

    await act(async () => {
      await result.current.run(PASSING);
    });

    const preview = previewDocument(ref);
    expect(preview).not.toBeNull();
    expect(preview?.getElementById('target')?.classList.contains('found')).toBe(true);
  });

  it('clears the result and re-renders the preview from the code reset is given', async () => {
    stubFetch();
    const ref = attachedRef();
    const { result } = renderRun(ref);

    await act(async () => {
      await result.current.run(PASSING);
    });
    expect(result.current.result).not.toBeNull();

    await act(async () => {
      await result.current.reset(challenge.starterCode);
    });

    expect(result.current.result).toBeNull();
    const preview = previewDocument(ref);
    expect(preview?.getElementById('target')).not.toBeNull();
    expect(preview?.getElementById('target')?.classList.contains('found')).toBe(false);
  });

  it('opens no preview when the reset comes before any run, and still runs afterwards', async () => {
    stubFetch();
    const ref = attachedRef();
    const { result } = renderRun(ref);

    await act(async () => {
      await result.current.reset(challenge.starterCode);
    });

    // The decision behind `reset`'s no-op on a null host, which is every call before the first run:
    // the frame is created by a run, so a page that has not been run has no preview -- and "cleared"
    // means "as the page arrived". Opening one here would show the learner something they never got
    // by loading the page. Awaited rather than polled, so the enqueued body has certainly run.
    expect(previewDocument(ref)).toBeNull();
    expect(result.current.result).toBeNull();

    // ...and the serial queue is not left wedged by the call that did nothing.
    await act(async () => {
      await result.current.run(PASSING);
    });

    expect(result.current.result?.passed).toBe(true);
    expect(previewDocument(ref)?.getElementById('target')?.classList.contains('found')).toBe(true);
  });

  it('never lets a superseded run land after the run that replaced it', async () => {
    const fetchMock = stubFetch();
    const ref = attachedRef();
    const seen: (Harness.RunResult | null)[] = [];
    const { result } = renderRun(ref, seen);

    // Passing first, failing second: the two verdicts are distinguishable, so a superseded run
    // that still wrote its result would show up in the render history below.
    await act(async () => {
      const superseded = result.current.run(PASSING);
      const latest = result.current.run(FAILING);
      await Promise.all([superseded, latest]);
    });

    await waitFor(() => {
      expect(result.current.isRunning).toBe(false);
    });

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.some((entry) => entry?.passed === true)).toBe(false);
    expect(result.current.result?.passed).toBe(false);

    // And the superseded run records nothing: one write, for the run the learner is looking at.
    await waitFor(() => {
      expect(writtenProgress(fetchMock)).toHaveLength(1);
    });
    expect(writtenProgress(fetchMock)[0]).toContain('"status":"attempted"');
    expect(writtenProgress(fetchMock).join('|')).not.toContain('"status":"solved"');
  });

  it('never lets a run reset superseded land in the cleared panel', async () => {
    const fetchMock = stubFetch();
    // The one thing a real host cannot be made to do on cue: stay in flight until the test says
    // otherwise, so `reset` is guaranteed to arrive while the run is still unresolved.
    let landRun!: (value: Harness.RunResult) => void;
    runChallengeOverride = () =>
      new Promise<Harness.RunResult>((resolve) => {
        landRun = resolve;
      });
    const ref = attachedRef();
    const seen: (Harness.RunResult | null)[] = [];
    const { result } = renderRun(ref, seen);

    let running: Promise<void> = Promise.resolve();
    act(() => {
      running = result.current.run(PASSING);
    });
    await waitFor(() => {
      expect(result.current.isRunning).toBe(true);
    });

    let resetting: Promise<void> = Promise.resolve();
    act(() => {
      resetting = result.current.reset(challenge.starterCode);
    });

    await act(async () => {
      landRun({ passed: true, results: [], error: null });
      await Promise.all([running, resetting]);
    });

    // The render history, not just the last value: reading only the end cannot tell "the run never
    // landed" apart from "it landed and something cleared it afterwards".
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.some((entry) => entry?.passed === true)).toBe(false);
    expect(result.current.result).toBeNull();
    // Nor is a run the learner cancelled an attempt they made.
    expect(writtenProgress(fetchMock)).toHaveLength(0);
  });

  it('treats a host torn down mid-run as a cancellation, not as a failed run', async () => {
    const fetchMock = stubFetch();
    // Detached, so the frame never loads and the run is still in flight when the hook unmounts --
    // the same shape as navigating away mid-run, or StrictMode's mount/cleanup/remount.
    const ref = detachedRef();
    const { result, unmount } = renderRun(ref);

    let running: Promise<void> = Promise.resolve();
    act(() => {
      running = result.current.run(PASSING);
    });
    await waitFor(() => {
      expect(result.current.isRunning).toBe(true);
    });

    unmount();

    // Rejecting here is the failure mode: `HostDisposedError` escaping `run` would surface as an
    // unhandled rejection rather than as the cancellation it is.
    await expect(running).resolves.toBeUndefined();
    expect(result.current.result).toBeNull();
    expect(writtenProgress(fetchMock)).toHaveLength(0);
  });

  it('counts the second run as a second attempt and keeps the first solve date', async () => {
    const fetchMock = stubEchoingProgressServer();
    const ref = attachedRef();
    const { result, client } = renderRun(ref);

    await act(async () => {
      await result.current.run(PASSING);
    });
    // The read-back is what makes the second run an increment rather than a repeat, so wait for
    // the stored record to reach the cache before running again.
    await waitFor(() => {
      expect(client.getQueryData<ProgressRecord[]>(PROGRESS_QUERY_KEY)?.[0]?.attempts).toBe(1);
    });

    await act(async () => {
      await result.current.run(PASSING);
    });
    await waitFor(() => {
      expect(writtenProgress(fetchMock)).toHaveLength(2);
    });

    const [firstWrite, secondWrite] = writtenProgress(fetchMock);
    expect(firstWrite).toContain('"attempts":1');
    expect(secondWrite).toContain('"attempts":2');

    const firstSolvedAt = /"solvedAt":"([^"]+)"/.exec(firstWrite ?? '')?.[1];
    expect(firstSolvedAt).toBeDefined();
    // Re-running something already solved is not a new solve.
    expect(secondWrite).toContain(`"solvedAt":"${String(firstSolvedAt)}"`);
  });

  it('writes against the stored record even when the run beats the progress fetch', async () => {
    const { fetchMock, releaseReads } = stubGatedProgressServer([solvedRecord]);
    const ref = attachedRef();
    const { result } = renderRun(ref);

    let running: Promise<void> = Promise.resolve();
    act(() => {
      running = result.current.run(FAILING);
    });

    // The verdict is on screen while `GET /progress` is still pending -- a cold deep-link where the
    // learner runs before the fetch answers. Waiting the race out here is exactly what would hide
    // the bug: the write must not be built from a placeholder captured at render time.
    await waitFor(() => {
      expect(result.current.result?.passed).toBe(false);
    });

    await act(async () => {
      releaseReads();
      await running;
    });

    await waitFor(() => {
      expect(writtenProgress(fetchMock)).toHaveLength(1);
    });
    const [write = ''] = writtenProgress(fetchMock);
    // Not `attempts: 1` and not `solvedAt: null`: overwriting those is silent destruction of a solve.
    expect(write).toContain('"attempts":5');
    expect(write).toContain(`"solvedAt":"${String(solvedRecord.solvedAt)}"`);
  });

  it('records nothing, and reports nothing, when the prior record cannot be read', async () => {
    const fetchMock = stubFailingProgressRead();
    const ref = attachedRef();
    const { result } = renderRun(ref);

    await act(async () => {
      await result.current.run(FAILING);
    });

    await waitFor(() => {
      expect(result.current.isRunning).toBe(false);
    });

    // Nothing is written at all. A record that cannot be read cannot be safely rewritten, and the
    // placeholder a friendlier fallback would reach for is exactly what destroys a solve.
    expect(writtenProgress(fetchMock)).toHaveLength(0);
    // The read failure stays invisible: the run itself really did produce this verdict, and a
    // progress fetch the learner never asked for must not be reported as their code failing.
    expect(result.current.result?.passed).toBe(false);
    expect(result.current.result?.results).toHaveLength(1);
    expect(result.current.result?.error).toBeNull();
  });

  it('keeps a solved challenge solved when a later run fails', async () => {
    const fetchMock = stubProgressServer([solvedRecord]);
    const ref = attachedRef();
    const { result } = renderRun(ref);

    // Reads are ungated here, so the write-time read has the solved row in hand: what this test
    // pins is the status the write then chooses, not the race the previous test covers.
    await act(async () => {
      await result.current.run(FAILING);
    });

    await waitFor(() => {
      expect(writtenProgress(fetchMock)).toHaveLength(1);
    });
    const [write = ''] = writtenProgress(fetchMock);
    // Solved is sticky: only an explicit clear un-solves a challenge. The attempt and the code the
    // learner last ran are still recorded.
    expect(write).toContain('"status":"solved"');
    expect(write).toContain('"attempts":5');
    expect(write).toContain(`"solvedAt":"${String(solvedRecord.solvedAt)}"`);
    expect(write).toContain(`"lastCode":${JSON.stringify(FAILING)}`);
  });

  it('hands the runner the code it was given, against the current challenge', async () => {
    stubFetch();
    const seenArgs: Parameters<RunChallengeFn>[] = [];
    runChallengeOverride = (...args) => {
      seenArgs.push(args);
      return Promise.resolve({ passed: true, results: [], error: null });
    };
    const ref = attachedRef();
    const { result } = renderRun(ref);

    await act(async () => {
      await result.current.run('const typed = 1;');
    });

    expect(seenArgs).toHaveLength(1);
    expect(seenArgs[0]?.[0]).toBe(challenge);
    expect(seenArgs[0]?.[1]).toBe('const typed = 1;');
  });

  it('stays silent when the run is cancelled, but reports any other host failure', async () => {
    // Both halves run against a host that is alive and current, which is what makes them a test of
    // the *discrimination* rather than of the staleness guard: nothing here advances the run token,
    // so only the `HostDisposedError` check can keep the first half off the screen.
    const cancelledFetch = stubFetch();
    runChallengeOverride = () => Promise.reject(new HostDisposedError());
    const cancelledRef = attachedRef();
    const cancelled = renderRun(cancelledRef);

    await act(async () => {
      await cancelled.result.current.run(PASSING);
    });

    expect(cancelled.result.current.result).toBeNull();
    expect(cancelled.result.current.isRunning).toBe(false);
    expect(writtenProgress(cancelledFetch)).toHaveLength(0);
    cancelled.unmount();

    vi.unstubAllGlobals();
    const brokenFetch = stubFetch();
    runChallengeOverride = () => Promise.reject(new Error('The preview frame did not initialise.'));
    const brokenRef = attachedRef();
    const broken = renderRun(brokenRef);

    await act(async () => {
      await broken.result.current.run(PASSING);
    });

    expect(broken.result.current.result?.error).toEqual({
      phase: 'execute',
      message: 'The preview frame did not initialise.',
    });
    expect(broken.result.current.result?.passed).toBe(false);
    expect(broken.result.current.isRunning).toBe(false);
    // A frame that never came up is not an attempt the learner made.
    expect(writtenProgress(brokenFetch)).toHaveLength(0);
  });

  it('does nothing and stops running when there is nowhere to mount the preview', async () => {
    const fetchMock = stubFetch();
    const ref: RefObject<HTMLDivElement | null> = { current: null };
    const { result } = renderRun(ref);

    await act(async () => {
      await result.current.run(PASSING);
    });

    expect(result.current.result).toBeNull();
    expect(result.current.isRunning).toBe(false);
    expect(writtenProgress(fetchMock)).toHaveLength(0);
  });
});
