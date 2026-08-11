# DOM Challenges — Phase 1: Engine and Vertical Slice

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete challenge engine — editor, sandbox, test harness, progress tracking, responsive UI — and author the Selection & Traversal category end to end, producing a genuinely usable app that proves the content format before ~88 more challenges are written against it.

**Architecture:** Submitted TypeScript is type-stripped by sucrase, executed inside a fresh same-origin `srcdoc` iframe, and asserted against by a DOM-agnostic harness that accepts any `Document`. That agnosticism lets the identical harness run under Vitest with happy-dom, which is what makes the content-correctness suite possible. Challenges are typed TS modules (they hold executable test functions, so they cannot be JSON); progress is server state in json-server via TanStack Query; editor drafts and UI state are Zustand persisted to localStorage.

**Tech Stack:** React 19.2, TypeScript 7 (native), Vite 8, Vitest 4 + happy-dom, Zustand 5, TanStack Query 5, React Hook Form 7, react-router 8, Tailwind 4 + shadcn/ui, Monaco, sucrase, json-server 1 (beta) + Faker 10, pnpm 11, Node 24.

## Global Constraints

- **No `any`.** Not in src, not in tests, not in config. Use `unknown` plus narrowing.
- **No lint disable comments** (`oxlint-disable`, `eslint-disable`, or any variant). If a rule fires, fix the code or change the rule in `.oxlintrc.json` with a comment explaining why.
- **Conventional Commits**, atomic, one per task minimum. **No AI attribution and no `Co-authored-by` lines.**
- **Prettier:** 120 print width, single quotes, trailing commas (`all`), semicolons.
- **Node 24** (`.nvmrc` pins `v24.18.0`), **pnpm 11** via corepack — already pinned in `package.json`.
- **TDD:** every task writes the failing test first, runs it to watch it fail, then implements.
- Each task ends green on `pnpm typecheck && pnpm lint && pnpm test` before its commit.
- **oxlint, not ESLint.** `typescript-eslint@8` declares `typescript: >=4.8.4 <6.1.0`, so ESLint's type-aware rules are incompatible with TypeScript 7 and no `typescript-eslint@9` exists yet. oxlint has its own parser and no TypeScript peer dependency, so it lints TS 7 sources directly. Type-aware rules come from `oxlint-tsgolint`, which is built on tsgo — the same native compiler as TS 7 — via `oxlint --type-aware`. Verified working: `typescript/no-explicit-any`, `typescript/no-floating-promises`, `react-hooks/exhaustive-deps`, `jsx-a11y/alt-text`, and `import/no-duplicates` all fire correctly.
- **Import sorting** comes from `@ianvs/prettier-plugin-sort-imports` (Prettier does it on format), replacing `eslint-plugin-perfectionist`.
- **Monaco must not load from a CDN.** `@monaco-editor/react` defaults to jsDelivr; Task 12 overrides this with `loader.config({ monaco })` and local workers. An app that breaks without network access is a bug here.
- **Lint overrides list files, never glob a directory.** `.oxlintrc.json` overrides name the exact files their justification covers. A glob over a growing directory — `src/challenges/*/*.ts` most of all — silently disables a check across every file added later.

## Authoring rules for challenge content

Every challenge module and every task that writes one inherits these.

- **Never write `toBeInstanceOf(SomeBareGlobalConstructor)` in challenge test code.** `toBeInstanceOf` resolves the constructor from the realm it is named in. happy-dom shares one class table across windows, so a bare global passes under Vitest — but Task 11 runs challenges inside a real same-origin iframe with its own constructors, where the same assertion fails on correct learner output, and the content suite cannot see it. Take the constructor from the challenge's realm (`ctx.win.HTMLInputElement`), or prefer the structural matchers (`toHaveClass`, `toHaveAttribute`, `toHaveTextContent`, `toHaveLength`), which were made realm-independent for this reason.
- **Read learner exports through `ctx.fn<T>(name)`, never by asserting a type onto `ctx.exports`.** The accessor concentrates the one unavoidable unsound assertion in `harness.ts` and throws a named, useful error when the export is missing.
- **A challenge's tests must make the wrong mental model impossible, not merely undesirable.** If the learner's function owns both the setup and the mutation, no assertion on its return value can tell a correct technique from a lucky one — invert control so the test performs the mutation. The live-vs-static challenge in Task 7 is the worked example.
- **Every `starterCode` must run cleanly and fail a named assertion.** A starter that fails to transpile also "fails a test", which is why the content suite asserts `error === null` and `results.length === tests.length` before it looks at failures.

---

## File Structure

```
.oxlintrc.json  .prettierrc.json  .prettierignore
vite.config.ts  vitest.config.ts  components.json
tsconfig.json  tsconfig.app.json  tsconfig.node.json
index.html

src/
  main.tsx  App.tsx  routes.tsx  index.css
  types/
    challenge.ts        Challenge, ChallengeTest, Solution, TestContext, CategoryId, Difficulty
    progress.ts         ProgressRecord, ProgressStatus
  runner/
    expect.ts           assertion API + AssertionError
    transpile.ts        sucrase wrapper
    context.ts          tick(), fire() event helpers
    harness.ts          runChallenge() — DOM-agnostic
    iframeHost.ts       browser HostHandle
  challenges/
    registry.ts         compose + validate uniqueness and relatedIds
    selection/
      index.ts          category export
      *.ts              one file per challenge
  api/
    client.ts           fetch wrapper for json-server
    progress.ts         query + mutation fns
  store/
    editorStore.ts      Zustand: drafts, filters, layout (persisted)
  hooks/
    useProgress.ts      TanStack Query hooks + optimistic mutation
    useChallengeRun.ts  run orchestration
  components/
    ui/                 shadcn generated primitives
    layout/AppShell.tsx  layout/MobileTabs.tsx
    challenge/ChallengePage.tsx  PromptPanel.tsx  EditorPanel.tsx
    challenge/PreviewFrame.tsx   ResultPanel.tsx  SolutionsPanel.tsx
    browse/Dashboard.tsx  CategoryGrid.tsx  ChallengeList.tsx
  test/
    createMemoryHost.ts happy-dom HostHandle for Vitest
    setup.ts            Vitest setup
server/
  seed.ts               Faker seed -> server/db.json (gitignored)
```

Content authoring note: engine tasks (1–6, 8–16, 18) carry complete code in every step. Content tasks (7, 17) carry complete code for the pattern-setting challenges and full per-challenge requirement specs for the rest — prompt, DOM, what each test asserts, and which alternative solutions to include. Inlining 12 × ~90 lines of finished challenge source into the plan would duplicate the repo, not specify it.

---

### Task 1: Project scaffolding and tooling

**Files:**
- Create: `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `.oxlintrc.json`, `.prettierrc.json`, `.prettierignore`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/test/setup.ts`
- Modify: `package.json`
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `pnpm dev | build | test | typecheck | lint | format` scripts; the `@/*` path alias resolving to `src/*` in both TypeScript and Vite; a Vitest environment of `happy-dom` with globals enabled.

- [ ] **Step 1: Install dependencies**

```bash
corepack enable
pnpm add react react-dom react-router @tanstack/react-query react-hook-form zustand \
  sucrase react-markdown remark-gfm shiki monaco-editor @monaco-editor/react
pnpm add -D typescript@^7 vite @vitejs/plugin-react vitest happy-dom \
  @testing-library/react @testing-library/user-event @testing-library/jest-dom \
  @types/react @types/react-dom @types/node \
  oxlint oxlint-tsgolint \
  prettier @ianvs/prettier-plugin-sort-imports \
  tailwindcss @tailwindcss/vite json-server @faker-js/faker concurrently
```

No ESLint packages. See Global Constraints for why.

- [ ] **Step 2: Write `tsconfig.json` and its project references**

`tsconfig.json`:

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }]
}
```

`tsconfig.app.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vite/client", "vitest/globals"],
    "baseUrl": ".",
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src", "vite.config.ts", "vitest.config.ts"]
}
```

`tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["server"]
}
```

`tsconfig.node.json` covers `server/`, which stays empty until Task 8 creates `server/seed.ts`. TypeScript errors with TS18003 when an `include` matches no files, so **`pnpm typecheck` targets `tsconfig.app.json` directly** (`tsc --noEmit -p tsconfig.app.json`) rather than building the reference graph. Task 8 extends the script to cover `server` once a real file exists there. Do **not** create a placeholder file to work around this — an empty `server/` is the honest state until Task 8.

`noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are deliberate: this codebase indexes into challenge and result arrays constantly, and those two flags are what turn "no `any`" from a slogan into something the compiler enforces.

- [ ] **Step 3: Write `vite.config.ts` and `vitest.config.ts`**

`vite.config.ts`:

```ts
import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
});
```

`vitest.config.ts`:

```ts
import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
```

