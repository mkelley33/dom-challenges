import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { challengeBySlug } from '@/challenges/registry';
import { useEditorStore } from '@/store/editorStore';
import type { Challenge } from '@/types/challenge';
import type { ProgressRecord } from '@/types/progress';

import { ChallengePage } from './ChallengePage';

vi.mock('@monaco-editor/react', async () => {
  const { createMonacoReactMock } = await import('@/test/monacoMock');
  return createMonacoReactMock();
});

vi.mock('@/lib/monaco', async () => {
  const { createMonacoLibMock } = await import('@/test/monacoMock');
  return createMonacoLibMock();
});

// Stood in for so that loading shiki -- which the solutions panel does through a dynamic import --
// is not a race this file has to wait out. `src/lib/highlighter.test.ts` covers the real one.
vi.mock('@/lib/highlighter', () => ({
  highlightTypeScript: (code: string) => Promise.resolve(`<pre><code>${code}</code></pre>`),
}));

function requireChallenge(slug: string): Challenge {
  const challenge = challengeBySlug(slug);
  if (!challenge) throw new Error(`The registry has no challenge with slug "${slug}".`);
  return challenge;
}

const first = requireChallenge('query-basics');
const second = requireChallenge('closest-row');

function renderChallengePage(slug: string) {
  const router = createMemoryRouter([{ path: '/challenge/:slug', element: <ChallengePage /> }], {
    initialEntries: [`/challenge/${slug}`],
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  return router;
}

function editor(): Promise<HTMLElement> {
  return screen.findByRole('textbox', { name: 'Solution code' });
}

function draftFor(challenge: Challenge): string | undefined {
  return useEditorStore.getState().drafts[challenge.id];
}

/** Scoped to the results region: a prompt is markdown, and markdown is free to contain lists. */
function testResultItems(): HTMLElement[] {
  return within(screen.getByRole('region', { name: 'Test results' })).getAllByRole('listitem');
}

interface RecordedCall {
  url: string;
  method: string;
  body: unknown;
}

const SOLVED: ProgressRecord = {
  id: 'server-assigned-id',
  challengeId: first.id,
  status: 'solved',
  attempts: 7,
  solvedAt: '2026-08-08T12:00:00.000Z',
  revealedAt: null,
  lastCode: '// the code that solved it',
  updatedAt: '2026-08-08T12:00:00.000Z',
};

/** Stuck rather than solved: the one state in which a reveal is the learner's to make. */
const STUCK: ProgressRecord = {
  id: 'server-assigned-id',
  challengeId: first.id,
  status: 'attempted',
  attempts: 9,
  solvedAt: null,
  revealedAt: null,
  lastCode: '// the ninth thing I tried',
  updatedAt: '2026-08-08T12:00:00.000Z',
};

const FIRST_REVEAL_AT = '2026-08-08T13:00:00.000Z';

const ALREADY_REVEALED: ProgressRecord = { ...STUCK, revealedAt: FIRST_REVEAL_AT };

/** Frozen so the written timestamps can be asserted exactly rather than as "some string". */
const REVEAL_CLOCK = '2026-08-10T09:30:00.000Z';

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200 });
}

/** Exhaustive over `RequestInfo | URL`: a bare `String(input)` would stringify a `Request` to junk. */
function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

/** Named so that `release`'s placeholder is not a closure recreated on every stub. */
const NOT_YET_SETTLED = (): void => {};

/**
 * Serves `stored` for every progress request, but holds the initial `GET /progress` open until
 * `settleProgress()` is called -- which is the state a cold deep-link to `/challenge/:slug` is in
 * for as long as that request is in flight.
 */
function stubProgressApi(stored: ProgressRecord[]) {
  const calls: RecordedCall[] = [];
  let release = NOT_YET_SETTLED;
  const settled = new Promise<void>((resolve) => {
    release = resolve;
  });

  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const url = requestUrl(input);
      const method = init?.method ?? 'GET';
      const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ url, method, body });

      // Only the unfiltered list read: the `?challengeId=` lookup belongs to a write that has
      // already resolved its record, so gating it would prove nothing.
      if (method === 'GET' && url.endsWith('/progress')) await settled;

      return method === 'GET' ? jsonResponse(stored) : jsonResponse(body);
    }),
  );

  return {
    calls,
    settleProgress: (): void => {
      release();
    },
  };
}

