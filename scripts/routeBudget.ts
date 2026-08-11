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
 * The headroom on `/` is deliberately less than one challenge's worth. `allChallenges` is eager --
 * see AGENTS.md §10 -- so every challenge authored adds around 15 kB to the landing page, and a
 * budget generous enough to absorb several of them would let the whole category land before anyone
 * noticed. Tripping this is the reminder that the eager-registry refactor is now due, not a
 * suggestion to raise the number.
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

if (failures.length > 0) {
  process.stdout.write(`Over budget:\n${failures.map((failure) => `  - ${failure}`).join('\n')}\n\n`);
  process.stdout.write('Measure before raising a number. AGENTS.md §7 has the method and §10 has the known cause.\n\n');
  process.exit(1);
}