`src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Write `.oxlintrc.json` and Prettier config**

`.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "ignorePatterns": ["dist", "coverage", "node_modules", "**/node_modules/**", "server/db.json"],
  "plugins": ["typescript", "react", "react-perf", "jsx-a11y", "import", "unicorn", "oxc", "vitest"],
  "categories": {
    "correctness": "error",
    "suspicious": "error",
    "perf": "error"
  },
  "rules": {
    "typescript/no-explicit-any": "error",
    "typescript/consistent-type-imports": "error",
    "typescript/no-floating-promises": "error",
    "typescript/no-misused-promises": "error",
    "react-hooks/rules-of-hooks": "error",
    "react-hooks/exhaustive-deps": "error",
    "react/react-in-jsx-scope": "off"
  },
  "overrides": [
    {
      "files": ["src/runner/**/*.ts"],
      "rules": {
        "no-new-func": "off"
      }
    }
  ]
}
```

`react/react-in-jsx-scope` is off because React 19's automatic JSX runtime needs no import. The `src/runner` override exists because the harness deliberately constructs functions from user-supplied source — that is the product, not a mistake.

`node_modules` is in `ignorePatterns` for a non-obvious reason: under `--type-aware`, oxlint otherwise reports hundreds of `no-unnecessary-type-arguments` errors **from TypeScript's own bundled `lib.dom.d.ts`**, which would make `pnpm lint` fail on a clean checkout. This was reproduced and confirmed. Do not remove that entry.

Verify the type-aware rules actually engage:

```bash
pnpm lint
```

`no-floating-promises` and `no-misused-promises` only fire when `--type-aware` is passed (see the `lint` script in Step 5). If `pnpm lint` reports nothing on code you know has a floating promise, type-aware mode is not active — fix that before moving on rather than assuming it works.

`.prettierrc.json`:

```json
{
  "printWidth": 120,
  "singleQuote": true,
  "trailingComma": "all",
  "semi": true,
  "arrowParens": "always",
  "plugins": ["@ianvs/prettier-plugin-sort-imports"],
  "importOrder": ["<BUILTIN_MODULES>", "<THIRD_PARTY_MODULES>", "^@/(.*)$", "^[./]"],
  "importOrderSeparation": true,
  "importOrderSortSpecifiers": true
}
```

Import ordering is Prettier's job now, applied by `pnpm format`, replacing `eslint-plugin-perfectionist`.

`.prettierignore`:

```
dist
coverage
pnpm-lock.yaml
server/db.json
docs/superpowers
```

- [ ] **Step 5: Write `package.json` scripts**

Merge into the existing `package.json` (keep the `packageManager` field):

```json
{
  "name": "dom-challenges",
  "private": true,
  "type": "module",
  "license": "MIT",
  "engines": { "node": ">=24" },
  "scripts": {
    "dev": "concurrently -n vite,api -c cyan,magenta \"vite\" \"pnpm api\"",
    "api": "json-server server/db.json --port 4000",
    "seed": "node server/seed.ts",
    "build": "pnpm typecheck && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit -p tsconfig.app.json",
    "lint": "oxlint --type-aware",
    "format": "prettier --write ."
  }
}
```

`node server/seed.ts` works without `tsx` because Node 24 strips types natively.

Task 8, which creates the first file under `server/`, must also widen `typecheck` to
`tsc --noEmit -p tsconfig.app.json && tsc --noEmit -p tsconfig.node.json`.

- [ ] **Step 6: Write the failing smoke test**

`src/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('App', () => {
  it('renders the application name', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /dom challenges/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run it and watch it fail**

Run: `pnpm test`
Expected: FAIL — `Failed to resolve import "./App"`.

- [ ] **Step 8: Write the minimal app entry**

`src/index.css`:

```css
@import 'tailwindcss';
```

`src/App.tsx`:

```tsx
export function App() {
  return <h1>DOM Challenges</h1>;
}
```

`src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root not found');

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>DOM Challenges</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 9: Verify everything is green**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: typecheck clean, lint clean, 1 test passing.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore: scaffold vite react typescript project with oxlint prettier and vitest"
```

---

### Task 2: Domain types and the assertion API

**Files:**
- Create: `src/types/challenge.ts`, `src/types/progress.ts`, `src/runner/expect.ts`
- Test: `src/runner/expect.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `CategoryId`, `Difficulty`, `Challenge`, `ChallengeTest`, `Solution`, `TestContext`, `EventHelpers`
  - `ProgressRecord`, `ProgressStatus`
  - `class AssertionError extends Error` with `readonly detail: AssertionFailure`
  - `interface AssertionFailure { matcher: string; expected: unknown; actual: unknown }`
  - `type ExpectFn = (actual: unknown) => Matchers`, and `const expect: ExpectFn`

`expect` is in-house rather than Vitest's because assertions execute inside the browser iframe, where Vitest does not exist. Structured `detail` is what lets the result panel render a real diff instead of a string.

- [ ] **Step 1: Write the domain types**

`src/types/challenge.ts`:

```ts
export type CategoryId =
  | 'selection'
  | 'creation'
  | 'attributes'
  | 'styles'
  | 'events'
  | 'forms'
  | 'observers'
  | 'async'
  | 'storage'
  | 'web-apis'
  | 'performance'
  | 'a11y'
  | 'react';

export type Difficulty = 'novice' | 'intermediate' | 'advanced' | 'expert';

export interface EventHelpers {
  click(target: Element, init?: MouseEventInit): void;
  input(target: HTMLInputElement | HTMLTextAreaElement, value: string): void;
  keydown(target: Element, key: string, init?: KeyboardEventInit): void;
  submit(form: HTMLFormElement): void;
}

export interface TestContext {
  doc: Document;
  win: Window & typeof globalThis;
  expect: (actual: unknown) => Matchers;
  exports: Readonly<Record<string, unknown>>;
  /**
   * Reads a named export from the submitted code as `T`.
   *
   * This is how a challenge test reaches the value the prompt asked the learner to export --
   * typically a function, though `fn` is generic over any export shape. The alternative --
   * asserting a type onto `exports` in the challenge file -- is an unsafe assertion repeated in
   * every one of ~100 challenge modules; here the one unavoidable assertion lives in the harness,
   * at the seam that already owns the boundary with the submitted code.
   *
   * Checks presence, not shape. Throws with a message naming the missing export when the code
   * does not export `name` at all, so a typo fails the test as "you did not export this" rather
   * than as "undefined is not a function". An export that exists but is not callable is not
   * caught here -- it is handed back as `T`, and calling it produces whatever error that mismatch
   * produces.
   */
  fn: <T>(name: string) => T;
  tick: () => Promise<void>;
  fire: EventHelpers;
}

export interface ChallengeTest {
  name: string;
  run: (ctx: TestContext) => void | Promise<void>;
  timeoutMs?: number;
}

export interface Solution {
  label: string;
  code: string;
  explanation: string;
  tradeoffs: string;
}

export interface Challenge {
  id: string;
  slug: string;
  title: string;
  category: CategoryId;
  difficulty: Difficulty;
  prompt: string;
  html: string;
  starterCode: string;
  tests: ChallengeTest[];
  solutions: Solution[];
  concepts: string[];
  relatedIds: string[];
}
```

Import `Matchers` from `@/runner/expect` at the top of this file with `import type { Matchers } from '@/runner/expect';`.

`src/types/progress.ts`:

```ts
export type ProgressStatus = 'unattempted' | 'attempted' | 'solved';

export interface ProgressRecord {
  id: string;
  challengeId: string;
  status: ProgressStatus;
  attempts: number;
  solvedAt: string | null;
  revealedAt: string | null;
  lastCode: string | null;
  updatedAt: string;
}
```

- [ ] **Step 2: Write the failing assertion tests**

`src/runner/expect.test.ts`:

```ts
import { describe, expect as vitestExpect, it } from 'vitest';

import { AssertionError, expect } from './expect';

describe('expect', () => {
  it('passes toBe on identical primitives', () => {
    vitestExpect(() => { expect(3).toBe(3); }).not.toThrow();
  });

  it('throws AssertionError with structured detail on toBe mismatch', () => {
    try {
      expect(3).toBe(4);
      throw new Error('should have thrown');
    } catch (error) {
      vitestExpect(error).toBeInstanceOf(AssertionError);
      vitestExpect((error as AssertionError).detail).toEqual({ matcher: 'toBe', expected: 4, actual: 3 });
    }
  });

  it('deep-compares with toEqual', () => {
    vitestExpect(() => { expect({ a: [1, 2] }).toEqual({ a: [1, 2] }); }).not.toThrow();
    vitestExpect(() => { expect({ a: [1, 2] }).toEqual({ a: [1, 3] }); }).toThrow(AssertionError);
  });

  it('inverts via .not', () => {
    vitestExpect(() => { expect(3).not.toBe(4); }).not.toThrow();
    vitestExpect(() => { expect(3).not.toBe(3); }).toThrow(AssertionError);
  });

  it('reports the negated matcher name in detail', () => {
    try {
      expect(3).not.toBe(3);
      throw new Error('should have thrown');
    } catch (error) {
      vitestExpect((error as AssertionError).detail.matcher).toBe('not.toBe');
    }
  });

  it('supports toHaveLength on arrays and NodeLists', () => {
    vitestExpect(() => { expect([1, 2]).toHaveLength(2); }).not.toThrow();
    vitestExpect(() => { expect([1, 2]).toHaveLength(3); }).toThrow(AssertionError);
  });

  it('supports DOM matchers', () => {
    document.body.innerHTML = '<p id="t" class="a b" data-x="1">hi</p>';
    const el = document.getElementById('t');
    vitestExpect(() => { expect(el).toHaveTextContent('hi'); }).not.toThrow();
    vitestExpect(() => { expect(el).toHaveClass('a'); }).not.toThrow();
    vitestExpect(() => { expect(el).toHaveClass('zzz'); }).toThrow(AssertionError);
    vitestExpect(() => { expect(el).toHaveAttribute('data-x', '1'); }).not.toThrow();
  });

  it('supports toThrow', () => {
    vitestExpect(() => { expect(() => { throw new Error('boom'); }).toThrow(); }).not.toThrow();
    vitestExpect(() => { expect(() => undefined).toThrow(); }).toThrow(AssertionError);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm vitest run src/runner/expect.test.ts`
Expected: FAIL — `Failed to resolve import "./expect"`.

- [ ] **Step 4: Implement `src/runner/expect.ts`**

```ts
export interface AssertionFailure {
  matcher: string;
  expected: unknown;
  actual: unknown;
}

export class AssertionError extends Error {
  readonly detail: AssertionFailure;

  constructor(message: string, detail: AssertionFailure) {
    super(message);
    this.name = 'AssertionError';
    this.detail = detail;
  }
}

export interface Matchers {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toBeNull(): void;
  toBeTruthy(): void;
  toBeFalsy(): void;
  toBeInstanceOf(expected: Function): void;
  toHaveLength(expected: number): void;
  toContain(expected: unknown): void;
  toHaveTextContent(expected: string): void;
  toHaveClass(expected: string): void;
  toHaveAttribute(name: string, value?: string): void;
  toThrow(): void;
  readonly not: Matchers;
}

export type ExpectFn = (actual: unknown) => Matchers;

function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return JSON.stringify(value);
  if (value instanceof Element) return `<${value.tagName.toLowerCase()}>`;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return Object.prototype.toString.call(value);
    }
  }
  return String(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const aKeys = Object.keys(a as Record<string, unknown>);
  const bKeys = Object.keys(b as Record<string, unknown>);
  if (aKeys.length !== bKeys.length) return false;

  return aKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(b, key) &&
      deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}

function lengthOf(value: unknown): number | null {
  if (typeof value === 'string' || Array.isArray(value)) return value.length;
  if (typeof value === 'object' && value !== null && 'length' in value) {
    const { length } = value as { length: unknown };
    return typeof length === 'number' ? length : null;
  }
  return null;
}

function createMatchers(actual: unknown, negated: boolean): Matchers {
  const check = (name: string, passed: boolean, expected: unknown): void => {
    if (passed !== negated) return;
    const matcher = negated ? `not.${name}` : name;
    const verb = negated ? 'not to' : 'to';
    throw new AssertionError(
      `Expected ${describeValue(actual)} ${verb} ${name.replace(/^to/, '').toLowerCase()} ${describeValue(expected)}`,
      { matcher, expected, actual },
    );
  };

  return {
    toBe: (expected) => { check('toBe', Object.is(actual, expected), expected); },
    toEqual: (expected) => { check('toEqual', deepEqual(actual, expected), expected); },
    toBeNull: () => { check('toBeNull', actual === null, null); },
    toBeTruthy: () => { check('toBeTruthy', Boolean(actual), true); },
    toBeFalsy: () => { check('toBeFalsy', !actual, false); },
    toBeInstanceOf: (expected) => {
      check('toBeInstanceOf', actual instanceof (expected as new (...args: never[]) => unknown), expected);
    },
    toHaveLength: (expected) => { check('toHaveLength', lengthOf(actual) === expected, expected); },
    toContain: (expected) => {
      const passed =
        typeof actual === 'string'
          ? actual.includes(String(expected))
          : Array.isArray(actual) && actual.includes(expected);
      check('toContain', passed, expected);
    },
    toHaveTextContent: (expected) => {
      const text = actual instanceof Node ? (actual.textContent ?? '') : '';
      check('toHaveTextContent', text.trim() === expected.trim(), expected);
    },
    toHaveClass: (expected) => {
      const passed = actual instanceof Element && actual.classList.contains(expected);
      check('toHaveClass', passed, expected);
    },
    toHaveAttribute: (name, value) => {
      const present = actual instanceof Element && actual.hasAttribute(name);
      const passed = value === undefined ? present : present && (actual as Element).getAttribute(name) === value;
      check('toHaveAttribute', passed, value === undefined ? name : `${name}="${value}"`);
    },
    toThrow: () => {
      let threw = false;
      if (typeof actual === 'function') {
        try {
          (actual as () => unknown)();
        } catch {
          threw = true;
        }
      }
      check('toThrow', threw, 'to throw');
    },
    get not(): Matchers {
      return createMatchers(actual, !negated);
    },
  };
}

export const expect: ExpectFn = (actual) => createMatchers(actual, false);
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `pnpm vitest run src/runner/expect.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 6: Verify the whole suite is green and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/types src/runner
git commit -m "feat: add domain types and in-house assertion api for the sandbox"
```

---

### Task 3: TypeScript transpiler wrapper

**Files:**
- Create: `src/runner/transpile.ts`
- Test: `src/runner/transpile.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `transpile(source: string): TranspileResult`, where
  `type TranspileResult = { ok: true; code: string } | { ok: false; message: string }`.
  Output is CommonJS — the `imports` transform is what lets the harness capture `module.exports` and inject a `require` shim for React challenges later.

- [ ] **Step 1: Write the failing tests**

`src/runner/transpile.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { transpile } from './transpile';

describe('transpile', () => {
  it('strips type annotations', () => {
    const result = transpile('const n: number = 1; export const double = (x: number): number => x * 2;');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).not.toContain(': number');
  });

  it('converts esm exports to commonjs so the harness can capture them', () => {
    const result = transpile('export function solve() { return 42; }');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).toContain('exports');
  });

  it('accepts code with no exports at all', () => {
    const result = transpile('document.title = "hi";');
    expect(result.ok).toBe(true);
  });

  it('strips interfaces and type-only imports', () => {
    const result = transpile('interface A { x: number }\nconst a: A = { x: 1 };\nconsole.log(a);');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.code).not.toContain('interface A');
  });

  it('returns a failure with a message on a syntax error instead of throwing', () => {
    const result = transpile('const = = =;');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/runner/transpile.test.ts`
Expected: FAIL — `Failed to resolve import "./transpile"`.

- [ ] **Step 3: Implement `src/runner/transpile.ts`**

```ts
import { transform } from 'sucrase';

export type TranspileResult = { ok: true; code: string } | { ok: false; message: string };

/**
 * Strips TypeScript types and lowers ESM syntax to CommonJS.
 *
 * Deliberately does not typecheck: Monaco's own TypeScript worker surfaces type errors
 * inline while editing, and a type error should warn the learner rather than block a run.
 */
export function transpile(source: string): TranspileResult {
  try {
    const { code } = transform(source, {
      transforms: ['typescript', 'imports'],
      preserveDynamicImport: true,
    });
    return { ok: true, code };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) };
  }
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm vitest run src/runner/transpile.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/runner/transpile.ts src/runner/transpile.test.ts
git commit -m "feat: add sucrase transpiler wrapper for submitted typescript"
```

---

### Task 4: Test context helpers

**Files:**
- Create: `src/runner/context.ts`
- Test: `src/runner/context.test.ts`

**Interfaces:**
- Consumes: `EventHelpers` from `@/types/challenge`.
- Produces:
  - `createTick(win: Window & typeof globalThis): () => Promise<void>` — flushes microtasks then one animation frame.
  - `createEventHelpers(win: Window & typeof globalThis): EventHelpers`

`tick()` exists because a large share of these challenges are about scheduling — MutationObserver callbacks, `requestAnimationFrame`, microtask ordering. Tests need a deterministic way past them; arbitrary `setTimeout` sleeps make a suite flaky at 100-challenge scale.

- [ ] **Step 1: Write the failing tests**

`src/runner/context.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { createEventHelpers, createTick } from './context';

describe('createTick', () => {
  it('flushes pending microtasks', async () => {
    const order: string[] = [];
    const tick = createTick(window);
    // Two chained `.then()` hops, not one: a bare `await` on an already-resolved
    // promise (what a no-op `tick()` would give for free) only buys a single
    // microtask turn, so a one-hop chain here would pass even if `tick()` did
    // nothing. Chaining a second hop means only a `tick()` that actually drains
    // the microtask queue can get the callback to run before the assertion.
    void Promise.resolve()
      .then(() => undefined)
      .then(() => order.push('microtask'));
    await tick();
    expect(order).toEqual(['microtask']);
  });

  it('flushes a pending animation frame callback', async () => {
    const order: string[] = [];
    const tick = createTick(window);
    window.requestAnimationFrame(() => order.push('raf'));
    await tick();
    expect(order).toEqual(['raf']);
  });

  it('flushes a pending MutationObserver callback', async () => {
    document.body.innerHTML = '<ul id="list"></ul>';
    const list = document.getElementById('list');
    if (!list) throw new Error('fixture missing');

    let called = 0;
    const observer = new MutationObserver(() => { called += 1; });
    observer.observe(list, { childList: true });

    const tick = createTick(window);
    // Defer the mutation itself by one microtask hop. happy-dom delivers
    // MutationObserver callbacks via a single `queueMicrotask` hop, so mutating
    // synchronously makes the callback observable after exactly the one microtask
    // turn a no-op `tick()` gets for free via `await`. Queuing the mutation turns
    // delivery into a second hop, reachable only by a `tick()` that actually
    // drains the microtask queue before this test resumes.
    void Promise.resolve().then(() => {
      list.append(document.createElement('li'));
    });
    await tick();
    observer.disconnect();
    expect(called).toBe(1);
  });
});

describe('createEventHelpers', () => {
  it('fires a bubbling click', () => {
    document.body.innerHTML = '<div id="parent"><button id="child">go</button></div>';
    const parent = document.getElementById('parent');
    const child = document.getElementById('child');
    if (!parent || !child) throw new Error('fixture missing');

    let seen = 0;
    parent.addEventListener('click', () => { seen += 1; });
    createEventHelpers(window).click(child);
    expect(seen).toBe(1);
  });

  it('sets the value before dispatching input so listeners observe the new value', () => {
    document.body.innerHTML = '<input id="field" />';
    const field = document.getElementById('field');
    if (!(field instanceof HTMLInputElement)) throw new Error('fixture missing');

    const observed: string[] = [];
    field.addEventListener('input', (event) => {
      observed.push((event.target as HTMLInputElement).value);
    });
    createEventHelpers(window).input(field, 'hello');
    expect(observed).toEqual(['hello']);
  });

  it('fires keydown with the given key', () => {
    document.body.innerHTML = '<div id="box" tabindex="0"></div>';
    const box = document.getElementById('box');
    if (!box) throw new Error('fixture missing');

    const keys: string[] = [];
    box.addEventListener('keydown', (event) => { keys.push(event.key); });
    createEventHelpers(window).keydown(box, 'Escape');
    expect(keys).toEqual(['Escape']);
  });

  it('fires a cancelable submit event', () => {
    document.body.innerHTML = '<form id="f"><button type="submit">ok</button></form>';
    const form = document.getElementById('f');
    if (!(form instanceof HTMLFormElement)) throw new Error('fixture missing');

    let submitted = 0;
    form.addEventListener('submit', (event) => { event.preventDefault(); submitted += 1; });
    createEventHelpers(window).submit(form);
    expect(submitted).toBe(1);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/runner/context.test.ts`
Expected: FAIL — `Failed to resolve import "./context"`.

- [ ] **Step 3: Implement `src/runner/context.ts`**

```ts
import type { EventHelpers } from '@/types/challenge';

/**
 * How long to wait for an animation frame before giving up and continuing anyway.
 *
 * Long enough to clear a 60Hz frame (~16ms) several times over on a busy main thread, short
 * enough to stay well inside the harness's per-test budget (`DEFAULT_TIMEOUT_MS`, 2000ms) even
 * when a test ticks repeatedly.
 */
const FRAME_FALLBACK_MS = 50;

/**
 * Returns a function that flushes pending microtasks and then one animation frame.
 *
 * MutationObserver callbacks are delivered as microtasks, so awaiting a resolved promise
 * twice drains them; the rAF hop then covers anything scheduled for the next paint.
 *
 * The frame hop is raced against a timer because animation-frame callbacks run only for
 * documents the browser is *rendering*. Two cases reach a learner: a hidden tab, which stops
 * servicing frames until it is shown again — click Run, switch tabs, and every `tick()` test
 * fails as `Test "..." timed out` — and, permanently, a frame inside a `display: none`
 * container, which is never rendered and so never services a frame at all. **Whatever hosts the
 * preview must keep it rendered rather than hiding it with `display: none`**; the fallback keeps
 * a non-rendered document degrading to a timer instead of hanging, but it cannot make
 * paint-dependent work happen in a document the browser is not painting.
 */
export function createTick(win: Window & typeof globalThis): () => Promise<void> {
  return async function tick(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise<void>((resolve) => {
      let fallback: number | undefined;
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        win.clearTimeout(fallback);
        resolve();
      };

      fallback = win.setTimeout(finish, FRAME_FALLBACK_MS);
      win.requestAnimationFrame(finish);
    });
  };
}

export function createEventHelpers(win: Window & typeof globalThis): EventHelpers {
  return {
    click(target, init) {
      target.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
    },
    input(target, value) {
      target.value = value;
      target.dispatchEvent(new win.Event('input', { bubbles: true }));
    },
    keydown(target, key, init) {
      target.dispatchEvent(new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...init }));
    },
    submit(form) {
      form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
    },
  };
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm vitest run src/runner/context.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/runner/context.ts src/runner/context.test.ts
git commit -m "feat: add tick and event helpers for the test context"
```

---

### Task 5: DOM-agnostic harness and the in-memory host

**Files:**
- Create: `src/runner/harness.ts`, `src/test/createMemoryHost.ts`
- Test: `src/runner/harness.test.ts`

**Interfaces:**
- Consumes: `transpile` (Task 3), `expect`/`AssertionError`/`AssertionFailure` (Task 2), `createTick`/`createEventHelpers` (Task 4), `Challenge` (Task 2).
- Produces:
  - `interface HostContext { window: Window & typeof globalThis; document: Document }`
  - `interface HostHandle { reset(html: string): Promise<HostContext>; dispose(): void }`
  - `interface TestResult { name: string; passed: boolean; message: string | null; detail: AssertionFailure | null; durationMs: number }`
  - `interface RunError { phase: 'transpile' | 'execute'; message: string }`
  - `interface RunResult { passed: boolean; results: TestResult[]; error: RunError | null }`
  - `interface RunOptions { modules?: Record<string, unknown> }`
  - `runChallenge(challenge: Challenge, code: string, host: HostHandle, options?: RunOptions): Promise<RunResult>`
  - `createMemoryHost(): HostHandle` (test-only, from `@/test/createMemoryHost`)

This is the load-bearing abstraction of the whole application. Because `runChallenge` takes a `HostHandle` rather than reaching for an iframe itself, the identical code path serves the browser (Task 11) and Vitest (Task 7's content suite). If this leaks a browser assumption, the content suite becomes impossible.

Each test gets a **fresh host** — the DOM is rebuilt and the submitted code re-executed per test — so one test cannot observe another's mutations, listeners, or timers.

`createMemoryHost` lives under `src/test/` rather than `src/runner/` on purpose: it imports `happy-dom`, a devDependency, and nothing reachable from `main.tsx` may import it.

- [ ] **Step 1: Write the failing tests**

`src/runner/harness.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { createMemoryHost } from '@/test/createMemoryHost';
import type { Challenge } from '@/types/challenge';

import { runChallenge } from './harness';

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
      createMemoryHost(),
    );
    expect(result.error).toBeNull();
    expect(result.passed).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.passed).toBe(true);
  });

  it('reports a structured failure when an assertion fails', async () => {
    const result = await runChallenge(makeChallenge(), '// does nothing', createMemoryHost());
    expect(result.passed).toBe(false);
    expect(result.results[0]?.passed).toBe(false);
    expect(result.results[0]?.detail?.matcher).toBe('toHaveClass');
    expect(result.results[0]?.message).toContain('found');
  });

  it('returns a transpile error without running any test', async () => {
    const result = await runChallenge(makeChallenge(), 'const = = =;', createMemoryHost());
    expect(result.error?.phase).toBe('transpile');
    expect(result.results).toHaveLength(0);
  });

  it('returns an execute error when the submitted code throws at module scope', async () => {
    const result = await runChallenge(makeChallenge(), 'throw new Error("boom");', createMemoryHost());
    expect(result.error?.phase).toBe('execute');
    expect(result.error?.message).toContain('boom');
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
    const result = await runChallenge(challenge, 'export const double = (n: number): number => n * 2;', createMemoryHost());
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
    const result = await runChallenge(challenge, '', createMemoryHost());
    expect(result.results.every((r) => r.passed)).toBe(true);
  });

  it('times out a hanging asynchronous test rather than hanging the suite', async () => {
    const challenge = makeChallenge({
      tests: [{ name: 'hangs', timeoutMs: 30, run: () => new Promise<void>(() => undefined) }],
    });
    const result = await runChallenge(challenge, '', createMemoryHost());
    expect(result.results[0]?.passed).toBe(false);
    expect(result.results[0]?.message).toContain('timed out');
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
      createMemoryHost(),
      { modules: { 'fake-mod': { seven: 7 } } },
    );
    expect(result.passed).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/runner/harness.test.ts`
Expected: FAIL — `Failed to resolve import "./harness"`.

- [ ] **Step 3: Implement `src/test/createMemoryHost.ts`**

```ts
import { Window } from 'happy-dom';

import type { HostContext, HostHandle } from '@/runner/harness';

/**
 * A HostHandle backed by happy-dom, for running the harness under Vitest.
 *
 * happy-dom's Window is structurally close to but not identical with lib.dom's Window,
 * so the returned context is cast through `unknown`. The casts are confined to this file.
 */
export function createMemoryHost(): HostHandle {
  let current: Window | null = null;

  return {
    reset(html: string): Promise<HostContext> {
      current?.close();
      const win = new Window({ url: 'https://challenges.local/' });
      win.document.body.innerHTML = html;
      current = win;
      return Promise.resolve({
        window: win as unknown as Window & typeof globalThis,
        document: win.document as unknown as Document,
      });
    },
    dispose(): void {
      current?.close();
      current = null;
    },
  };
}
```

- [ ] **Step 4: Implement `src/runner/harness.ts`**

```ts
import type { Challenge } from '@/types/challenge';

import { createEventHelpers, createTick } from './context';
import type { AssertionFailure } from './expect';
import { AssertionError, expect } from './expect';
import { transpile } from './transpile';

export interface HostContext {
  window: Window & typeof globalThis;
  document: Document;
}

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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function evaluate(
  win: Window & typeof globalThis,
  code: string,
  modules: Record<string, unknown>,
): Record<string, unknown> {
  const moduleObject = { exports: {} as Record<string, unknown> };
  const requireShim = (name: string): unknown => {
    if (Object.prototype.hasOwnProperty.call(modules, name)) return modules[name];
    throw new Error(`Cannot import "${name}" in this challenge.`);
  };

  // The iframe's own Function constructor is used so that `document` and `window` inside
  // the submitted code resolve to the host frame through the scope chain, not the app's.
  const factory = new win.Function('exports', 'module', 'require', code) as (
    exports: Record<string, unknown>,
    module: { exports: Record<string, unknown> },
    require: (name: string) => unknown,
  ) => void;

  factory(moduleObject.exports, moduleObject, requireShim);
  return moduleObject.exports;
}

async function withTimeout(work: Promise<void>, ms: number, name: string): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(new Error(`Test "${name}" timed out after ${ms}ms`)); }, ms);
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
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `pnpm vitest run src/runner/harness.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 6: Verify green and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/runner/harness.ts src/runner/harness.test.ts src/test/createMemoryHost.ts
git commit -m "feat: add dom-agnostic challenge harness with per-test isolation"
```

---

### Task 6: Challenge registry and validation

**Files:**
- Create: `src/challenges/registry.ts`, `src/challenges/selection/index.ts`
- Test: `src/challenges/registry.test.ts`

**Interfaces:**
- Consumes: `Challenge`, `CategoryId` (Task 2).
- Produces:
  - `allChallenges: readonly Challenge[]`
  - `challengeById(id: string): Challenge | undefined`
  - `challengeBySlug(slug: string): Challenge | undefined`
  - `challengesInCategory(category: CategoryId): Challenge[]`
  - `validateRegistry(challenges: readonly Challenge[]): string[]` — returns human-readable problems, empty when sound
  - `CATEGORY_META: Record<CategoryId, { title: string; blurb: string }>`

`validateRegistry` returns problems rather than throwing, so a test can assert on the full list at once instead of failing on the first. At ~100 challenges, duplicate slugs and dangling `relatedIds` are the realistic failure modes, and both are silent bugs without this.

- [ ] **Step 1: Write the failing tests**

`src/challenges/registry.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { Challenge } from '@/types/challenge';

import { allChallenges, challengeById, challengeBySlug, challengesInCategory, validateRegistry } from './registry';

function stub(overrides: Partial<Challenge>): Challenge {
  return {
    id: 'a',
    slug: 'a',
    title: 'A',
    category: 'selection',
    difficulty: 'novice',
    prompt: 'p',
    html: '<div></div>',
    starterCode: '',
    tests: [{ name: 't', run: () => undefined }],
    solutions: [{ label: 'Canonical', code: '', explanation: 'e', tradeoffs: 't' }],
    concepts: [],
    relatedIds: [],
    ...overrides,
  };
}

describe('validateRegistry', () => {
  it('reports no problems for a sound registry', () => {
    expect(validateRegistry([stub({ id: 'a', slug: 'a' }), stub({ id: 'b', slug: 'b' })])).toEqual([]);
  });

  it('reports duplicate ids', () => {
    const problems = validateRegistry([stub({ id: 'a', slug: 'a' }), stub({ id: 'a', slug: 'b' })]);
    expect(problems.join(' ')).toContain('duplicate id');
  });

  it('reports duplicate slugs', () => {
    const problems = validateRegistry([stub({ id: 'a', slug: 'same' }), stub({ id: 'b', slug: 'same' })]);
    expect(problems.join(' ')).toContain('duplicate slug');
  });

  it('reports relatedIds that point at nothing', () => {
    const problems = validateRegistry([stub({ id: 'a', slug: 'a', relatedIds: ['ghost'] })]);
    expect(problems.join(' ')).toContain('ghost');
  });

  it('does not report relatedIds that resolve to a real challenge in the same list', () => {
    const problems = validateRegistry([stub({ id: 'a', slug: 'a', relatedIds: ['b'] }), stub({ id: 'b', slug: 'b' })]);
    expect(problems).toEqual([]);
  });

  it('reports a challenge with no tests', () => {
    const problems = validateRegistry([stub({ id: 'a', slug: 'a', tests: [] })]);
    expect(problems.join(' ')).toContain('no tests');
  });

  it('reports a challenge with no solutions', () => {
    const problems = validateRegistry([stub({ id: 'a', slug: 'a', solutions: [] })]);
    expect(problems.join(' ')).toContain('no solutions');
  });
});

describe('the real registry', () => {
  it('is valid', () => {
    expect(validateRegistry(allChallenges)).toEqual([]);
  });

  it('returns undefined for an unknown slug', () => {
    expect(challengeBySlug('no-such-slug')).toBeUndefined();
  });

  it('returns undefined for an unknown id', () => {
    expect(challengeById('no-such-id')).toBeUndefined();
  });

  it('filters by category', () => {
    expect(challengesInCategory('selection').every((c) => c.category === 'selection')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/challenges/registry.test.ts`
Expected: FAIL — `Failed to resolve import "./registry"`.

- [ ] **Step 3: Create the empty category barrel**

`src/challenges/selection/index.ts`:

```ts
import type { Challenge } from '@/types/challenge';

export const selectionChallenges: Challenge[] = [];
```

- [ ] **Step 4: Implement `src/challenges/registry.ts`**

```ts
import type { CategoryId, Challenge } from '@/types/challenge';

import { selectionChallenges } from './selection';

export const CATEGORY_META: Record<CategoryId, { title: string; blurb: string }> = {
  selection: { title: 'Selection & Traversal', blurb: 'Finding elements and walking the tree.' },
  creation: { title: 'Create, Insert & Remove', blurb: 'Building and placing nodes efficiently.' },
  attributes: { title: 'Attributes, Properties & Data', blurb: 'The attribute/property split and datasets.' },
  styles: { title: 'Classes, Styles & CSSOM', blurb: 'classList, custom properties, computed styles.' },
  events: { title: 'Events', blurb: 'Propagation, delegation, custom events, AbortController.' },
  forms: { title: 'Forms & Validation', blurb: 'FormData and the Constraint Validation API.' },
  observers: { title: 'Observers', blurb: 'Mutation, Intersection, and Resize observers.' },
  async: { title: 'Async & Scheduling', blurb: 'Frames, microtasks, idle callbacks, throttling.' },
  storage: { title: 'Storage, URL & History', blurb: 'localStorage, IndexedDB, URL and History APIs.' },
  'web-apis': { title: 'Web APIs', blurb: 'Shadow DOM, Clipboard, Canvas, Drag & Drop, fetch.' },
  performance: { title: 'Performance', blurb: 'Layout thrashing, batching, virtualization.' },
  a11y: { title: 'Accessibility', blurb: 'Focus management, ARIA state, keyboard navigation.' },
  react: { title: 'React', blurb: 'The same problems, solved the React way.' },
};

export const allChallenges: readonly Challenge[] = [...selectionChallenges];

const byId = new Map(allChallenges.map((challenge) => [challenge.id, challenge]));
const bySlug = new Map(allChallenges.map((challenge) => [challenge.slug, challenge]));

export function challengeById(id: string): Challenge | undefined {
  return byId.get(id);
}

export function challengeBySlug(slug: string): Challenge | undefined {
  return bySlug.get(slug);
}

export function challengesInCategory(category: CategoryId): Challenge[] {
  return allChallenges.filter((challenge) => challenge.category === category);
}

export function validateRegistry(challenges: readonly Challenge[]): string[] {
  const problems: string[] = [];
  const seenIds = new Set<string>();
  const seenSlugs = new Set<string>();
  const knownIds = new Set(challenges.map((challenge) => challenge.id));

  for (const challenge of challenges) {
    const label = `${challenge.category}/${challenge.slug}`;

    if (seenIds.has(challenge.id)) problems.push(`${label}: duplicate id "${challenge.id}"`);
    seenIds.add(challenge.id);

    if (seenSlugs.has(challenge.slug)) problems.push(`${label}: duplicate slug "${challenge.slug}"`);
    seenSlugs.add(challenge.slug);

    if (challenge.tests.length === 0) problems.push(`${label}: has no tests`);
    if (challenge.solutions.length === 0) problems.push(`${label}: has no solutions`);

    for (const relatedId of challenge.relatedIds) {
      if (!knownIds.has(relatedId)) problems.push(`${label}: relatedIds points at unknown challenge "${relatedId}"`);
    }
  }

  return problems;
}
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `pnpm vitest run src/challenges/registry.test.ts`
Expected: PASS — 9 tests.

Every assertion here holds against an empty registry: `validateRegistry([])` returns no problems, `challengesInCategory` returns an empty array whose `.every()` is vacuously true, and the unknown-slug lookup returns `undefined`. A positive slug-lookup test would fail until Task 7 registers a challenge, so it belongs there, not here.

- [ ] **Step 6: Commit**

```bash
git add src/challenges
git commit -m "feat: add challenge registry with structural validation"
```

---

### Task 7: First three challenges and the content-correctness suite

**Files:**
- Create: `src/challenges/selection/queryBasics.ts`, `src/challenges/selection/closestRow.ts`, `src/challenges/selection/liveVsStatic.ts`
- Modify: `src/challenges/selection/index.ts`
- Test: `src/challenges/content.test.ts`

**Interfaces:**
- Consumes: `Challenge` (Task 2), `runChallenge` (Task 5), `createMemoryHost` (Task 5), `allChallenges` (Task 6).
- Produces: three named `Challenge` exports (`queryBasics`, `closestRow`, `liveVsStatic`) collected into `selectionChallenges`, and a generic suite that automatically covers every challenge added from here on — no per-challenge test wiring, in Phase 1 or in any later phase.

This is the task that proves the content format. Three challenges is the minimum that exercises all of it: no exports (challenge 1), a single exported function (challenge 2), and an exported function whose whole point is a subtle DOM behaviour (challenge 3).

The suite enforces two invariants for **every** challenge in the registry:

1. Every entry in `solutions` passes **all** of that challenge's tests. Without this, reference solutions rot silently, and at ~100 challenges nobody will notice until a learner does.
2. `starterCode` fails **at least one** test. Without this, a challenge that is accidentally pre-solved by its own starter ships as a challenge that passes before the user types anything.

- [ ] **Step 1: Write the failing content-correctness suite**

`src/challenges/content.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { runChallenge } from '@/runner/harness';
import { createMemoryHost } from '@/test/createMemoryHost';

import { allChallenges } from './registry';

/**
 * The correctness suite for challenge *content*, driven straight off the registry so that every
 * challenge added from here on is covered without any per-challenge wiring.
 *
 * Two invariants, both of which rot silently without a test:
 *  1. every reference solution still passes every test of its own challenge;
 *  2. every `starterCode` fails at least one test -- otherwise a challenge ships pre-solved and
 *     reads as complete before the learner types anything.
 *
 * Each host is disposed in a `finally`: `runChallenge` leaves host lifecycle to its caller, and
 * `createMemoryHost`'s `reset` only closes the *previous* window, so an undisposed host leaks one
 * happy-dom window (and any timers inside it) per challenge.
 */
describe('challenge content', () => {
  it('has at least one challenge registered', () => {
    // Everything below is generated from `allChallenges`; on an empty registry the `.each` blocks
    // expand to nothing at all and the suite would pass while testing no content whatsoever.
    expect(allChallenges.length).toBeGreaterThan(0);
  });

  describe.each(allChallenges.map((challenge) => [challenge.slug, challenge] as const))('%s', (_slug, challenge) => {
    it.each(challenge.solutions.map((solution, index) => [solution.label || `#${index}`, solution] as const))(
      'solution "%s" passes every test',
      async (_label, solution) => {
        const host = createMemoryHost();
        try {
          const result = await runChallenge(challenge, solution.code, host);
          expect(result.error).toBeNull();
          // A `filter(...)` over an empty `results` is an empty array, so the emptiness check below
          // is vacuously true for a run that never reached a single test. Pinning the count to the
          // number of tests is what separates "passed everything" from "ran nothing".
          expect(result.results).toHaveLength(challenge.tests.length);
          expect(result.results.filter((r) => !r.passed).map((r) => `${r.name}: ${r.message ?? ''}`)).toEqual([]);
        } finally {
          host.dispose();
        }
      },
    );

    it('ships a starter that does not already pass', async () => {
      const host = createMemoryHost();
      try {
        const result = await runChallenge(challenge, challenge.starterCode, host);
        // The starter has to fail *as an unsolved challenge*, not as broken input. A starter that
        // fails to transpile, or throws while loading, produces zero results -- which would satisfy
        // "does not pass" by accident and hide a starter that is genuinely pre-solved.
        expect(result.error, `${challenge.slug}: starterCode did not run cleanly`).toBeNull();
        expect(result.results).toHaveLength(challenge.tests.length);
        const failed = result.results.filter((r) => !r.passed);
        expect(failed.length, `${challenge.slug}: starterCode already passes every test`).toBeGreaterThan(0);
      } finally {
        host.dispose();
      }
    });

    it('documents every solution', () => {
      // Both loops below iterate content that a malformed challenge could leave empty, and an
      // assertion that never runs is an assertion that never fails.
      expect(challenge.tests.length, `${challenge.slug}: ships no tests`).toBeGreaterThan(0);
      expect(challenge.solutions.length, `${challenge.slug}: ships no solutions`).toBeGreaterThan(0);

      for (const solution of challenge.solutions) {
        expect(solution.label.length, `${challenge.slug}: a solution is missing a label`).toBeGreaterThan(0);
        expect(solution.explanation.length, `${challenge.slug}/${solution.label}: no explanation`).toBeGreaterThan(0);
        expect(solution.tradeoffs.length, `${challenge.slug}/${solution.label}: no tradeoffs`).toBeGreaterThan(0);
      }
    });
  });
});
```

The starter half is the load-bearing invariant here, and it is easy to get wrong. `result.error !== null`
for a starter that fails to *transpile*, so the naive check — `error === null && results.every(passed)` —
is `false` for a starter of `const = = =;` and reports success while proving nothing. Assert the starter
ran cleanly first (`error` is null, `results.length === tests.length`), and only then that at least one
test failed. Every iteration is length-guarded for the same reason: `.every()` and an empty
`filter(...).toEqual([])` are both vacuously true over an empty array.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/challenges/content.test.ts`
Expected: FAIL — "has at least one challenge registered" fails because `allChallenges` is still empty.

- [ ] **Step 3: Write challenge 1 in full — `src/challenges/selection/queryBasics.ts`**

```ts
import type { Challenge } from '@/types/challenge';

export const queryBasics: Challenge = {
  id: 'selection-query-basics',
  slug: 'query-basics',
  title: 'Find one element and mark it',
  category: 'selection',
  difficulty: 'novice',
  concepts: ['getElementById', 'querySelector', 'classList'],
  relatedIds: [],
  prompt: [
    'The menu below has three items. One of them has the id `target`.',
    '',
    'Add the class `found` to that element — **without disturbing the classes it already has**.',
  ].join('\n'),
  html: [
    '<ul id="menu">',
    '  <li class="item">Home</li>',
    '  <li class="item" id="target">Docs</li>',
    '  <li class="item">About</li>',
    '</ul>',
  ].join('\n'),
  starterCode: '// Add the class "found" to the element with id "target".\n',
  tests: [
    {
      name: 'the target element has the class "found"',
      run: ({ doc, expect }) => {
        expect(doc.getElementById('target')).toHaveClass('found');
      },
    },
    {
      name: 'exactly one element was marked',
      run: ({ doc, expect }) => {
        expect(doc.querySelectorAll('.found')).toHaveLength(1);
      },
    },
    {
      name: 'the original "item" class is preserved',
      run: ({ doc, expect }) => {
        expect(doc.getElementById('target')).toHaveClass('item');
      },
    },
  ],
  solutions: [
    {
      label: 'getElementById',
      code: [
        'const target = document.getElementById("target");',
        'target?.classList.add("found");',
      ].join('\n'),
      explanation: [
        '`getElementById` is the most direct route to a unique element. It returns',
        '`HTMLElement | null`, so the optional chain is not defensive noise — it is the',
        'type system insisting you handle the case where the id is absent.',
        '',
        '`classList.add` appends to the existing token list. That is what keeps `item`',
        'intact, and it is the reason the third test exists.',
      ].join('\n'),
      tradeoffs: [
        'Fastest and clearest when you have an id. It is not scoped — it always searches the',
        'whole document, never a subtree — so it is unusable inside a component that must only',
        'look within itself. It also cannot express anything but an id.',
      ].join('\n'),
    },
    {
      label: 'querySelector',
      code: [
        'const target = document.querySelector("#target");',
        'target?.classList.add("found");',
      ].join('\n'),
      explanation: [
        '`querySelector` takes any CSS selector and returns the first match. Using one API',
        'for ids, classes, attributes, and structural selectors keeps calling code uniform.',
      ].join('\n'),
      tradeoffs: [
        'More flexible and scopable — `container.querySelector(...)` searches only that subtree,',
        'which `getElementById` cannot do. Marginally slower for a plain id lookup, though never',
        'enough to matter outside a hot loop. The real cost is that selector typos fail silently',
        'as `null` rather than as an error.',
      ].join('\n'),
    },
  ],
};
```

Note the deliberate trap in test 3: `target.className = 'found'` satisfies tests 1 and 2 and fails test 3. The novice mistake is caught by the content, not by prose.

- [ ] **Step 4: Write challenge 2 — `src/challenges/selection/closestRow.ts`**

Same `Challenge` shape. Fixed values:

- `id: 'selection-closest-row'`, `slug: 'closest-row'`, `difficulty: 'intermediate'`
- `title: 'Walk up to the containing row'`
- `concepts: ['closest', 'parentElement', 'matches', 'event delegation']`
- `prompt`: explains that a click lands on a `<td>` but the handler needs the `<tr>`, and asks the learner to export `findRow`.
- `html`:

```html
<table id="grid">
  <tbody>
    <tr id="row-1"><td><span id="cell-a">A1</span></td><td>B1</td></tr>
    <tr id="row-2"><td><span id="cell-b">A2</span></td><td>B2</td></tr>
  </tbody>
</table>
<p id="outside">not in the table</p>
```

- `starterCode`:

```ts
export function findRow(start: Element): HTMLElement | null {
  return null;
}
```

- `tests` (write exactly these):

```ts
tests: [
  {
    name: 'finds the row from a deeply nested cell',
    run: ({ doc, exports, expect }) => {
      const findRow = exports['findRow'] as (start: Element) => HTMLElement | null;
      const cell = doc.getElementById('cell-b');
      expect(cell).not.toBeNull();
      if (!cell) return;
      expect(findRow(cell)?.id).toBe('row-2');
    },
  },
  {
    name: 'returns the element itself when it is already a row',
    run: ({ doc, exports, expect }) => {
      const findRow = exports['findRow'] as (start: Element) => HTMLElement | null;
      const row = doc.getElementById('row-1');
      expect(row).not.toBeNull();
      if (!row) return;
      expect(findRow(row)?.id).toBe('row-1');
    },
  },
  {
    name: 'returns null when there is no row above the element',
    run: ({ doc, exports, expect }) => {
      const findRow = exports['findRow'] as (start: Element) => HTMLElement | null;
      const outside = doc.getElementById('outside');
      expect(outside).not.toBeNull();
      if (!outside) return;
      expect(findRow(outside)).toBeNull();
    },
  },
],
```

- `solutions` — three, each with a full `explanation` and `tradeoffs`:

```ts
// 1. label: 'closest'
export function findRow(start: Element): HTMLElement | null {
  return start.closest('tr');
}

// 2. label: 'Manual parent walk'
export function findRow(start: Element): HTMLElement | null {
  let node: Element | null = start;
  while (node) {
    if (node.tagName === 'TR') return node as HTMLElement;
    node = node.parentElement;
  }
  return null;
}

// 3. label: 'matches loop'
export function findRow(start: Element): HTMLElement | null {
  let node: Element | null = start;
  while (node && !node.matches('tr')) node = node.parentElement;
  return node as HTMLElement | null;
}
```

Explanation and tradeoff points each solution must make:
- **closest** — starts at the element *itself*, not its parent (that is test 2's whole purpose), walks native, returns `null` at the root, accepts any selector. Preferred in real code; the entire body of a delegated handler.
- **Manual parent walk** — shows what `closest` does; `parentElement` stops at the document root while `parentNode` would climb into the document node, a classic off-by-one. Verbose and tag-only, so it does not generalise to `.row[data-id]`.
- **matches loop** — restores selector generality but is easy to get wrong: forgetting to test `start` first breaks test 2, and forgetting the `node &&` guard throws at the root.

- [ ] **Step 5: Write challenge 3 — `src/challenges/selection/liveVsStatic.ts`**

- `id: 'selection-live-vs-static'`, `slug: 'live-vs-static'`, `difficulty: 'advanced'`
- `title: 'Live collections versus static lists'`
- `concepts: ['HTMLCollection', 'NodeList', 'getElementsByClassName', 'querySelectorAll']`
- `html`: `<ul id="list"><li class="row">1</li><li class="row">2</li></ul>`

**Control is inverted deliberately: the learner exports `capture()` and the *test* appends the row.**
An earlier draft had the learner export a `measure()` that captured the collections, appended the row,
and returned four counts. It was solvable without ever calling `getElementsByClassName` — re-querying
the document for `liveAfter` passed every test, so the challenge's entire subject was skippable and the
content suite could not tell. When the learner's function owns both the capture and the mutation, no
assertion on its return value can distinguish a standing live query from a re-query. Appending in the
test means the third row does not exist until `capture()` has already returned, so the only way `live`
can count it is by being live.

Write the file exactly as follows:

```ts
import type { Challenge } from '@/types/challenge';

/**
 * The shape `capture()` hands back.
 *
 * Deliberately `ArrayLike` rather than `HTMLCollection`/`NodeList`: the tests distinguish the two
 * by behaviour, never by type or by `instanceof`. A learner who returns `list.children` and a
 * spread copy has understood the same thing, and typing the contract by what it does rather than
 * by which API produced it is also what keeps the assertions realm-safe.
 */
interface Captured {
  live: ArrayLike<Element>;
  snapshot: ArrayLike<Element>;
}

/**
 * The mutation belongs to the test, not to the learner.
 *
 * If `capture()` owned both the capture and the append, no assertion on its return value could
 * tell a standing live query from a re-query performed afterwards -- the challenge's whole subject
 * would be skippable. Appending here means the row does not exist until `capture()` has already
 * returned, so the only way `live` can count it is by being live.
 */
function appendRow(doc: Document): void {
  const list = doc.getElementById('list');
  if (!list) throw new Error('#list is missing from the challenge markup');
  const row = doc.createElement('li');
  row.className = 'row';
  list.append(row);
}

export const liveVsStatic: Challenge = {
  id: 'selection-live-vs-static',
  slug: 'live-vs-static',
  title: 'Live collections versus static lists',
  category: 'selection',
  difficulty: 'advanced',
  concepts: ['HTMLCollection', 'NodeList', 'getElementsByClassName', 'querySelectorAll'],
  relatedIds: ['selection-query-basics'],
  prompt: [
    'The list below holds two `.row` items. Not every DOM query hands back the same kind of result:',
    'one kind keeps tracking the document as it changes, the other is a snapshot of the instant it',
    'was taken.',
    '',
    'Export a function `capture()` that returns both kinds of `.row` collection, and changes nothing:',
    '',
    '- `live` — a collection that keeps tracking the document, so a `.row` added *after* `capture()`',
    '  has returned is counted by it;',
    '- `snapshot` — a collection fixed at the moment `capture()` ran, which later changes leave alone.',
    '',
    'Return `{ live, snapshot }`.',
    '',
    'The test does the mutating: it calls `capture()`, appends one more `<li class="row">` to `#list`,',
    'and only then reads `length` from the two collections you handed back. Re-querying the document',
    'is not available to you — by the time the third row exists, your function has already returned.',
  ].join('\n'),
  html: '<ul id="list"><li class="row">1</li><li class="row">2</li></ul>',
  starterCode: [
    'export interface Captured {',
    '  live: ArrayLike<Element>;',
    '  snapshot: ArrayLike<Element>;',
    '}',
    '',
    'export function capture(): Captured {',
    '  return { live: [], snapshot: [] };',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'both collections start with the two rows already in the list',
      run: ({ fn, expect }) => {
        const { live, snapshot } = fn<() => Captured>('capture')();
        expect(live).toHaveLength(2);
        expect(snapshot).toHaveLength(2);
      },
    },
    {
      name: 'the live collection counts a row appended after capture() returned',
      run: ({ doc, fn, expect }) => {
        const { live } = fn<() => Captured>('capture')();
        appendRow(doc);
        expect(live).toHaveLength(3);
      },
    },
    {
      name: 'the snapshot ignores a row appended after capture() returned',
      run: ({ doc, fn, expect }) => {
        const { snapshot } = fn<() => Captured>('capture')();
        appendRow(doc);
        expect(snapshot).toHaveLength(2);
      },
    },
  ],
  solutions: [
    {
      label: 'Live HTMLCollection versus static NodeList',
      code: [
        'export interface Captured {',
        '  live: HTMLCollectionOf<Element>;',
        '  snapshot: NodeListOf<Element>;',
        '}',
        '',
        'export function capture(): Captured {',
        '  return {',
        "    live: document.getElementsByClassName('row'),",
        "    snapshot: document.querySelectorAll('.row'),",
        '  };',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'Both queries run at the same instant, against the same two-row document, and `capture()`',
        'returns before the third row exists. Yet one of the two values notices it and the other never',
        'does. The difference is in what each query returns.',
        '',
        '`getElementsByClassName` returns a live `HTMLCollection`. It is not an array of the elements',
        'that matched; it is a standing query against the document. Every property access re-consults',
        'the tree, so `live.length` answers "how many `.row` elements are in the document *right now*"',
        'and reports 3 once the test has appended — even though nothing re-ran your function. The same',
        'is true of `getElementsByTagName`, `document.forms`, `document.images`, and `element.children`;',
        "returning `document.getElementById('list')!.children` here would pass the same tests.",
        '',
        '`querySelectorAll` returns a static `NodeList` — the matches are resolved once, at call time,',
        'and the list never changes again. It reports 2 both times because it is a snapshot of a',
        'document that had two rows. (`element.childNodes` is the exception that spoils the neat rule:',
        'it is a `NodeList`, but a live one.)',
        '',
        'Neither is more correct. The bug is holding one while thinking you hold the other — which is',
        'why the test, not your code, appends the row: a value you can only re-query is a value whose',
        'liveness you never actually tested.',
      ].join('\n'),
      tradeoffs: [
        'Reach for the live collection when you genuinely want a standing answer — a count you read',
        'occasionally and want current, without re-querying — exactly what the test does with `live`.',
        'Reach for `querySelectorAll` for anything you are about to iterate, which is nearly always.',
        '',
        'The reason is that iterating a live collection while mutating the document is a trap:',
        '',
        '- `for (let i = 0; i < live.length; i++)` that appends a matching element in the body never',
        '  terminates. Each append grows `live.length`, and the bound is re-read on every iteration, so',
        '  the loop chases a finish line it keeps moving.',
        '- Removing elements in the same loop is the quieter bug: `live[0]` is dropped from the',
        '  collection the moment it leaves the document, every later element shifts down one index, and',
        '  `i++` then steps past the element that moved into the slot. You silently process half of',
        '  them. Iterating backwards, or snapshotting first, avoids it.',
        '',
        'Ergonomics push the same way. `NodeList` has `forEach`. `HTMLCollection` has no `forEach` and',
        'no array methods at all — indexing and `length` are the whole API. Both are spreadable, so',
        '`Array.from(live)` or `[...live]` gets you to `map` and `filter`; note that the conversion is',
        'also what turns a live collection into a snapshot, which is usually what the code wanted in',
        'the first place.',
      ].join('\n'),
    },
  ],
};
```

- [ ] **Step 6: Register the three challenges**

`src/challenges/selection/index.ts`:

```ts
import type { Challenge } from '@/types/challenge';

