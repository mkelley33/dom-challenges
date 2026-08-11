import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { challengeBySlug } from '@/challenges/registry';
import { PROGRESS_QUERY_KEY } from '@/hooks/useProgress';
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

  return { router, client };
}

/**
 * Resolves once the progress read has settled into `status`.
 *
 * The reveal resolves its record off this same query, so a settled query is a strict precondition
 * for the reveal's decision having been made -- which is what a "nothing was written" assertion
 * needs, and what waiting on a *recorded request* does not give: requests are recorded when issued.
 */
function progressQuerySettled(client: QueryClient, status: 'success' | 'error'): Promise<void> {
  return waitFor(() => {
    expect(client.getQueryState(PROGRESS_QUERY_KEY)?.status).toBe(status);
  });
}

function editor(): Promise<HTMLElement> {
  return screen.findByRole('textbox', { name: 'Solution code' });
}

function draftFor(challenge: Challenge): string | undefined {
  return useEditorStore.getState().drafts[challenge.id];
}

/** Captured before any test edits it, so restoring never has to restate the store's own defaults. */
const DEFAULT_LAYOUT = useEditorStore.getState().layout;

/**
 * Answers `matchMedia` the way a viewport of the given size would.
 *
 * happy-dom's window is 1024px wide, which is exactly Tailwind's `lg`, so the unstubbed default is
 * "desktop" -- correct for every test that is not about the phone layout, and useless for the ones
 * that are.
 */
