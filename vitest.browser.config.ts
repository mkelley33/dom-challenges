import { fileURLToPath, URL } from 'node:url';

import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/**
 * The one-off Chromium verification pass. Not a second gate; see `AGENTS.md` §1.
 *
 * Disjoint from `vitest.config.ts` **by filename**, both ways round: this config collects only
 * `*.browser.test.ts` and that one excludes exactly that pattern. Neither can silently collect the
 * other's files, which matters because the two run in different engines and a file collected by the
 * wrong one would either fail for reasons that say nothing about the code or -- far worse -- pass in
 * happy-dom while claiming to be a browser reading.
 *
 * No `setupFiles` and no `globals`: the browser suite imports what it uses, and the node setup file
 * installs jest-dom matchers this pass has no use for.
 */
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.browser.test.ts'],
    // Every run rebuilds a document per test and the pass covers the whole shipping library, so a
    // challenge's worth of runs is genuinely slower here than the 5 s default allows. High enough
    // not to fail on honest work, low enough that a hang still ends the run rather than the day.
    testTimeout: 30_000,
    // `provider` takes a factory rather than the string the plan was written against: Vitest 4
    // moved the providers into their own packages (`@vitest/browser-playwright`) and rejects the
    // old spelling outright at startup.
    browser: { enabled: true, provider: playwright(), headless: true, instances: [{ browser: 'chromium' }] },
  },
});