import { closestRow } from './closestRow';
import { liveVsStatic } from './liveVsStatic';
import { queryBasics } from './queryBasics';

export const selectionChallenges: Challenge[] = [queryBasics, closestRow, liveVsStatic];
```

- [ ] **Step 7: Add the positive slug lookup to the registry test**

Now that the registry is non-empty, add to the `the real registry` block in `src/challenges/registry.test.ts`:

```ts
it('looks up a registered challenge by slug', () => {
  expect(challengeBySlug('query-basics')?.id).toBe('selection-query-basics');
});
```

- [ ] **Step 8: Run the suite and verify it passes**

Run: `pnpm vitest run src/challenges`
Expected: PASS — registry validation green, and for each of the three challenges: every solution passes, the starter fails, and all solutions are documented.

If a starter accidentally passes, the failure message names the slug. Fix the starter, not the test.

- [ ] **Step 9: Verify green and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/challenges
git commit -m "feat: add first three selection challenges with content correctness suite"
```

---

### Task 8: json-server, Faker seed, API client, and progress hooks

**Files:**
- Create: `server/seed.ts`, `src/api/client.ts`, `src/api/progress.ts`, `src/hooks/useProgress.ts`
- Modify: `src/main.tsx` (wrap in `QueryClientProvider`)
- Test: `src/api/progress.test.ts`, `src/hooks/useProgress.test.tsx`

