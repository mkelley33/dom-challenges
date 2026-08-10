import { describe, expect, it } from 'vitest';

import { runChallenge } from '@/runner/harness';
import { createMemoryHost } from '@/test/createMemoryHost';

import { allChallenges } from './registry';

/**
 * The correctness suite for challenge *content*, driven straight off the registry so that every
 * challenge added from here on is covered without any per-challenge wiring.
 *
 * Two invariants, both of which rot silently without a test:
 *  1. every reference solution still passes every test of its own challenge;
 *  2. every `starterCode` fails at least one test -- otherwise a challenge ships pre-solved and
 *     reads as complete before the learner types anything.
 *
 * Each host is disposed in a `finally`: `runChallenge` leaves host lifecycle to its caller, and
 * `createMemoryHost`'s `reset` only closes the *previous* window, so an undisposed host leaks one
 * happy-dom window (and any timers inside it) per challenge.
 */
describe('challenge content', () => {
  it('has at least one challenge registered', () => {
    // Everything below is generated from `allChallenges`; on an empty registry the `.each` blocks
    // expand to nothing at all and the suite would pass while testing no content whatsoever.
    expect(allChallenges.length).toBeGreaterThan(0);
  });

  describe.each(allChallenges.map((challenge) => [challenge.slug, challenge] as const))('%s', (_slug, challenge) => {
    it.each(challenge.solutions.map((solution, index) => [solution.label || `#${index}`, solution] as const))(
      'solution "%s" passes every test',
      async (_label, solution) => {
        const host = createMemoryHost();
        try {
          const result = await runChallenge(challenge, solution.code, host);
          expect(result.error).toBeNull();
          // A `filter(...)` over an empty `results` is an empty array, so the emptiness check below
          // is vacuously true for a run that never reached a single test. Pinning the count to the
          // number of tests is what separates "passed everything" from "ran nothing".
          expect(result.results).toHaveLength(challenge.tests.length);
          expect(result.results.filter((r) => !r.passed).map((r) => `${r.name}: ${r.message ?? ''}`)).toEqual([]);
        } finally {
          host.dispose();
        }
      },
    );

    it('ships a starter that does not already pass', async () => {
      const host = createMemoryHost();
      try {
        const result = await runChallenge(challenge, challenge.starterCode, host);
        // The starter has to fail *as an unsolved challenge*, not as broken input. A starter that
        // fails to transpile, or throws while loading, produces zero results -- which would satisfy
        // "does not pass" by accident and hide a starter that is genuinely pre-solved.
        expect(result.error, `${challenge.slug}: starterCode did not run cleanly`).toBeNull();
        expect(result.results).toHaveLength(challenge.tests.length);
        const failed = result.results.filter((r) => !r.passed);
        expect(failed.length, `${challenge.slug}: starterCode already passes every test`).toBeGreaterThan(0);
      } finally {
        host.dispose();
      }
    });

    it('documents every solution', () => {
      // Both loops below iterate content that a malformed challenge could leave empty, and an
      // assertion that never runs is an assertion that never fails.
      expect(challenge.tests.length, `${challenge.slug}: ships no tests`).toBeGreaterThan(0);
      expect(challenge.solutions.length, `${challenge.slug}: ships no solutions`).toBeGreaterThan(0);

      for (const solution of challenge.solutions) {
        expect(solution.label.length, `${challenge.slug}: a solution is missing a label`).toBeGreaterThan(0);
        expect(solution.explanation.length, `${challenge.slug}/${solution.label}: no explanation`).toBeGreaterThan(0);
        expect(solution.tradeoffs.length, `${challenge.slug}/${solution.label}: no tradeoffs`).toBeGreaterThan(0);
      }
    });

    it('gives every solution a distinct label', () => {
      const labels = challenge.solutions.map((solution) => solution.label);
      // Not a style rule: `SolutionsPanel` keys both the React list and the Tabs `value` on the
      // label, so a duplicate collides twice over -- one tab silently swallows the other's panel,
      // and the solution behind it becomes unreachable. Content is what has to hold this line,
      // because the panel cannot tell a duplicate from a repeat visit to the same tab.
      expect(labels.length, `${challenge.slug}: ships no solutions`).toBeGreaterThan(0);
      expect(new Set(labels).size, `${challenge.slug}: two solutions share a label`).toBe(labels.length);
    });
  });
});
