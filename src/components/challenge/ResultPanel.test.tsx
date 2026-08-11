import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { RunResult, TestResult } from '@/runner/harness';

import { ResultPanel } from './ResultPanel';

function testResult(overrides: Partial<TestResult> & Pick<TestResult, 'name' | 'passed'>): TestResult {
  return { message: null, detail: null, durationMs: 1, ...overrides };
}

const compileFailure: RunResult = {
  passed: false,
  results: [],
  error: { phase: 'transpile', message: 'Unexpected token (1:6)' },
};

const threwBeforeTests: RunResult = {
  passed: false,
  results: [],
  error: { phase: 'execute', message: 'boom' },
};

const mixed: RunResult = {
  passed: false,
  error: null,
  results: [
    testResult({ name: 'the target element has the class "found"', passed: true }),
    testResult({
      name: 'exactly one element was marked',
      passed: false,
      message: 'Expected length 1 but received 3',
    }),
  ],
};

function resultsRegion(): HTMLElement {
  return screen.getByRole('region', { name: 'Test results' });
}

describe('ResultPanel', () => {
  it('is keyboard-scrollable while it is on screen', () => {
    render(<ResultPanel result={mixed} isRunning={false} />);

    // No `tabindex` attribute, so Chrome's own rule applies: since Chrome 127 a scroll container
    // whose content overflows and which holds nothing focusable becomes focusable itself, which is
    // the only way a keyboard user can scroll a long list of results at all. Verified in Chrome 151
    // against a plain <div> control: the same element focuses while its content overflows and does
    // not when it stops.
    expect(resultsRegion()).not.toHaveAttribute('tabindex');
  });

  it('takes itself out of the tab order while it is parked off-screen', () => {
    render(<ResultPanel result={mixed} isRunning={false} offScreen />);

    // Otherwise that same Chrome rule puts a Tab stop 200vw to the left, with its focus ring drawn
    // where nobody can see it: the sibling preview is `inert`, but this panel deliberately is not,
    // because an `inert` live region cannot announce. `-1` opts out of the sequential order and
    // leaves programmatic focus -- and the announcement -- untouched.
    expect(resultsRegion()).toHaveAttribute('tabindex', '-1');
  });

  it('still announces its status while parked, which is why it is not inert', () => {
    render(<ResultPanel result={mixed} isRunning={false} offScreen />);

    expect(resultsRegion()).not.toHaveAttribute('inert');
    expect(within(resultsRegion()).getByRole('status')).toHaveTextContent('1 of 2 tests passing');
  });

  it('says nothing has run yet before the first run', () => {
    render(<ResultPanel result={null} isRunning={false} />);

    expect(screen.getByRole('status')).toHaveTextContent('Not run yet');
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('announces that a run is in flight', () => {
    render(<ResultPanel result={null} isRunning />);

    expect(screen.getByRole('status')).toHaveTextContent(/running/i);
    expect(screen.getByRole('status')).not.toHaveTextContent('Not run yet');
  });

  it('summarises how many tests passed and lists every one of them', () => {
    render(<ResultPanel result={mixed} isRunning={false} />);

    expect(screen.getByRole('region', { name: 'Test results' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 of 2 tests passing');

    const items = screen.getAllByRole('listitem');
    // Without the length assertion the per-item checks below would hold vacuously
    // against a panel that rendered no list at all.
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('the target element has the class "found"');
    expect(items[1]).toHaveTextContent('exactly one element was marked');
  });

  it('conveys pass and fail in text, not only by symbol or colour', () => {
    render(<ResultPanel result={mixed} isRunning={false} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);

    const [passing, failing] = items;
    expect(passing).toBeDefined();
    expect(failing).toBeDefined();
    expect(within(passing!).getByText(/passed/i)).toBeInTheDocument();
    expect(within(failing!).getByText(/failed/i)).toBeInTheDocument();
  });

  it('shows the failure message for a failing test and none for a passing one', () => {
    render(<ResultPanel result={mixed} isRunning={false} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);

    expect(items[1]).toHaveTextContent('Expected length 1 but received 3');
    expect(items[0]).not.toHaveTextContent('Expected length 1 but received 3');
  });

  it('does not claim a test count when nothing ran', () => {
    render(<ResultPanel result={compileFailure} isRunning={false} />);

    // "0 of 0 tests passing" above an error reads as a verdict on the learner's code, when in fact
    // no test was ever reached. The paragraph below carries the detail; the summary must not
    // pretend to score a run that never happened.
    expect(screen.getByRole('status')).not.toHaveTextContent('0 of 0 tests passing');
    expect(screen.getByRole('status')).toHaveTextContent(/no tests ran/i);
  });

  it('labels a transpile failure as a compile problem and shows the compiler message', () => {
    render(<ResultPanel result={compileFailure} isRunning={false} />);

    expect(screen.getByText(/could not compile/i)).toBeInTheDocument();
    expect(screen.getByText(/Unexpected token \(1:6\)/)).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('distinguishes code that threw before any test ran from a compile failure', () => {
    render(<ResultPanel result={threwBeforeTests} isRunning={false} />);

    expect(screen.getByText(/threw before tests ran/i)).toBeInTheDocument();
    expect(screen.queryByText(/could not compile/i)).not.toBeInTheDocument();
    expect(screen.getByText(/boom/)).toBeInTheDocument();
  });
});
