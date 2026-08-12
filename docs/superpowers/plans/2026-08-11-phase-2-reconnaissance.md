# Phase 2 Reconnaissance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Determine which of the twelve unpopulated categories the engine can actually carry, before committing a
category's worth of authoring to any of them.

**Architecture:** Two unblocking engine changes, then one reconnaissance challenge per remaining category — each chosen
to exercise that category's *riskiest* engine dependency rather than its most representative one — and a findings report
that decides Phase 3's category order.

**Why this order.** Phase 1's category went smoothly because it needed nothing the engine did not already have. Every
remaining category has at least one dependency nobody has tested, and the content-correctness suite runs on happy-dom,
so a category whose APIs happy-dom lacks cannot be validated at all — not "validated more weakly", *not validated*. That
suite is the load-bearing guarantee of the whole project. Discovering a gap at challenge 3 costs a design decision;
discovering it at challenge 40 costs a category.

## Measured environment facts

Probed directly against `happy-dom` at the version this repo pins. **Do not re-derive; do not assume.**

| API | Status | Category that promises it |
| --- | --- | --- |
| `MutationObserver` | present | observers |
| `IntersectionObserver` | present as a constructor | observers |
| `ResizeObserver` | present as a constructor | observers |
| `requestAnimationFrame` | present | async, performance |
| `requestIdleCallback` | **MISSING** | async — named in its blurb |
| `indexedDB` | **MISSING** | storage — named in its blurb |
| `canvas.getContext('2d')` | **returns null** | web-apis — Canvas named in its blurb |
| `structuredClone` | **MISSING** | storage, web-apis |
| `FormData`, `SubmitEvent` | present | forms |
| `DataTransfer`, `DragEvent`, `ClipboardEvent`, `navigator.clipboard` | present | web-apis |
| `CustomEvent`, `AbortController` | present | events |
| `localStorage`, `history`, `URL` | present | storage |
| `getComputedStyle`, `CSS`, `matchMedia` | present | styles |

**Presence is not fidelity.** `IntersectionObserver` and `ResizeObserver` being constructors says nothing about whether
they ever *fire* — both need layout, and happy-dom has no layout engine (`getBoundingClientRect()` returns zeros). That
is the single most important thing this reconnaissance has to settle, because it decides whether the Observers category
exists at all.

## Global Constraints

Everything in `AGENTS.md` binds, and it is the product of nineteen tasks of finding these out the hard way. The ones
this phase will collide with:

- **No `any`. No lint-disable comments of any kind**, including `ts-expect-error`.
- **The realm rule.** Tests run in the app realm, challenges in an iframe realm; happy-dom shares one class table
  across windows, so `toBeInstanceOf(SomeBareGlobal)` passes under Vitest and fails in a real browser. Use `ctx.win.X`
  or the structural matchers.
- **Every `starterCode` must run cleanly and fail a named assertion.** A starter that fails to transpile also "fails a
  test", which is why the suite pins `error === null` and `results.length === tests.length` first.
- **A challenge's tests must make the wrong mental model impossible, not merely undesirable.**
- **`<script>` in a challenge's `html` may be traversed, never relied upon** — the real host executes it, happy-dom
  does not.
- Prettier at 120 columns; Conventional Commits, atomic; no AI attribution.

---

### Task 1: Make the registry lazy

**Files:**

- Create: `src/challenges/index.generated.ts` (or a build step that writes it), `src/challenges/loader.ts`
- Modify: `src/challenges/registry.ts`, `src/challenges/selection/index.ts`, `src/components/browse/Dashboard.tsx`,
  `src/components/browse/ChallengeList.tsx`, `src/components/challenge/ChallengePage.tsx`, `src/lib/progressSummary.ts`
- Delete: the `eager registry scale` block in `src/challenges/registry.test.ts`
- Test: `src/challenges/loader.test.ts`, plus updates wherever `allChallenges` is consumed

**This is a hard blocker, not a nice-to-have.** `pnpm test` fails at challenge 14 and `pnpm build` fails at 15; Task 3
adds twelve. Both guards exist specifically to stop this being deferred again.

The problem: `Dashboard` imports `allChallenges`, so every challenge's `prompt`, `html`, `starterCode`, every solution's
`code`/`explanation`/`tradeoffs`, and every `tests[].run` function ships in the landing page's static closure —
**87,832 B of 452,947 B (19.4%) at 13 challenges, ~6,756 B each, ~696 kB at the ~103 the project targets.** All of it
for a page that renders counts and titles.

- [ ] **Step 1: Write the failing test** — `loader.test.ts` asserts the index carries only
      `{id, slug, title, category, difficulty, concepts}`, and that loading a challenge by slug resolves the full
      object. Assert the index entry has **no** `tests`, `solutions`, `html` or `starterCode` key, since that absence
      is the entire point and a spread would silently reintroduce them.
- [ ] **Step 2: Run it and watch it fail.**
- [ ] **Step 3: Implement.** A metadata index plus `loadChallenge(slug): Promise<Challenge>` backed by a dynamic
      `import()`. `ChallengePage` is already `lazy()`, so only `challengeBySlug` has to become async. `summarise`,
      `Dashboard` and `ChallengeList` consume the index alone.