**Interfaces:**
- Consumes: `ProgressRecord`, `ProgressStatus` (Task 2).
- Produces:
  - `API_BASE_URL: string` and `apiFetch<T>(path: string, init?: RequestInit): Promise<T>`
  - `fetchAllProgress(): Promise<ProgressRecord[]>`
  - `saveProgress(record: ProgressRecord): Promise<ProgressRecord>` — POST when new, PATCH when it exists
  - `useProgressQuery(): UseQueryResult<ProgressRecord[]>`
  - `useSaveProgress(): UseMutationResult<...>` with optimistic cache update and rollback
  - `useChallengeProgress(challengeId: string): ProgressRecord` — always returns a record, synthesising an `unattempted` default so consumers never branch on `undefined`

`useChallengeProgress` returning a synthesised default rather than `undefined` is deliberate: every consumer in Tasks 13–16 would otherwise repeat the same null check, and the "no record yet" and "unattempted record" cases are identical to the UI.

- [ ] **Step 1: Write the Faker seed script**

`server/seed.ts`:

```ts
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { faker } from '@faker-js/faker';

interface SeedProfile {
  id: string;
  displayName: string;
  createdAt: string;
}

interface SeedFixtureRow {
  id: string;
  name: string;
  email: string;
  role: string;
}

faker.seed(20260809);

const profile: SeedProfile = {
  id: 'local',
  displayName: faker.person.firstName(),
  createdAt: new Date('2026-08-09T00:00:00.000Z').toISOString(),
};

// Fixture rows back the list-rendering and performance challenges in later phases,
// where a challenge needs realistic volume rather than three hand-written <li>s.
const fixtureRows: SeedFixtureRow[] = Array.from({ length: 500 }, () => ({
  id: faker.string.uuid(),
  name: faker.person.fullName(),
  email: faker.internet.email(),
  role: faker.helpers.arrayElement(['admin', 'editor', 'viewer']),
}));

const db = { profiles: [profile], progress: [], fixtureRows };

const outputPath = join(dirname(fileURLToPath(import.meta.url)), 'db.json');
writeFileSync(outputPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
process.stdout.write(`Seeded ${outputPath} with ${String(fixtureRows.length)} fixture rows\n`);
```

`faker.seed(...)` makes the seed reproducible — regenerating `db.json` should not produce a spurious diff for anyone comparing environments. `progress` starts empty so a first run reflects a real beginner's state.

- [ ] **Step 2: Run the seed and start the API**

```bash
pnpm seed
pnpm api
```

Expected: `server/db.json` written (gitignored), json-server listening on port 4000. Verify with `curl -s http://localhost:4000/profiles`.

- [ ] **Step 3: Write the failing API tests**

