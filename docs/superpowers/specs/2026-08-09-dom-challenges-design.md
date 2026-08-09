# DOM Challenges — Design

Date: 2026-08-09
Status: Approved
Branch: `feat/dom-challenges-app`

## 1. Purpose

An interactive web application for practicing JavaScript/TypeScript DOM manipulation
and Web API usage. The user reads a challenge, writes TypeScript in an embedded
editor, runs it against hidden tests, and sees pass/fail results. When stuck, the
user reveals a reference solution with an explanation of why it is correct.

Most challenges carry more than one accepted solution, each with its own tradeoff
analysis, so the app teaches *when* to reach for a technique rather than only *how*.

Audience ranges from novice to expert; challenges are graded across four difficulty
levels and cover both framework-free TypeScript and React.

Success criteria:

- A user can solve, clear, resubmit, and reveal any challenge.
- Progress is tracked per category and persists across reloads.
- Every reference solution provably passes its own tests (CI-enforced).
- The app is usable on a phone and on a desktop.

## 2. Architecture overview

```
┌──────────────── React app (Vite) ────────────────┐
│                                                  │
│  Routes ──► ChallengePage                        │
│               ├─ PromptPanel   (react-markdown)  │
│               ├─ EditorPanel   (Monaco, lazy)    │
│               └─ ResultPanel                     │
│                    ├─ <iframe srcdoc>  ◄── DOM   │
│                    └─ TestResultList             │
│                                                  │
│  Zustand ── editor drafts, filters, UI state     │
│             (persisted to localStorage)          │
│  TanStack Query ── progress (json-server)        │
└──────────────────────────────────────────────────┘
                  │
                  ▼
        json-server  /progress  /profiles
        (seeded by Faker via `pnpm seed`)
```

Challenge content is **not** in json-server. Challenges contain executable test
functions, so they live as typed TypeScript modules under `src/challenges/`, where
they are typechecked, unit-tested, and reviewable in diffs.

## 3. Execution model

### 3.1 Host

Submitted code runs inside a `srcdoc` iframe that is **same-origin** — no `sandbox`
attribute.

The isolation this application needs is **DOM isolation**: a broken solution must not
corrupt the app shell, and each run must start from a pristine DOM. It does *not*
need security isolation, because the only code executing is the user's own, in the
user's own browser, with no server-side effect and no third-party code.

Same-origin is a deliberate choice with a concrete payoff: the harness passes real,
typed function references across the boundary and reads `iframe.contentDocument`
directly. A cross-origin `sandbox="allow-scripts"` frame would force every test
function through `Function.prototype.toString()` serialization, which silently breaks
any closure over module scope and discards type safety at the boundary.

**Accepted limitation:** a same-origin iframe shares the main event loop. A
synchronous `while (true)` in submitted code freezes the tab, and no timeout can
interrupt it. Asynchronous hangs are covered by a per-test timeout. A Web Worker
would remove this hazard but has no DOM, which is the entire subject matter of the
application. This limitation is documented in the UI's help text.

Each run creates a fresh iframe and disposes of the previous one, so no state leaks
between attempts.

### 3.2 Pipeline

```
TypeScript source
  → sucrase.transform(code, { transforms: ['typescript'] })   // strip types only
  → wrap in an async IIFE exposing a controlled `exports` object
  → inject into the fresh iframe
  → run each ChallengeTest against the iframe document
  → collect TestResult[]
```

Monaco supplies inline type diagnostics while editing via its own bundled TypeScript
worker. Sucrase performs transpilation only — it does not typecheck, which is correct
here because the two concerns are deliberately separated: Monaco tells the user about
type errors, and the runner does not block on them (a type error should not prevent
running code, only warn).

`typescript@7` is the native (Go) compiler and is used for `tsc --noEmit` typechecking
of the repo itself. It is not used at runtime in the browser.

### 3.3 DOM-agnostic harness

The harness core takes a `Document` rather than assuming an iframe:

```ts
runChallenge(challenge: Challenge, code: string, host: { document: Document }): Promise<RunResult>
```

The iframe is one host. Vitest with happy-dom is another. This is what makes the
content-correctness suite in §7 possible, and it keeps the harness unit-testable
without a browser.

### 3.4 Test context

Each `ChallengeTest.run` receives:

```ts
interface TestContext {
  doc: Document;                 // the host document
  win: Window & typeof globalThis;
  expect: ExpectFn;              // minimal assertion API
  exports: Readonly<Record<string, unknown>>;  // whatever the solution exported
  tick: () => Promise<void>;     // flush microtasks + one animation frame
  fire: EventHelpers;            // click, input, keydown, submit, drag helpers
}
```

`tick()` exists because a large fraction of these challenges are about scheduling —
MutationObserver callbacks, `requestAnimationFrame`, microtask ordering. Tests need a
reliable way to advance past them without arbitrary sleeps.

