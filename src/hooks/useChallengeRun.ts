import type { RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { HostHandle, RunResult } from '@/runner/harness';
import { renderPreview, runChallenge } from '@/runner/harness';
import { createIframeHost, HostDisposedError } from '@/runner/iframeHost';
import { useEditorStore } from '@/store/editorStore';
import type { Challenge } from '@/types/challenge';

import { useSaveProgress, useStoredProgress } from './useProgress';

export interface ChallengeRun {
  result: RunResult | null;
  isRunning: boolean;
  run: (code: string) => Promise<void>;
  reset: (code: string) => Promise<void>;
}

/**
 * Asks the editor store to write its in-memory state back over whatever is in `localStorage`.
 *
 * The preview frame is same-origin with the app and therefore shares its storage area, so submitted
 * code can empty or overwrite `dom-challenges-editor` — which holds every challenge's drafts. The
 * runner detects that and calls this to repair it; see `protectAppStorage`.
 *
 * **Through zustand's own `setState`, never by rebuilding the stored envelope.** `persist` writes
 * after every set, so this reuses the library's serialisation instead of duplicating a format that
 * could drift out of step with it — a hand-built envelope would read as "different" on every check
 * and would overwrite the real value with a malformed one.
 *
 * The set is deliberately identity-preserving: `drafts` comes back as the same reference, so
 * subscribers selecting it do not re-render. Measured at 0.004ms.
 */
function repersistAppState(): void {
  useEditorStore.setState((state) => ({ drafts: state.drafts }));
}

/**
 * Same structural read as the harness's own: an error thrown inside the preview frame belongs to
 * that frame's realm, so `instanceof Error` is false for it and `String(error)` would report
 * "Error: boom" where a same-realm throw reports "boom".
 */
function describeError(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return String(error);
}

/**
 * Owns one challenge's run flow: the preview host, the last result, and the progress write.
 *
 * Two hazards shape the implementation.
 *
 * *Staleness.* Every call to `run` or `reset` takes the next value of a monotonic token. A run
 * writes state -- result, preview, progress -- only while its own token is still the current one,
 * so a run that has been superseded (by another run, by `reset`, or by moving to another
 * challenge) finishes silently instead of landing on top of a newer answer. Runs are also
 * serialised through a promise queue rather than overlapped, because they share one host and
 * every `reset` on it tears the frame down: two runs in flight at once would each destroy the
 * other's document.
 *
 * *Cancellation.* Disposing the host settles any `reset` waiting on the torn-down frame by
 * rejecting it with `HostDisposedError`, which surfaces as a rejection out of `runChallenge`.
 * That is not a failed attempt -- it is the learner navigating away, or React's StrictMode
 * remount -- so it is swallowed: nothing is shown and nothing is recorded.
 *
 * *Losing a solve.* A progress write sends the whole record, not a delta, so it is only safe once
 * the record it is built from is known. See `useStoredProgress`.
 */
export function useChallengeRun(challenge: Challenge, containerRef: RefObject<HTMLDivElement | null>): ChallengeRun {
  const [result, setResult] = useState<RunResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const hostRef = useRef<HostHandle | null>(null);
  const runIdRef = useRef(0);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const readStoredProgress = useStoredProgress(challenge.id);
  const { mutate: writeProgress } = useSaveProgress();

  useEffect(() => {
    setResult(null);
    setIsRunning(false);

    return () => {
      // Taking the token before disposing is what stops a run that was in flight for the
      // challenge being left from writing its verdict onto the challenge being arrived at.
      runIdRef.current += 1;
      hostRef.current?.dispose();
      hostRef.current = null;
    };
  }, [challenge.id]);

  const execute = useCallback(
    async (code: string, runId: number): Promise<void> => {
      const isCurrent = (): boolean => runIdRef.current === runId;
      const stopRunning = (): void => {
        if (isCurrent()) setIsRunning(false);
      };

      const container = containerRef.current;
      if (!container) {
        stopRunning();
        return;
      }

      try {
        // Inside the try, not before it: a throw out here would reject the promise `run` hands
        // back -- which callers `void` -- and leave `isRunning` stuck true with no spinner to stop.
        hostRef.current ??= createIframeHost(container, { repersistAppState });
        const host = hostRef.current;

        const next = await runChallenge(challenge, code, host);
        if (!isCurrent()) return;
        setResult(next);

        // `runChallenge` rebuilds the document before every test, so on return the frame holds
        // whatever the *last* test left behind. One clean render puts the learner's own output
        // back on screen. Its own errors are already in `next`; there is nothing to add here.
        await renderPreview(challenge, code, host);
        if (!isCurrent()) return;

        const stored = await readStoredProgress();
        if (!isCurrent()) return;
        // A run whose prior record never arrived records nothing at all, and says nothing about it:
        // the result the learner is looking at was real, and a progress fetch is not their problem.
        if (stored === null) return;

        const now = new Date().toISOString();
        writeProgress({
          ...stored,
          // Solved is sticky. A failing re-run is an attempt at an already-solved challenge, not a
          // regression of it -- clearing progress is the only thing that un-solves.
          status: next.passed || stored.solvedAt !== null ? 'solved' : 'attempted',
          attempts: stored.attempts + 1,
          // Keep the original solve date: re-running a solved challenge is not a new solve.
          solvedAt: next.passed ? (stored.solvedAt ?? now) : stored.solvedAt,
          lastCode: code,
          updatedAt: now,
        });
      } catch (error) {
        if (error instanceof HostDisposedError) return;
        if (!isCurrent()) return;
        // Anything else is the preview frame itself failing, which the learner still has to see --
        // silently leaving the previous result on screen would read as "my run did nothing".
        setResult({ passed: false, results: [], error: { phase: 'execute', message: describeError(error) } });
      } finally {
        stopRunning();
      }
    },
    [challenge, containerRef, readStoredProgress, writeProgress],
  );

  /** Appends `work` to the serial queue and keeps the queue itself un-rejectable. */
  const enqueue = useCallback((work: () => Promise<void>): Promise<void> => {
    const settled = queueRef.current.then(work);
    queueRef.current = settled.catch(() => undefined);
    return settled;
  }, []);

  const run = useCallback(
    (code: string): Promise<void> => {
      const runId = (runIdRef.current += 1);
      setIsRunning(true);
      return enqueue(() => execute(code, runId));
    },
    [enqueue, execute],
  );

  const reset = useCallback(
    (code: string): Promise<void> => {
      const runId = (runIdRef.current += 1);
      setResult(null);
      setIsRunning(false);

      return enqueue(async () => {
        const host = hostRef.current;
        if (!host) return;
        try {
          await renderPreview(challenge, code, host);
        } catch (error) {
          if (error instanceof HostDisposedError) return;
          if (runIdRef.current !== runId) return;
          setResult({ passed: false, results: [], error: { phase: 'execute', message: describeError(error) } });
        }
      });
    },
    [challenge, enqueue],
  );

  return { result, isRunning, run, reset };
}
