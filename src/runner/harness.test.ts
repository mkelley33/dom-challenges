import { describe, expect, it } from 'vitest';

import { createMemoryHost } from '@/test/createMemoryHost';
import type { Challenge } from '@/types/challenge';

import { runChallenge } from './harness';

function makeChallenge(overrides: Partial<Challenge> = {}): Challenge {
  return {
    id: 'test-1',
    slug: 'test-1',
    title: 'Test',
    category: 'selection',
    difficulty: 'novice',
    prompt: 'Add the class `found` to #target.',
    html: '<div id="target"></div>',
    starterCode: '',
    tests: [
      {
        name: 'adds the class',
        run: ({ doc, expect: assert }) => {
          assert(doc.getElementById('target')).toHaveClass('found');
        },
      },
    ],
    solutions: [{ label: 'Canonical', code: '', explanation: '', tradeoffs: '' }],
    concepts: [],
    relatedIds: [],
    ...overrides,
  };
}

describe('runChallenge', () => {
  it('reports a pass when the submitted code satisfies the test', async () => {
    const result = await runChallenge(
      makeChallenge(),
      'document.getElementById("target")?.classList.add("found");',
      createMemoryHost(),
    );
    expect(result.error).toBeNull();
    expect(result.passed).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.passed).toBe(true);
  });

  it('reports a structured failure when an assertion fails', async () => {
    const result = await runChallenge(makeChallenge(), '// does nothing', createMemoryHost());
    expect(result.passed).toBe(false);
    expect(result.results[0]?.passed).toBe(false);
    expect(result.results[0]?.detail?.matcher).toBe('toHaveClass');
    expect(result.results[0]?.message).toContain('found');
  });

  it('returns a transpile error without running any test', async () => {
    const result = await runChallenge(makeChallenge(), 'const = = =;', createMemoryHost());
    expect(result.error?.phase).toBe('transpile');
    expect(result.results).toHaveLength(0);
  });

  it('returns an execute error when the submitted code throws at module scope', async () => {
    const result = await runChallenge(makeChallenge(), 'throw new Error("boom");', createMemoryHost());
    expect(result.error?.phase).toBe('execute');
    expect(result.error?.message).toContain('boom');
    // Pins that the throw aborts the run rather than being swallowed into a passing result.
    expect(result.passed).toBe(false);
    expect(result.results).toHaveLength(0);
  });

  it('exposes exported values to the test context', async () => {
    const challenge = makeChallenge({
      tests: [
        {
          name: 'exports double',
          run: ({ exports, expect: assert }) => {
            const double = exports['double'];
            assert(typeof double).toBe('function');
            assert((double as (n: number) => number)(4)).toBe(8);
          },
        },
      ],
    });
    const result = await runChallenge(
      challenge,
      'export const double = (n: number): number => n * 2;',
      createMemoryHost(),
    );
    expect(result.passed).toBe(true);
  });

  it('isolates tests from one another with a fresh dom per test', async () => {
    const challenge = makeChallenge({
      tests: [
        {
          name: 'first mutates',
          run: ({ doc, expect: assert }) => {
            doc.body.append(doc.createElement('span'));
            assert(doc.querySelectorAll('span')).toHaveLength(1);
          },
        },
        {
          name: 'second sees a clean dom',
          run: ({ doc, expect: assert }) => {
            assert(doc.querySelectorAll('span')).toHaveLength(0);
          },
        },
      ],
    });
    const result = await runChallenge(challenge, '', createMemoryHost());
    // `every` on an empty array is vacuously true, so the length and per-test
    // assertions are what make this test fail against a runner that never runs anything.
    expect(result.error).toBeNull();
    expect(result.results).toHaveLength(2);
    expect(result.results[1]?.passed).toBe(true);
    expect(result.results.every((r) => r.passed)).toBe(true);
  });

  it('times out a hanging asynchronous test rather than hanging the suite', async () => {
    const challenge = makeChallenge({
      tests: [{ name: 'hangs', timeoutMs: 30, run: () => new Promise<void>(() => undefined) }],
    });
    const result = await runChallenge(challenge, '', createMemoryHost());
    expect(result.results[0]?.passed).toBe(false);
    expect(result.results[0]?.message).toContain('timed out');
  });

  it('supplies injected modules to require', async () => {
    const challenge = makeChallenge({
      tests: [
        {
          name: 'uses the injected module',
          run: ({ exports, expect: assert }) => {
            assert(exports['value']).toBe(7);
          },
        },
      ],
    });
    const result = await runChallenge(
      challenge,
      'import { seven } from "fake-mod";\nexport const value = seven;',
      createMemoryHost(),
      { modules: { 'fake-mod': { seven: 7 } } },
    );
    expect(result.passed).toBe(true);
  });
});
