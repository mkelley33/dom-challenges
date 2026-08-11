/**
 * Fails the build when a route's eager JavaScript grows past its committed budget.
 *
 * This is the signal `chunkSizeWarningLimit` cannot give. That limit is a single global number
 * compared against one chunk at a time, so on this project it only ever names Monaco's lazy
 * workers -- chunks no route downloads -- while the number that actually matters, how much
 * JavaScript a learner fetches before a route can paint, is not a chunk size at all. It is the
 * closure: the entry chunk, everything `index.html` modulepreloads with it, and for a route behind
 * `React.lazy`, that chunk plus everything Vite preloads alongside it.
 *
 * Two bundle claims on this branch turned out to be wrong for exactly the reason this file exists:
 * `vite build`'s size listing cannot tell a genuinely deferred chunk from one a route statically
 * imports and preloads, and a chunk that "shed 110 kB" had 64 kB of that reappear in files sitting
 * in the same route's preload list.
 *
 * The graph is read from Vite's own build manifest rather than by parsing `__vite__mapDeps` out of
 * the emitted entry chunk. It is the same data -- `imports` is the static edge set the preload
 * helper is generated from -- resolved per route rather than summed whole, which is the mistake
 * that made those earlier claims wrong.
 */
import { readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const MANIFEST_PATH = join(DIST_DIR, '.vite', 'manifest.json');

/** The manifest key of the HTML entry, whose closure every route pays for. */
const HTML_ENTRY_KEY = 'index.html';

interface RouteBudget {
  route: string;
  /** The module a `React.lazy` call reaches for, or `null` when the route is in the entry chunk. */
  lazyKey: string | null;
  maxBytes: number;
}

/**
 * Measured figures plus roughly 2.5%.
 *
 * `/`'s headroom is 12,053 B, which at the measured 6,756 B per challenge (AGENTS.md §10) is a
 * little under two — so this trips on the *second* challenge authored, not the first.
 *
 * That is the backstop, not the guard. This check measures bytes, and bytes are a proxy: the rule
 * is "do not author a second category while the registry is statically imported", and 12 kB freed
 * anywhere at all buys another challenge without anyone going near the registry. The unused `ui/`
 * components and CSS tokens on the Phase 2 list would each do it, as a side effect of cleanup that
 * has nothing to do with challenges. The ungameable half is the pinned count in
 * `src/challenges/registry.test.ts`, which counts challenges rather than bytes and trips on the
 * first one. Keep both; they fail for different reasons and say different things.
 */
const BUDGETS: RouteBudget[] = [
  { route: '/', lazyKey: null, maxBytes: 465_000 },
  { route: '/category/:categoryId', lazyKey: 'src/components/browse/ChallengeList.tsx', maxBytes: 635_000 },
  { route: '/challenge/:slug', lazyKey: 'src/components/challenge/ChallengePage.tsx', maxBytes: 890_000 },
];

interface ManifestChunk {
  file: string;
  /** Static imports only. `dynamicImports` are what this check exists to leave out. */
  imports: string[];
  css: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function stringsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const strings: string[] = [];
  for (const item of value) {
    if (typeof item === 'string') strings.push(item);
  }
  return strings;
}

function readManifest(): Map<string, ManifestChunk> {
  const parsed: unknown = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  if (!isRecord(parsed)) {
    throw new Error(`${MANIFEST_PATH} is not an object -- was it written by a different Vite version?`);
  }

  const chunks = new Map<string, ManifestChunk>();
  for (const [key, value] of Object.entries(parsed)) {
    if (!isRecord(value) || typeof value.file !== 'string') continue;
    chunks.set(key, { file: value.file, imports: stringsOf(value.imports), css: stringsOf(value.css) });
  }
  return chunks;
}

interface Closure {
  scripts: Set<string>;
  stylesheets: Set<string>;
}

/** Every file the browser fetches before `roots` can run: the roots and their static imports. */
function eagerClosure(manifest: Map<string, ManifestChunk>, roots: string[]): Closure {
  const visited = new Set<string>();
  const closure: Closure = { scripts: new Set(), stylesheets: new Set() };
  const pending = [...roots];

  while (pending.length > 0) {
    const key = pending.pop();
    if (key === undefined || visited.has(key)) continue;
    visited.add(key);

    const chunk = manifest.get(key);
    if (chunk === undefined) {
      // Only reachable for a transitive import, since the roots are checked before the walk: a
      // manifest that names a chunk it does not describe is not something to measure around.
      throw new Error(`the build manifest names "${key}" as an import but has no entry for it`);
    }

    closure.scripts.add(chunk.file);
    for (const stylesheet of chunk.css) closure.stylesheets.add(stylesheet);
    for (const staticImport of chunk.imports) pending.push(staticImport);
  }

  return closure;
}

function totalBytes(files: Set<string>): number {
  let bytes = 0;
  for (const file of files) bytes += statSync(join(DIST_DIR, file)).size;
  return bytes;
}

function format(bytes: number): string {
  return bytes.toLocaleString('en-US');
}

const manifest = readManifest();
const failures: string[] = [];
const lines: string[] = [];
let stylesheetBytes = 0;

for (const { route, lazyKey, maxBytes } of BUDGETS) {
  // A split route whose module is no longer a chunk of its own has been folded into whatever
  // imported it -- almost always the entry, by someone replacing a `lazy()` with a plain import.
  // Named here rather than left to show up as an unexplained jump in another route's number,
  // because the number that moves is `/`'s and the file that changed is this route's.
  if (lazyKey !== null && !manifest.has(lazyKey)) {
    failures.push(`${route} is no longer code-split: "${lazyKey}" has no chunk, so its cost moved into the entry`);
  }

  const roots = lazyKey === null ? [HTML_ENTRY_KEY] : [HTML_ENTRY_KEY, lazyKey].filter((key) => manifest.has(key));
  const closure = eagerClosure(manifest, roots);
  const bytes = totalBytes(closure.scripts);
  stylesheetBytes = Math.max(stylesheetBytes, totalBytes(closure.stylesheets));

  const share = Math.round((bytes / maxBytes) * 100);
  lines.push(
    `  ${route.padEnd(22)} ${format(bytes).padStart(9)} B of ${format(maxBytes).padStart(9)} B  ${String(share).padStart(3)}%  (${String(closure.scripts.size)} files)`,
  );
  if (bytes > maxBytes) {
    failures.push(`${route} is ${format(bytes - maxBytes)} B over its ${format(maxBytes)} B budget`);
  }
}

process.stdout.write(`\nRoute-level eager JavaScript -- the entry chunk plus everything preloaded with it\n\n`);
process.stdout.write(`${lines.join('\n')}\n\n`);
// Not budgeted, and not silently dropped either: there is one stylesheet, every route links it, and
// a `<link rel="stylesheet">` is not a module preload -- so it belongs in the report but not in a
// per-route number that would count it three times.
process.stdout.write(`  one shared stylesheet: ${format(stylesheetBytes)} B\n\n`);

// Named inline rather than left to the reader. Someone who has just authored a challenge reads
// "/ is 1,234 B over its 465,000 B budget" and the most available fix is a bigger number -- which
// the following line forbids without saying why. Naming the eager registry is what makes refusing
// the obvious fix reasonable rather than merely prohibited.
const OVER_BUDGET_GUIDANCE = [
  'On `/` the usual cause is the eager registry: `Dashboard` imports every challenge module, so each',
  'challenge authored puts another ~6.8 kB on the first paint of a page that shows only counts and',
  'titles. The fix is the one AGENTS.md §10 describes -- a generated index module plus a per-challenge',
  'dynamic import -- not a bigger number here. `src/challenges/registry.test.ts` pins the same rule by',
  'count, and it trips a challenge earlier than this does.',
  '',
  'For anything else, measure before changing a number: AGENTS.md §7 has the method, and this check is',
  'what it says to use.',
].join('\n');

if (failures.length > 0) {
  process.stdout.write(`Over budget:\n${failures.map((failure) => `  - ${failure}`).join('\n')}\n\n`);
  process.stdout.write(`${OVER_BUDGET_GUIDANCE}\n\n`);
  process.exit(1);
}
