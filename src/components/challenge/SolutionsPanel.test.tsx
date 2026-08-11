import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Solution } from '@/types/challenge';
import type { ProgressRecord } from '@/types/progress';

import { SolutionsPanel } from './SolutionsPanel';

const highlightTypeScript = vi.hoisted(() => vi.fn<(code: string) => Promise<string>>());

// The real highlighter is exercised in `src/lib/highlighter.test.ts`. Here it is stood in for, so
// that "what does the panel do while/if highlighting resolves" is a decision the test makes rather
// than a race it observes.
vi.mock('@/lib/highlighter', () => ({ highlightTypeScript }));

const SOLUTIONS: Solution[] = [
  {
    label: 'getElementById',
    code: "const el = document.getElementById('target');",
    explanation: 'The most direct route to a unique element.',
    tradeoffs: 'Fastest with an id, but it can express nothing else.',
  },
  {
    label: 'querySelector',
    code: "const el = document.querySelector('#target');",
    explanation: 'One API for ids, classes and structural selectors.',
    tradeoffs: 'Scopable to a subtree, at the cost of silent nulls on a typo.',
  },
];

function record(overrides: Partial<ProgressRecord>): ProgressRecord {
  return {
    id: 'c1',
    challengeId: 'c1',
    status: 'unattempted',
    attempts: 0,
    solvedAt: null,
    revealedAt: null,
    lastCode: null,
    updatedAt: '2026-08-09T00:00:00.000Z',
    ...overrides,
  };
}

const LOCKED = record({ status: 'attempted', attempts: 4 });
const EARNED = record({ status: 'solved', solvedAt: '2026-08-09T01:00:00.000Z' });
const REVEALED = record({ status: 'attempted', attempts: 4, revealedAt: '2026-08-09T01:00:00.000Z' });

function renderPanel(progress: ProgressRecord, onReveal: () => void = vi.fn<() => void>()) {
  return render(<SolutionsPanel solutions={SOLUTIONS} record={progress} onReveal={onReveal} />);
}

function revealButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Reveal solution' });
}

function tabNames(): (string | null)[] {
  return screen.getAllByRole('tab').map((tab) => tab.textContent);
}

beforeEach(() => {
  // A faithful stand-in: the same `<pre><code>` shape shiki produces, over source with no
  // HTML-significant characters, so the panel's text content is the code either way.
  highlightTypeScript.mockImplementation((code) => Promise.resolve(`<pre><code>${code}</code></pre>`));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('SolutionsPanel when locked', () => {
  it('offers a reveal button and shows no solution content', () => {
    renderPanel(LOCKED);

    expect(revealButton()).toBeInTheDocument();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    for (const solution of SOLUTIONS) {
      expect(screen.queryByText(solution.explanation)).not.toBeInTheDocument();
      expect(screen.queryByText(solution.tradeoffs)).not.toBeInTheDocument();
    }
  });

  it('does not reveal until the dialog is confirmed', async () => {
    const user = userEvent.setup();
    const onReveal = vi.fn<() => void>();
    renderPanel(LOCKED, onReveal);

    await user.click(revealButton());

    const dialog = await screen.findByRole('dialog', { name: 'Reveal the solution?' });
    // Announced with the dialog, not merely present somewhere in it: a warning a screen reader
    // never reaches is not a warning.
    expect(dialog).toHaveAccessibleDescription(/revealing is recorded against this challenge/i);
    // And it names the way back out, which is a promise the app has to keep: clearing deletes the
    // record, and `revealedAt` goes with it. `ChallengePage.test.tsx` holds both halves -- that the
    // panel really does return to locked, and that the control this copy names is on the page.
    expect(dialog).toHaveAccessibleDescription(/clearing your progress/i);
    // Waited for, not asserted outright: the dialog element is in the DOM before Base UI has moved
    // focus into it, and the lazy boundary in front of it widens that gap enough to flake.
    // `contains` rather than `toContainElement`, which will not take `Element | null`.
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true);
    });
    // Opening the warning is not consent. A panel that called `onReveal` straight from the button --
    // or rendered no dialog at all -- fails here rather than at the confirm below. Checked after the
    // wait above, so a stray call has had every chance to land before this says it did not happen.
    expect(onReveal).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Yes, reveal it' }));

    expect(onReveal).toHaveBeenCalledTimes(1);
  });

  it('dismisses the dialog without revealing and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    const onReveal = vi.fn<() => void>();
    renderPanel(LOCKED, onReveal);
    const trigger = revealButton();

    await user.click(trigger);
    await screen.findByRole('dialog', { name: 'Reveal the solution?' });
    await user.click(screen.getByRole('button', { name: 'Keep trying' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
    expect(onReveal).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(trigger).toHaveFocus();
    });
  });
});

