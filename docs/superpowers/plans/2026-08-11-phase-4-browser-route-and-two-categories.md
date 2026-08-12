# Phase 4 Implementation Plan: the browser validation route, and two more categories

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the browser validation route that `docs/superpowers/specs/2026-08-11-phase-2-findings.md` §5.1 named the
parallel track, then take `styles` and `async` to depth behind it.

**Architecture:** The route is a **driver around the unmodified production host**, not a second harness. Vitest 4 —
already in the tree — runs the existing content suite in real Chromium through `createIframeHost`, the same code the
learner runs. The content suite's body becomes a factory parameterised by `HostHandle`, which is the seam `AGENTS.md`
§2 already exists to provide; nothing about the harness changes.

**Tech Stack:** Vitest 4 browser mode, `@vitest/browser`, Playwright (Chromium). Everything else as it is.

---

## Why this phase, and the scope call it makes

The findings document's recommended order puts `styles` (4), `async` (5), `forms` (6), `performance` (7) and `a11y` (8)
next, with the browser route running "as a parallel track from day one". Phase 3 did positions 0–3 and did not start
the track. This phase starts it, at the cost of taking two content categories instead of five.

**The argument is not "it unblocks positions 9–11", though it does.** It is that `AGENTS.md` §3 already _requires_
browser verification for a class of challenge — "Challenges that touch platform integers or APIs happy-dom models
differently … must be run once against a real iframe before they are trusted" — and that requirement is today satisfied
by whoever remembers to do it by hand. Every defect this project has shipped came from a claim that was written down
without being run. This route converts the most-violated rule in the file from diligence into a gate, over the 48
challenges that already exist as well as everything after them. It is also strictly cheaper to build at 48 challenges
than at 100.

**The cost, stated plainly:** the app ends this phase with six complete categories instead of nine. If the priority is a
learner-facing library rather than a trustworthy one, Tasks 1–3 are the ones to cut, and Tasks 4–5 stand alone.

## Global Constraints

`AGENTS.md` binds in full. The ones this phase will collide with:

- **No `any`. No lint-suppression comments of any kind** — not `oxlint-disable`, not `@ts-expect-error`. The escape
  hatch is a **file-listed** `overrides` entry in `.oxlintrc.json` with a justifying comment; never a glob.
- **The realm rule.** Never `toBeInstanceOf(SomeBareGlobal)` in challenge content — `ctx.win.X` or a structural
  matcher. Note this phase is the first that can _detect_ a violation; it does not license writing one.
- **Never statically import a challenge module.** Metadata in the category `index.ts`, content in the module.
- **Every `starterCode` runs cleanly and fails a named assertion.**
- **Every challenge carries at least one documented alternative solution with tradeoffs**, labels distinct.
- **Name the plausible-but-wrong solution each challenge rejects, and run it** — the exact code, one variant at a time,
  recording the failure message. Not one that rhymes with it.
- **A browser probe whose answer is "X never happened" needs a positive control in the same document over the same
  wait.** This phase is made entirely of such probes.
- **The preview frame must never be `display: none`** — a non-rendered subtree services no frames and delivers no
  observer entries. This is the single constraint most likely to make Task 1 report a false negative.
- **`pnpm typecheck && pnpm lint && pnpm test && pnpm build`** all green before any task is claimed done.

---

### Task 1: The spike — does a headless driver render?

**Files:** Create `vitest.browser.config.ts`, `src/runner/browserDelivery.browser.test.ts`; modify `package.json`,
`.gitignore`

**This is the measurement the whole route rests on, and it is currently unknown.** Findings §5.1: "does the chosen
driver, headless, deliver `IntersectionObserver` entries and service `requestAnimationFrame`? … If headless does not
render, the route needs a headed display in CI and that changes its cost."

Deliver a measurement, not infrastructure. If the answer is no, **stop and escalate** rather than proceeding to Task 2
with a headed workaround nobody priced.

- [ ] **Step 1: Add the driver.** `pnpm add -D @vitest/browser playwright`, then `pnpm exec playwright install chromium`.
      Add `playwright-report/` and `test-results/` to `.gitignore` if the run creates them.

- [ ] **Step 2: Write `vitest.browser.config.ts`.** It must not collect the node suite, and the node config must not
      collect `*.browser.test.ts` — two configs, disjoint by filename, so neither can silently run the other's files.

