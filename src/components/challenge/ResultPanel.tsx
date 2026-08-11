import type { RunResult } from '@/runner/harness';

export interface ResultPanelProps {
  result: RunResult | null;
  isRunning: boolean;
  /**
   * Whether the panel is currently parked off-screen with the preview it rides beside.
   *
   * Only the tab order depends on it. This panel is deliberately *not* made `inert` the way its
   * sibling preview frame is, because an inert live region cannot announce -- and announcing the
   * outcome of a run is the whole job of the thing.
   */
  offScreen?: boolean;
}

function summarise(result: RunResult | null, isRunning: boolean): string {
  if (isRunning) return 'Running tests…';
  if (!result) return 'Not run yet';
  // An error result means the run never reached a test, so there is no score to announce -- "0 of 0
  // tests passing" would read as a verdict on code that was never measured.
  if (result.error) return 'No tests ran';

  const passedCount = result.results.filter((entry) => entry.passed).length;
  return `${String(passedCount)} of ${String(result.results.length)} tests passing`;
}

export function ResultPanel({ result, isRunning, offScreen = false }: ResultPanelProps) {
  return (
    // `tabIndex={-1}` only while parked, and no attribute at all otherwise.
    //
    // Since Chrome 127 a scroll container whose content overflows and which contains nothing
    // focusable becomes keyboard-focusable itself -- which is exactly this element, and which is the
    // only way a keyboard user can scroll a long list of results. Left alone while parked, that is a
    // Tab stop 200vw off-screen with its focus ring drawn where nobody can see it: the same defect
    // as an `aria-hidden` focusable subtree, in the sibling the preview's `inert` deliberately does
    // not cover. Opting out of the sequential order costs nothing here, and hardcoding `-1` would
    // cost the on-screen panel the only keyboard scrolling it has.
    <section
      aria-label="Test results"
      tabIndex={offScreen ? -1 : undefined}
      className="flex min-h-0 flex-col gap-2 overflow-auto p-3"
    >
      {/* `<output>` rather than a div with `aria-live`: it carries the implicit `status` role,
          which is a polite live region, so the run state is announced to a screen reader as it
          changes and is addressable by role rather than by class name. */}
      <output className="block text-sm font-medium">{summarise(result, isRunning)}</output>

      {result?.error && (
        <p className="rounded-md border border-fail/40 bg-fail/10 p-2 text-sm">
          <strong>{result.error.phase === 'transpile' ? 'Could not compile' : 'Code threw before tests ran'}:</strong>{' '}
          {result.error.message}
        </p>
      )}

      <ul className="flex flex-col gap-1">
        {result?.results.map((entry, index) => (
          // Keyed on position as well as name: nothing stops a challenge from giving two tests the
          // same name, and this list is rebuilt wholesale per run and never reordered.
          <li
            key={`${String(index)}:${entry.name}`}
            className={`rounded-md border p-2 text-sm ${entry.passed ? 'border-pass/40' : 'border-fail/40'}`}
          >
            {/* The tick is decorative; the sr-only word beside it is what carries the verdict to a
                screen reader, and it is why colour alone never has to be enough. */}
            <span aria-hidden="true" className={entry.passed ? 'text-pass' : 'text-fail'}>
              {entry.passed ? '✓' : '✗'}
            </span>{' '}
            <span className="sr-only">{entry.passed ? 'Passed:' : 'Failed:'}</span>
            {entry.name}
            {!entry.passed && entry.message !== null && (
              <p className="mt-1 break-words whitespace-pre-wrap text-muted">{entry.message}</p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