describe('SolutionsPanel when unlocked', () => {
  it('frames a solve as other approaches, with no way left to reveal', () => {
    renderPanel(EARNED);

    expect(screen.getByRole('heading', { level: 2, name: 'Other approaches' })).toBeInTheDocument();
    expect(screen.getByText(/solved this one unaided/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reveal solution' })).not.toBeInTheDocument();
    expect(screen.queryByText('revealed')).not.toBeInTheDocument();
  });

  it('frames a reveal as the solution, badged and stated in words', () => {
    renderPanel(REVEALED);

    expect(screen.getByRole('heading', { level: 2, name: 'Solution' })).toBeInTheDocument();
    expect(screen.getByText('revealed')).toBeInTheDocument();
    // The badge is a visual echo. The sentence is what a screen reader reaches in the flow of the
    // panel, so the state does not depend on a stray two-word span being announced.
    expect(screen.getByText(/you revealed this solution/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reveal solution' })).not.toBeInTheDocument();
  });

  it('shows the same solutions whether they were earned or revealed', () => {
    const { unmount } = renderPanel(EARNED);
    const earnedTabs = tabNames();
    unmount();

    renderPanel(REVEALED);
    const revealedTabs = tabNames();

    const labels = SOLUTIONS.map((solution) => solution.label);
    // Both directions matter. Equality alone would hold if the panel rendered one tab in both
    // states; matching the full label list is what fails the moment `earned` filters anything.
    expect(earnedTabs).toEqual(labels);
    expect(revealedTabs).toEqual(labels);
  });

  it('shows the selected solution and reaches the others by keyboard', async () => {
    const user = userEvent.setup();
    renderPanel(EARNED);

    const firstPanel = screen.getByRole('tabpanel');
    await waitFor(() => {
      expect(firstPanel).toHaveTextContent(SOLUTIONS[0]!.code);
    });
    expect(firstPanel).toHaveTextContent(SOLUTIONS[0]!.explanation);
    expect(firstPanel).toHaveTextContent(SOLUTIONS[0]!.tradeoffs);

    await user.tab();
    expect(screen.getAllByRole('tab')[0]).toHaveFocus();
    await user.keyboard('{ArrowRight}{Enter}');

    const secondPanel = await screen.findByRole('tabpanel');
    await waitFor(() => {
      expect(secondPanel).toHaveTextContent(SOLUTIONS[1]!.code);
    });
    expect(secondPanel).toHaveTextContent(SOLUTIONS[1]!.explanation);
    expect(secondPanel).toHaveTextContent(SOLUTIONS[1]!.tradeoffs);
  });
});

describe('SolutionsPanel code highlighting', () => {
  it('swaps in the highlighter output once it resolves', async () => {
    highlightTypeScript.mockImplementation((code) =>
      Promise.resolve(`<pre><code>highlighted by shiki: ${code}</code></pre>`),
    );
    renderPanel(EARNED);

    // Not merely "the code is on screen" -- the plain fallback already satisfies that. The marker
    // is only reachable through the highlighter's own output.
    expect(await screen.findByText(/highlighted by shiki/)).toBeInTheDocument();
  });

  it('keeps the code readable when the highlighter fails to load', async () => {
    highlightTypeScript.mockRejectedValue(new Error('chunk load failed'));
    renderPanel(EARNED);

    await waitFor(() => {
      expect(highlightTypeScript).toHaveBeenCalled();
    });
    expect(screen.getByRole('tabpanel')).toHaveTextContent(SOLUTIONS[0]!.code);
  });
});