```ts
import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['src/**/*.browser.test.ts'],
    browser: {
      enabled: true,
      provider: 'playwright',
      headless: true,
      instances: [{ browser: 'chromium' }],
    },
  },
});
```

- [ ] **Step 3: Exclude the browser files from the node run.** In `vitest.config.ts`'s `test` block, add
      `exclude: [...configDefaults.exclude, 'src/**/*.browser.test.ts']`, importing `configDefaults` from `vitest/config`
      — spelling the exclude list by hand drops Vitest's own defaults and starts collecting `node_modules`. Run
      `pnpm test` and confirm the file count is unchanged from today's 39.

- [ ] **Step 4: Write the probe, with positive controls.** Every negative gets a known-good channel in the same
      document over the same wait. The container is appended to `document.body` and given real size — a zero-size or
      non-rendered container is the false-negative this project has already recorded twice.

```ts
import { afterEach, beforeEach, expect, it } from 'vitest';

import { createIframeHost } from '@/runner/iframeHost';
import type { HostHandle } from '@/runner/harness';

let container: HTMLDivElement;
let host: HostHandle;

beforeEach(() => {
  container = document.createElement('div');
  // Real geometry and a real rendering: AGENTS.md §5 -- a non-rendered subtree services no frames
  // and delivers no observer entries, which would make every negative below meaningless.
  container.style.cssText = 'width: 300px; height: 300px;';
  document.body.append(container);
  host = createIframeHost(container);
});

afterEach(() => {
  host.dispose();
  container.remove();
});

it('services requestAnimationFrame, with a microtask as the control', async () => {
  const ctx = await host.reset('<div id="probe">probe</div>');
  const log: string[] = [];
  await new Promise<void>((resolve) => {
    queueMicrotask(() => log.push('microtask'));
    ctx.window.requestAnimationFrame(() => {
      log.push('raf');
      resolve();
    });
    setTimeout(resolve, 2000);
  });
  expect(log, 'control fired but rAF did not: the frame is not being rendered').toContain('microtask');
  expect(log).toContain('raf');
});

it('delivers IntersectionObserver entries, with MutationObserver as the control', async () => {
  const ctx = await host.reset('<div id="target" style="width:50px;height:50px">t</div>');
  const target = ctx.document.getElementById('target');
  expect(target).not.toBeNull();

  const seen: string[] = [];
  await new Promise<void>((resolve) => {
    let pending = 2;
    const settle = (): void => {
      pending -= 1;
      if (pending === 0) resolve();
    };
    new ctx.window.MutationObserver(() => {
      seen.push('mutation');
      settle();
    }).observe(target as Node, { attributes: true });
    new ctx.window.IntersectionObserver((entries) => {
      if (entries.length > 0) seen.push('intersection');
      settle();
    }).observe(target as Element);
    (target as HTMLElement).setAttribute('data-poke', '1');
    setTimeout(resolve, 2000);
  });

  expect(seen, 'control never fired: the wait, not the observer, is what failed').toContain('mutation');
  expect(seen).toContain('intersection');
});
```

Write the `ResizeObserver` case to the same shape — same `pending`/`settle` pairing, same 2000 ms escape, same
`MutationObserver` control in the same document — observing `target` and then setting `target.style.width = '80px'`
from the frame realm to trigger it. Do not collapse the three probes into one test: a shared wait would let one
channel's delivery mask another's silence, which is the exact confusion the controls exist to prevent.

- [ ] **Step 5: Run it and record the numbers.** `pnpm test:browser` (add
      `"test:browser": "vitest run --config vitest.browser.config.ts"`). Run **at least 20 times** — a delivery question
      answered once is the failure mode §2 of the findings document is about. Record: pass rate, per-run wall clock, and
      whether any control ever failed (a failed control invalidates that run, it does not fail the feature).

- [ ] **Step 6: Record the verdict** in `docs/superpowers/specs/2026-08-11-phase-2-findings.md` §8, replacing "Whether a
      headless driver renders" with what was measured. If headless does **not** render, write what headed costs and
      **stop — escalate before Task 2.**

- [ ] **Step 7: Commit.** `test(runner): measure headless delivery of frames and observer entries`

---

### Task 2: The content suite, over the production host, in Chromium

