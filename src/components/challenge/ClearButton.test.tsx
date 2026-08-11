import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as ProgressHooks from '@/hooks/useProgress';
import { emptyProgress } from '@/hooks/useProgress';
import type { ProgressRecord } from '@/types/progress';

import { ClearButton } from './ClearButton';

type ClearOptions = { onError?: (error: Error) => void };

const clearDraft = vi.hoisted(() => vi.fn<(challengeId: string) => void>());
const readStoredProgress = vi.hoisted(() => vi.fn<() => Promise<ProgressRecord | null>>());
const useStoredProgress = vi.hoisted(() => vi.fn<(challengeId: string) => () => Promise<ProgressRecord | null>>());
const clearProgress = vi.hoisted(() => vi.fn<(recordId: string, options?: ClearOptions) => void>());

// The real module minus its two hooks: `emptyProgress` and the placeholder-recognising predicate
// behind it stay real, so the "no row to delete" tests below run against the same values
// `findChallengeProgress` actually synthesises rather than a hand-made lookalike.
vi.mock('@/hooks/useProgress', async (importOriginal) => {
  const actual = await importOriginal<typeof ProgressHooks>();
  return { ...actual, useStoredProgress, useClearProgress: () => ({ mutate: clearProgress }) };
});

// Mocked rather than driven for real: this file is about what the button orchestrates, and a spy
// records the id it was handed. `ChallengePage.test.tsx` runs the same flow through the real store.
vi.mock('@/store/editorStore', () => ({
  useEditorStore: <T,>(selector: (state: { clearDraft: (challengeId: string) => void }) => T): T =>
    selector({ clearDraft }),
}));

const CHALLENGE_ID = 'selection-query-basics';

/** A row the server is holding, with the id *it* assigned -- never the challenge id. */
function storedRecord(overrides: Partial<ProgressRecord> = {}): ProgressRecord {
  return {
    id: 'server-assigned-id',
    challengeId: CHALLENGE_ID,
    status: 'attempted',
    attempts: 3,
    solvedAt: null,
    revealedAt: null,
    lastCode: '// the third thing I tried',
    updatedAt: '2026-08-10T00:00:00.000Z',
    ...overrides,
  };
}

function renderClearButton() {
  const onCleared = vi.fn<() => void>();
  render(<ClearButton challengeId={CHALLENGE_ID} onCleared={onCleared} />);
  return { onCleared };
}

function clearButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Clear solution' });
}