- [ ] **Step 4: Keep the content suite whole.** `content.test.ts` must still exercise **every** challenge — it is the
      correctness guarantee and must not silently start testing a subset. Eager import there is correct; it is a test.
- [ ] **Step 5: Verify by measurement, not by listing.** `pnpm build`'s budget check must show `/` dropping by
      approximately the 87,832 B measured above. Re-baseline the budgets in `scripts/routeBudget.ts` and correct
      `AGENTS.md` §10 to describe the post-refactor architecture.
- [ ] **Step 6: Delete the two guards** — the `EAGER_REGISTRY_LIMIT` block and its cross-reference in the budget
      script. They exist to force this refactor; leaving them is a tripwire with nothing behind it.
- [ ] **Step 7: Commit.**

---

### Task 2: `submit` must dispatch a `SubmitEvent`

**Files:** Modify `src/runner/context.ts`; test `src/runner/context.test.ts`

`context.ts`'s `submit` helper dispatches a bare `Event`, so `event.submitter` is `undefined`. Forms & Validation cannot
be authored honestly without it — "which button submitted this form" is a core lesson of that category. happy-dom has
`SubmitEvent`, so this is a small change.

- [ ] **Step 1:** Failing test — a submit handler reads `event.submitter` and gets the button that was passed.
- [ ] **Step 2:** Run it, watch it fail with `undefined`.
- [ ] **Step 3:** Dispatch a `SubmitEvent` with `submitter` in its init, taking the constructor from the challenge's
      realm rather than the app's.
- [ ] **Step 4:** Verify, and confirm the existing `submit` tests still pass unchanged.
- [ ] **Step 5:** Commit.

---

### Task 3: One reconnaissance challenge per remaining category

**Files:** one new file under each of `src/challenges/<category>/`, plus each category's `index.ts`

**These are real challenges, authored to the full standard** — the phase produces content, not throwaways. What makes
them reconnaissance is the *selection*: each category's challenge targets that category's riskiest engine dependency,
so the category fails loudly here or not at all.

**A reconnaissance challenge that quietly avoids the risky API has failed at its only job.** If the honest challenge
cannot be written, that is the finding — record it and move on. Do not substitute an easier one to produce a green suite.

Risk-ordered. Do the high-risk ones first; a stop-the-line finding is worth more early.

- [ ] **`observers` — highest.** Does `IntersectionObserver` ever *fire* under happy-dom, given no layout engine?
      Author against it and find out. If it cannot fire, the category is browser-only and that changes its plan.
- [ ] **`performance`.** Layout thrashing is the category's core lesson and it needs real geometry —
      `offsetWidth`/`getBoundingClientRect` return zeros here. Can a challenge assert a *batching* property without
      measuring pixels (e.g. counting reads/writes through a proxy)?
- [ ] **`async`.** `requestIdleCallback` is missing. Can the category teach scheduling through microtasks, `rAF` and
      `AbortController` alone, or does it need a shim?
- [ ] **`storage`.** `indexedDB` is missing. `localStorage`, `URL` and `history` are present — is that enough for a
      category, or does IndexedDB need a shim or a browser-only marker?
- [ ] **`web-apis`.** `canvas.getContext('2d')` returns null. Shadow DOM is already proven by Phase 1. Target Canvas or
      Clipboard, not Shadow DOM — the point is the untested half.
- [ ] **`forms`.** Constraint Validation: does happy-dom implement `checkValidity`, `setCustomValidity` and the
      `validity` flags faithfully? Depends on Task 2.
- [ ] **`styles`.** Does `getComputedStyle` resolve custom properties and the cascade, or only inline styles?
- [ ] **`a11y`.** Focus management works, but `:focus-visible` and computed ARIA state may not.
- [ ] **`events`.** Delegation, propagation, `AbortController` — medium risk; exercises `context.ts` broadly.
- [ ] **`attributes`.** The attribute/property split and `dataset` — low risk.
- [ ] **`creation`.** `DocumentFragment` batching, `insertAdjacentHTML`, template cloning — low risk.
- [ ] **`react` — separate, and last.** React must run *inside the frame realm*. `RunOptions.modules` exists as a seam
      and has never been used. If it does not work, that is the largest finding in this phase and it deserves its own
      brainstorm rather than a task. Do not force it.

- [ ] **Final step: the findings report.** `docs/superpowers/specs/2026-08-11-phase-2-findings.md`, one row per
      category: can the engine carry it, what it needs if not, and the recommended authoring order for Phase 3.
      **This report is the deliverable.** The twelve challenges are its evidence.

---

## Phase 2 Done When

- The registry is lazy and `/`'s eager JavaScript has dropped by roughly 87 kB, measured by route-level delta.
- `submit` carries its `submitter`.
- Every remaining category has one honest challenge, or a recorded reason it cannot have one yet.
- The findings report names Phase 3's category order and what each blocked category needs first.