`src/api/progress.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProgressRecord } from '@/types/progress';

import { fetchAllProgress, saveProgress } from './progress';

const record: ProgressRecord = {
  id: 'p1',
  challengeId: 'selection-query-basics',
  status: 'solved',
  attempts: 2,
  solvedAt: '2026-08-09T10:00:00.000Z',
  revealedAt: null,
  lastCode: 'x',
  updatedAt: '2026-08-09T10:00:00.000Z',
};

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchAllProgress', () => {
  it('returns the parsed list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([record]), { status: 200 })));
    await expect(fetchAllProgress()).resolves.toEqual([record]);
  });

  it('throws with the status when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 500 })));
    await expect(fetchAllProgress()).rejects.toThrow('500');
  });
});

describe('saveProgress', () => {
  it('patches when the record already exists', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([record]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(record), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await saveProgress(record);

    const secondCall = fetchMock.mock.calls[1];
    expect(secondCall?.[1]).toMatchObject({ method: 'PATCH' });
  });

  it('posts when the record is new', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(record), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);

    await saveProgress(record);

    const secondCall = fetchMock.mock.calls[1];
    expect(secondCall?.[1]).toMatchObject({ method: 'POST' });
  });
});
```

- [ ] **Step 4: Run it and watch it fail**

Run: `pnpm vitest run src/api/progress.test.ts`
Expected: FAIL — `Failed to resolve import "./progress"`.

- [ ] **Step 5: Implement `src/api/client.ts`**

```ts
export const API_BASE_URL = import.meta.env['VITE_API_URL'] ?? 'http://localhost:4000';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });

  if (!response.ok) {
    throw new ApiError(response.status, `Request to ${path} failed with ${String(response.status)}`);
  }

  return (await response.json()) as T;
}
```

- [ ] **Step 6: Implement `src/api/progress.ts`**

```ts
import type { ProgressRecord } from '@/types/progress';

import { apiFetch } from './client';

export function fetchAllProgress(): Promise<ProgressRecord[]> {
  return apiFetch<ProgressRecord[]>('/progress');
}

/**
 * json-server has no upsert, so an existing record is looked up by challengeId first.
 * The challengeId is used as the record id, which makes the lookup a stable point read
 * and keeps a challenge from ever accumulating two progress rows.
 */
export async function saveProgress(record: ProgressRecord): Promise<ProgressRecord> {
  const existing = await apiFetch<ProgressRecord[]>(
    `/progress?challengeId=${encodeURIComponent(record.challengeId)}`,
  );
  const current = existing[0];

  if (current) {
    return apiFetch<ProgressRecord>(`/progress/${current.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...record, id: current.id }),
    });
  }

  return apiFetch<ProgressRecord>('/progress', { method: 'POST', body: JSON.stringify(record) });
}

export function deleteProgress(recordId: string): Promise<unknown> {
  return apiFetch<unknown>(`/progress/${recordId}`, { method: 'DELETE' });
}
```

- [ ] **Step 7: Run the API tests and verify they pass**

Run: `pnpm vitest run src/api/progress.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 8: Write the failing hook test**

`src/hooks/useProgress.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ProgressRecord } from '@/types/progress';

import { useChallengeProgress, useProgressQuery } from './useProgress';

const solved: ProgressRecord = {
  id: 'selection-query-basics',
  challengeId: 'selection-query-basics',
  status: 'solved',
  attempts: 1,
  solvedAt: '2026-08-09T10:00:00.000Z',
  revealedAt: null,
  lastCode: null,
  updatedAt: '2026-08-09T10:00:00.000Z',
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useProgressQuery', () => {
  it('loads progress records', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([solved]), { status: 200 })));
    const { result } = renderHook(() => useProgressQuery(), { wrapper });
    await waitFor(() => { expect(result.current.isSuccess).toBe(true); });
    expect(result.current.data).toEqual([solved]);
  });
});

describe('useChallengeProgress', () => {
  it('synthesises an unattempted record when none exists', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 })));
    const { result } = renderHook(() => useChallengeProgress('never-tried'), { wrapper });
    await waitFor(() => { expect(result.current.status).toBe('unattempted'); });
    expect(result.current.attempts).toBe(0);
    expect(result.current.revealedAt).toBeNull();
  });

  it('returns the stored record when one exists', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([solved]), { status: 200 })));
    const { result } = renderHook(() => useChallengeProgress('selection-query-basics'), { wrapper });
    await waitFor(() => { expect(result.current.status).toBe('solved'); });
  });
});
```

- [ ] **Step 9: Run it and watch it fail**

Run: `pnpm vitest run src/hooks/useProgress.test.tsx`
Expected: FAIL — `Failed to resolve import "./useProgress"`.

- [ ] **Step 10: Implement `src/hooks/useProgress.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';

import { deleteProgress, fetchAllProgress, saveProgress } from '@/api/progress';
import type { ProgressRecord } from '@/types/progress';

export const PROGRESS_QUERY_KEY = ['progress'] as const;

export function emptyProgress(challengeId: string): ProgressRecord {
  return {
    id: challengeId,
    challengeId,
    status: 'unattempted',
    attempts: 0,
    solvedAt: null,
    revealedAt: null,
    lastCode: null,
    updatedAt: new Date().toISOString(),
  };
}

export function useProgressQuery(): UseQueryResult<ProgressRecord[]> {
  return useQuery({ queryKey: PROGRESS_QUERY_KEY, queryFn: fetchAllProgress, staleTime: 30_000 });
}

/** Always returns a record. "No row yet" and "unattempted" are the same thing to the UI. */
export function useChallengeProgress(challengeId: string): ProgressRecord {
  const { data } = useProgressQuery();
  return data?.find((record) => record.challengeId === challengeId) ?? emptyProgress(challengeId);
}

export function useSaveProgress(): UseMutationResult<ProgressRecord, Error, ProgressRecord, { previous: ProgressRecord[] }> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveProgress,
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: PROGRESS_QUERY_KEY });
      const previous = queryClient.getQueryData<ProgressRecord[]>(PROGRESS_QUERY_KEY) ?? [];
      const others = previous.filter((record) => record.challengeId !== next.challengeId);
      queryClient.setQueryData<ProgressRecord[]>(PROGRESS_QUERY_KEY, [...others, next]);
      return { previous };
    },
    onError: (_error, _next, context) => {
      if (context) queryClient.setQueryData(PROGRESS_QUERY_KEY, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: PROGRESS_QUERY_KEY });
    },
  });
}

export function useClearProgress(): UseMutationResult<unknown, Error, string, { previous: ProgressRecord[] }> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (recordId: string) => deleteProgress(recordId),
    onMutate: async (recordId) => {
      await queryClient.cancelQueries({ queryKey: PROGRESS_QUERY_KEY });
      const previous = queryClient.getQueryData<ProgressRecord[]>(PROGRESS_QUERY_KEY) ?? [];
      queryClient.setQueryData<ProgressRecord[]>(
        PROGRESS_QUERY_KEY,
        previous.filter((record) => record.id !== recordId),
      );
      return { previous };
    },
    onError: (_error, _recordId, context) => {
      if (context) queryClient.setQueryData(PROGRESS_QUERY_KEY, context.previous);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: PROGRESS_QUERY_KEY });
    },
  });
}
```

- [ ] **Step 11: Wrap the app in `QueryClientProvider`**

In `src/main.tsx`, add above `createRoot`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});
```

and wrap `<App />`:

```tsx
<StrictMode>
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>
</StrictMode>
```

- [ ] **Step 12: Run the tests and verify they pass**

Run: `pnpm vitest run src/hooks src/api`
Expected: PASS — 7 tests.

- [ ] **Step 13: Verify green and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add server src/api src/hooks src/main.tsx package.json
git commit -m "feat: add json-server progress api with optimistic tanstack query hooks"
```

---

### Task 9: Zustand editor store

**Files:**
- Create: `src/store/editorStore.ts`
- Test: `src/store/editorStore.test.ts`

**Interfaces:**
- Consumes: `CategoryId`, `Difficulty` (Task 2).
- Produces: `useEditorStore` with state `{ drafts, filters, layout, mobileTab }` and actions
  `setDraft(challengeId, code)`, `clearDraft(challengeId)`, `setFilters(partial)`, `setLayout(partial)`, `setMobileTab(tab)`.
  Exported types: `ChallengeFilters`, `MobileTab`.

Drafts are local, not server state, and that split is load-bearing: if json-server is not running, the learner can still write code and keep it across a reload. Only *progress* degrades.

- [ ] **Step 1: Write the failing tests**

`src/store/editorStore.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import { useEditorStore } from './editorStore';

const initial = useEditorStore.getState();

beforeEach(() => {
  useEditorStore.setState(initial, true);
  localStorage.clear();
});

describe('editor store', () => {
  it('starts with no drafts', () => {
    expect(useEditorStore.getState().drafts).toEqual({});
  });

  it('stores and retrieves a draft per challenge', () => {
    useEditorStore.getState().setDraft('a', 'code-a');
    useEditorStore.getState().setDraft('b', 'code-b');
    expect(useEditorStore.getState().drafts['a']).toBe('code-a');
    expect(useEditorStore.getState().drafts['b']).toBe('code-b');
  });

  it('clears a single draft without touching the others', () => {
    useEditorStore.getState().setDraft('a', 'code-a');
    useEditorStore.getState().setDraft('b', 'code-b');
    useEditorStore.getState().clearDraft('a');
    expect(useEditorStore.getState().drafts['a']).toBeUndefined();
    expect(useEditorStore.getState().drafts['b']).toBe('code-b');
  });

  it('merges partial filter updates', () => {
    useEditorStore.getState().setFilters({ difficulty: 'expert' });
    expect(useEditorStore.getState().filters.difficulty).toBe('expert');
    expect(useEditorStore.getState().filters.category).toBe('all');
  });

  it('tracks the active mobile tab', () => {
    useEditorStore.getState().setMobileTab('result');
    expect(useEditorStore.getState().mobileTab).toBe('result');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/store/editorStore.test.ts`
Expected: FAIL — `Failed to resolve import "./editorStore"`.

- [ ] **Step 3: Implement `src/store/editorStore.ts`**

```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { CategoryId, Difficulty } from '@/types/challenge';

export type MobileTab = 'code' | 'problem' | 'result';

export interface ChallengeFilters {
  category: CategoryId | 'all';
  difficulty: Difficulty | 'all';
  query: string;
  hideSolved: boolean;
}

export interface EditorLayout {
  promptPercent: number;
  editorPercent: number;
}

interface EditorStore {
  drafts: Record<string, string>;
  filters: ChallengeFilters;
  layout: EditorLayout;
  mobileTab: MobileTab;
  setDraft: (challengeId: string, code: string) => void;
  clearDraft: (challengeId: string) => void;
  setFilters: (partial: Partial<ChallengeFilters>) => void;
  setLayout: (partial: Partial<EditorLayout>) => void;
  setMobileTab: (tab: MobileTab) => void;
}

const DEFAULT_FILTERS: ChallengeFilters = { category: 'all', difficulty: 'all', query: '', hideSolved: false };
const DEFAULT_LAYOUT: EditorLayout = { promptPercent: 28, editorPercent: 42 };

export const useEditorStore = create<EditorStore>()(
  persist(
    (set) => ({
      drafts: {},
      filters: DEFAULT_FILTERS,
      layout: DEFAULT_LAYOUT,
      mobileTab: 'problem',
      setDraft: (challengeId, code) => {
        set((state) => ({ drafts: { ...state.drafts, [challengeId]: code } }));
      },
      clearDraft: (challengeId) => {
        set((state) => {
          const { [challengeId]: _removed, ...rest } = state.drafts;
          return { drafts: rest };
        });
      },
      setFilters: (partial) => {
        set((state) => ({ filters: { ...state.filters, ...partial } }));
      },
      setLayout: (partial) => {
        set((state) => ({ layout: { ...state.layout, ...partial } }));
      },
      setMobileTab: (tab) => { set({ mobileTab: tab }); },
    }),
    {
      name: 'dom-challenges-editor',
      // mobileTab is view state for the current visit, not something to restore days later.
      partialize: (state) => ({ drafts: state.drafts, filters: state.filters, layout: state.layout }),
    },
  ),
);
```

The `clearDraft` destructure discards a key without mutating. `noUnusedLocals` would normally reject `_removed`; the underscore prefix satisfies the default `varsIgnorePattern`. If lint still objects, use `Object.fromEntries(Object.entries(state.drafts).filter(([key]) => key !== challengeId))` rather than adding a disable comment.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm vitest run src/store/editorStore.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/store
git commit -m "feat: add persisted zustand store for drafts filters and layout"
```

---

### Task 10: Tailwind, shadcn/ui, app shell, and routing

**Files:**
- Create: `components.json`, `src/routes.tsx`, `src/components/layout/AppShell.tsx`, `src/components/browse/Dashboard.tsx`, `src/components/browse/ChallengeList.tsx`, `src/components/challenge/ChallengePage.tsx`, `src/components/NotFound.tsx`
- Modify: `src/index.css`, `src/App.tsx`
- Test: `src/routes.test.tsx`

**Interfaces:**
- Consumes: `allChallenges`, `challengeBySlug`, `challengesInCategory`, `CATEGORY_META` (Task 6).
- Produces: `router` (a `createBrowserRouter` instance) and route components. Routes:
  `/` → `Dashboard`, `/category/:categoryId` → `ChallengeList`, `/challenge/:slug` → `ChallengePage`, `*` → `NotFound`.

Tasks 11–16 fill these components in. This task establishes navigation and the responsive frame so every later task has somewhere to render.

- [ ] **Step 1: Configure Tailwind 4**

Tailwind 4 is CSS-first — there is no `tailwind.config.js`. Replace `src/index.css`:

```css
@import 'tailwindcss';

@custom-variant dark (&:is(.dark *));

@theme {
  --color-surface: oklch(99% 0.002 260);
  --color-surface-raised: oklch(97% 0.004 260);
  --color-ink: oklch(22% 0.02 260);
  --color-muted: oklch(55% 0.02 260);
  --color-accent: oklch(58% 0.16 255);
  --color-pass: oklch(62% 0.15 150);
  --color-fail: oklch(58% 0.19 25);
}

:root.dark {
  --color-surface: oklch(20% 0.01 260);
  --color-surface-raised: oklch(25% 0.012 260);
  --color-ink: oklch(94% 0.01 260);
  --color-muted: oklch(68% 0.02 260);
}

html,
body,
#root {
  height: 100%;
}
```

- [ ] **Step 2: Initialise shadcn/ui and add the primitives used in Phase 1**

```bash
pnpm dlx shadcn@latest init
pnpm dlx shadcn@latest add button card badge tabs dialog progress select input switch scroll-area separator
```

Accept the defaults, with `@/components/ui` as the component path. Confirm `components.json` is written and `src/components/ui/` is populated.

- [ ] **Step 3: Write the failing routing test**

`src/routes.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { describe, expect, it } from 'vitest';

import { routeDefinitions } from './routes';