**Files:** Create `src/challenges/contentSuite.ts`, `src/challenges/content.browser.test.ts`; modify
`src/challenges/content.test.ts`

The node suite proves a challenge is self-consistent under happy-dom. This proves it runs in Chrome. Both are needed and
neither replaces the other, so **the node suite does not shrink** — this task adds a second reader of the same content,
it does not move one.

**Interfaces:**

- Produces: `defineContentSuite(options: { createHost: () => HostHandle; label: string }): void` — declares the whole
  suite against a host factory. Both entry files call it and neither holds assertions of its own.
- Consumes: `HostHandle` from `@/runner/harness`, `loadChallenge`, `challengeIndex`.

- [ ] **Step 1: Extract the suite body verbatim into `contentSuite.ts`,** taking the host from `options.createHost()`
      where it today calls `createMemoryHost()`. Change nothing else — not an assertion, not a comment. The comments in
      that file record measurements and every one of them still applies.

- [ ] **Step 2: Reduce `content.test.ts` to its call**, and run `pnpm test`. Expected: the same test count as before the
      extraction, all green. If the count moved, the extraction was not verbatim.

```ts
import { defineContentSuite } from './contentSuite';
import { createMemoryHost } from '@/test/createMemoryHost';

defineContentSuite({ createHost: createMemoryHost, label: 'happy-dom' });
```

- [ ] **Step 3: Add `content.browser.test.ts`,** which supplies an iframe host over a rendered, sized container — the
      same arrangement Task 1 measured, for the same reason.

```ts
import { defineContentSuite } from './contentSuite';
import { createIframeHost } from '@/runner/iframeHost';

defineContentSuite({
  createHost: () => {
    const container = document.createElement('div');
    // Must be rendered and non-zero: a display:none or zero-size container services no frames.
    container.style.cssText = 'width: 400px; height: 300px;';
    document.body.append(container);
    return createIframeHost(container);
  },
  label: 'chromium',
});
```

- [ ] **Step 4: Run it and fix what it finds.** `pnpm test:browser`. Expect failures — that is the point of the task,
      and finding none would be the surprising result worth a second look. For each: decide whether the challenge is
      wrong or the browser is, and say which. A challenge that only fails in Chrome is a challenge that was shipping
      broken.

- [ ] **Step 5: Report the delta.** How many of the 48 challenges failed, which, and why. This number is the task's
      actual deliverable — it is the first direct measurement of how much the happy-dom-only guarantee was worth.

- [ ] **Step 6: Wire it into the gates.** Add `test:browser` to whatever CI runs, and state in `AGENTS.md` §1 whether it
      joins the four gates or runs separately. **If it is slower than a watch loop tolerates, say so and keep it out of
      `pnpm test`** — a gate people skip is worse than a gate that is honest about when it runs.

- [ ] **Step 7: Commit.** One commit for the extraction, one for the browser entry, one per content fix.

---

### Task 3: Make the skipped set visible

**Files:** Modify `src/types/challenge.ts`, `src/challenges/contentSuite.ts`, `src/challenges/registry.test.ts`

`AGENTS.md` §10 requires `content.test.ts` to open **every** challenge, and that totality is a real guarantee. A
challenge that can only run in the browser punches a hole in it. Findings §5.1: the hole must be **visible** — the node
suite should assert that every challenge it skips is registered in the browser suite's manifest, rather than simply
skipping.

Only do this task if Task 2 produced challenges that genuinely cannot run under happy-dom. **If none did, skip it and
say so** — an unused marker is a mechanism people will later use for challenges that were merely inconvenient to fix.

- [ ] **Step 1: Write the failing test first.** In `registry.test.ts`: a challenge marked `hosts: ['browser']` is absent
      from the node suite's set and present in the browser suite's, and the two sets union to the whole index. Watch it
      fail.
- [ ] **Step 2: Add the field** to `ChallengeMeta` as an optional, defaulting to both hosts. It lives in the **index**,
      not the module, so `/` can see it without loading content.
- [ ] **Step 3: Make `defineContentSuite` filter on it,** and assert the count it skipped equals the count the other
      host claims — a skip that nothing counts is a skip nobody will notice.
- [ ] **Step 4: Run both suites.** Counts must add up to the index length in both directions.
- [ ] **Step 5: Record the rule in `AGENTS.md` §10,** with the reason: the totality guarantee now has two readers, and
      the marker is what keeps their union whole.
