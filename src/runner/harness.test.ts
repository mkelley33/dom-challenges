import { afterEach, describe, expect, it } from 'vitest';

import { createMemoryHost } from '@/test/createMemoryHost';
import type { Challenge } from '@/types/challenge';

import type { HostHandle } from './harness';
import { runChallenge } from './harness';

/**
 * `runChallenge` leaves host lifecycle to its caller on purpose -- Task 11 keeps the DOM alive to
 * render a preview -- and `createMemoryHost`'s `reset` only closes the *previous* window. So every
 * host built here would otherwise leave one happy-dom window open, and any timers a test
 * registered inside it running, for the rest of the process.
 */
const openHosts: HostHandle[] = [];

function memoryHost(): HostHandle {
  const host = createMemoryHost();
  openHosts.push(host);
  return host;
}

afterEach(() => {
  for (const host of openHosts) host.dispose();
  openHosts.length = 0;
});

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
      memoryHost(),
    );
    expect(result.error).toBeNull();
    expect(result.passed).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.passed).toBe(true);
  });

  it('reports a structured failure when an assertion fails', async () => {
    const result = await runChallenge(makeChallenge(), '// does nothing', memoryHost());
    expect(result.passed).toBe(false);
    expect(result.results[0]?.passed).toBe(false);
    expect(result.results[0]?.detail?.matcher).toBe('toHaveClass');
    expect(result.results[0]?.message).toContain('found');
  });

  it('returns a transpile error without running any test', async () => {
    const result = await runChallenge(makeChallenge(), 'const = = =;', memoryHost());
    expect(result.error?.phase).toBe('transpile');
    expect(result.results).toHaveLength(0);
  });

  it('returns an execute error when the submitted code throws at module scope', async () => {
    const result = await runChallenge(makeChallenge(), 'throw new Error("boom");', memoryHost());
    expect(result.error?.phase).toBe('execute');
    // Submitted code is compiled with the *host's* Function constructor, so this Error is not an
    // instance of the harness realm's Error. `toBe` rather than `toContain` is what pins that the
    // message is read off the object instead of falling back to `String(error)`, which would show
    // the UI "Error: boom" here and a bare "boom" for a same-realm throw.
    expect(result.error?.message).toBe('boom');
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
    const result = await runChallenge(challenge, 'export const double = (n: number): number => n * 2;', memoryHost());
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
    const result = await runChallenge(challenge, '', memoryHost());
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
    const result = await runChallenge(challenge, '', memoryHost());
    expect(result.results[0]?.passed).toBe(false);
    expect(result.results[0]?.message).toContain('timed out');
    // A timeout is not an assertion failure: `detail` must stay null so the UI cannot render a
    // fabricated expected/actual pair for it.
    expect(result.results[0]?.detail).toBeNull();
  });

  it('reports a plain TypeError from a test as a failure with no assertion detail', async () => {
    const challenge = makeChallenge({
      tests: [
        {
          name: 'dereferences the element the learner never created',
          run: ({ doc }) => {
            // The ordinary shape of a failing challenge test: the learner produced nothing, so
            // `getElementById` is null and the test throws before reaching any assertion.
            doc.getElementById('created')!.classList.add('done');
          },
        },
      ],
    });
    const result = await runChallenge(challenge, '// does nothing', memoryHost());
    expect(result.passed).toBe(false);
    expect(result.results[0]?.passed).toBe(false);
    expect(result.results[0]?.detail).toBeNull();
    expect(result.results[0]?.message).toContain('classList');
  });

  it('reports no pass for a challenge that ships without tests', async () => {
    const result = await runChallenge(makeChallenge({ tests: [] }), '', memoryHost());
    // `results.every(...)` is vacuously true on an empty array, so a challenge with no tests
    // would otherwise report PASS for the starter code as loudly as for the solution.
    expect(result.passed).toBe(false);
    expect(result.results).toHaveLength(0);
    expect(result.error).toBeNull();
  });

  it('rejects an import of a module the challenge does not provide', async () => {
    const result = await runChallenge(
      makeChallenge(),
      'import { seven } from "not-provided";\nexport const value = seven;',
      memoryHost(),
    );
    expect(result.error?.phase).toBe('execute');
    // The exact wording matters: without it the learner sees whatever TypeError follows from an
    // undefined module object instead of being told which import is unavailable.
    expect(result.error?.message).toBe('Cannot import "not-provided" in this challenge.');
    expect(result.results).toHaveLength(0);
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
      memoryHost(),
      { modules: { 'fake-mod': { seven: 7 } } },
    );
    expect(result.passed).toBe(true);
  });
});
