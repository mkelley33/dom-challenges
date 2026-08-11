# Phase 3 Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan
> task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the three categories the engine can carry unconditionally from one reconnaissance challenge each to a
complete mental model, and close the budget deadline that lands before they finish.

**Why these three.** `docs/superpowers/specs/2026-08-11-phase-2-findings.md` measured every category against the
engine. `creation`, `attributes` and `events` came back clean — no subset boundary, no browser-only dependency, nothing
that needs engine work first. Five more are authorable only inside a stated subset, and three are mostly blocked on a
browser validation route that is a larger, still-undesigned piece of work. Doing the clean three first means Phase 3
produces four complete categories without waiting on that design, and it exercises the lazy registry and the derived
budget under real growth before anything harder depends on them.

**What "complete mental model" means here.** Selection & Traversal is the reference: 13 challenges, novice through
expert, each teaching a distinct idea, several deliberately teaching the _same_ task two ways so the tradeoff is the
lesson. A category is done when a learner who finishes it would not be surprised by that area of the DOM — not when it
hits a number. Ten to twelve is the expected range; say so if a category is genuinely complete at eight.

## Global Constraints

`AGENTS.md` binds in full — it is the product of two phases and every rule carries the measurement that produced it.
The ones this phase will collide with:

- **No `any`. No lint-disable comments of any kind.** The escape hatch is a file-listed `overrides` entry in
  `.oxlintrc.json` with a justifying comment; never a glob.
- **The realm rule.** Never `toBeInstanceOf(SomeBareGlobal)` in challenge content — use `ctx.win.X` or a structural
  matcher. The content suite cannot see this mistake.
- **Never statically import a challenge module.** Metadata in the category `index.ts`, content in the module.
- **Every `starterCode` runs cleanly and fails a named assertion.** A starter that throws or fails to transpile is a
  bug, not a challenge.
- **Every challenge carries at least one documented alternative solution with tradeoffs.** A challenge with one
  solution teaches only that one way exists, which is the opposite of this app's purpose.
- **Tests must make the wrong mental model impossible.** For each challenge, name the plausible-but-wrong solution the
  tests reject and verify it by running it. If you cannot name one, the tests do not catch the trap.
- **Never patch a prototype** — happy-dom shares one class table across windows. Instrument per element.
- **Never assert ordering between two schedulers** — rAF versus timer is reversed between the hosts.
- **`<script>` in a challenge's `html` may be traversed, never relied upon.**
- **Any browser probe runs in a foregrounded tab, with a positive control**, and never trusts a negative from a single
  run.

---

### Task 1: Derive the two split-route budgets

**Files:** Modify `scripts/budgets.ts`, `scripts/budgets.test.ts`; possibly `AGENTS.md` §7

**This lands before the content, because the content is what trips it.** `/category/:categoryId` and
`/challenge/:slug` are literals at 98% of ceiling — roughly 22 and 35 challenges of headroom. This phase adds around
thirty. `/`'s ceiling already derives from the challenge count; these two do not, and a manual re-baseline midway
through a content phase is indistinguishable from someone raising a number to make a regression go away.

The blocker recorded in Phase 2 was that their measured per-challenge deltas are 427.8 and 438.2 B against `/`'s 414,
and nobody could explain the excess — so the previous implementer declined to build a formula on it, correctly.

- [ ] **Step 1: Explain the excess before modelling it.** Measure each route's floor and per-challenge delta directly
      (empty the category arrays, rebuild, subtract), and determine whether the ~14–24 B excess is a fixed re-chunking
      cost that appears once, or a genuine per-challenge term. Those two have different formulas and the difference is
      testable: measure at two different challenge counts.
- [ ] **Step 2: Derive both**, using whatever the measurement says rather than assuming linearity. If a route turns out
      not to be honestly derivable, say so and pin it as a measured constant instead — a pinned literal that fails when
      edited is still better than a bare one.
- [ ] **Step 3: Prove the derivation reproduces today's measured figures**, and that it moves by the right amount when
      a challenge is added.
- [ ] **Step 4: Confirm `assertChallengesAreLazy` still guards what the budget cannot.** The byte budget cannot detect
      a challenge going eager at any size — that was measured. The two checks guard different problems; do not let a
      derivation blur them.
- [ ] **Step 5: Commit.**

---

### Task 2: `creation` — Create, Insert & Remove, to depth

**Files:** new modules under `src/challenges/creation/`, plus its `index.ts`

Recon verdict: **clean.** `<template>.content` survives the memory host's `innerHTML`; nothing needs the browser route.
One constraint, measured: a `DocumentFragment` insertion is **not observably a batch** — Chrome reports one
`MutationRecord` of three nodes, happy-dom three records of one — so "prove you batched" is unauthorable. Teach the
_why_ through what fragments cost elsewhere, not through a record count.

Ideas worth covering, each stated as its trap rather than its API: `createElement` versus `innerHTML` and what the
latter costs (parsing, event-listener loss, XSS); `textContent` versus `innerHTML` versus `insertAdjacentHTML`;
`cloneNode(true)` versus `cloneNode(false)` and what a shallow clone silently drops; `<template>` as inert markup;
`insertBefore`/`append`/`prepend`/`replaceWith` and which accept strings; `remove()` versus `removeChild` and the
detached-node lifetime that surprises people; document order when inserting a fragment that is then reused (it is
empty afterwards — that is the trap); and building a list two ways so the tradeoff is the lesson.

---

### Task 3: `attributes` — Attributes, Properties & Data, to depth

**Files:** new modules under `src/challenges/attributes/`, plus its `index.ts`

Recon verdict: **clean, including the dirty value flag.** One rule, measured: **absolute `href`/`src` are unassertable**
— `about:srcdoc` inherits the app's route as its base URL, so a resolved URL differs between hosts.

The attribute/property split is the spine: `getAttribute` versus `.value`, `checked` versus `defaultChecked`, the dirty
value flag, `data-*` and `dataset` naming rules, boolean attributes where presence is the value, `class` versus
`className` versus `classList`, `setAttribute('style', …)` versus `style.setProperty`, and `toggleAttribute`.

---

### Task 4: `events` — Events, to depth

**Files:** new modules under `src/challenges/events/`, plus its `index.ts`

Recon verdict: **clean for `composedPath()`; one measured divergence to author around.** `event.target` is **not
retargeted** out of a shadow root under happy-dom, so `target.closest(...)` — the natural wrong answer — works in the
suite and fails in Chrome. The existing recon challenge rejects it from both sides; keep doing that. Closed-root
truncation, post-dispatch paths and already-aborted signals need the browser route, so stay out of them.

Cover: capture versus bubble and why capture exists; delegation and why it beats N listeners; `stopPropagation` versus
`stopImmediatePropagation`; `preventDefault` and what is not cancelable; `AbortController` for listener removal versus
the `removeEventListener` reference trap; `CustomEvent` with `detail`; `once`/`passive`; and event ordering within one
target.

---

## Phase 3 Done When

- Both split-route budgets are derived or pinned by a test that fails when edited, with the excess explained.
- `creation`, `attributes` and `events` each teach a complete mental model, and each says why it stopped where it did.
- Every challenge names the wrong solution its tests reject, verified by running it.
- All four gates green, and the route budgets pass without having been re-baselined by hand.