function renderAt(path: string) {
  const router = createMemoryRouter(routeDefinitions, { initialEntries: [path] });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('routing', () => {
  it('renders the dashboard at the root', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { name: /your progress/i })).toBeInTheDocument();
  });

  it('renders a category listing', async () => {
    renderAt('/category/selection');
    expect(await screen.findByRole('heading', { name: /selection & traversal/i })).toBeInTheDocument();
  });

  it('renders a challenge page by slug', async () => {
    renderAt('/challenge/query-basics');
    expect(await screen.findByRole('heading', { name: /find one element and mark it/i })).toBeInTheDocument();
  });

  it('renders a not-found page for an unknown slug', async () => {
    renderAt('/challenge/does-not-exist');
    expect(await screen.findByText(/couldn't find that challenge/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run it and watch it fail**

Run: `pnpm vitest run src/routes.test.tsx`
Expected: FAIL — `Failed to resolve import "./routes"`.

- [ ] **Step 5: Implement the shell and routes**

`src/components/layout/AppShell.tsx`:

```tsx
import { Link, Outlet } from 'react-router';

export function AppShell() {
  return (
    <div className="flex h-full flex-col bg-surface text-ink">
      <header className="flex items-center gap-4 border-b px-4 py-3">
        <Link to="/" className="font-semibold tracking-tight">
          DOM Challenges
        </Link>
        <nav aria-label="Main" className="text-sm text-muted">
          <Link to="/">Dashboard</Link>
        </nav>
      </header>
      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
```

`src/components/NotFound.tsx`:

```tsx
export function NotFound({ message = "We couldn't find that challenge." }: { message?: string }) {
  return (
    <div className="p-8">
      <p className="text-muted">{message}</p>
    </div>
  );
}
```

`src/routes.tsx`:

```tsx
import type { RouteObject } from 'react-router';
import { createBrowserRouter } from 'react-router';

import { ChallengeList } from './components/browse/ChallengeList';
import { Dashboard } from './components/browse/Dashboard';
import { ChallengePage } from './components/challenge/ChallengePage';
import { AppShell } from './components/layout/AppShell';
import { NotFound } from './components/NotFound';

export const routeDefinitions: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'category/:categoryId', element: <ChallengeList /> },
      { path: 'challenge/:slug', element: <ChallengePage /> },
      { path: '*', element: <NotFound message="That page does not exist." /> },
    ],
  },
];

export const router = createBrowserRouter(routeDefinitions);
```

**AMENDED after the Task 13 review — `ChallengePage` must be code-split, and this file is where
that is owned.** The static import above is correct for Task 10, when `ChallengePage` is a
placeholder. By Task 13 it transitively pulls `react-markdown`, `remark-gfm`, and the editor chain
into the entry chunk: the entry grew 325 kB → 729 kB and `vite build` began emitting its 500 kB
chunk warning. Task 12 already established that Monaco itself must stay out of any chunk that does
not render an editor; the same argument applies one level up. Wrap the challenge route's component
in `lazy()` with a `<Suspense>` boundary around `AppShell`'s `<Outlet />` — keeping `element` in
the route table synchronous so `createMemoryRouter(routeDefinitions, …)` in tests still works —
and confirm the build no longer warns.

`src/App.tsx`:

```tsx
import { RouterProvider } from 'react-router';

import { router } from './routes';

export function App() {
  return <RouterProvider router={router} />;
}
```

Update `src/App.test.tsx` from Task 1 — the smoke assertion on an `<h1>DOM Challenges</h1>` no longer holds. Replace its body with an assertion that the shell's home link renders:

```tsx
expect(screen.getByRole('link', { name: /dom challenges/i })).toBeInTheDocument();
```

- [ ] **Step 6: Implement minimal `Dashboard`, `ChallengeList`, and `ChallengePage`**

`src/components/browse/Dashboard.tsx` — heading `Your progress`, plus a grid of `Link`s built from `CATEGORY_META` and `challengesInCategory(id).length`. Task 16 adds real completion figures.

`src/components/browse/ChallengeList.tsx` — reads `categoryId` via `useParams`, renders `CATEGORY_META[categoryId].title` as the heading and a list of `Link`s to `/challenge/:slug`. Render `<NotFound message="Unknown category." />` when the param is not a valid `CategoryId`; narrow with `Object.prototype.hasOwnProperty.call(CATEGORY_META, categoryId)` rather than a cast.

`src/components/challenge/ChallengePage.tsx` — reads `slug` via `useParams`, looks up `challengeBySlug`, renders `<NotFound />` when missing, otherwise renders the challenge title as an `<h1>` and three placeholder regions labelled Problem, Code, and Result. Tasks 11–15 replace the placeholders.

- [ ] **Step 7: Run the tests and verify they pass**

Run: `pnpm vitest run src/routes.test.tsx src/App.test.tsx`
Expected: PASS — 5 tests.

- [ ] **Step 8: Verify green and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add -A
git commit -m "feat: add tailwind shadcn app shell and routing"
```

---

### Task 11: Iframe sandbox host

**Files:**
- Create: `src/runner/iframeHost.ts`, `src/components/challenge/PreviewFrame.tsx`
- Test: `src/runner/iframeHost.test.ts`

**Interfaces:**
- Consumes: `HostContext`, `HostHandle` (Task 5).
- Produces:
  - `createIframeHost(container: HTMLElement): HostHandle`
  - `PreviewFrame` — `{ containerRef: RefObject<HTMLDivElement | null> }`, renders the mount point the host attaches iframes to.

The iframe carries **no `sandbox` attribute**, making it same-origin. That is the design decision from spec §3.1: this buys DOM isolation, which is what the app needs, while keeping the harness able to hand real function references across the boundary. Security isolation is not the goal, because the only code running is the learner's own.

Every `reset` destroys the previous iframe and builds a new one, so window listeners, timers, and observers from an earlier attempt cannot survive into the next.

- [ ] **Step 1: Write the failing tests**

`src/runner/iframeHost.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { createIframeHost } from './iframeHost';

describe('createIframeHost', () => {
  it('mounts an iframe into the container and exposes its document', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const host = createIframeHost(container);

    const context = await host.reset('<p id="hello">hi</p>');
    expect(context.document.getElementById('hello')?.textContent).toBe('hi');

    host.dispose();
    container.remove();
  });

  it('does not sandbox the frame, so the harness can reach into it', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const host = createIframeHost(container);

    await host.reset('<p></p>');
    const frame = container.querySelector('iframe');
    expect(frame).not.toBeNull();
    expect(frame?.hasAttribute('sandbox')).toBe(false);

    host.dispose();
    container.remove();
  });

  it('replaces the frame on reset so no state survives', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const host = createIframeHost(container);

    const first = await host.reset('<p id="a"></p>');
    first.window.setTimeout(() => undefined, 100_000);
    const second = await host.reset('<p id="b"></p>');

    expect(container.querySelectorAll('iframe')).toHaveLength(1);
    expect(second.document.getElementById('a')).toBeNull();
    expect(second.document.getElementById('b')).not.toBeNull();

    host.dispose();
    container.remove();
  });

  it('removes the frame on dispose', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const host = createIframeHost(container);

    await host.reset('<p></p>');
    host.dispose();

    expect(container.querySelectorAll('iframe')).toHaveLength(0);
    container.remove();
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/runner/iframeHost.test.ts`
Expected: FAIL — `Failed to resolve import "./iframeHost"`.

- [ ] **Step 3: Implement `src/runner/iframeHost.ts`**

```ts
import type { HostContext, HostHandle } from './harness';

const BASE_STYLES = `
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 12px;
    font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #18181b;
    background: #ffffff;
  }
`;

function documentFor(html: string): string {
  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    `<style>${BASE_STYLES}</style>`,
    `</head><body>${html}</body></html>`,
  ].join('');
}

/**
 * A HostHandle backed by a same-origin srcdoc iframe.
 *
 * No `sandbox` attribute: the harness needs to pass live function references and read
 * `contentDocument` directly. Isolation here means DOM isolation — a broken solution
 * cannot corrupt the app shell — not a security boundary against untrusted code.
 */
export function createIframeHost(container: HTMLElement): HostHandle {
  let frame: HTMLIFrameElement | null = null;

  const destroy = (): void => {
    frame?.remove();
    frame = null;
  };

  return {
    reset(html: string): Promise<HostContext> {
      destroy();

      return new Promise<HostContext>((resolve, reject) => {
        const next = document.createElement('iframe');
        next.title = 'Challenge preview';
        next.className = 'h-full w-full border-0 bg-white';

        next.addEventListener(
          'load',
          () => {
            const { contentWindow, contentDocument } = next;
            if (!contentWindow || !contentDocument) {
              reject(new Error('The preview frame did not initialise.'));
              return;
            }
            resolve({ window: contentWindow as Window & typeof globalThis, document: contentDocument });
          },
          { once: true },
        );

        next.srcdoc = documentFor(html);
        container.append(next);
        frame = next;
      });
    },
    dispose: destroy,
  };
}
```

If happy-dom does not fire `load` for a `srcdoc` iframe and the first test hangs, replace the `srcdoc` assignment with a write after append:

```ts
container.append(next);
const doc = next.contentDocument;
if (!doc) { reject(new Error('The preview frame did not initialise.')); return; }
doc.open();
doc.write(documentFor(html));
doc.close();
resolve({ window: next.contentWindow as Window & typeof globalThis, document: doc });
```

Diagnose which path is needed before changing anything — do not apply both.

- [ ] **Step 4: Implement `src/components/challenge/PreviewFrame.tsx`**

```tsx
import type { RefObject } from 'react';

export interface PreviewFrameProps {
  containerRef: RefObject<HTMLDivElement | null>;
}

export function PreviewFrame({ containerRef }: PreviewFrameProps) {
  return (
    <section aria-label="Preview" className="min-h-40 flex-1 overflow-hidden rounded-md border bg-white">
      <div ref={containerRef} className="h-full w-full" />
    </section>
  );
}
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `pnpm vitest run src/runner/iframeHost.test.ts`
Expected: PASS — 4 tests.

- [ ] **Step 6: Verify green and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/runner/iframeHost.ts src/runner/iframeHost.test.ts src/components/challenge/PreviewFrame.tsx
git commit -m "feat: add same-origin iframe host for running submitted code"
```

---

### Task 12: Monaco editor panel

**Files:**
- Create: `src/lib/monaco.ts`, `src/components/challenge/EditorPanel.tsx`
- Test: `src/components/challenge/EditorPanel.test.tsx`

**Interfaces:**
- Consumes: `useEditorStore` (Task 9).
- Produces: `EditorPanel` with props
  `{ challengeId: string; starterCode: string; value: string; onChange: (code: string) => void; onRun: () => void; isRunning: boolean }`.
  Also `configureMonaco(): void` from `src/lib/monaco.ts`.

Two things must be true or this task has failed:

1. **Monaco loads locally.** `@monaco-editor/react` fetches Monaco from jsDelivr by default. `loader.config({ monaco })` points it at the bundled copy. Without this the app is broken offline and leaks a third-party request on every challenge page.
2. **Monaco is a lazy chunk.** The dashboard and browse routes must not pay for a ~3 MB editor they never render.

- [ ] **Step 1: Implement `src/lib/monaco.ts`**

```ts
import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

let configured = false;

/** Points @monaco-editor/react at the bundled Monaco instead of a CDN, and wires its workers. */
export function configureMonaco(): void {
  if (configured) return;
  configured = true;

  window.MonacoEnvironment = {
    getWorker(_workerId: string, label: string): Worker {
      return label === 'typescript' || label === 'javascript' ? new tsWorker() : new editorWorker();
    },
  };

  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    lib: ['es2020', 'dom', 'dom.iterable'],
    strict: true,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    allowNonTsExtensions: true,
  });

  // Submitted code is a standalone snippet, so "top-level await" and "unused export"
  // style diagnostics would be noise rather than teaching.
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    diagnosticCodesToIgnore: [1375, 1378],
  });

  loader.config({ monaco });
}
```

- [ ] **Step 2: Write the failing editor test**

`src/components/challenge/EditorPanel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EditorPanel } from './EditorPanel';

vi.mock('@monaco-editor/react', () => ({
  Editor: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea aria-label="Solution code" value={value} onChange={(e) => { onChange(e.target.value); }} />
  ),
  loader: { config: vi.fn() },
}));

describe('EditorPanel', () => {
  const baseProps = {
    challengeId: 'c1',
    starterCode: '// start',
    value: '// start',
    onChange: vi.fn(),
    onRun: vi.fn(),
    isRunning: false,
  };

  it('renders a run button', async () => {
    render(<EditorPanel {...baseProps} />);
    expect(await screen.findByRole('button', { name: /run/i })).toBeInTheDocument();
  });

  it('calls onRun when the run button is pressed', async () => {
    const onRun = vi.fn();
    render(<EditorPanel {...baseProps} onRun={onRun} />);
    await userEvent.click(await screen.findByRole('button', { name: /run/i }));
    expect(onRun).toHaveBeenCalledOnce();
  });

  it('disables the run button while a run is in flight', async () => {
    render(<EditorPanel {...baseProps} isRunning />);
    expect(await screen.findByRole('button', { name: /running/i })).toBeDisabled();
  });
});
```

The Monaco mock is not laziness — Monaco cannot render in happy-dom (it needs real layout and workers). Mocking it keeps the test about the panel's own behaviour, which is what this component owns.

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm vitest run src/components/challenge/EditorPanel.test.tsx`
Expected: FAIL — `Failed to resolve import "./EditorPanel"`.

- [ ] **Step 4: Implement `src/components/challenge/EditorPanel.tsx`**

```tsx
import { lazy, Suspense, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { configureMonaco } from '@/lib/monaco';

const MonacoEditor = lazy(async () => {
  const monacoReact = await import('@monaco-editor/react');
  return { default: monacoReact.Editor };
});

export interface EditorPanelProps {
  challengeId: string;
  starterCode: string;
  value: string;
  onChange: (code: string) => void;
  onRun: () => void;
  isRunning: boolean;
}

export function EditorPanel({ challengeId, value, onChange, onRun, isRunning }: EditorPanelProps) {
  useEffect(() => {
    configureMonaco();
  }, []);

  return (
    <section aria-label="Code editor" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-sm font-medium">Your solution</h2>
        <Button onClick={onRun} disabled={isRunning} size="sm">
          {isRunning ? 'Running…' : 'Run tests'}
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <Suspense fallback={<p className="p-3 text-sm text-muted">Loading editor…</p>}>
          <MonacoEditor
            key={challengeId}
            language="typescript"
            path={`file:///${challengeId}.ts`}
            value={value}
            onChange={(next) => { onChange(next ?? ''); }}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
            }}
          />
        </Suspense>
      </div>
    </section>
  );
}
```

The `path` prop gives each challenge its own Monaco model, so type state from one challenge cannot bleed into the next.

- [ ] **Step 5: Run the tests and verify they pass**

Run: `pnpm vitest run src/components/challenge/EditorPanel.test.tsx`
Expected: PASS — 3 tests.

- [ ] **Step 6: Verify Monaco is lazy and local**

```bash
pnpm build
```

Expected: the build output lists a separate large chunk for Monaco, not folded into the entry chunk. Then `pnpm preview`, open a challenge page with DevTools Network throttled to offline after first load, and confirm no request to `cdn.jsdelivr.net`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/monaco.ts src/components/challenge/EditorPanel.tsx src/components/challenge/EditorPanel.test.tsx
git commit -m "feat: add lazy monaco editor panel with local workers"
```

---

### Task 13: Run flow and results

**Files:**
- Create: `src/hooks/useChallengeRun.ts`, `src/components/challenge/ResultPanel.tsx`, `src/components/challenge/PromptPanel.tsx`
- Modify: `src/runner/harness.ts` (add `renderPreview`), `src/components/challenge/ChallengePage.tsx`
- Test: `src/hooks/useChallengeRun.test.tsx`, `src/components/challenge/ResultPanel.test.tsx`

**Interfaces:**
- Consumes: `runChallenge`, `HostHandle` (Task 5), `createIframeHost` (Task 11), `useSaveProgress`/`useChallengeProgress`/`emptyProgress` (Task 8), `useEditorStore` (Task 9).
- Produces:
  - `renderPreview(challenge, code, host, options?): Promise<RunError | null>` added to `harness.ts`
  - `useChallengeRun(challenge, containerRef): { result, isRunning, run, reset }` — `reset` clears the on-screen result and re-renders the preview from the starter code; Task 15 consumes it
  - `ResultPanel` — `{ result: RunResult | null; isRunning: boolean }`
  - `PromptPanel` — `{ challenge: Challenge }`

`renderPreview` exists because after `runChallenge` the frame holds whatever the *last test* left behind, which is a confusing thing to show. One final clean reset-and-execute gives the learner the DOM their code actually produces.

- [ ] **Step 1: Add `renderPreview` to `src/runner/harness.ts`**

Append to the file, reusing the existing private `evaluate` and `transpile`:

```ts
/** Renders the submitted code once into a clean host, for display rather than assertion. */
export async function renderPreview(
  challenge: Challenge,
  code: string,
  host: HostHandle,
  options: RunOptions = {},
): Promise<RunError | null> {
  const transpiled = transpile(code);
  if (!transpiled.ok) return { phase: 'transpile', message: transpiled.message };

  const context = await host.reset(challenge.html);
  try {
    evaluate(context.window, transpiled.code, options.modules ?? {});
    return null;
  } catch (error) {
    return { phase: 'execute', message: messageOf(error) };
  }
}
```

Add to `src/runner/harness.test.ts`:

```ts
it('renderPreview leaves the produced dom in the host', async () => {
  const host = createMemoryHost();
  const error = await renderPreview(makeChallenge(), 'document.getElementById("target")?.classList.add("found");', host);
  expect(error).toBeNull();
  const context = await host.reset(makeChallenge().html);
  expect(context.document.getElementById('target')).not.toBeNull();
});
```

- [ ] **Step 2: Write the failing run-flow test**

`src/hooks/useChallengeRun.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Challenge } from '@/types/challenge';

import { useChallengeRun } from './useChallengeRun';

const challenge: Challenge = {
  id: 'c1',
  slug: 'c1',
  title: 'C1',
  category: 'selection',
  difficulty: 'novice',
  prompt: 'p',
  html: '<div id="target"></div>',
  starterCode: '',
  tests: [
    {
      name: 'adds the class',
      run: ({ doc, expect: assert }) => { assert(doc.getElementById('target')).toHaveClass('found'); },
    },
  ],
  solutions: [{ label: 'Canonical', code: '', explanation: 'e', tradeoffs: 't' }],
  concepts: [],
  relatedIds: [],
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('useChallengeRun', () => {
  it('reports a pass and records solved progress', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const container = document.createElement('div');
    document.body.append(container);
    const ref = createRef<HTMLDivElement>();
    Object.defineProperty(ref, 'current', { value: container, writable: true });

    const { result } = renderHook(() => useChallengeRun(challenge, ref), { wrapper });

    await act(async () => {
      await result.current.run('document.getElementById("target")?.classList.add("found");');
    });

    await waitFor(() => { expect(result.current.result?.passed).toBe(true); });

    const posted = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST');
    expect(posted).toBeDefined();
    expect(String((posted?.[1] as RequestInit).body)).toContain('"status":"solved"');
  });

  it('records an attempt when the run fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const container = document.createElement('div');
    document.body.append(container);
    const ref = createRef<HTMLDivElement>();
    Object.defineProperty(ref, 'current', { value: container, writable: true });

    const { result } = renderHook(() => useChallengeRun(challenge, ref), { wrapper });
    await act(async () => { await result.current.run('// nothing'); });

    await waitFor(() => { expect(result.current.result?.passed).toBe(false); });

    const posted = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'POST');
    expect(String((posted?.[1] as RequestInit).body)).toContain('"status":"attempted"');
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `pnpm vitest run src/hooks/useChallengeRun.test.tsx`
Expected: FAIL — `Failed to resolve import "./useChallengeRun"`.

- [ ] **Step 4: Implement `src/hooks/useChallengeRun.ts`**

```ts
import type { RefObject } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { HostHandle, RunResult } from '@/runner/harness';
import { renderPreview, runChallenge } from '@/runner/harness';
import { createIframeHost } from '@/runner/iframeHost';
import type { Challenge } from '@/types/challenge';