`expect` is a small in-house assertion API rather than Vitest's, because assertions
must run inside the browser iframe where Vitest is not present. It produces
structured failures (`{ matcher, expected, actual }`) so the result panel can render
a readable diff.

## 4. Content model

```ts
type CategoryId =
  | 'selection'  | 'creation'  | 'attributes' | 'styles'
  | 'events'     | 'forms'     | 'observers'  | 'async'
  | 'storage'    | 'web-apis'  | 'performance'
  | 'a11y'       | 'react';

type Difficulty = 'novice' | 'intermediate' | 'advanced' | 'expert';

interface Challenge {
  id: string;
  slug: string;
  title: string;
  category: CategoryId;
  difficulty: Difficulty;
  prompt: string;          // markdown
  html: string;            // initial DOM for the host document
  starterCode: string;
  tests: ChallengeTest[];
  solutions: Solution[];   // [0] is canonical; the rest are alternatives
  concepts: string[];      // e.g. ['event delegation', 'AbortController']
  relatedIds: string[];    // cross-links, incl. vanilla <-> React counterparts
}

interface ChallengeTest {
  name: string;
  run: (ctx: TestContext) => void | Promise<void>;
  timeoutMs?: number;      // default 2000
}

interface Solution {
  label: string;           // 'Canonical' | 'Using DocumentFragment' | ...
  code: string;
  explanation: string;     // markdown — why this is correct
  tradeoffs: string;       // markdown — when to prefer it, when to avoid it
}
```

`solutions` being a list is the mechanism that delivers "do it different ways and
explain the tradeoffs". A single insertion challenge, for example, ships *Canonical*,
*DocumentFragment*, and *insertAdjacentHTML* solutions, each with its own reasoning
about reflow cost, XSS exposure, and readability.

`relatedIds` cross-links a vanilla challenge to its React counterpart. React is a
category in its own right *and* a set of cross-references, so the two libraries stay
distinct rather than duplicating one another.

### 4.1 Registry

Each category exports an array of challenges from `src/challenges/<category>/index.ts`.
A root registry composes them, builds lookup maps by `id`, `slug`, and `category`, and
asserts uniqueness at module load. Adding a challenge means adding one file and one
array entry.

## 5. Categories

Approximately eight challenges each, target ~100 total.

| # | Category | Representative coverage |
|---|----------|-------------------------|
| 1 | Selection & Traversal | `querySelector*`, `closest`, `matches`, live vs static collections, `TreeWalker` |
| 2 | Create, Insert & Remove | `createElement`, `DocumentFragment`, `insertAdjacentHTML`, `replaceChildren`, `cloneNode` |
| 3 | Attributes, Properties & Data | attribute vs property, `dataset`, boolean attributes, `toggleAttribute` |
| 4 | Classes, Styles & CSSOM | `classList`, custom properties, `getComputedStyle`, stylesheet manipulation |
| 5 | Events | bubbling/capture, delegation, `CustomEvent`, `AbortController`, passive listeners |
| 6 | Forms & Validation | `FormData`, Constraint Validation API, controlled inputs, `input` vs `change` |
| 7 | Observers | `MutationObserver`, `IntersectionObserver`, `ResizeObserver` |
| 8 | Async & Scheduling | `requestAnimationFrame`, microtasks, `requestIdleCallback`, debounce/throttle |
| 9 | Storage, URL & History | `localStorage`, IndexedDB, `URLSearchParams`, History API |
| 10 | Web APIs | Shadow DOM & custom elements, Clipboard, Canvas, Drag & Drop, `fetch` + abort |
| 11 | Performance | layout thrashing, read/write batching, virtualization, `content-visibility` |
| 12 | Accessibility | focus management, focus traps, ARIA state, roving tabindex, live regions |
| 13 | React | refs, portals, `useSyncExternalStore`, effect cleanup, escape hatches, RHF |

## 6. State and persistence

| Concern | Owner | Notes |
|---------|-------|-------|
| Challenge content | static TS modules | typechecked, unit-tested, in git |
| Progress records | json-server via TanStack Query | optimistic mutations, `/progress` |
| Profile | json-server via TanStack Query | `/profiles`, seeded by Faker |
| Editor drafts | Zustand + `persist` | survives reload; keyed by challenge id |
| Filters, panel layout, theme | Zustand + `persist` | pure UI state |
| Fixture datasets | Faker at seed time | for list/perf challenges needing volume |

```ts
interface ProgressRecord {
  challengeId: string;
  status: 'unattempted' | 'attempted' | 'solved';
  attempts: number;
  solvedAt: string | null;
  revealedAt: string | null;   // spoiler timestamp
  lastCode: string | null;
  updatedAt: string;
}
```

Revealing a solution stamps `revealedAt` but does not mark the challenge solved. The
challenge remains solvable and is badged "revealed" in the UI, so completion stats
stay honest.

