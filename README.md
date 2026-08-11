# DOM Challenges

An interactive app for practising DOM manipulation and Web API work in TypeScript.

You read a challenge, write TypeScript in an embedded Monaco editor, and press **Run**. Your code is type-stripped and
executed inside a live `<iframe>`, then the challenge's own tests are run against the DOM it produced. You get per-test
pass/fail with failure messages, and a preview of the document your code actually built. When you are stuck you can
reveal the reference solutions; when you solve it unaided, the same solutions unlock as a reward.

Most challenges carry more than one accepted solution, each with an explanation and a tradeoff analysis, so the app
teaches _when_ to reach for a technique rather than only _how_.

This is Phase 1: the engine plus one category authored end to end — **Selection & Traversal**, 13 challenges from
novice to expert. Twelve further categories are specified in `docs/superpowers/specs/`.

## Requirements

| Tool | Version                    | How                                                                             |
| ---- | -------------------------- | ------------------------------------------------------------------------------- |
| Node | 24 (`.nvmrc` pins 24.18.0) | `nvm use`, or install Node 24 any way you like                                  |
| pnpm | 11.21.0                    | `corepack enable` — the version is pinned by `packageManager` in `package.json` |

Do not install pnpm globally; corepack reads the pinned version out of `package.json` and uses exactly that.

## Setup

```bash
corepack enable
pnpm install
pnpm seed
```

`pnpm seed` writes `server/db.json`, the json-server database. It is gitignored and not present in a fresh clone, so
this step is required, not optional. Re-running it resets all saved progress back to empty.

## Running

```bash
pnpm dev
```

That starts two processes under `concurrently`:

- the Vite dev server on **http://localhost:5173** — the app (if 5173 is taken, Vite prints the port it chose instead)
- json-server on **http://localhost:4000** — the progress API, serving `/progress`, `/profiles` and `/fixtureRows`

Open the app URL. The API base is `http://localhost:4000` unless you set `VITE_API_URL`.

