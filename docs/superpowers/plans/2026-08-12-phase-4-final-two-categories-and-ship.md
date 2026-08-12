# Phase 4 Implementation Plan: the last two categories, then ship

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish `styles` and `forms`, verify all six shipping categories in a real browser once, and make the app
honest about what it contains. This is the last phase.

**Scope decision, made by the owner and binding on everything below:** the target is **six categories a learner can
finish and trust** — not the ~103 challenges across twelve categories the original spec described. `selection`,
`creation`, `attributes` and `events` are done; `styles` and `forms` are this phase; the other six categories do not
ship. `forms` takes the sixth slot over `async` — the findings order put `async` first on engine risk, but the shipping
six are now chosen by learner value, and a learner practising DOM manipulation meets forms constantly and
`requestIdleCallback` never. The cost is real and priced: findings §4.2's four exclusions mean more design work per
challenge, including the loss of the category's natural styling challenge.

**Tech Stack:** unchanged, plus Playwright/Chromium for a one-time verification pass that does not become
infrastructure.

---

## What the scope decision retires

Recorded so nobody re-derives them as open questions. Each was live until the scope narrowed, and each is now moot
rather than deferred:

- **The browser validation route as a permanent gate** (findings §5.1). Its nine payoffs are all in categories that no
  longer ship. What survives is a **one-time pass** (Task 3), which is a different and much smaller thing: no
  parameterised content suite, no `browserOnly` marker, no second CI gate.
- **The `iframeHost` URL decision** (findings §5.2). It blocked History, which blocked `storage`, which does not ship.
- **`react`** (findings §8), and every other category at positions 6–12.

The word doing the work in the owner's answer is **trust**, and it points at exactly the two categories left. `styles`
is where happy-dom's lying is worst — findings §4.1 lists a whole class of "green here, wrong in a browser" computed
values — and `forms` is where two of its four exclusions fail in the dangerous direction, looking like they work here
while doing nothing in a browser. So the verification pass is not optional decoration on the scope decision; it is the
half of it that says "and trust".

## Global Constraints

`AGENTS.md` binds in full. The ones this phase will collide with:

- **No `any`. No lint-suppression comments of any kind.** The escape hatch is a **file-listed** `overrides` entry in
  `.oxlintrc.json` with a justifying comment; never a glob.
- **The realm rule.** Never `toBeInstanceOf(SomeBareGlobal)` in challenge content — `ctx.win.X` or a structural matcher.
- **Never statically import a challenge module.** Metadata in the category `index.ts`, content in the module.
- **Every `starterCode` runs cleanly and fails a named assertion.**
- **Every challenge carries at least one documented alternative solution with tradeoffs**, labels distinct.
- **Name the plausible-but-wrong solution each challenge rejects, and run that exact code** — one variant at a time,
  recording the failure message. Not one that rhymes with it.
- **`expect(...).toEqual(...)` never discriminates DOM nodes.** `toBe`, or a projection.
- **A browser probe whose answer is "X never happened" needs a positive control** in the same document over the same
  wait. **The preview frame must never be `display: none`** — a non-rendered subtree services no frames.
- **`pnpm typecheck && pnpm lint && pnpm test && pnpm build`** all green before any task is claimed done.

---

### Task 1: `styles` — Styles & CSSOM, to depth

**Files:** new modules under `src/challenges/styles/`, plus its `index.ts`

The category already holds `density-token` from reconnaissance. **Absorb it rather than replacing it** — it exists, it
passes, and it was authored against the measured boundary.

Recon verdict: **green + subset**, and the subset contains the category's actual lesson. Read `AGENTS.md` §3 and
findings §4.1 before authoring, and put whatever you measure into the category's `index.ts` docblock, which is where
the next author will look.

Assert only: **px lengths written as px**; a custom property read off the element that **declares** it; any longhand the
challenge's own CSS sets. Never a colour (`red` stays `red` here instead of computing to `rgb(...)`), a shorthand
assembled from longhands, an `em` or a percentage (`2em` against `font-size: 10px` gives **`32px` here and `20px` in
Chrome** — a plausible wrong number, the worst available shape), a UA default, a pseudo-element, a `var()` fallback, or
an inherited custom property read off the inheriting element.

Ideas, each stated as its trap rather than its API: inline `style` versus a stylesheet rule and which wins;
`style.setProperty` versus `setAttribute('style', …)` and what the second destroys; custom properties and the
indirection `var()` buys; `classList` versus rewriting `className`; specificity and `!important` over inline;
`insertRule` and `CSSStyleSheet` manipulation versus toggling a class, and why the second is almost always right;
`getComputedStyle` versus `style.width`, and why the latter is empty for anything a stylesheet set; and the
dashed-property index trap (`style['margin-bottom'] = '5px'` is a real declaration in Chrome and a **no-op** here — so
it may be taught but never asserted until Task 3 can check it).

Ten to twelve expected, `density-token` included. Say so if the category is genuinely complete at eight.

---

### Task 2: `forms` — Forms & Validation, to depth

**Files:** new modules under `src/challenges/forms/`, plus its `index.ts`

