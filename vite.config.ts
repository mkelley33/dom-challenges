import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Above Monaco's largest emitted chunk, which is `ts.worker` at ~6,914 kB.
 *
 * Every build warned before this, always about the same lazily-loaded Monaco chunks -- workers and
 * language services no route references and no learner downloads until the editor opens. A build
 * that is permanently red hides the next real regression exactly as thoroughly as a raised limit
 * would, and this branch has already had two bundle claims turn out wrong, so the signal matters
 * more here than usual.
 *
 * The lost signal is replaced rather than dropped: `scripts/routeBudget.ts` runs as the last step
 * of `pnpm build` and fails on what a per-chunk limit was never able to measure -- how much
 * JavaScript a route actually fetches before it can paint. This number's only job is to stop the
 * noise, so it is set by Monaco's chunks and means nothing else. Do not read it as a budget.
 */
const MONACO_CHUNK_HEADROOM_KB = 7500;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    chunkSizeWarningLimit: MONACO_CHUNK_HEADROOM_KB,
    // Written so `scripts/routeBudget.ts` can walk the static-import graph per route instead of
    // parsing `__vite__mapDeps` back out of the emitted entry chunk.
    manifest: true,
  },
});