You can run the API on its own with `pnpm api`. Running Vite alone works too — editor drafts live in `localStorage`, so
you can still write and run code — but nothing is recorded as solved, and there is no on-screen banner telling you why
(see [Known limitations](#known-limitations)).

## Scripts

| Script            | What it does                                                                   |
| ----------------- | ------------------------------------------------------------------------------ |
| `pnpm dev`        | Vite dev server + json-server together                                         |
| `pnpm api`        | json-server alone, on port 4000                                                |
| `pnpm seed`       | Generates `server/db.json` (Faker, fixed seed — reproducible; resets progress) |
| `pnpm test`       | Full Vitest suite, once                                                        |
| `pnpm test:watch` | Vitest in watch mode                                                           |
| `pnpm typecheck`  | `tsc --build` over both projects, app and `server/`                            |
| `pnpm lint`       | oxlint, including the type-aware rules                                         |
| `pnpm build`      | Typechecks, then a production build into `dist/`                               |
| `pnpm preview`    | Serves the built `dist/` locally                                               |
| `pnpm format`     | Prettier over the repo                                                         |

## Using the app

**Dashboard (`/`)** — overall solved count, a bar per difficulty tier, and a card per category. Categories with no
challenges yet say so rather than rendering an empty progress bar.

**Category (`/category/:categoryId`)** — the challenges in one category, easiest first, with a search box, a difficulty
filter, and a "hide solved" switch.

**Challenge (`/challenge/:slug`)** — three panes on a desktop (problem, code, result), and a single column with a
`[Problem | Code | Result]` tab bar below 1024px. The tab you were last on is remembered across reloads.

- **Run** transpiles your code, executes it in a fresh frame per test, and reports each test's outcome. A passing run
  marks the challenge solved.
- **Solved is sticky.** A later failing run counts as another attempt but does not un-solve the challenge. Only
  **Clear** does that.
- **Clear** asks for confirmation, then throws the attempt away: your draft goes back to the starter code and the
  progress record is deleted. It is atomic — if the delete fails, nothing is cleared.
- **Solutions** unlock either by solving or by revealing. Revealing asks for confirmation and is recorded, but a
  learner who reveals sees exactly the same solutions and tradeoffs as one who solved unaided.
- **Resizing the panes.** On a desktop there is a handle between each pair of columns. Drag it, or focus it with Tab
  and use the left and right arrow keys. No pane can be taken below 15% of the row, so a split you save is always one
  you can undo. Below 1024px the columns are stacked behind the tab bar and the handles are not rendered.

Your in-progress code is saved to `localStorage` per challenge as you type, and survives a reload. So does the pane
split. Progress — attempts, solved and revealed state — is saved to json-server.

## Project layout

```
src/
  runner/        the execution engine: transpile, assertions, harness, iframe host
  challenges/    challenge content as typed TypeScript modules, plus the registry
    selection/   Selection & Traversal — one file per challenge
  components/
    browse/      dashboard, category list, filter bar
    challenge/   the challenge workspace: prompt, editor, preview, results, solutions
    layout/      app shell, mobile tabs, route error page
    ui/          shadcn/ui primitives (see AGENTS.md before regenerating any of these)
  hooks/         run flow, progress queries and mutations, media query
  store/         Zustand: editor drafts, filters, pane layout, active mobile tab
  api/           fetch wrapper and the progress endpoints
  lib/           Monaco config, shiki highlighter, progress summary, solution gating
  types/         Challenge and ProgressRecord
  test/          shared test helpers (happy-dom host, Monaco mock)
server/          json-server database and its Faker seed script
docs/            the design spec and the phase plans
```

Challenge content is deliberately **not** in json-server: challenges contain executable test functions, so they live as
TypeScript modules where they are typechecked, unit-tested and reviewable in a diff.

## Adding a challenge

A challenge is one module exporting one `Challenge` object:

```ts
export interface Challenge {
  id: string; // globally unique, conventionally `<category>-<slug>`
  slug: string; // the URL segment, globally unique
  title: string;
  category: CategoryId;
  difficulty: 'novice' | 'intermediate' | 'advanced' | 'expert';
  prompt: string; // markdown, shown to the learner
  html: string; // the starting DOM, parsed into the frame before every test
  starterCode: string; // what the editor opens with; must fail at least one test
  tests: ChallengeTest[]; // hidden from the learner; each gets a fresh document
  solutions: Solution[]; // label + code + explanation + tradeoffs
  concepts: string[];
  relatedIds: string[]; // must resolve to real challenge ids
}
```

Each test receives a `TestContext`: `doc` and `win` (the frame's document and window), `expect`, `exports` and
`fn<T>(name)` for reading a named export off the submitted code, `tick()` for waiting a frame, and `fire` for
dispatching `click`, `input`, `keydown` and `submit`.

To add one:

1. Write `src/challenges/<category>/<name>.ts`, exporting a `Challenge`.
2. Add it to that category's `index.ts` array.
3. Run `pnpm test`.

Registration order matters only as a tiebreak — the registry sorts each category by ascending difficulty, so a
challenge lands in the right place in the ladder without you moving it. There is no per-challenge test wiring to write:
the content suite is generated from the registry, so step 3 checks the new challenge the moment step 2 lands.

`AGENTS.md` carries the authoring rules that are not obvious from the type — in particular the realm rule, which is the
one mistake that passes the test suite and fails in a real browser. Read it before writing tests.

## Testing

```bash
pnpm test
```

341 tests across 32 files. Beyond the usual unit and component coverage, one suite is load-bearing:
`src/challenges/content.test.ts` runs every challenge in the registry through the real harness and proves, per
challenge:

- every reference solution passes **every** test of its own challenge — so a solution cannot rot silently;
- `starterCode` runs cleanly and still **fails at least one** test — so no challenge ships accidentally pre-solved,
  and a starter that merely fails to compile does not pass this check by accident;
- the result count equals the test count — so "nothing failed" cannot mean "nothing ran";
- every solution has a distinct label, an explanation and a tradeoff analysis.

`src/challenges/registry.test.ts` covers the structural invariants: unique ids and slugs, resolvable `relatedIds`, and
the ascending-difficulty ordering within each category.

Under Vitest the harness runs against happy-dom; in the browser it runs against a real iframe. The engine is the same
code either way — that is the point of the host contract described in `AGENTS.md`.

## Known limitations

- **A synchronous infinite loop in submitted code freezes the tab.** The per-test timeout is a promise race, and no
  promise can interrupt a `while (true)` on the same thread. Recovery is closing the tab. Async work is covered by the
  timeout; synchronous work is not, and cannot be without moving execution into a worker.
- **The runner is not a security sandbox.** The frame is same-origin with no `sandbox` attribute, because the harness
  passes live function references across the boundary and reads `contentDocument` directly. What it isolates is the
  DOM — a broken solution cannot corrupt the app shell. Do not paste code you do not trust into it.
- **The pane split moves in whole percentage points.** A drag rounds to the nearest one, so at 1440px the boundary
  snaps in steps of about 14px rather than following the pointer continuously. That is what keeps the three panes
  summing to exactly 100 however long the drag, and keeps the persisted value readable.
- **With json-server down, progress fails quietly.** Editing and running still work, and nothing is destroyed, but
  reads and writes fail with no banner explaining it. The spec calls for one; it is not built yet.
- **`vite build` always prints the 500 kB chunk warning.** It names Monaco's lazily-loaded chunks, which no entry
  references. See `AGENTS.md` for why the limit has not simply been raised.

## License

MIT — see [LICENSE](LICENSE).