The category already holds `signup-validation` from reconnaissance. **Absorb it.**

Recon verdict: **green minus exactly four things**, every one enumerated in findings §4.2 and mirrored in `AGENTS.md`
§3's Forms bullet. Read both before authoring; the boundary is precise enough to author against, which is what the
reconnaissance was for.

Faithful, measured identical in both hosts, and therefore fair game: `valueMissing`, `typeMismatch`, `patternMismatch`,
`rangeOverflow`, `stepMismatch`; `checkValidity()` and its per-field `invalid` event, collectable from one
capture-phase listener on the form; `setCustomValidity` including its round-trip through `validationMessage` and its
clearing on `''`; `willValidate` on inputs; `noValidate`; `FormData` in full — `getAll`, multi-selects, excluded
disabled fields, the two-argument `FormData(form, submitter)`; `requestSubmit(submitter)` declining to fire on an
invalid form; `form.reset()` including radios; and `SubmitEvent.submitter`.

The four exclusions, each of which is a challenge that must not be written rather than a detail to work around:

1. **`minlength`/`maxlength`** — `tooShort`/`tooLong` apply only to a user-edited value; happy-dom ignores that
   condition, so they look like they work here and do nothing in a browser. The dangerous direction.
2. **Browser-supplied `validationMessage`** — `''` here for every built-in failure. Only a message the challenge set
   with `setCustomValidity` is assertable.
3. **`:invalid`/`:valid`/`:required`** — never match here. This costs the category its natural styling challenge; a
   styling challenge must key off an attribute the code sets (`aria-invalid`, a `data-*` state), which happens to be
   the more accessible pattern anyway — teach that as the lesson, not as the workaround.
4. **`button.willValidate`** — `undefined` here, `true` in Chrome.

Ideas, each stated as its trap: `submit()` versus `requestSubmit()` and which one skips validation entirely; reading a
form with `FormData` versus walking `.value` by hand, and what disabled fields do to each; `checkValidity` versus
`reportValidity` (probe the second before relying on it — it was not in the recon pass); one capture-phase `invalid`
listener versus a listener per field; `setCustomValidity` and the empty-string clearing trap that leaves a form
permanently invalid; `defaultValue`/`defaultChecked` and `reset()`, tying back to `attributes`' dirty-value-flag
challenge; which submitter a two-argument `FormData(form, submitter)` records and why that matters for multi-button
forms; and marking invalid state with `aria-invalid` so CSS and assistive tech read the same signal.

Ten to twelve expected, `signup-validation` included. Note the shipped app's own storage protection (`AGENTS.md` §2)
if any challenge touches persistence — a form-draft challenge is where someone would naturally reach for
`localStorage`, and the `dom-challenges-*` prefix is off limits.

---

### Task 3: Verify all six shipping categories in a real browser, once

**Files:** Create `vitest.browser.config.ts`, `src/challenges/content.browser.test.ts`; modify `vitest.config.ts`,
`package.json`, `.gitignore`

**This is a verification pass, not a platform.** It runs after the content exists so it covers all of it. Resist every
temptation to generalise it: no `browserOnly` marker, no second permanent CI gate, no host-parameterised suite
abstraction. One config, one test file, one run, and a written record of what it found.

`AGENTS.md` §3 already requires this for challenges touching platform behaviour happy-dom models differently — "must be
run once against a real iframe before they are trusted." Today that is satisfied by whoever remembers. This task
discharges it for the whole shipping library at once, which is the "and trust" half of the scope decision.

- [ ] **Step 1: Add the driver.** `pnpm add -D @vitest/browser playwright`, then `pnpm exec playwright install chromium`.
      Add `playwright-report/` and `test-results/` to `.gitignore` if a run creates them.

- [ ] **Step 2: Write `vitest.browser.config.ts`,** disjoint from the node config by filename so neither can silently
      collect the other's files.

```ts
import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['src/**/*.browser.test.ts'],
    browser: { enabled: true, provider: 'playwright', headless: true, instances: [{ browser: 'chromium' }] },
  },
});
```

- [ ] **Step 3: Exclude the browser file from the node run.** In `vitest.config.ts`'s `test` block add
      `exclude: [...configDefaults.exclude, 'src/**/*.browser.test.ts']`, importing `configDefaults` from
      `vitest/config` — spelling the list by hand drops Vitest's defaults and starts collecting `node_modules`. Run
      `pnpm test`; the file count must not move.

- [ ] **Step 4: Prove the harness delivers before trusting any negative from it.** Findings §5.1 records this as the
      unknown the whole idea rests on: a document the browser is not rendering services no frames, and in a headless run
      that silently does not render, `tick()` escapes through `FRAME_FALLBACK_MS` on every call — so every
      frame-dependent challenge would "pass" without its paint-dependent work ever running, which is a false positive
      wearing a green suite. Write this probe first, with its positive control, and do not proceed while it fails.