function stubViewport(isDesktop: boolean): void {
  vi.stubGlobal('matchMedia', (media: string) => ({
    media,
    matches: isDesktop,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

/** One of the three layout columns, found by the tab it belongs to. */
function panel(name: 'code' | 'problem' | 'result'): HTMLElement {
  const element = document.querySelector(`[data-panel="${name}"]`);
  if (!(element instanceof HTMLElement)) throw new Error(`No column is marked data-panel="${name}".`);
  return element;
}

/**
 * Whether a column is `display: none`.
 *
 * The class is the only trace there is: happy-dom loads no stylesheet, so nothing here has a
 * computed style to read, and a `display: none` element is present in the DOM like any other.
 * `hidden` is Tailwind's fixed name for that declaration, which is why it can be named literally.
 */
function isDisplayNone(element: HTMLElement): boolean {
  return element.classList.contains('hidden');
}

/**
 * The preview section, by attribute rather than by role.
 *
 * `getByRole` cannot reach it while it is parked off-screen, because being out of the
 * accessibility tree at that moment is precisely what is being asserted.
 */
function previewSection(): HTMLElement {
  const section = document.querySelector('section[aria-label="Preview"]');
  if (!(section instanceof HTMLElement)) throw new Error('The preview section is not in the document at all.');
  return section;
}

function viewTab(name: string): HTMLElement {
  return screen.getByRole('tab', { name });
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
interface ProgressApiOptions {
  /** Answers every DELETE with this status instead of removing the row. */
  deleteFailsWith?: number;
}

function stubProgressApi(stored: ProgressRecord[], options: ProgressApiOptions = {}) {
  const calls: RecordedCall[] = [];
  const rows = [...stored];
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

      // A delete actually removes the row, and 404s for an id no row has -- json-server's own
      // behaviour, and the thing a clear keyed on the challenge id would run into. A stub that
      // answered every delete with 200 and kept serving the row would report success for a delete
      // that removed nothing, and the refetch after it would hand the record straight back.
      if (method === 'DELETE') {
        if (options.deleteFailsWith !== undefined) return new Response('{}', { status: options.deleteFailsWith });
        const index = rows.findIndex((row) => url.endsWith(`/progress/${row.id}`));
        if (index === -1) return new Response('{}', { status: 404 });
        rows.splice(index, 1);
        return jsonResponse({});
      }

      return method === 'GET' ? jsonResponse(rows) : jsonResponse(body);
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

/** Every request that would remove a stored row. */
function rowDeletes(calls: RecordedCall[]): RecordedCall[] {
  return calls.filter((call) => call.method === 'DELETE');
}

/** Collection reads only -- `saveProgress`'s `?challengeId=` lookup is a different question. */
function progressReads(calls: RecordedCall[]): number {
  return calls.filter((call) => call.method === 'GET' && call.url.endsWith('/progress')).length;
}

/** Drives a reveal through the confirm dialog, from the locked panel. */
async function confirmReveal(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole('button', { name: 'Reveal solution' }));
  await user.click(await screen.findByRole('button', { name: 'Yes, reveal it' }));
}

/** Drives a clear through its confirm dialog. */
async function confirmClear(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(await screen.findByRole('button', { name: 'Clear solution' }));
  await user.click(await screen.findByRole('button', { name: 'Yes, clear it' }));
}

beforeEach(() => {
  // `mobileTab` and `layout` are module-level store state that outlives a render, so they are reset
  // here as well: a tab left on "Results" by one test would silently pre-satisfy the next.
  useEditorStore.setState({ drafts: {}, mobileTab: 'problem', layout: DEFAULT_LAYOUT });
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  useEditorStore.setState({ drafts: {}, mobileTab: 'problem', layout: DEFAULT_LAYOUT });
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
    const { router } = renderChallengePage(first.slug);
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

    // The heading, not a recorded request: `stubProgressApi` pushes to `calls` when a request is
    // *issued*, which for the gated read is before it resolves, so waiting on that would let the
    // assertion below run before a missing guard had any chance to write. "Other approaches" can
    // only render once the settled record is in hand -- the same record the reveal reads.
    expect(await screen.findByRole('heading', { level: 2, name: 'Other approaches' })).toBeInTheDocument();
    await expect.poll(() => writes(calls)).toHaveLength(0);
  });

  it('leaves the original reveal timestamp alone when the challenge was revealed before', async () => {
    const user = userEvent.setup();
    const { calls, settleProgress } = stubProgressApi([ALREADY_REVEALED]);

    renderChallengePage(first.slug);
    await confirmReveal(user);

    settleProgress();

    // As above: the unlocked heading is what proves the settled record reached the page.
    expect(await screen.findByRole('heading', { level: 2, name: 'Solution' })).toBeInTheDocument();
    // First reveal wins: the second is the same decision, not a later one. Nothing is written at
    // all, so `revealedAt` keeps the moment the learner actually made the choice.
    await expect.poll(() => writes(calls)).toHaveLength(0);
  });

  it('clears the draft, the stored record and the result on screen together', async () => {
    const user = userEvent.setup();
    const solution = first.solutions[0];
    expect(solution).toBeDefined();
    useEditorStore.setState({ drafts: { [first.id]: solution!.code } });
    const { calls, settleProgress } = stubProgressApi([STUCK]);
    settleProgress();

    renderChallengePage(first.slug);
    await user.click(await screen.findByRole('button', { name: /run tests/i }));

    const total = String(first.tests.length);
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(`${total} of ${total} tests passing`);
    });

    await confirmClear(user);

    // All three, or the page lies: a stale set of passing tests sitting beside freshly reset
    // starter code reads as "this is what the starter code scores".
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Not run yet');
    });
    expect(await editor()).toHaveValue(first.starterCode);
    expect(draftFor(first)).toBeUndefined();
    await waitFor(() => {
      expect(rowDeletes(calls)).toHaveLength(1);
    });
    expect(rowDeletes(calls)[0]?.url).toContain(`/progress/${STUCK.id}`);
  });

  it('keeps the draft and the result when the delete fails, and says the clear did not happen', async () => {
    const user = userEvent.setup();
    const solution = first.solutions[0];
    expect(solution).toBeDefined();
    useEditorStore.setState({ drafts: { [first.id]: solution!.code } });
    const { calls, settleProgress } = stubProgressApi([STUCK], { deleteFailsWith: 500 });
    settleProgress();

    renderChallengePage(first.slug);
    await user.click(await screen.findByRole('button', { name: /run tests/i }));

    const total = String(first.tests.length);
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(`${total} of ${total} tests passing`);
    });

    await confirmClear(user);

    // The alert is the whole outcome, and it is what proves the flow reached its answer -- the
    // delete had to be issued and rejected before this can be on screen.
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be cleared/i);
    expect(rowDeletes(calls)).toHaveLength(1);
    // Nothing else moved. `useClearProgress` rolls its optimistic removal back on failure, so the
    // record returns -- and a flow that had already cleared the draft would leave the learner with
    // their progress intact and their code gone, which is the half that cannot be recovered.
    expect(await editor()).toHaveValue(solution!.code);
    expect(draftFor(first)).toBe(solution!.code);
    expect(screen.getByRole('status')).toHaveTextContent(`${total} of ${total} tests passing`);
  });

  it('deletes the row the server assigned even when the progress read is still in flight', async () => {
    const user = userEvent.setup();
    const { calls, settleProgress } = stubProgressApi([STUCK]);

    renderChallengePage(first.slug);

    // The cold deep-link window again: the page still holds `emptyProgress`, whose `id` is the
    // *challenge* id. A clear keyed on that would 404 against json-server's own row id, roll back,
    // and leave the learner looking at an unchanged page after confirming a destructive action.
    await confirmClear(user);

    settleProgress();

    await waitFor(() => {
      expect(rowDeletes(calls)).toHaveLength(1);
    });
    expect(rowDeletes(calls)[0]?.url).toContain(`/progress/${STUCK.id}`);
    expect(rowDeletes(calls)[0]?.url).not.toContain(`/progress/${first.id}`);
  });

  it('returns the solutions panel to locked, and it stays locked once the refetch lands', async () => {
    const user = userEvent.setup();
    const { calls, settleProgress } = stubProgressApi([ALREADY_REVEALED]);
    settleProgress();

    renderChallengePage(first.slug);
    expect(await screen.findByRole('heading', { level: 2, name: 'Solution' })).toBeInTheDocument();

    const readsBeforeClear = progressReads(calls);
    await confirmClear(user);

    // Clearing takes `revealedAt` with the row, which is what makes the confirm dialog's promise of
    // a way back true.
    expect(await screen.findByRole('button', { name: 'Reveal solution' })).toBeInTheDocument();

    // The optimistic removal is only half of it. `useClearProgress` invalidates on React Query's
    // 'active' default -- deliberately, since a delete has no server-assigned field to read back --
    // and this page does observe the query, so a refetch follows. That refetch is the server's own
    // answer, and if it disagreed the row would reappear under the learner.
    await waitFor(() => {
      expect(progressReads(calls)).toBeGreaterThan(readsBeforeClear);
    });
    expect(rowDeletes(calls)).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Reveal solution' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Solution' })).not.toBeInTheDocument();
  });

  it('leaves the run flow working when the learner clears before ever running', async () => {
    const user = userEvent.setup();
    const { calls, settleProgress } = stubProgressApi([STUCK]);
    settleProgress();

    renderChallengePage(first.slug);
    expect(await editor()).toHaveValue(first.starterCode);

    await confirmClear(user);
    await waitFor(() => {
      expect(rowDeletes(calls)).toHaveLength(1);
    });

    // `reset` no-ops before the first run, because there is no preview frame yet -- covered as a
    // decision in `useChallengeRun.test.tsx`. What matters here is that the no-op leaves nothing
    // wedged: the serial queue the reset joined still carries the next run.
    await user.click(screen.getByRole('button', { name: /run tests/i }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/of \d+ tests passing/);
    });
    expect(testResultItems()).toHaveLength(first.tests.length);
  });

  it('warns about a reveal by naming a control the page actually offers', async () => {
    const user = userEvent.setup();
    const { settleProgress } = stubProgressApi([STUCK]);
    settleProgress();

    // One constant for both halves, because the two are the same claim: the warning tells the
    // learner how to undo a reveal, and the control it names has to be findable under that name.
    // The Task 14 review found this copy promising a Clear button that did not exist; it does now,
    // and this is what keeps the two from drifting apart again.
    const clearLabel = 'Clear solution';

    renderChallengePage(first.slug);

    // Checked before the dialog opens, because a modal dialog takes the rest of the page out of the
    // accessibility tree -- which is also why the copy describes what to do once it is closed.
    expect(await screen.findByRole('button', { name: clearLabel })).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Reveal solution' }));

    const dialog = await screen.findByRole('dialog', { name: 'Reveal the solution?' });
    expect(dialog).toHaveAccessibleDescription(new RegExp(clearLabel, 'i'));
  });

  it('offers the three panels as a tablist and records the choice in the store', async () => {
    const user = userEvent.setup();
    renderChallengePage(first.slug);
    await editor();

    expect(screen.getByRole('tablist', { name: 'Challenge view' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(3);

    await user.click(viewTab('Code'));

    expect(viewTab('Code')).toHaveAttribute('aria-selected', 'true');
    expect(viewTab('Problem')).toHaveAttribute('aria-selected', 'false');
    // Through the store, not through local state: the sticky action row, the run flow and the
    // panels all read the same value, and a control that only knew its own selection would leave
    // them disagreeing.
    expect(useEditorStore.getState().mobileTab).toBe('code');
  });

  it('keeps every panel mounted on a phone, so switching tabs is presentation only', async () => {
    const user = userEvent.setup();
    stubViewport(false);
    renderChallengePage(first.slug);
    await editor();
    const preview = previewSection();

    for (const label of ['Code', 'Results', 'Problem']) {
      await user.click(viewTab(label));

      // Two layouts -- or one that mounted a tab at a time -- would fail here. The preview is the
      // costly half: tearing it down takes the iframe host, and with it the learner's rendered DOM,
      // every time they glance at the prompt.
      expect(screen.getByRole('region', { name: 'Problem' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Code editor' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Test results' })).toBeInTheDocument();
      expect(previewSection()).toBe(preview);
    }
  });

  it('never puts the preview frame in a display:none subtree, whichever tab is showing', async () => {
    const user = userEvent.setup();
    stubViewport(false);
    renderChallengePage(first.slug);
    await editor();

    const observed: { tab: string; problem: boolean; code: boolean; result: boolean }[] = [];
    for (const tab of ['Problem', 'Code', 'Results']) {
      await user.click(viewTab(tab));
      observed.push({
        tab,
        problem: isDisplayNone(panel('problem')),
        code: isDisplayNone(panel('code')),
        result: isDisplayNone(panel('result')),
      });
    }

    // Collected into a table and asserted once, rather than an assertion per branch: the `result`
    // column being false everywhere only means something next to the other two being true
    // somewhere. A layout that hid nothing at all would fail this; so would one that reached for
    // `hidden` on the column holding the preview.
    expect(observed).toEqual([
      { tab: 'Problem', problem: false, code: true, result: false },
      { tab: 'Code', problem: true, code: false, result: false },
      { tab: 'Results', problem: true, code: true, result: false },
    ]);
  });

  it('parks the inactive preview off-screen and takes it out of the accessibility tree instead', async () => {
    const user = userEvent.setup();
    stubViewport(false);
    renderChallengePage(first.slug);
    await editor();

    await user.click(viewTab('Results'));
    expect(panel('result').classList.contains('absolute')).toBe(false);
    expect(previewSection()).toHaveAttribute('aria-hidden', 'false');

    await user.click(viewTab('Problem'));

    // Out of view, still rendered. A document that is not rendered never services
    // requestAnimationFrame, so a `hidden` here would drop the harness's `tick()` onto its 50 ms
    // fallback on every call and stop any paint-dependent learner code from running at all.
    expect(panel('result').classList.contains('absolute')).toBe(true);
    expect(previewSection()).toHaveAttribute('aria-hidden', 'true');
  });

  it('leaves the preview in the accessibility tree at desktop widths, whatever the phone tab says', async () => {
    stubViewport(true);
    useEditorStore.setState({ mobileTab: 'problem' });

    renderChallengePage(first.slug);
    await editor();

    // Every column is on screen above `lg`, so none of them is "inactive". `aria-hidden` cannot be
    // written as a media query, so keying it off the tab alone would hide the preview from a
    // desktop screen-reader user for no reason they could ever discover.
    expect(screen.getByRole('region', { name: 'Preview' })).toBeInTheDocument();
    expect(previewSection()).toHaveAttribute('aria-hidden', 'false');
  });

  it('announces the run outcome through a polite live region rather than moving focus', async () => {
    renderChallengePage(first.slug);
    await editor();

    // `role="status"` is a polite live region by definition, which is what `<output>` carries. The
    // point is that the outcome reaches a screen reader without anything stealing focus from the
    // editor the learner is still sitting in.
    const results = screen.getByRole('region', { name: 'Test results' });
    expect(within(results).getByRole('status')).toHaveTextContent('Not run yet');
  });

  it('runs from the keyboard, under a name that does not change while it is running', async () => {
    const user = userEvent.setup();
    renderChallengePage(first.slug);

    // Found by its exact name, not `/run/i`: the label a learner hears must be the same one before
    // and during the run, and a loose matcher would accept a button that renamed itself mid-action.
    const run = await screen.findByRole('button', { name: 'Run tests' });
    run.focus();
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/of \d+ tests passing/);
    });
    expect(screen.getByRole('button', { name: 'Run tests' })).toBeInTheDocument();
  });

  it('brings a phone to the results as the run starts, so the announcement is on screen', async () => {
    const user = userEvent.setup();
    stubViewport(false);
    useEditorStore.setState({ mobileTab: 'code' });
    renderChallengePage(first.slug);

    await user.click(await screen.findByRole('button', { name: 'Run tests' }));

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/of \d+ tests passing/);
    });
    // Otherwise the learner presses Run on the code tab and nothing they can see or hear changes:
    // the results are a tab away, and an off-screen live region announces to no one.
    expect(useEditorStore.getState().mobileTab).toBe('result');
    expect(viewTab('Results')).toHaveAttribute('aria-selected', 'true');
  });

  it('lays the desktop columns out from the persisted layout rather than a fixed ratio', async () => {
    useEditorStore.setState({ layout: { promptPercent: 20, editorPercent: 50 } });

    renderChallengePage(first.slug);
    await editor();

    // Deliberately not the stored defaults: a hardcoded ratio would pass against those and fail
    // here. The third track is what is left over, so the three always sum to the whole row.
    const grid = panel('code').parentElement;
    expect(grid?.style.gridTemplateColumns).toBe('minmax(0, 20fr) minmax(0, 50fr) minmax(0, 30fr)');
  });

  it('records nothing when the prior record cannot be read', async () => {
    const user = userEvent.setup();
    const calls = stubFailingProgressRead();

    const { client } = renderChallengePage(first.slug);
    await confirmReveal(user);

    // A failed read changes nothing on screen, so there is no heading to wait on here. The query's
    // settled error state is the equivalent guarantee: the reveal reads the same query, so it has
    // had its answer by the time this resolves.
    await progressQuerySettled(client, 'error');
    // A record that cannot be read cannot be safely rewritten. The tempting fallback -- reveal onto
    // `emptyProgress(challenge.id)` -- typechecks and POSTs a placeholder over the learner's row.
    await expect.poll(() => writes(calls)).toHaveLength(0);
  });
});
