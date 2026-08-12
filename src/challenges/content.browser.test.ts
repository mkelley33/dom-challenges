import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTick } from '@/runner/context';
import type { HostHandle } from '@/runner/harness';
import { runChallenge } from '@/runner/harness';
import { createIframeHost } from '@/runner/iframeHost';
import type { CategoryId } from '@/types/challenge';

import { loadChallenge } from './loader';
import { challengeIndex } from './registry';

/**
 * A one-off Chromium verification pass over the shipping library. **Not a gate, and not a
 * platform** -- see `AGENTS.md` §1 for when it is run and why it is not in `pnpm test`.
 *
 * `pnpm test` runs every challenge against happy-dom, which proves each one is self-consistent
 * *under happy-dom*. It cannot prove any of them runs in a browser, and `AGENTS.md` §3 lists a
 * dozen places the two engines disagree -- several of them in the direction where the wrong answer
 * is the one this project's own suite accepts. This file discharges §3's "must be run once against
 * a real iframe before they are trusted" for the whole shipping library at once, through the
 * production `createIframeHost` rather than a test-only reimplementation of it.
 *
 * Deliberately narrow: the six shipping categories, the run assertions only. Everything
 * `content.test.ts` checks that is engine-independent -- labels, explanations, tradeoffs, the
 * index/module correspondence -- is already checked there and is not repeated here.
 */
const SHIPPING_CATEGORIES: readonly CategoryId[] = ['selection', 'creation', 'attributes', 'styles', 'events', 'forms'];

const shippingEntries = challengeIndex.filter((entry) => SHIPPING_CATEGORIES.includes(entry.category));
const shippingChallenges = await Promise.all(shippingEntries.map((entry) => loadChallenge(entry)));

let container: HTMLDivElement;
let host: HostHandle;

beforeEach(() => {
  container = document.createElement('div');
  // Real geometry and a real rendering: AGENTS.md §5 -- a non-rendered subtree services no frames,
  // which would make every negative in this file meaningless.
  container.style.cssText = 'width: 400px; height: 300px;';
  document.body.append(container);
  host = createIframeHost(container);
});

afterEach(() => {
  host.dispose();
  container.remove();
});

/**
 * Runs first, and everything below it is worthless until it is green.
 *
 * `createTick` races a frame against `FRAME_FALLBACK_MS` (250ms) so that a document the browser is
 * not rendering degrades to a timer instead of hanging. That escape is what makes a non-rendering
 * environment dangerous here rather than merely broken: every frame-dependent challenge would run
 * its assertions after a *timer*, with the learner's paint-dependent work never having happened, and
 * report green. A false positive wearing a passing suite.
 *
 * So the environment has to prove it renders before any result below is admissible, and per
 * AGENTS.md §5 a probe whose answer is "X never happened" needs a positive control in the same
 * document over the same wait. The control here is a microtask queued **in the frame's own realm**,
 * which fires whether or not anything is being painted -- so "control fired, rAF did not" is a
 * non-rendering document, and "neither fired" is a probe that never ran at all.
 */
describe('the environment renders', () => {
  it('services requestAnimationFrame, with a microtask as the control', async () => {
    const ctx = await host.reset('<div id="probe">probe</div>');
    const log: string[] = [];
    await new Promise<void>((resolve) => {
      ctx.window.queueMicrotask(() => log.push('microtask'));
      ctx.window.requestAnimationFrame(() => {
        log.push('raf');
        resolve();
      });
      setTimeout(resolve, 2000);
    });
    expect(log, 'neither channel fired: this probe never ran').toContain('microtask');
    expect(log, 'control fired but rAF did not: the frame is not being rendered').toContain('raf');
  });

  it('resolves tick() through a real frame rather than through the fallback timer', async () => {
    const ctx = await host.reset('<div id="probe">probe</div>');
    let framesSeen = 0;
    // Registered before `tick()` and in the same document, so it shares the wait: `tick()` resolves
    // either way, and this counter is the only thing that can tell which of its two exits it took.
    ctx.window.requestAnimationFrame(() => {
      framesSeen += 1;
    });

    const startedAt = performance.now();
    await createTick(ctx.window)();
    const elapsedMs = performance.now() - startedAt;

    expect(framesSeen, 'tick() returned without a frame having been serviced').toBe(1);
    // Corroborating, not the claim: two chained hops escaping the timer cost ~500ms, a real pair of
    // frames a fraction of that. Generous enough not to fail a slow first frame (measured tail
    // ~94ms) and still nowhere near a single escape.
    expect(elapsedMs, 'tick() took the fallback exit').toBeLessThan(250);
  });
});

describe('every shipping challenge, in Chromium', () => {
  it('covers the six shipping categories and nothing else', () => {
    // A `describe.each` over an empty list expands to no tests at all, so "nothing failed" and
    // "nothing ran" are the same output. Pin both the count and the category set: a category
    // dropped from the list above would otherwise silently shrink this pass to whatever remained.
    expect(shippingChallenges.length).toBeGreaterThan(0);
    expect([...new Set(shippingChallenges.map((challenge) => challenge.category))].toSorted()).toEqual(
      [...SHIPPING_CATEGORIES].toSorted(),
    );
    expect(shippingChallenges.map((challenge) => challenge.slug)).toEqual(shippingEntries.map((entry) => entry.slug));
  });

  describe.each(shippingChallenges.map((challenge) => [challenge.slug, challenge] as const))(
    '%s',
    (_slug, challenge) => {
      it.each(challenge.solutions.map((solution, index) => [solution.label || `#${index}`, solution] as const))(
        'solution "%s" passes every test',
        async (_label, solution) => {
          const result = await runChallenge(challenge, solution.code, host);
          expect(result.error).toBeNull();
          // A `filter(...)` over an empty `results` is empty, so the emptiness check below is
          // vacuously true for a run that never reached a test. The count is what separates
          // "passed everything" from "ran nothing".
          expect(result.results).toHaveLength(challenge.tests.length);
          expect(result.results.filter((r) => !r.passed).map((r) => `${r.name}: ${r.message ?? ''}`)).toEqual([]);
        },
      );

      it('ships a starter that does not already pass', async () => {
        const result = await runChallenge(challenge, challenge.starterCode, host);
        expect(result.error, `${challenge.slug}: starterCode did not run cleanly`).toBeNull();
        expect(result.results).toHaveLength(challenge.tests.length);
        const failed = result.results.filter((r) => !r.passed);
        expect(failed.length, `${challenge.slug}: starterCode already passes every test`).toBeGreaterThan(0);
      });
    },
  );
});