- [ ] **Step 6: Commit.**

---

### Task 4: `styles` — Styles & CSSOM, to depth

**Files:** new modules under `src/challenges/styles/`, plus its `index.ts`

Recon verdict: **green + subset**, and the subset contains the category's actual lesson. `AGENTS.md` §3 and findings
§4.1 state the boundary; read both before authoring, and put what you measure in the category's `index.ts` docblock.

Assert only: **px lengths written as px**; a custom property read off the element that **declares** it; any longhand the
challenge's own CSS sets. Never a colour, a shorthand assembled from longhands, an `em` or a percentage, a UA default, a
pseudo-element, a `var()` fallback, or an inherited custom property read off the inheriting element. `2em` against
`font-size: 10px` gives **`32px` here and `20px` in Chrome** — a plausible wrong number, the worst available shape.

**Task 2 changes what this task can claim.** With the browser suite live, a `styles` challenge can be verified in
Chromium as it is written rather than trusted. Use it, and say in the report which challenges the browser suite caught.

Ideas, each stated as its trap: inline `style` versus a stylesheet rule and which wins; `style.setProperty` versus
`setAttribute('style', …)` and what the second destroys; custom properties and the indirection `var()` buys;
`classList` versus rewriting `className`; specificity and `!important` over inline; `insertRule` and `CSSStyleSheet`
manipulation versus toggling a class, and why the second is almost always right; `getComputedStyle` versus
`style.width` and why the latter is empty for anything the stylesheet set; and the dashed-property index trap
(`style['margin-bottom']` is a real declaration in Chrome and a no-op under happy-dom — now testable in both).

Ten to twelve expected. Say so if the category is genuinely complete at eight.

---

### Task 5: `async` — Async & Scheduling, to depth

**Files:** new modules under `src/challenges/async/`, plus its `index.ts`

Recon verdict: **green + subset** on four schedulers — `rAF`, microtasks, timers, `AbortController`.

Two hard rules, both measured: **`requestIdleCallback` is absent** from the pinned happy-dom — do not shim it; a
challenge about the `setTimeout` fallback is authorable today and teaches the more useful thing. And **never assert
ordering between two schedulers** — `micro → timeout0 → raf` in Chrome, `micro → raf → timeout0` under happy-dom.
Ordering _within_ one scheduler is fine.

That second rule is now partly liftable and it is worth being precise about how: a cross-scheduler ordering assertion is
still unauthorable in the **node** suite, but a challenge marked browser-only (Task 3) could assert Chrome's real
ordering. **Do not reach for that on the first pass.** It trades the project's strongest guarantee — that every
challenge is validated by the same suite — for one lesson, and the lesson can be taught by an ordered log within one
scheduler. If you author one anyway, argue it in the report.

Cover: the microtask/macrotask split and why `queueMicrotask` starves the frame; `rAF` for coalescing writes; debounce
versus throttle built by hand; `AbortController` for cancellation, including aborting a listener and aborting a chain;
`setTimeout(0)` versus `queueMicrotask` for "after this turn"; and the reentrancy trap where a callback schedules
itself.

Ten to twelve expected.

---

## Deliberately not in this phase

- **The `iframeHost` URL decision (findings §5.2).** It blocks History, which blocks `storage`, which is position 11 —
  behind three categories this phase does not reach either. It is also not the decision it looks like: findings §5.2
  closes by naming the question that has to be answered *first* — whether the preview's navigable can be detached from
  the tab's joint session history at all while staying same-origin and script-executing — and that is unmeasured.
  Pricing C or D before answering it would be choosing between two options whose real cost nobody knows.
- **`forms`, `performance`, `a11y`** — positions 6–8, next phase.
- **`react`** — needs its own brainstorm (findings §8), not a slot in a content phase.

## Phase 4 Done When

- The headless delivery question is **measured and recorded** in the findings document, replacing the unknown.
- Every existing challenge runs under the production host in real Chromium, or is marked browser-only in a way both
  suites count — and the number that failed on first contact is written down.
- `styles` and `async` each teach a complete mental model, and each says why it stopped where it did.
- Every challenge names the wrong solution its tests reject, verified by running that exact code.
- All four gates green, plus the browser suite, with the route budgets passing without a hand re-baseline.