```ts
import { afterEach, beforeEach, expect, it } from 'vitest';

import type { HostHandle } from '@/runner/harness';
import { createIframeHost } from '@/runner/iframeHost';

let container: HTMLDivElement;
let host: HostHandle;

beforeEach(() => {
  container = document.createElement('div');
  // Real geometry and a real rendering: AGENTS.md §5 -- a non-rendered subtree services no frames,
  // which would make every negative in this file meaningless.
  container.style.cssText = 'width: 400px; height: 300px;';
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
```

- [ ] **Step 5: Run every challenge's solutions and starter through `createIframeHost`,** with the same assertions
      `content.test.ts` makes — `error === null`, `results.length === tests.length`, no failed result for a solution, at
      least one for a starter. Import `defineContentSuite`-style logic by hand if that is simpler than refactoring; the
      node suite must not change. Only the six shipping categories are in scope.

- [ ] **Step 6: Triage every failure into one of two buckets, and say which.** A challenge that is wrong in Chrome is a
      bug to fix. A probe that is wrong about Chrome is a bug in this task. The two are easy to confuse and only one of
      them means the library was broken.

- [ ] **Step 7: Fix what the pass found,** one commit per challenge, each naming the divergence and the failure message.
      Any newly measured divergence goes into `AGENTS.md` §3 and the category's `index.ts` docblock — that is where the
      knowledge has to land to survive.

- [ ] **Step 8: Record the count.** How many of the ~70 challenges failed on first contact with a real browser, and
      which. This number is the task's real deliverable: it is the first direct measurement of what the happy-dom-only
      guarantee was worth, and it is the evidence behind the word "trust".

- [ ] **Step 9: Decide whether `pnpm test:browser` stays.** Keep the config and the file committed either way — they are
      the record. State in `AGENTS.md` §1 whether the pass joins the gates or is run deliberately before a release.
      **If it is slower than a watch loop tolerates, keep it out of `pnpm test` and say so** — a gate people skip is
      worse than one that is honest about when it runs.

- [ ] **Step 10: Commit.**

---

### Task 4: Make the app honest about what it contains

**Files:** modify `src/challenges/registry.ts` and/or the category metadata it reads, the browse UI that lists
categories, `README.md`, `docs/superpowers/specs/2026-08-09-dom-challenges-design.md`

Six categories ship. Six do not, and each of those six holds exactly one reconnaissance challenge: `a11y`
(`roving-tabindex`), `async` (`frame-batch`), `observers` (`mutation-batch`), `performance` (`layout-thrash`),
`storage` (`filter-state`), `web-apis` (`copy-handler`). A learner opening the app today sees twelve categories, half of
them with one challenge — which is the precise opposite of "a learner can finish".

**Do not delete those six challenges.** They pass, they are documented, they carry measurements in their category
docblocks, and `content.test.ts` opening every challenge is what keeps the index honest (`AGENTS.md` §10). Hide the
categories from the browse UI; keep the content in the repo and in the suites.

- [ ] **Step 1: Write the failing test first.** The browse UI lists exactly the shipping categories; the registry still
      resolves every challenge including the hidden ones; `content.test.ts`'s count is unchanged. Watch each fail.
- [ ] **Step 2: Add the flag to category metadata** — not to `ChallengeMeta`, which is per challenge. Default it so a
      new category must opt **in** to shipping: the failure mode worth preventing is a half-finished category appearing
      by default, which is the exact state this task exists to fix.
- [ ] **Step 3: Filter the browse UI**, and confirm a direct link to a hidden challenge still resolves rather than
      404ing — the content is unshipped, not withdrawn, and a stale bookmark should not break.
- [ ] **Step 4: Re-run the route budgets.** Hiding is a UI filter, so the index is unchanged and the budgets should not
      move at all. If they move, the flag was put somewhere it changes the import graph — that is a finding, not a
      re-baseline.
- [ ] **Step 5: Correct every claim that promises twelve categories or ~103 challenges** — `README.md`, the design spec,
      and anything else stating a target. Re-derive the test and challenge counts rather than copying them; `AGENTS.md`
      §8 records that `README.md` has shipped a stale count before. Prefer wording that does not rot.
- [ ] **Step 6: Commit.**

---

## Deliberately not in this phase, and not in any phase

`async`, `performance`, `a11y`, `observers`, `web-apis`, `storage`, `react`; the browser route as permanent
infrastructure; the `iframeHost` URL decision. All retired by the scope decision, not deferred by it. `async` was the
findings order's position 5 and is the nearest miss — it lost the sixth slot to `forms` on learner value, and its
reconnaissance challenge stays in the repo like the others'. The findings document stays as the record of what was
measured and why these were possible — if the scope ever widens again, it is still the map.

## Phase 4 Done When

- `styles` and `forms` each teach a complete mental model, absorbing their reconnaissance challenge, and each says why
  it stopped where it did.
- Every challenge names the wrong solution its tests reject, verified by running that exact code.
- All six shipping categories have been run through the production host in real Chromium, the failure count is written
  down, and everything it found is fixed and recorded in `AGENTS.md`.
- The app shows six finishable categories, and no document promises twelve.
- All four gates green, route budgets passing without a hand re-baseline.