import { useChallengeProgress, useSaveProgress } from './useProgress';

export interface ChallengeRun {
  result: RunResult | null;
  isRunning: boolean;
  run: (code: string) => Promise<void>;
  reset: (code: string) => Promise<void>;
}

export function useChallengeRun(challenge: Challenge, containerRef: RefObject<HTMLDivElement | null>): ChallengeRun {
  const [result, setResult] = useState<RunResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const hostRef = useRef<HostHandle | null>(null);
  const progress = useChallengeProgress(challenge.id);
  const saveProgress = useSaveProgress();

  useEffect(() => {
    setResult(null);
    return () => {
      hostRef.current?.dispose();
      hostRef.current = null;
    };
  }, [challenge.id]);

  const run = useCallback(
    async (code: string): Promise<void> => {
      const container = containerRef.current;
      if (!container) return;

      hostRef.current ??= createIframeHost(container);
      const host = hostRef.current;

      setIsRunning(true);
      try {
        const next = await runChallenge(challenge, code, host);
        setResult(next);
        await renderPreview(challenge, code, host);

        const now = new Date().toISOString();
        saveProgress.mutate({
          ...progress,
          // AMENDED after the Task 13 review (owner decision). The original line read
          // `status: next.passed ? 'solved' : 'attempted'`, which regressed a solved challenge to
          // `attempted` on any later failing run while the line below deliberately preserved
          // `solvedAt` -- a self-contradictory record, and a solved count that dropped whenever a
          // learner experimented after solving. Solved is now sticky: only Task 15's Clear button
          // un-solves a challenge.
          status: next.passed || progress.solvedAt !== null ? 'solved' : 'attempted',
          attempts: progress.attempts + 1,
          solvedAt: next.passed ? (progress.solvedAt ?? now) : progress.solvedAt,
          lastCode: code,
          updatedAt: now,
        });
      } finally {
        setIsRunning(false);
      }
    },
    [challenge, containerRef, progress, saveProgress],
  );

  const reset = useCallback(
    async (code: string): Promise<void> => {
      setResult(null);
      const host = hostRef.current;
      if (host) await renderPreview(challenge, code, host);
    },
    [challenge],
  );

  return { result, isRunning, run, reset };
}
```

**AMENDED after the Task 13 review — the `progress` closure above is destructive, not merely
stale.** The sketch spreads `...progress`, a value captured when the callback was created, and
`saveProgress` PATCHes the whole record body rather than a delta. On a cold deep-link to
`/challenge/:slug` the `GET /progress` is still in flight when the learner's first run starts, so
`progress` is the synthesised `emptyProgress` placeholder — and the write then overwrites a real
solved row with `attempts: 1`, `status: 'attempted'`, `solvedAt: null`. The prior record must be
read **at write time**, after awaiting the progress query, and the write must be skipped entirely
if that read cannot be established. Never derive the written record from a placeholder that only
means "not loaded yet". The same restructure removes `progress` from the callback's dependency
array, which is what makes the memoisation real: `emptyProgress` builds a fresh object on every
render, so a `progress` dependency invalidates the callback every time regardless.

- [ ] **Step 5: Implement `ResultPanel` and `PromptPanel`**

`src/components/challenge/ResultPanel.tsx`:

```tsx
import type { RunResult } from '@/runner/harness';

export interface ResultPanelProps {
  result: RunResult | null;
  isRunning: boolean;
}

