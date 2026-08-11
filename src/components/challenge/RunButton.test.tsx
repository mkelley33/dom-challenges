import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { RunButton } from './RunButton';

const LABEL = 'Run tests';

function renderRunButton(isRunning: boolean) {
  const onRun = vi.fn<() => void>();
  const { rerender } = render(<RunButton onRun={onRun} isRunning={isRunning} />);
  return {
    onRun,
    setRunning: (next: boolean) => {
      rerender(<RunButton onRun={onRun} isRunning={next} />);
    },
  };
}

function runButton(): HTMLElement {
  return screen.getByRole('button', { name: LABEL });
}

/** The in-flight motion. Decorative by construction, so it is found by tag rather than by role. */
function spinner(): SVGElement | null {
  return runButton().querySelector('svg');
}

describe('RunButton', () => {
  it('is reachable by keyboard and runs on Enter', async () => {
    const { onRun } = renderRunButton(false);

    await userEvent.tab();
    expect(runButton()).toHaveFocus();
    await userEvent.keyboard('{Enter}');

    expect(onRun).toHaveBeenCalledOnce();
  });

  it('keeps the same accessible name while the run is in flight', () => {
    const { setRunning } = renderRunButton(false);
    expect(runButton()).toBeInTheDocument();

    setRunning(true);

    // The decision this component exists to hold, and the one `ClearButton` already made: a
    // control's accessible name is its identity, and swapping it to "Running…" renames the button
    // under a screen reader at the exact moment the learner is waiting on it -- while saying
    // nothing that `aria-disabled` and the results region's live announcement do not already say.
    // `getByRole` throwing on a missing name is the assertion.
    expect(runButton()).toHaveAttribute('aria-disabled', 'true');
  });

  it('shows motion while running, and nothing at all when idle', () => {
    const { setRunning } = renderRunButton(false);
    // Without this half the test would pass against a button that showed the spinner permanently.
    expect(spinner()).toBeNull();

    setRunning(true);

    // The visible half of the in-flight state, and the reason the label does not have to carry it:
    // an `aria-hidden` icon adds motion without touching the accessible name.
    expect(spinner()).not.toBeNull();
    expect(spinner()).toHaveAttribute('aria-hidden', 'true');
  });

  it('cannot be set off again while a run is in flight, and keeps focus', async () => {
    const { onRun, setRunning } = renderRunButton(false);
    await userEvent.tab();

    setRunning(true);
    await userEvent.click(runButton());

    expect(onRun).not.toHaveBeenCalled();
    // Focusable but inert, for the same reason `ClearButton` is: a plainly `disabled` button cannot
    // hold focus, so a keyboard learner who pressed Enter would be dropped onto <body> by their own
    // successful action.
    expect(runButton()).toHaveFocus();
  });
});