/** The collection read 500s, so no prior record can ever be established. */
function stubFailingProgressRead(): RecordedCall[] {
  const calls: RecordedCall[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>((input, init) => {
      const url = requestUrl(input);
      const method = init?.method ?? 'GET';
      const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      calls.push({ url, method, body });

      if (method === 'GET' && url.endsWith('/progress')) {
        return Promise.resolve(new Response('{}', { status: 500 }));
      }
      return Promise.resolve(jsonResponse(method === 'GET' ? [] : body));
    }),
  );

  return calls;
}

/** Every request that would change a stored row: what "nothing was written" has to mean. */
function writes(calls: RecordedCall[]): RecordedCall[] {
  return calls.filter((call) => call.method === 'PATCH' || call.method === 'POST');
}

/** Drives a reveal through the confirm dialog, from the locked panel. */
async function confirmReveal(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole('button', { name: 'Reveal solution' }));
  await user.click(await screen.findByRole('button', { name: 'Yes, reveal it' }));
}

beforeEach(() => {
  useEditorStore.setState({ drafts: {} });
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  useEditorStore.setState({ drafts: {} });
});

describe('ChallengePage', () => {
  it('shows the prompt, the editor, the preview and the results as one region each', async () => {
    renderChallengePage(first.slug);

    expect(await screen.findByRole('heading', { level: 1, name: first.title })).toBeInTheDocument();

    const names = screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'));
    expect(names).toHaveLength(5);
    expect(names).toEqual(expect.arrayContaining(['Problem', 'Code editor', 'Preview', 'Test results', 'Solutions']));
    // EditorPanel already labels itself; a wrapper labelled "Code" around it would nest two
    // differently-named regions over the same content.
    expect(names.filter((name) => name === 'Code')).toHaveLength(0);
  });

  it("falls back to the challenge's starter code when the learner has no draft yet", async () => {
    renderChallengePage(first.slug);

    expect(await editor()).toHaveValue(first.starterCode);
    expect(draftFor(first)).toBeUndefined();
  });

  it('prefers a stored draft over the starter code', async () => {
    useEditorStore.setState({ drafts: { [first.id]: '// picked up where I left off' } });

    renderChallengePage(first.slug);

    expect(await editor()).toHaveValue('// picked up where I left off');
  });

  it("stores what the learner types under the current challenge's id", async () => {
    renderChallengePage(first.slug);
    const field = await editor();

    await userEvent.type(field, 'x');

    await waitFor(() => {
      expect(draftFor(first)).toBe(`${first.starterCode}x`);
    });
    // The id has to be the one being edited, not merely *an* id: a hardcoded or stale one would
    // still make the assertion above pass if it happened to match.
    expect(Object.keys(useEditorStore.getState().drafts)).toEqual([first.id]);
  });

  it('switching challenges leaks neither text into the other editor nor drafts over each other', async () => {
    const router = renderChallengePage(first.slug);
    await userEvent.type(await editor(), 'A');
    await waitFor(() => {
      expect(draftFor(first)).toBe(`${first.starterCode}A`);
    });

    await act(async () => {
      await router.navigate(`/challenge/${second.slug}`);
    });

    // The second challenge starts from its own starter code, not the first challenge's draft.
    const secondField = await screen.findByRole('textbox', { name: 'Solution code' });
    expect(secondField).toHaveValue(second.starterCode);
    expect(secondField).not.toHaveValue(`${first.starterCode}A`);

    await userEvent.type(secondField, 'B');

    await waitFor(() => {
      expect(draftFor(second)).toBe(`${second.starterCode}B`);
    });
    // ...and editing the second challenge leaves the first challenge's draft exactly as it was.
    expect(draftFor(first)).toBe(`${first.starterCode}A`);
  });

  it('runs the draft and reports every test passing for a canonical solution', async () => {
    const solution = first.solutions[0];
    expect(solution).toBeDefined();
    useEditorStore.setState({ drafts: { [first.id]: solution!.code } });
    // A challenge with no tests would report a vacuous pass; the run assertions below only mean
    // something because there is something to run.
    expect(first.tests.length).toBeGreaterThan(0);

    renderChallengePage(first.slug);
    expect(await screen.findByRole('status')).toHaveTextContent('Not run yet');

    await userEvent.click(await screen.findByRole('button', { name: /run tests/i }));

    const total = String(first.tests.length);
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(`${total} of ${total} tests passing`);
    });

    const items = testResultItems();
    expect(items).toHaveLength(first.tests.length);
    expect(items.filter((item) => /failed/i.test(item.textContent ?? ''))).toHaveLength(0);
  });

  it('runs the starter code and reports the individual failures instead of a pass', async () => {
    renderChallengePage(first.slug);

    await userEvent.click(await screen.findByRole('button', { name: /run tests/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/of \d+ tests passing/);
    });

    const total = String(first.tests.length);
    // The starter code does satisfy one of this challenge's tests (the element already carries the
    // class the third test checks), so the assertion is "not all of them", not "none of them".
    expect(screen.getByRole('status')).not.toHaveTextContent(`${total} of ${total} tests passing`);

    const items = testResultItems();
    expect(items).toHaveLength(first.tests.length);
    expect(items.filter((item) => /failed/i.test(item.textContent ?? '')).length).toBeGreaterThan(0);
  });

  it('hands the solutions panel the stored record, so an earlier solve needs no reveal', async () => {
    const { settleProgress } = stubProgressApi([SOLVED]);
    settleProgress();

    renderChallengePage(first.slug);

    expect(await screen.findByRole('heading', { level: 2, name: 'Other approaches' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reveal solution' })).not.toBeInTheDocument();
  });

  it('reveals onto the stored record rather than the placeholder when the progress read is still in flight', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(REVEAL_CLOCK));
    const user = userEvent.setup();
    const { calls, settleProgress } = stubProgressApi([STUCK]);

    renderChallengePage(first.slug);

    // The page has no record yet -- only `emptyProgress` -- so the panel is locked and the reveal
    // is offered. This is exactly the window in which a render-time spread would be destructive.
    await confirmReveal(user);

    settleProgress();

    await waitFor(() => {
      expect(writes(calls)).toHaveLength(1);
    });

    const [patch] = writes(calls);
    expect(patch?.method).toBe('PATCH');
    expect(patch?.url).toContain(`/progress/${STUCK.id}`);
    // Every attempt the learner had made survives the reveal. A write built from the placeholder
    // would send `attempts: 0`, `status: 'unattempted'` and `lastCode: null` instead. The
    // timestamps are exact rather than `expect.any(String)`, which cannot see a wrong one.
    expect(patch?.body).toEqual({
      ...STUCK,
      revealedAt: REVEAL_CLOCK,
      updatedAt: REVEAL_CLOCK,
    });
  });

  it('does not stamp a reveal onto a challenge the stored record says was already solved', async () => {
    const user = userEvent.setup();
    const { calls, settleProgress } = stubProgressApi([SOLVED]);

    renderChallengePage(first.slug);

    // Same cold-deep-link window, but the row behind it is an unaided solve. The panel offered the
    // reveal only because it had not finished loading; taking the learner up on it would set
    // `revealedAt` on a solved row and drop `earned` to false permanently -- there is no control
    // anywhere in the app that puts it back.
    await confirmReveal(user);

    settleProgress();

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'GET' && call.url.endsWith('/progress'))).toBe(true);
    });
    // Waited out rather than asserted immediately: the write, if the guard were missing, happens
    // after that read resolves, so asserting straight away would pass against the bug.
    await expect.poll(() => writes(calls)).toHaveLength(0);
  });

  it('leaves the original reveal timestamp alone when the challenge was revealed before', async () => {
    const user = userEvent.setup();
    const { calls, settleProgress } = stubProgressApi([ALREADY_REVEALED]);

    renderChallengePage(first.slug);
    await confirmReveal(user);

    settleProgress();

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'GET' && call.url.endsWith('/progress'))).toBe(true);
    });
    // First reveal wins: the second is the same decision, not a later one. Nothing is written at
    // all, so `revealedAt` keeps the moment the learner actually made the choice.
    await expect.poll(() => writes(calls)).toHaveLength(0);
    expect(ALREADY_REVEALED.revealedAt).toBe(FIRST_REVEAL_AT);
  });

  it('records nothing when the prior record cannot be read', async () => {
    const user = userEvent.setup();
    const calls = stubFailingProgressRead();

    renderChallengePage(first.slug);
    await confirmReveal(user);

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'GET' && call.url.endsWith('/progress'))).toBe(true);
    });
    // A record that cannot be read cannot be safely rewritten. The tempting fallback -- reveal onto
    // `emptyProgress(challenge.id)` -- typechecks and POSTs a placeholder over the learner's row.
    await expect.poll(() => writes(calls)).toHaveLength(0);
  });
});