`pnpm seed` regenerates `server/db.json` with Faker. That file is gitignored, so the
seed script is the source of truth for its shape.

## 7. Testing strategy

Test-first throughout: each unit below gets a failing test before implementation.

**Unit (Vitest + happy-dom)**

- Transpile wrapper: type stripping, syntax-error surfacing, export capture.
- Assertion API: every matcher, including failure message shape.
- Harness: pass/fail aggregation, per-test timeout, isolation between tests.
- Progress store and query hooks: optimistic update, rollback on error.
- Registry: id/slug uniqueness, category integrity, `relatedIds` all resolve.

**Content correctness (the load-bearing suite)**

For every challenge, for every entry in `solutions`:

1. the solution passes **all** of that challenge's tests, and
2. the `starterCode` fails **at least one** test.

Check 1 guarantees no reference solution is broken — indispensable at ~100
challenges. Check 2 catches challenges that are accidentally pre-solved by their own
starter, which would otherwise ship as a challenge that passes before the user types
anything.

**Component (Vitest + Testing Library)**

Challenge page flow, spoiler confirm gate, clear/resubmit cycle, mobile tab
switching, progress dashboard aggregation.

## 8. UI and responsiveness

**Desktop (≥1024px)** — three resizable panes: prompt, editor, results. Pane sizes
persist in Zustand.

**Mobile (<1024px)** — single column with a segmented control `[Problem | Code |
Result]` and a sticky Run button. Monaco is configured for touch on this breakpoint.

**Key interactions**

- **Run** — transpile, execute, render per-test pass/fail with structured diffs.
- **Clear** — resets the editor to `starterCode` and deletes the progress record,
  behind a confirm dialog.
- **Reveal solution** — confirm-gated; opens a tabbed panel, one tab per `Solution`,
  each showing code, why it is correct, and its tradeoffs.
- **Dashboard** — per-category completion, difficulty breakdown, revealed count.

Monaco loads as a lazy chunk so the dashboard and browse routes are not burdened by
it. Prompts and explanations render through `react-markdown`; code blocks inside them
are highlighted by `shiki`.

Accessibility is a first-class requirement, not only a challenge category: keyboard
operability throughout, visible focus, labelled controls, and results announced via a
live region.

## 9. Stack and additions

Specified: React 19, TypeScript 7, Vite, Vitest, Zustand, TanStack Query, React Hook
Form, json-server, Faker, pnpm 11 via corepack, Node 24, ESLint 9 flat config,
Prettier (120 cols, single quotes, trailing commas), shadcn/ui.

Additions, with justification:

| Package | Why |
|---------|-----|
| `tailwindcss` + shadcn deps | shadcn/ui requires Tailwind |
| `monaco-editor`, `@monaco-editor/react` | editor with inline TS diagnostics |
| `sucrase` | fast browser type-stripping for the runner |
| `react-router` | 100 challenges across 13 categories need deep links |
| `react-markdown`, `remark-gfm` | prompts, explanations, and tradeoffs are markdown |
| `shiki` | static syntax highlighting for solution display |
| `happy-dom` | DOM host for the harness under Vitest |
| `@testing-library/react`, `@testing-library/user-event` | component tests |

Constraints, binding: no `any`, no ESLint disable comments, atomic Conventional
Commits, no AI attribution in commit messages.

## 10. Delivery phases

Each phase ends green — typecheck, lint, and full test suite — and is committed.

- **P1 — Engine + vertical slice.** Tooling, harness, runner, editor, progress,
  routing, shell UI, plus category 1 authored end to end (~12 challenges). The app is
  genuinely usable at the end of this phase, and the content format has been proven
  against real cases before it is mass-produced.
- **P2 — Categories 2–4** — creation, attributes, styles (~22 challenges).
- **P3 — Categories 5–8** — events, forms, observers, async (~30 challenges).
- **P4 — Categories 9–13** — storage, web APIs, performance, a11y, and React parity
  with cross-links (~36 challenges).

Running total: 12 + 22 + 30 + 36 = ~100.
- **P5 — Polish.** Dashboard refinement, a11y audit pass, README.md, CLAUDE.md
  delegating non-Claude-specific detail to AGENTS.md, MIT LICENSE.

Sequencing rationale: if the content format proves wrong, 12 challenges are reworked
rather than 100.

## 11. Risks

| Risk | Mitigation |
|------|-----------|
| Synchronous infinite loop freezes tab | Documented in UI; async timeouts cover the rest |
| Monaco bundle size | Lazy chunk, loaded only on challenge routes |
| Content format churn after bulk authoring | P1 vertical slice validates format first |
| Reference solutions silently rot | Content-correctness suite fails CI (§7) |
| json-server unavailable | Query errors surface as a non-blocking banner; drafts are local, so editing still works |
| Challenge tests coupled to incidental DOM detail | Tests assert on behaviour and structure, not formatting; reviewed per batch |