/** Opens the confirm and waits for Base UI to move focus into it, which it does asynchronously. */
async function openConfirm(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
  await user.click(clearButton());
  const dialog = await screen.findByRole('dialog', { name: 'Clear your progress?' });
  await waitFor(() => {
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
  return dialog;
}

async function confirmClear(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await openConfirm(user);
  await user.click(screen.getByRole('button', { name: 'Yes, clear it' }));
}

/** When `fn` was first called, relative to every other spy in the file. */
function firstCallOrder(fn: Mock): number {
  const [order] = fn.mock.invocationCallOrder;
  expect(order).toBeDefined();
  return order ?? 0;
}

beforeEach(() => {
  useStoredProgress.mockReturnValue(readStoredProgress);
  readStoredProgress.mockResolvedValue(storedRecord());
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ClearButton', () => {
  it('offers a control named for what it clears', () => {
    renderClearButton();

    expect(clearButton()).toBeInTheDocument();
  });

  it('warns before clearing anything, and clears nothing until the warning is confirmed', async () => {
    const user = userEvent.setup();
    const { onCleared } = renderClearButton();

    const dialog = await openConfirm(user);

    // Announced with the dialog rather than merely present inside it: a warning about a
    // destructive, irreversible action that a screen reader never reaches is not a warning.
    expect(dialog).toHaveAccessibleDescription(/deletes your saved progress/i);
    // The read resolves in a microtask, so a button that started clearing on its own click would
    // have finished the whole flow long before the focus wait above resolved. Those assertions are
    // therefore about a chance that has been and gone, not about a race this test happens to win.
    expect(clearDraft).not.toHaveBeenCalled();
    expect(clearProgress).not.toHaveBeenCalled();
    expect(onCleared).not.toHaveBeenCalled();
  });

  it('clears the draft, deletes the stored row and hands back to the caller, in that order', async () => {
    const user = userEvent.setup();
    const { onCleared } = renderClearButton();

    await confirmClear(user);

    await waitFor(() => {
      expect(onCleared).toHaveBeenCalledTimes(1);
    });
    expect(useStoredProgress).toHaveBeenCalledWith(CHALLENGE_ID);
    expect(clearDraft).toHaveBeenCalledExactlyOnceWith(CHALLENGE_ID);
    expect(clearProgress).toHaveBeenCalledTimes(1);
    // The id the server assigned, never `challengeId`. json-server discards a client-supplied id on
    // create, so a delete keyed on the challenge id aims at a row that does not exist: it 404s, the
    // mutation rolls back, and the learner is left looking at an unchanged page.
    expect(clearProgress.mock.calls[0]?.[0]).toBe('server-assigned-id');
    expect(clearProgress.mock.calls[0]?.[0]).not.toBe(CHALLENGE_ID);
    // Order matters to the tests below as much as to the flow: they wait on `onCleared` and then
    // assert a delete did *not* happen, which is only a guarantee while the delete comes first.
    expect(firstCallOrder(clearDraft)).toBeLessThan(firstCallOrder(clearProgress));
    expect(firstCallOrder(clearProgress)).toBeLessThan(firstCallOrder(onCleared));
  });

  it('dismisses without clearing anything and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    const { onCleared } = renderClearButton();
    const trigger = clearButton();

    await openConfirm(user);
    await user.click(screen.getByRole('button', { name: 'Keep my work' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    // Focus coming back is the last thing the close does, so anything the close had wrongly set off
    // has already had its turn by the time these three assertions run.
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
    expect(clearDraft).not.toHaveBeenCalled();
    expect(clearProgress).not.toHaveBeenCalled();
    expect(onCleared).not.toHaveBeenCalled();
  });

  it('skips the delete when the server holds no row for this challenge', async () => {
    const user = userEvent.setup();
    readStoredProgress.mockResolvedValue(emptyProgress(CHALLENGE_ID));
    const { onCleared } = renderClearButton();

    await confirmClear(user);

    // `onCleared` runs after the delete branch, so waiting for it is waiting for the decision.
    await waitFor(() => {
      expect(onCleared).toHaveBeenCalledTimes(1);
    });
    // The placeholder's `id` is the *challenge* id, so deleting it would 404 -- and a 404 on a
    // record that was never there is not a failure to report, it is nothing to do.
    expect(clearProgress).not.toHaveBeenCalled();
    expect(clearDraft).toHaveBeenCalledExactlyOnceWith(CHALLENGE_ID);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('deletes a row whose only content is a reveal', async () => {
    const user = userEvent.setup();
    // Reachable, and the reason "unattempted with no attempts" is not on its own a placeholder: a
    // learner who reveals before ever running creates exactly this row. Skipping its delete would
    // leave the solutions unlocked forever while telling the learner they had been cleared.
    readStoredProgress.mockResolvedValue(
      storedRecord({ status: 'unattempted', attempts: 0, lastCode: null, revealedAt: '2026-08-10T09:00:00.000Z' }),
    );
    renderClearButton();

    await confirmClear(user);

    await waitFor(() => {
      expect(clearProgress).toHaveBeenCalledTimes(1);
    });
    expect(clearProgress.mock.calls[0]?.[0]).toBe('server-assigned-id');
  });

  it('reports a failure instead of a clear when the stored record cannot be read', async () => {
    const user = userEvent.setup();
    readStoredProgress.mockResolvedValue(null);
    const { onCleared } = renderClearButton();

    await confirmClear(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be cleared/i);
    // Half a clear is worse than none: dropping the draft while the row survives would take the
    // learner's code and leave the record that says they solved it.
    expect(clearDraft).not.toHaveBeenCalled();
    expect(clearProgress).not.toHaveBeenCalled();
    expect(onCleared).not.toHaveBeenCalled();
  });

  it('reports a failure when the delete itself fails', async () => {
    const user = userEvent.setup();
    clearProgress.mockImplementation((_recordId, options) => {
      options?.onError?.(new Error('network down'));
    });
    renderClearButton();

    await confirmClear(user);

    // Otherwise the mutation rolls its optimistic removal back and the record simply reappears,
    // with nothing on screen to say the clear the learner confirmed did not happen.
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be cleared/i);
  });

  it('cannot be set off a second time while the first clear is still in flight, and keeps focus', async () => {
    const user = userEvent.setup();
    let releaseRead!: (record: ProgressRecord | null) => void;
    readStoredProgress.mockReturnValue(
      new Promise<ProgressRecord | null>((resolve) => {
        releaseRead = resolve;
      }),
    );
    const { onCleared } = renderClearButton();

    await confirmClear(user);

    // The read is still open -- the cold deep-link case, where it is a whole request long -- so the
    // dialog restores focus to a trigger that is mid-clear. A plainly `disabled` button cannot take
    // focus, and it would land on <body> instead: a keyboard learner loses their place at exactly
    // the moment the page is rearranging itself.
    await waitFor(() => {
      expect(clearButton()).toHaveFocus();
    });
    expect(clearButton()).toHaveAttribute('aria-disabled', 'true');
    // And it *looks* unavailable, which the ARIA attribute alone does not deliver: keeping the
    // button focusable means Base UI omits the native `disabled` attribute, and `buttonVariants`
    // dims and un-hovers through `disabled:` variants that compile to `&:disabled`. Without the
    // `aria-disabled:` pair a learner who just confirmed a destructive action watches the dialog
    // close and is left with a button that still looks live and does nothing.
    expect(clearButton()).toHaveClass('aria-disabled:opacity-50', 'aria-disabled:pointer-events-none');

    // Focusable, but genuinely inert: a second confirm would delete a row the first one is already
    // deleting, and the second DELETE 404s and rolls the cache back over the first.
    await user.click(clearButton());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(clearProgress).not.toHaveBeenCalled();

    releaseRead(storedRecord());

    await waitFor(() => {
      expect(onCleared).toHaveBeenCalledTimes(1);
    });
    // ...and it comes back, rather than leaving the learner with a dead control.
    expect(clearButton()).not.toHaveAttribute('aria-disabled', 'true');
    expect(clearProgress).toHaveBeenCalledTimes(1);
  });
});
