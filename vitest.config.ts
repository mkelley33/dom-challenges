import { fileURLToPath, URL } from 'node:url';

import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    // `scripts` as well as `src`: the route budgets are checked by a build script, and the numbers
    // in it went untested for exactly as long as no test in this project could reach that far.
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'scripts/**/*.{test,spec}.ts'],
    // The Chromium pass (`vitest.browser.config.ts`) lives in `src` and would otherwise be
    // collected here, where it would run against happy-dom and report a browser reading it never
    // took. Spread `configDefaults.exclude` rather than spelling the list: writing it by hand drops
    // Vitest's own defaults and starts collecting `node_modules`.
    exclude: [...configDefaults.exclude, 'src/**/*.browser.test.ts'],
  },
});
