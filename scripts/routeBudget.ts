/**
 * Fails the build when a route's eager JavaScript grows past its budget in `./budgets.ts`.
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

import { challengeModuleKeys, routeBudgets } from './budgets.ts';

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = join(ROOT_DIR, 'dist');
const MANIFEST_PATH = join(DIST_DIR, '.vite', 'manifest.json');

/** The manifest key of the HTML entry, whose closure every route pays for. */
const HTML_ENTRY_KEY = 'index.html';

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

/**
 * Fails when a challenge's content stops being fetched on demand.
 *
 * The structural counterpart to the byte budgets, and the one that does not depend on a number
 * anybody can raise -- which matters, because the budgets cannot see this at all: the most
 * expensive challenge module going eager lands at 100% of `/`'s budget and passes.
 *
 * A module reached only through `import()` is emitted as a chunk of its own and appears in the
 * manifest under its source path; a module someone statically imported is folded into whatever
 * imported it and vanishes from the manifest entirely, leaving nothing behind but a slightly larger
 * entry chunk. Reading the expected set from disk rather than from the manifest is what makes the
 * disappearance visible -- and what makes this scale to a hundred challenges with nothing to
 * re-baseline, unlike the challenge count this replaced.
 *
 * A file in a category directory that no index registers fails the same way, since it is absent
 * from the manifest for its own reason. That is deliberate: it is the only thing keeping "every
 * challenge on disk" equal to "every challenge in the index".
 *
 * The second half catches the rarer shape: a chunk that is still emitted but has also been pulled
 * into a route's static import graph, which the manifest reports as an ordinary import.
 */
function assertChallengesAreLazy(manifest: Map<string, ManifestChunk>, eagerScripts: Set<string>): string[] {
  const problems: string[] = [];

  for (const key of challengeModuleKeys()) {
    const chunk = manifest.get(key);
    if (chunk === undefined) {
      // Two causes, and the message names both because the fixes are opposites. A module folded
      // into a static importer and a module nothing imports at all are the same absence here.
      problems.push(
        `"${key}" has no chunk of its own. Either something statically imports it -- challenge content must be reached only through the \`load\` in its category index -- or no index registers it, in which case add the entry or delete the file`,
      );
      continue;
    }
    if (eagerScripts.has(chunk.file)) {
      problems.push(`"${key}" is preloaded by a route, so its content is fetched before anyone opens that challenge`);
    }
  }

  return problems;
}

const manifest = readManifest();
const failures: string[] = [];
const lines: string[] = [];
/** Every script any route pulls in eagerly, pooled so the lazy check can be made once. */
const eagerScripts = new Set<string>();
let stylesheetBytes = 0;

for (const { route, lazyKey, maxBytes } of routeBudgets()) {
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
  for (const script of closure.scripts) eagerScripts.add(script);
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

failures.push(...assertChallengesAreLazy(manifest, eagerScripts));

// Named inline rather than left to the reader. Someone who has just authored a challenge reads
// "/ is 1,234 B over its 380,000 B budget" and the most available fix is a bigger number -- which
// the following line forbids without saying why. Naming what actually moves the number is what
// makes refusing the obvious fix reasonable rather than merely prohibited.
const OVER_BUDGET_GUIDANCE = [
  "`/`'s budget is derived rather than committed: a measured floor, 414 B of ceiling for every",
  'registered challenge, and a fixed 9,500 B of slack (`scripts/budgets.ts`). Authoring is therefore',
  'already paid for, and this line tripping is not a library that grew. It is a challenge that got',
  'more expensive than an index entry, or an import that dragged weight from a lazy route into the',
  'entry. Measure which, rather than editing a constant: `scripts/budgets.test.ts` pins them, so',
  'raising one means editing a test that records a measurement -- which is the friction it is for.',
  '',
  'The two split routes are still literals, and for those a re-baseline is the honest answer to',
  'ordinary growth: roughly every 32 challenges on /category/:categoryId and every 48 on',
  '/challenge/:slug. Deriving them the same way is the better fix and needs their floors measured.',
  '',
  'Do not read any of these numbers as the laziness check. A single challenge module that stopped',
  'being lazy costs between 2,178 B and 9,224 B and fits inside the slack either way -- measured,',
  'with the most expensive one landing at 379,724 B. `assertChallengesAreLazy` is what sees that,',
  'and AGENTS.md §10 describes the shape it is holding.',
  '',
  'For anything else, measure before changing a number: AGENTS.md §7 has the method, and this check is',
  'what it says to use.',
].join('\n');

if (failures.length > 0) {
  process.stdout.write(`Failed:\n${failures.map((failure) => `  - ${failure}`).join('\n')}\n\n`);
  process.stdout.write(`${OVER_BUDGET_GUIDANCE}\n\n`);
  process.exit(1);
}