export function ResultPanel({ result, isRunning }: ResultPanelProps) {
  const passedCount = result?.results.filter((entry) => entry.passed).length ?? 0;
  const total = result?.results.length ?? 0;

  return (
    <section aria-label="Test results" className="flex min-h-0 flex-col gap-2 overflow-auto p-3">
      <div aria-live="polite" className="text-sm font-medium">
        {isRunning ? 'Running tests…' : result ? `${String(passedCount)} of ${String(total)} tests passing` : 'Not run yet'}
      </div>

      {result?.error && (
        <p className="rounded border border-fail/40 bg-fail/10 p-2 text-sm">
          <strong>{result.error.phase === 'transpile' ? 'Could not compile' : 'Code threw before tests ran'}:</strong>{' '}
          {result.error.message}
        </p>
      )}

      <ul className="flex flex-col gap-1">
        {result?.results.map((entry) => (
          <li key={entry.name} className="rounded border p-2 text-sm">
            <span aria-hidden="true">{entry.passed ? '✓' : '✗'}</span>{' '}
            <span className="sr-only">{entry.passed ? 'Passed' : 'Failed'}:</span>
            {entry.name}
            {!entry.passed && entry.message && <p className="mt-1 text-muted">{entry.message}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
```

`src/components/challenge/PromptPanel.tsx` — renders `challenge.title` as `<h1>`, difficulty and concepts as `Badge`s, and `challenge.prompt` through `ReactMarkdown` with `remarkGfm`.

- [ ] **Step 6: Write `src/components/challenge/ResultPanel.test.tsx`**

Assert: "Not run yet" with a null result; "1 of 2 tests passing" for a mixed result; the failure message rendered for a failing entry; and the transpile-error branch rendering "Could not compile".

- [ ] **Step 7: Wire `ChallengePage`**

Replace the placeholders with `PromptPanel`, `EditorPanel`, `PreviewFrame`, and `ResultPanel`. Hold the container ref with `useRef<HTMLDivElement>(null)`, read and write the draft through `useEditorStore` (falling back to `challenge.starterCode` when no draft exists), and pass `run` from `useChallengeRun`.

- [ ] **Step 8: Run the tests and verify they pass**

Run: `pnpm vitest run src/hooks src/components src/runner`
Expected: PASS.

- [ ] **Step 9: Verify green and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add -A
git commit -m "feat: wire the run flow with results preview and progress recording"
```

---

### Task 14: Solutions panel with earned/revealed gating

**Files:**
- Create: `src/components/challenge/SolutionsPanel.tsx`, `src/lib/solutionAccess.ts`
- Modify: `src/components/challenge/ChallengePage.tsx`
- Test: `src/lib/solutionAccess.test.ts`, `src/components/challenge/SolutionsPanel.test.tsx`

**Interfaces:**
- Consumes: `ProgressRecord` (Task 2), `Solution` (Task 2), `useSaveProgress` (Task 8).
- Produces:
  - `solutionAccess(record: ProgressRecord): { unlocked: boolean; earned: boolean }`
  - `SolutionsPanel` — `{ solutions: Solution[]; record: ProgressRecord; onReveal: () => void }`

From spec §8.1. One panel, two paths in:

| Progress state | Gate | Framing |
|----------------|------|---------|
| `unattempted` / `attempted` | "Reveal solution" + confirm, stamps `revealedAt` | spoiler |
| `solved`, `revealedAt === null` | none — unlocks on the passing run | "Other approaches" — earned |
| `solved`, `revealedAt !== null` | already open | badged "revealed" |

`earned` changes **framing only** — heading copy and the absence of a confirm dialog. It never changes *which* solutions are shown. A learner who reveals sees exactly the same alternatives and tradeoff analysis as one who solved it unaided; withholding teaching material from someone who struggled would invert the point of the app.

- [ ] **Step 1: Write the failing access tests**

`src/lib/solutionAccess.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import type { ProgressRecord } from '@/types/progress';

import { solutionAccess } from './solutionAccess';

function record(overrides: Partial<ProgressRecord>): ProgressRecord {
  return {
    id: 'c1',
    challengeId: 'c1',
    status: 'unattempted',
    attempts: 0,
    solvedAt: null,
    revealedAt: null,
    lastCode: null,
    updatedAt: '2026-08-09T00:00:00.000Z',
    ...overrides,
  };
}

describe('solutionAccess', () => {
  it('locks solutions for an unattempted challenge', () => {
    expect(solutionAccess(record({}))).toEqual({ unlocked: false, earned: false });
  });

  it('locks solutions for an attempted but unsolved challenge', () => {
    expect(solutionAccess(record({ status: 'attempted', attempts: 3 }))).toEqual({ unlocked: false, earned: false });
  });

  it('unlocks and marks earned when solved without revealing', () => {
    expect(solutionAccess(record({ status: 'solved' }))).toEqual({ unlocked: true, earned: true });
  });

  it('unlocks without earning when the solution was revealed', () => {
    const revealed = record({ status: 'attempted', revealedAt: '2026-08-09T01:00:00.000Z' });
    expect(solutionAccess(revealed)).toEqual({ unlocked: true, earned: false });
  });

  it('does not count as earned when solved after revealing', () => {
    const both = record({ status: 'solved', revealedAt: '2026-08-09T01:00:00.000Z' });
    expect(solutionAccess(both)).toEqual({ unlocked: true, earned: false });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/lib/solutionAccess.test.ts`
Expected: FAIL — `Failed to resolve import "./solutionAccess"`.

- [ ] **Step 3: Implement `src/lib/solutionAccess.ts`**

```ts
import type { ProgressRecord } from '@/types/progress';

export interface SolutionAccess {
  unlocked: boolean;
  earned: boolean;
}

/** Single source of truth for spec §8.1. Both flags derive from the record alone. */
export function solutionAccess(record: ProgressRecord): SolutionAccess {
  const revealed = record.revealedAt !== null;
  const solved = record.status === 'solved';
  return { unlocked: solved || revealed, earned: solved && !revealed };
}
```

- [ ] **Step 4: Implement `SolutionsPanel`**

Behaviour to build, each covered by a test in `SolutionsPanel.test.tsx`:

- When locked: render only a "Reveal solution" `Button`. Clicking opens a shadcn `Dialog` warning that this cannot be un-revealed for this attempt; confirming calls `onReveal`. Assert `onReveal` is not called until the dialog is confirmed.
- When unlocked and `earned`: heading "Other approaches", with copy noting they solved it unaided. No dialog, no reveal button.
- When unlocked and not `earned`: heading "Solution", plus a `Badge` reading "revealed".
- In both unlocked states: a shadcn `Tabs` with one tab per `Solution`, each tab panel showing the code, the `explanation`, and the `tradeoffs`. Assert every solution label appears as a tab and that the same number of tabs render in earned and revealed states — that assertion is what stops the two framings from drifting apart into different content.

Render `explanation` and `tradeoffs` with `ReactMarkdown`; render `code` in a `<pre><code>` highlighted by `shiki`.

**AMENDED — this is shiki's first use in the project, and its default entry point is a bundle
trap.** Importing `codeToHtml` from `'shiki'` pulls every grammar and every theme it ships with,
which is measured in megabytes; it would land inside the `ChallengePage` chunk that Task 13 just
finished separating out (413 kB). Build the highlighter from `shiki/core` via
`createHighlighterCore`, dynamically importing **only** the `typescript` grammar and the one or
two themes actually rendered, and use the JavaScript RegExp engine
(`createJavaScriptRegexEngine` from `shiki/engine/javascript`) rather than the default oniguruma
WASM — TypeScript's grammar is supported by it and the WASM binary is pure weight otherwise. Load
the highlighter through a dynamic `import()` inside the panel so it forms its own chunk rather
than inflating `ChallengePage`'s, and render unhighlighted `<pre><code>` until it resolves so a
slow highlighter never blocks the solution text. Report `ChallengePage`'s chunk size before and
after; a highlighter that grows it materially has been wired wrong.

Highlighting is decoration. If the highlighter fails to load, the code must still be readable —
catch and fall back to plain `<pre><code>`, and cover that fallback with a test.

- [ ] **Step 5: Wire reveal into `ChallengePage`**

`onReveal` writes `revealedAt` and `updatedAt` onto the challenge's existing record.

**AMENDED after the Task 13 review — do not spread a render-time `progress` value here.** The
sketch this replaced read `{ ...progress, … }` from the component closure, which is the same
destructive write Task 13 had to fix: `saveProgress` PATCHes the whole record body, so a learner
who deep-links to `/challenge/:slug` and clicks Reveal before `GET /progress` settles would
overwrite their real row with the synthesised `emptyProgress` placeholder — wiping `attempts`,
`status` and `solvedAt` in exchange for a `revealedAt`. Reveal must resolve the prior record the
way `useChallengeRun` does: await the settled progress query, then `findChallengeProgress(records,
challenge.id)`, then write. If the record cannot be established, skip the write rather than
writing a placeholder-derived one. A test must cover reveal-before-the-query-settles against an
already-solved row.

- [ ] **Step 6: Run the tests and verify they pass**

Run: `pnpm vitest run src/lib src/components/challenge`
Expected: PASS.

- [ ] **Step 7: Verify green and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add -A
git commit -m "feat: add solutions panel gated by earned versus revealed"
```

---

### Task 15: Clear and resubmit

**Files:**
- Modify: `src/components/challenge/ChallengePage.tsx`
- Create: `src/components/challenge/ClearButton.tsx`
- Test: `src/components/challenge/ClearButton.test.tsx`

**Interfaces:**
- Consumes: `useClearProgress` (Task 8), `useEditorStore.clearDraft` (Task 9), `useStoredProgress`
  (Task 14).
- Produces: `ClearButton` — `{ challengeId: string; onCleared: () => void }`.

**AMENDED — `recordId` cannot be a prop, and this is the third appearance of the same hazard.**
The original signature took `recordId: string`, which `ChallengePage` would source from
`useChallengeProgress(challenge.id)`. That returns `emptyProgress(challengeId)` whenever the
progress query has not settled, and `emptyProgress` sets `id` to the **challenge** id — not a real
json-server row id. json-server assigns its own `id` on POST and discards the client's; the
docblock on `useClearProgress` in `src/hooks/useProgress.ts` exists specifically to warn about
this. A Clear on a cold deep-link would therefore DELETE a row that does not exist, 404, and
silently roll back, leaving the learner staring at an unchanged page after confirming a
destructive action.

Resolve the record at click time, the way Tasks 13 and 14 do: `useStoredProgress(challengeId)`
returns `Promise<ProgressRecord | null>` off the settled query. Then:

- `stored === null` (query unresolvable) — do not delete. Surface the failure rather than
  reporting success.
- `stored.status === 'unattempted'` with `attempts === 0` — there is no row to delete. Clear the
  draft and the on-screen result, skip the mutation entirely, and do not treat the absent DELETE
  as an error.
- Otherwise DELETE `stored.id`, which is now the id the server actually assigned.

Test the cold-deep-link shape directly: hold `GET /progress` pending, click Clear, release the
read, and assert the DELETE went to the server's id rather than the challenge id.

**Two inherited decisions to settle here rather than inherit by default:**

- `useClearProgress`'s `onSettled` runs on React Query's `'active'` default while `useSaveProgress`
  uses `refetchType: 'all'`. The asymmetry is correct — a delete has no server-assigned field to
  read back — and is commented at both sites. This is the first task to exercise the delete path,
  so confirm it here rather than leaving it as an assumption.
- `useChallengeRun`'s `reset` silently no-ops when `hostRef.current` is null, which is every call
  before the first run. Decide what clearing before a first run should render, and cover it.

**Restore the Task 14 dialog copy.** `SolutionsPanel`'s reveal dialog was reworded during the Task
14 fix wave to stop promising a Clear control that did not exist yet. It exists as of this task —
put the "clearing your progress is the way back" sentence back, and make sure it is true: clearing
deletes the record, which drops `revealedAt` along with it, so the panel returns to locked.

Clearing must reset **three** things or the app lies to the learner: the editor draft, the progress record, and the on-screen result. Missing the third leaves stale passing results next to freshly reset starter code.

- [ ] **Step 1: Write the failing test**

`src/components/challenge/ClearButton.test.tsx` asserts:

- The button is labelled "Clear solution".
- Clicking opens a confirm dialog; nothing is cleared before confirmation.
- Confirming calls `clearDraft(challengeId)`, fires the delete mutation for `recordId`, and calls `onCleared`.
- Dismissing the dialog calls none of them.

Mock `@/hooks/useProgress` and `@/store/editorStore` with `vi.mock` so the test covers this component's orchestration rather than the network.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/components/challenge/ClearButton.test.tsx`
Expected: FAIL — `Failed to resolve import "./ClearButton"`.

- [ ] **Step 3: Implement `ClearButton`**

A shadcn `Dialog` wrapping a destructive-variant `Button`. On confirm, in order: `clearDraft(challengeId)`, `clearProgress.mutate(recordId)`, `onCleared()`.

**AMENDED after the Task 15 review — that ordering is not safe on a failed DELETE.** The sketch
never considered the network failing, and with `mutate` (fire-and-forget) it produces exactly the
state the same function refuses to produce three lines earlier: `clearDraft` has already destroyed
the learner's unrecoverable code while the optimistic removal rolls the record back, so the row
saying they solved it returns and their draft does not. Half a clear, and the worse half.

Use `mutateAsync` and clear the draft and the result **after** it resolves, so a failed DELETE
leaves everything intact and the alert is the whole outcome. The usual objection — a visible delay
on every clear — does not apply here: the flow already awaits `readStoredProgress()` before it can
do anything, and already renders an in-flight disabled state built for that wait. One DELETE
round-trip inside an affordance that already exists costs nothing new. On success the learner
observes the same order the sketch specified.

Whichever way this lands, the `stored === null` branch's stated reasoning and the DELETE-failure
branch's behaviour must agree. They currently contradict each other in the same function.

- [ ] **Step 4: Wire it into `ChallengePage`**

Pass `onCleared` as a callback that sets the editor value back to `challenge.starterCode` and then calls `reset(challenge.starterCode)` from `useChallengeRun` (Task 13), which clears the stale result and re-renders the preview.

- [ ] **Step 5: Run the tests and verify they pass**

Run: `pnpm vitest run src/components/challenge`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add -A
git commit -m "feat: add clear and resubmit flow for challenge solutions"
```

---

### Task 16: Dashboard and category browsing

**Files:**
- Modify: `src/components/browse/Dashboard.tsx`, `src/components/browse/ChallengeList.tsx`
- Create: `src/lib/progressSummary.ts`, `src/components/browse/FilterBar.tsx`
- Test: `src/lib/progressSummary.test.ts`, `src/components/browse/FilterBar.test.tsx`

**Interfaces:**
- Consumes: `allChallenges`, `CATEGORY_META`, `challengesInCategory` (Task 6); `useProgressQuery` (Task 8); `useEditorStore` filters (Task 9).
- Produces:
  - `summarise(challenges: readonly Challenge[], records: ProgressRecord[]): ProgressSummary` where
    `ProgressSummary = { total: number; solved: number; revealed: number; byCategory: Record<CategoryId, { total: number; solved: number }>; byDifficulty: Record<Difficulty, { total: number; solved: number }> }`
  - `FilterBar` — a React Hook Form form writing into `useEditorStore.setFilters`

`summarise` is a pure function tested directly, so the dashboard's arithmetic is verified without rendering anything. `revealed` counts challenges with a non-null `revealedAt` — surfacing it is what keeps the completion figure honest per spec §6.

- [ ] **Step 1: Write the failing summary tests**

`src/lib/progressSummary.test.ts` asserts, against a hand-built list of 4 challenges across 2 categories and 2 difficulties:

- `total` equals the challenge count, not the record count.
- `solved` counts only records with `status === 'solved'`.
- A progress record for a challenge id not in the registry is ignored (stale records must not inflate counts).
- `revealed` counts non-null `revealedAt` regardless of solved status.
- `byCategory` and `byDifficulty` totals sum back to `total`.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/lib/progressSummary.test.ts`
Expected: FAIL — `Failed to resolve import "./progressSummary"`.

- [ ] **Step 3: Implement `summarise`**

Build a `Map` of records keyed by `challengeId`, then fold over `challenges` — iterating challenges rather than records is what makes stale records harmless. Seed `byCategory` from `Object.keys(CATEGORY_META)` and `byDifficulty` from a `DIFFICULTIES` constant so every bucket exists at zero rather than being absent.

- [ ] **Step 4: Build the `Dashboard`**

Heading "Your progress", an overall shadcn `Progress` bar, and a card per category linking to `/category/:id` showing `solved / total`. Show the revealed count as secondary text where non-zero.

- [ ] **Step 5: Build `FilterBar` with React Hook Form**

`useForm<ChallengeFilters>` with `defaultValues` from the store; subscribe with `watch` and push changes through `setFilters`. Controls: a text `Input` for `query` (labelled "Search challenges"), `Select` for `difficulty`, and a `Switch` for `hideSolved`. Test that typing in the search box updates the store and that toggling the switch filters a solved challenge out of the rendered list.

- [ ] **Step 6: Apply filters in `ChallengeList`**

Filter by `query` against title and `concepts`, by `difficulty`, and by `hideSolved` against the progress records. Render an explicit empty state when filters exclude everything — never a blank panel.

- [ ] **Step 7: Run the tests and verify they pass**

Run: `pnpm vitest run src/lib src/components/browse`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add -A
git commit -m "feat: add progress dashboard with filtering and category browsing"
```

---

### Task 17: Complete the Selection & Traversal category

**Files:**
- Create: nine files under `src/challenges/selection/`
- Modify: `src/challenges/selection/index.ts`
- Test: covered automatically by `src/challenges/content.test.ts` (Task 7)

**Interfaces:**
- Consumes: `Challenge` (Task 2).
- Produces: nine additional `Challenge` exports registered in `selectionChallenges`, bringing the category to 12.

No new test file. The content suite from Task 7 generalises over the registry, so each challenge added here is automatically checked for solution correctness, a non-passing starter, and complete documentation. That is the whole return on Task 7.

Each challenge below states its id, difficulty, the concept it teaches, and — most importantly — **the trap its tests must catch**. A challenge whose tests do not catch its trap is not finished.

**The plan's "Authoring rules for challenge content" section binds every file in this task**, and it
is repeated here because this is the largest content task and a brief extracted from it would
otherwise not carry the rules:

- **Never write `toBeInstanceOf(SomeBareGlobalConstructor)` in challenge test code.**
  `toBeInstanceOf` resolves the constructor from the realm it is named in. happy-dom shares one
  class table across windows, so a bare global passes under Vitest — but challenges run inside a
  real same-origin iframe with its own constructors, where the same assertion fails on *correct*
  learner output, and the content suite cannot see it. Use `ctx.win.HTMLInputElement`, or prefer
  the structural matchers (`toHaveClass`, `toHaveAttribute`, `toHaveTextContent`, `toHaveLength`),
  which were made realm-independent for exactly this reason.
- **Read learner exports through `ctx.fn<T>(name)`, never by asserting a type onto `ctx.exports`.**
- **A challenge's tests must make the wrong mental model impossible, not merely undesirable.** If
  the learner's function owns both the setup and the mutation, no assertion on its return value
  can distinguish a correct technique from a lucky one — invert control so the *test* performs the
  mutation. `liveVsStatic` is the worked example.
- **Every `starterCode` must run cleanly and fail a named assertion.** A starter that fails to
  transpile also "fails a test", which is why the content suite asserts `error === null` and
  `results.length === tests.length` before it looks at failures.

- [ ] **Step 1: `selection-query-all` — novice — `queryAll.ts`**

Collect the text of every `.item` into a `string[]` via exported `itemTexts()`. **Trap:** `NodeList` is not an `Array` — `.map` does not exist on it. Tests must assert the return value is a real array (`Array.isArray`). Solutions: `Array.from(...).map`, spread `[...nodes].map`, and `forEach` with `push`. Tradeoffs must cover `NodeList.forEach` existing while `HTMLCollection` has nothing.

- [ ] **Step 2: `selection-scoped-query` — intermediate — `scopedQuery.ts`**

Given nested containers, export `directParagraphs(container: Element): Element[]` returning only paragraphs that are direct children. **Trap:** `container.querySelectorAll('div p')` matches descendants whose `div` ancestor is *outside* `container` — selectors are matched against the whole document, then filtered to the subtree. Tests must include a structure where the naive selector over-matches. Solutions: `:scope > p`, and `Array.from(container.children).filter(...)`.

- [ ] **Step 3: `selection-attribute-selectors` — intermediate — `attributeSelectors.ts`**

Export `findByRole(root: Element, role: string): Element[]` plus a selector for external links. **Trap:** attribute values needing quoting, and `[class*="btn"]` matching `btn-danger` as well as `btn`. Tests must include a near-miss element that a sloppy substring selector wrongly matches. Solutions: `[data-role="x"]`, `[href^="http"]`, and `classList.contains` as the precise alternative to `[class*=]`.

- [ ] **Step 4: `selection-children-vs-childnodes` — intermediate — `childrenVsChildNodes.ts`**

Export `counts()` returning `{ children: number; childNodes: number }` for a container whose HTML has newlines between tags. **Trap:** whitespace between tags produces text nodes, so `childNodes.length` exceeds `children.length`. The `html` field **must** contain real newlines between the child elements or the challenge teaches nothing. Tests assert both exact numbers.

- [ ] **Step 5: `selection-first-element-child` — novice — `firstElementChild.ts`**

Export `firstTag(container: Element): string | null`. **Trap:** `firstChild` returns a whitespace `Text` node, which has no `tagName`. Tests assert the tag name is returned, so a `firstChild`-based attempt yields `undefined` and fails. Solutions: `firstElementChild`, and `children[0]`.

- [ ] **Step 6: `selection-sibling-traversal` — intermediate — `siblingTraversal.ts`**

Export `nextRowId(current: Element): string | null` and `previousRowId(current: Element): string | null`. **Trap:** `nextSibling` versus `nextElementSibling`, and returning `null` at the ends rather than throwing. Tests must probe both boundaries — first element's previous and last element's next.

- [ ] **Step 7: `selection-contains-and-position` — advanced — `containsAndPosition.ts`**

Export `isInside(ancestor: Element, node: Node): boolean` and `comesFirst(a: Node, b: Node): boolean`. **Trap:** `contains` returns `true` when the node *is* the ancestor; document order needs `compareDocumentPosition` with `Node.DOCUMENT_POSITION_FOLLOWING` bit-masked, not compared with `===`. Tests must include the self-containment case and a pair in reverse document order.

- [ ] **Step 8: `selection-tree-walker` — expert — `treeWalker.ts`**

Export `visibleText(root: Element): string` collecting text nodes while skipping `<script>` and `<style>`. **Trap:** `NodeFilter.FILTER_REJECT` skips a node *and its subtree*, while `FILTER_SKIP` skips only the node itself — using `SKIP` on a `<script>` still yields its text. Tests must include a `<script>` containing a distinctive string and assert it is absent. Solutions: `createTreeWalker` with a filter, and a recursive walk over `childNodes` for contrast.

- [ ] **Step 9: `selection-template-content` — advanced — `templateContent.ts`**

Export `templateItemCount()` for a page containing a `<template>` with list items inside. **Trap:** `document.querySelectorAll` cannot see inside a `<template>` — its contents live in an inert `DocumentFragment` at `template.content`. Tests assert the document-level query finds zero and the `content` query finds the real number. Explanation must cover why templates are inert: no images fetched, no scripts run.

- [ ] **Step 10: `selection-shadow-boundary` — expert — `shadowBoundary.ts`**

Build a shadow root in the challenge code and export `countInside(host: Element): number`. **Trap:** `document.querySelectorAll` does not pierce shadow boundaries; you must go through `host.shadowRoot`. Tests assert the light-DOM query finds zero. Set `relatedIds: []` for now and add the `web-apis` cross-link in Phase 4 when that category exists — `validateRegistry` rejects dangling ids, so do not point at a challenge that has not been written.

- [ ] **Step 11: Register all nine and run the suite**

Add every export to `selectionChallenges` in `src/challenges/selection/index.ts`.

Run: `pnpm vitest run src/challenges`
Expected: PASS — 12 challenges, every solution passing, every starter failing, every solution documented.

- [ ] **Step 12: Verify green and commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add src/challenges
git commit -m "feat: complete the selection and traversal challenge category"
```

---

### Task 18: Responsive layout and accessibility pass

**Files:**
- Create: `src/components/layout/MobileTabs.tsx`
- Modify: `src/components/challenge/ChallengePage.tsx`, `src/components/layout/AppShell.tsx`
- Test: `src/components/layout/MobileTabs.test.tsx`, `src/components/challenge/ChallengePage.test.tsx`

**Interfaces:**
- Consumes: `useEditorStore.mobileTab` / `setMobileTab` (Task 9).
- Produces: `MobileTabs` — `{ value: MobileTab; onChange: (tab: MobileTab) => void }`.

Both layouts render from **one** component tree; the breakpoint changes presentation only. Conditionally mounting two different trees would double the surface every later task must maintain and silently break state on rotation.

- [ ] **Step 1: Write the failing layout tests**

`src/components/challenge/ChallengePage.test.tsx` asserts:

- All three regions — `Problem`, `Code editor`, `Test results` — are in the accessible tree at every viewport, found by their `aria-label`.
- The segmented control is a `tablist` with three `tab`s; activating one sets `aria-selected` and updates the store.
- The Run button is reachable by keyboard and labelled.
- The results region carries `aria-live="polite"` so a screen reader announces the outcome without moving focus.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm vitest run src/components/challenge/ChallengePage.test.tsx`
Expected: FAIL — no `tablist` yet.

- [ ] **Step 3: Implement `MobileTabs`**

A shadcn `Tabs` with `TabsList`/`TabsTrigger` for `problem`, `code`, `result`, rendered `lg:hidden`.

- [ ] **Step 4: Make `ChallengePage` responsive**

Desktop (`lg:`): a three-column grid using the persisted `layout` percentages. Below `lg`: one column where the two inactive panels get `hidden` and the active one `flex`. Keep the Run button sticky at the bottom on small screens.

**AMENDED — `hidden` must not be applied to the panel containing the preview frame.** Tailwind's
`hidden` is `display: none`, and a document that is not rendered never services
`requestAnimationFrame`: the harness's `tick()` would fall back to its 50 ms timer on every call
and any paint-dependent work in a learner's code simply would not happen. This constraint was
recorded for Task 12 and it recurs here the moment the mobile layout hides two of three panels.
Move the inactive preview off-screen instead — a wrapper that stays rendered (`position: absolute`
with a large negative offset, or `clip-path` with non-zero size) and is hidden from assistive tech
with `aria-hidden` — rather than removing it from the box tree. The other two panels may use
`hidden` freely. Add a test that the preview frame's container is still rendered while another
mobile tab is active; asserting only that the element exists is not enough, since `display: none`
elements are present in the DOM.

- [ ] **Step 5: Accessibility sweep**

Walk every component built in Tasks 10–17 and confirm: one `<h1>` per page; landmarks (`header`, `main`, `nav`) present; every icon-only control has an accessible name; visible focus rings are not removed; `Dialog` traps focus and restores it on close (shadcn handles this — verify, do not assume); pass/fail is not conveyed by colour alone (the `✓`/`✗` plus screen-reader-only text in Task 13 covers this).

Run `pnpm lint` and confirm `jsx-a11y` reports nothing.

- [ ] **Step 6: Add a router `errorElement`**

**ADDED after the Task 14 review.** There is no error boundary anywhere in `src/` — no
`errorElement`, no `componentDidCatch` — while the app now has three lazy boundaries that can
reject on a flaky network: the challenge route (`src/routes.tsx`), Monaco
(`src/components/challenge/EditorPanel.tsx`), and the reveal dialog
(`src/components/challenge/SolutionsPanel.tsx`). A rejected chunk import currently throws to the
root and blanks the whole app rather than degrading the one control that failed. One
`errorElement` on the `AppShell` route covers all three; it must render inside the shell so the
learner keeps the nav and can get back to a working page, and it must offer a retry (a reload is
acceptable — `lazy` re-issues its import on the next attempt). Test it by rendering a route whose
component throws, and assert the shell's nav is still reachable.

- [ ] **Step 6: Verify in a real browser at both sizes**

```bash
pnpm dev
```

Check a challenge page at 375px and at 1440px. Confirm the editor is usable by touch, the sticky Run button does not cover the last line of code, and the preview iframe scrolls independently.

- [ ] **Step 7: Commit**

```bash
pnpm typecheck && pnpm lint && pnpm test
git add -A
git commit -m "feat: add responsive challenge layout with accessibility pass"
```

---

### Task 19: README, license, and project instructions

**Files:**
- Create: `README.md`, `LICENSE`, `AGENTS.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the documentation set. Pulled forward from spec Phase 5 because the app is genuinely runnable at the end of Phase 1, and an app nobody can start is not delivered.

- [ ] **Step 1: Write `LICENSE`**

The MIT license text, copyright `2026 Michaux Kelley`.

- [ ] **Step 2: Write `README.md`**

Sections: what the project is; prerequisites (Node 24 via `.nvmrc`, corepack, pnpm 11); setup (`corepack enable`, `pnpm install`, `pnpm seed`); running (`pnpm dev` starts Vite and json-server together, with the app on 5173 and the API on 4000); the full script table; project layout; how to add a challenge (the `Challenge` shape, where files go, and the fact that the content suite will check it automatically); testing (`pnpm test`, and what the content suite guarantees); and the known limitation that a synchronous infinite loop in submitted code freezes the tab.

- [ ] **Step 3: Write `AGENTS.md`**

The stack-neutral project rules: no `any`, no lint disable comments, TDD, Conventional Commits with no AI attribution, Prettier settings, the harness's host-agnostic contract and why it must stay that way, and the rule that every new challenge needs at least one documented alternative solution with tradeoffs.

- [ ] **Step 4: Write `CLAUDE.md`**

Short, and delegating: a pointer to `@AGENTS.md` for everything non-Claude-specific, plus only the Claude-specific notes — which skills apply to this repo and the reminder to read the spec in `docs/superpowers/specs/` before changing the runner contract.

- [ ] **Step 5: Verify the README from a clean state**

```bash
rm -rf node_modules server/db.json
corepack enable && pnpm install && pnpm seed && pnpm test
```

Expected: every step succeeds by following only what the README says. Fix the README where it does not.

- [ ] **Step 6: Commit**

```bash
git add README.md LICENSE AGENTS.md CLAUDE.md
git commit -m "docs: add readme license and project instruction files"
```

---

## Phase 1 Done When

- `pnpm typecheck && pnpm lint && pnpm test` is green.
- `pnpm dev` serves an app where all 12 Selection & Traversal challenges can be solved, cleared, resubmitted, and revealed.
- The content suite proves every reference solution passes and every starter fails.
- Monaco loads from the local bundle, in its own chunk.
- The app works at 375px and 1440px, and `jsx-a11y` reports nothing.
