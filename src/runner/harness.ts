import type { Challenge } from '@/types/challenge';

import { createEventHelpers, createTick } from './context';
import type { AssertionFailure } from './expect';
import { AssertionError, expect } from './expect';
import { transpile } from './transpile';

/** A live document plus its window, handed back by a host after each reset. */
export interface HostContext {
  window: Window & typeof globalThis;
  document: Document;
}

/**
 * The only thing the harness knows about where code runs.
 *
 * The browser implements this with a `srcdoc` iframe; Vitest implements it with happy-dom.
 * Keeping it this narrow is what lets both share one code path.
 */
export interface HostHandle {
  reset(html: string): Promise<HostContext>;
  dispose(): void;
}

export interface TestResult {
  name: string;
  passed: boolean;
  message: string | null;
  detail: AssertionFailure | null;
  durationMs: number;
}

export interface RunError {
  phase: 'execute' | 'transpile';
  message: string;
}

export interface RunResult {
  passed: boolean;
  results: TestResult[];
  error: RunError | null;
}

export interface RunOptions {
  modules?: Record<string, unknown>;
}

const DEFAULT_TIMEOUT_MS = 2000;

/**
 * Errors crossing out of the host realm are not instances of *this* realm's `Error`, so the
 * check is structural: `instanceof` would send every error thrown by submitted code down the
 * `String(error)` path and report "Error: boom" where a same-realm throw reports "boom".
 * `String(error)` remains the fallback for values that carry no message at all (`throw 42`),
 * where it still beats "[object Object]".
 */
function messageOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return String(error);
}

function evaluate(
  win: Window & typeof globalThis,
  code: string,
  modules: Record<string, unknown>,
): Record<string, unknown> {
  const moduleObject: { exports: Record<string, unknown> } = { exports: {} };
  const requireShim = (name: string): unknown => {
    if (Object.prototype.hasOwnProperty.call(modules, name)) return modules[name];
    throw new Error(`Cannot import "${name}" in this challenge.`);
  };

  // The host's own Function constructor is used so that `document` and `window` inside
  // the submitted code resolve to the host realm through the scope chain, not the app's.
  const factory = new win.Function('exports', 'module', 'require', code) as (
    exports: Record<string, unknown>,
    module: { exports: Record<string, unknown> },
    require: (name: string) => unknown,
  ) => void;

  factory(moduleObject.exports, moduleObject, requireShim);
  return moduleObject.exports;
}

/**
 * Builds the `ctx.fn` accessor: the single seam where a learner's untyped exports become the
 * typed value a challenge test calls.
 *
 * The assertion is unavoidable -- `exports` is `Record<string, unknown>` because nothing about
 * submitted code is known until it runs -- but it belongs here rather than in the challenge
 * files. Narrowing with `typeof value === 'function'` instead would not help: that widens to
 * `Function`, whose call returns `any`.
 *
 * A missing export throws rather than handing back `undefined`, for the same reason the `require`
 * shim above names the module it cannot supply. `undefined` would surface several frames later as
 * "undefined is not a function" inside a challenge test, pointing the learner at the harness
 * instead of at the `export` keyword they left off.
 */
function createExportAccessor(exports: Record<string, unknown>): <T>(name: string) => T {
  return <T>(name: string): T => {
    const value = exports[name];
    if (value === undefined) {
      const exported = Object.keys(exports);
      const detail =
        exported.length > 0
          ? `It exports: ${exported.join(', ')}.`
          : 'It exports nothing yet — did you forget the `export` keyword?';
      throw new Error(`Your code does not export "${name}". ${detail}`);
    }
    return value as T;
  };
}

async function withTimeout(work: Promise<void>, ms: number, name: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Test "${name}" timed out after ${ms}ms`));
    }, ms);
  });

  try {
    await Promise.race([work, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Runs submitted code against a challenge's tests inside the supplied host.
 *
 * Host-agnostic by design: the browser passes an iframe-backed handle, Vitest passes a
 * happy-dom-backed one, and the content-correctness suite depends on both being identical.
 */
export async function runChallenge(
  challenge: Challenge,
  code: string,
  host: HostHandle,
  options: RunOptions = {},
): Promise<RunResult> {
  const transpiled = transpile(code);
  if (!transpiled.ok) {
    return { passed: false, results: [], error: { phase: 'transpile', message: transpiled.message } };
  }

  const modules = options.modules ?? {};
  const results: TestResult[] = [];

  for (const test of challenge.tests) {
    const startedAt = performance.now();
    // A fresh host per test: no test can observe another's mutations, listeners, or timers.
    const context = await host.reset(challenge.html);

    let exports: Record<string, unknown>;
    try {
      exports = evaluate(context.window, transpiled.code, modules);
    } catch (error) {
      return { passed: false, results, error: { phase: 'execute', message: messageOf(error) } };
    }

    try {
      await withTimeout(
        Promise.resolve(
          test.run({
            doc: context.document,
            win: context.window,
            expect,
            exports,
            fn: createExportAccessor(exports),
            tick: createTick(context.window),
            fire: createEventHelpers(context.window),
          }),
        ),
        test.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        test.name,
      );
      results.push({
        name: test.name,
        passed: true,
        message: null,
        detail: null,
        durationMs: performance.now() - startedAt,
      });
    } catch (error) {
      results.push({
        name: test.name,
        passed: false,
        message: messageOf(error),
        detail: error instanceof AssertionError ? error.detail : null,
        durationMs: performance.now() - startedAt,
      });
    }
  }

  return { passed: results.length > 0 && results.every((result) => result.passed), results, error: null };
}
