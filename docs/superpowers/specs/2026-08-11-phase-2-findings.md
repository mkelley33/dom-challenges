# Phase 2 Findings: what the engine can carry, and what Phase 3 must build first

Date: 2026-08-11
Status: Deliverable of Phase 2 — decides Phase 3's category order
Branch: `feat/phase-2-recon`

> **Superseded on scope, not on measurement (2026-08-12).** The "~100 challenges" this document measures against was
> retired by the Phase 4 owner decision: six categories ship, and the seven below that do not are hidden from browsing
> rather than deleted. Every measurement, verdict and subset boundary here still stands and is still the map if the
> scope ever widens — read the counts and the target as the state on the date above.

Evidence: eleven reconnaissance challenges, one per previously-empty category, each aimed at that category's _riskiest_
engine dependency rather than its most representative one. The full measurement log is
`.superpowers/sdd/task-3-report.md`; the reversible negatives are pinned by `src/test/happyDomGaps.test.ts`; the
per-category detail an author needs lives in each category's `index.ts` docblock. This document does not restate any of
them. It decides.

---

## 1. What this decides, and for whom

Twenty-four challenges exist — thirteen `selection` from Phase 1, eleven from this pass — against a target of ~100.
Phase 3 authors the rest. Before committing eight challenges to a category, this pass asked one question of each:
**can the content-correctness suite validate it at all?** That suite runs on happy-dom, and a category it cannot
validate has no correctness guarantee — not a weaker one, none.

The answers are not binary. Three outcomes recur, and the middle one is the common case:

- **Green** — author today against the rules already written in the category's `index.ts` and AGENTS.md §3.
- **Green inside a named subset** — the category's core lesson is authorable; an enumerated part of it is not.
- **Blocked** — named engine work has to happen first.

Section 3 is the verdict table. Section 4 states the subset boundaries precisely enough to author against without
re-measuring. Section 5 is the engine work, in priority order. Section 7 is the order.

---

## 2. What was measured, and why it can be trusted

Two engines, the same code, compared run for run:

- **happy-dom** at the pinned version, driven exactly as `createMemoryHost` drives it.
- **Real Chrome through `createIframeHost` itself** — the production host, not a re-implementation of it — on a page
  served over `http://` by the Vite dev server.

Three method rules were established during the pass. Each was established the expensive way, by producing a confident
wrong reading first, and each is now binding (AGENTS.md §5).

1. **A browser probe runs in a genuinely foregrounded tab, and asserts it.** A document the browser is not rendering
   services no animation frames and delivers no observer entries. The first Chrome run of pass 1 reported
   `IntersectionObserver`, `ResizeObserver` and `requestAnimationFrame` all dead **in Chrome** — the tab was merely
   backgrounded. The first Chrome run of pass 2 hit the identical trap. Foreground is forced via AppleScript and
   asserted (`visibilityState: 'visible'`, `hasFocus()`); nothing from a run that failed the assertion was used.
2. **A negative needs a positive control in the same document over the same wait.** "It never fired" and "the wait was
   too short" are the same observation until something separates them. Every negative in `happyDomGaps.test.ts` carries
   one, and the controls are mutation-proved: stopping the control channel turns the test red.
3. **A browser claim carries a repeat count.** Pass 2's content verification: **192 solution runs, 0 failures; 18
   starter runs, all `error=none` and all failing their named assertion; 18 wrong-solution runs, all rejected; 0
   `localStorage` keys leaked.** Pass 1's rAF challenge separately: 70 full-suite runs, 0 failures.

**The lesson worth carrying into Phase 3 is the asymmetry between the two halves.** Every claim in this pass that turned
out wrong was a _browser_ claim made from _one run_. The happy-dom half — scripted, repeatable, re-runnable in a second
— was right every time. And the single claim in the first report that was **inferred rather than measured** was also
wrong: "a `blob:` URL would give the frame a real URL that `pushState` accepts" was never run, and when it was run it
failed (§5.2, arrangement B). In a report whose entire value is measurement, one unmarked inference was enough to
mislead the decision it was written to inform. **Mark inferences as inferences, or measure them.** This document does
the former wherever it does not do the latter.

---

## 3. Verdict table

`selection` is Phase 1's and is not in scope. `react` was deliberately left out of this pass (§8).

| Category      | Verdict            | Authorable today                                                                                                                           | Blocked, and needs                                                                                                                   |
| ------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `creation`    | **Green**          | Everything: create, clone, fragments, `importNode`, all four `insertAdjacent*`, `DOMParser`, `<template>.content`, move-not-copy, escaping | "Prove you batched your inserts" — fragment insertion is not observably a batch here. Browser route.                                 |
| `attributes`  | **Green**          | The whole attribute/property split including the dirty value flag, `dataset`, boolean attributes, reflection, `setAttributeNS`             | Nothing. One rule: a resolved `href`/`src`/`action` is never assertable.                                                             |
| `events`      | **Green + subset** | All ordinary propagation at full fidelity; `composedPath()` **during** dispatch; the by-hand composed-tree walk                            | `event.target` retargeting, closed-root truncation, post-dispatch paths, already-aborted signals. Browser route.                     |
| `styles`      | **Green + subset** | The **cascade** in full — specificity, inheritance, `!important` over inline, `insertRule`, custom properties through `var()`              | Every computed **value** outside the portable subset in §4.1. No engine work would fix it; it is a serialisation difference.         |
| `performance` | **Green + subset** | Read/write **ordering**, via per-element instrumentation                                                                                   | Pixels, at any price — `getBoundingClientRect()` is all zeros here. Virtualization and `content-visibility` presumed blocked (§8).   |
| `async`       | **Green + subset** | `rAF`, microtasks, timers, `AbortController`                                                                                               | `requestIdleCallback` (absent). Ordering _between_ two schedulers is reversed between hosts and is permanently unassertable.         |
| `forms`       | **Green + subset** | The Constraint Validation API, `FormData`, `requestSubmit`, `SubmitEvent.submitter`, `reset()`                                             | Four things, enumerated in §4.2 — one of which costs the category its styling challenge. Browser route.                              |
| `a11y`        | **Green + subset** | Focus management, including `focus()` from the app realm moving the frame's `activeElement`; ARIA written as **attributes**                | ARIA IDL reflection, `:focus-within`, `:focus-visible`, `ElementInternals`, focus on anything not natively focusable. Browser route. |
| `observers`   | **Mostly blocked** | `MutationObserver` alone, at genuinely high fidelity — one of the category's three observers                                               | `IntersectionObserver` and `ResizeObserver` **construct and never fire** here. Browser route.                                        |
| `storage`     | **Mostly blocked** | `localStorage`, `URL`, `URLSearchParams` — identical in both hosts down to the escaping                                                    | IndexedDB (absent). History (present in both, throws in the real one). Browser route; **`iframeHost` URL decision**.                 |
| `web-apis`    | **Mostly blocked** | `ClipboardEvent` + `DataTransfer`. Shadow DOM was proven in Phase 1 and not re-probed                                                      | Canvas 2D, drag-and-drop, the async Clipboard API. Browser route — and the Clipboard needs more than that (§5.1).                    |
| `react`       | **Unknown**        | Nothing — not probed                                                                                                                       | An architectural spike, not an authoring decision (§8).                                                                              |

Three numbers a reader would otherwise re-measure:

- `IntersectionObserver` and `ResizeObserver` under happy-dom: **zero callbacks**, after microtask drain, after a frame,
  and after 100 ms of real time, with `takeRecords()` empty — while the identical code through the real srcdoc host in a
  foregrounded tab delivers correct entries both before and after a scroll and a resize.
- `getBoundingClientRect()` and `offsetWidth`/`offsetHeight` under happy-dom: **all zeros**.
- `canvas.getContext('2d')` under happy-dom: **`null`** — and `toDataURL()` answers with an empty
  `data:image/png;base64,` stub rather than throwing, so a Canvas challenge would not merely be unvalidated, it would
  look validated.

---

## 4. The subset boundaries, stated to author against

### 4.1 `styles` — the cascade resolves; the values do not

Assert only: **px lengths written as px**; a custom property read off the element that **declares** it; any longhand the
challenge's own CSS sets. Read the longhand a `var()` fed, never the inherited custom property itself.

Never assert, because each is green here and wrong in a browser: a colour (`red` and `#0000ff` stay as written instead
of computing to `rgb(...)`), a shorthand assembled from longhands (`''` here), a relative length (`2em` against
`font-size: 10px` gives **`32px` here and `20px` in Chrome** — a plausible number that is wrong, which is the worst
available shape), a percentage, a UA default, a pseudo-element, a `var()` fallback, or an inherited custom property read
off the inheriting element. `computedStyleMap` does not exist here at all.

### 4.2 `forms` — faithful minus exactly four things

Faithful, measured identical in both hosts: `valueMissing`, `typeMismatch`, `patternMismatch`, `rangeOverflow`,
`stepMismatch`; `checkValidity()` and its per-field `invalid` event, collectable from one capture-phase listener on the
form; `setCustomValidity` including its round-trip through `validationMessage` and its clearing on `''`; `willValidate`;
`noValidate`; `FormData` in full including `getAll`, multi-selects, excluded disabled fields and the two-argument
`FormData(form, submitter)`; `requestSubmit(submitter)` declining to fire on an invalid form; `form.reset()` including
radios; and `SubmitEvent.submitter`.

The four exclusions:

1. **`minlength` / `maxlength`** — `tooShort`/`tooLong` apply only to a value the **user** edited; happy-dom ignores
   that condition, so they look like they work here and do nothing in a browser.
2. **Browser-supplied `validationMessage`** — `''` here for every built-in failure. Only a message the challenge set
   itself is assertable.
3. **`:invalid` / `:valid` / `:required`** — never match here. **This costs the category its styling challenge**; any
   styling challenge must key off an attribute the code sets.
4. **`button.willValidate`** — `undefined` here, `true` in Chrome.

### 4.3 `a11y` — focus yes, ARIA through attributes only

Every ARIA state goes through `setAttribute`/`getAttribute`: happy-dom implements the `ARIAMixin` IDL properties as
plain JavaScript properties that reflect **nothing**, so `el.ariaExpanded = 'true'` is correct in a browser and
invisible to every attribute selector in the suite. `element.role` is the one that does reflect.

Every focusable element in a challenge must be **natively focusable** — `focus()` succeeds on a plain `<div>` here and
is refused in Chrome. `:focus-within` never matches here. `:focus-visible` agrees in both hosts for a reason that
recommends nothing: its heuristic is defined over **real** user input and the harness can only dispatch untrusted
events, so the agreement is an artefact of the question never being asked.

### 4.4 `events` — the path is portable, the retargeting is not

`composedPath()` during dispatch is identical in both hosts, contents and order, and so is the walk out through
`parentNode` / `ShadowRoot.host`. `event.target` across a shadow boundary is not: Chrome retargets to the host,
happy-dom does not, **which makes `event.target.closest(...)` — the natural wrong answer — work in the suite and fail
for the learner.** A retargeting challenge is authorable only by rejecting that answer from both sides at once, as
`events/composed-path` does; nothing may assert the retargeting itself.

### 4.5 `performance` — instrument, never measure, and never patch a prototype

Per-element own-property shadowing (`element.getBoundingClientRect = fn`) is portable in both hosts and is the only
permitted technique. **A prototype patch escapes the challenge**: happy-dom shares one class table across every `Window`
it creates, so patching `w1.Element.prototype` is observed by an element built in `w2` and therefore by the rest of the
Vitest process. `getBoundingClientRect` and `setAttribute` are writable, configurable data properties in both hosts;
`CSSStyleDeclaration.prototype.width` is not portably instrumentable, so style writes cannot be counted — count
`setAttribute` instead.

---

## 5. The engine work Phase 3 depends on, in priority order

### 5.0 Gate — derive the two literal route budgets. This deadline is now nearer than when it was filed

Measured today (`pnpm budget`, 24 challenges on disk):

| route                   | eager JS  | ceiling | headroom                                             |
| ----------------------- | --------- | ------- | ---------------------------------------------------- |
| `/`                     | 374,334 B | 384,551 | derived from the count                               |
| `/category/:categoryId` | 540,489 B | 550,000 | 9,511 B ≈ **22 challenges** at its measured 427.8 B  |
| `/challenge/:slug`      | 789,552 B | 805,000 | 15,448 B ≈ **35 challenges** at its measured 438.2 B |

`/`'s budget moves with the challenge count and needs nothing. The other two are **literals sitting at 98% of ceiling**.
AGENTS.md §7 already says to derive them "before the first full category is authored"; at ~8 challenges a category, the
`/category/:categoryId` ceiling is reached inside the **third** full category. Derive them first, or the first red
budget will arrive in the middle of an authoring run, where a re-baseline is indistinguishable from someone burying a
regression.

### 5.1 The browser-only validation route — nine blocked areas, one investment

This is the headline item. Nine distinct areas across six categories are blocked on the same missing thing:

| #   | Area                                                     | Category    |
| --- | -------------------------------------------------------- | ----------- |
| 1   | `IntersectionObserver` / `ResizeObserver` delivery       | `observers` |
| 2   | Canvas 2D                                                | `web-apis`  |
| 3   | `DragEvent.dataTransfer`                                 | `web-apis`  |
| 4   | The async Clipboard API                                  | `web-apis`  |
| 5   | `DocumentFragment` insertion batching                    | `creation`  |
| 6   | Shadow retargeting, closed-root paths, aborted signals   | `events`    |
| 7   | `minlength` / `maxlength`                                | `forms`     |
| 8   | `:invalid` / `:valid` / `:required`                      | `forms`     |
| 9   | ARIA IDL reflection, `:focus-within`, `ElementInternals` | `a11y`      |

**Cost it as one piece of work with nine payoffs, not as nine.** The alternative — shimming — is worth less than
nothing: a suite running against a shim proves something about the shim rather than about the platform, which is exactly
the guarantee AGENTS.md §2 exists to protect.

A tenth candidate the source report did not count: **IndexedDB** is absent from happy-dom and present in Chrome, so the
same route would unblock it on the same terms as Canvas. It is listed separately here only because the report's "nine"
is the figure the rest of the project has been quoted.

**Recommended shape: a real automation driver (Playwright or CDP) around the unmodified production host.** Not a second
harness, and not a page you open by hand.

_Known, because it was measured:_

- The production `createIframeHost` already runs unchanged in a real browser. Every solution and starter of all eleven
  reconnaissance challenges has been driven through it. The route needs a driver, not a new runner.
- Per-run cost, measured through the real host after the `tick()` fix: 6.5–11.8 ms for a challenge with no frame
  dependency, ~350 ms for one that waits on real frames (`mutation-batch` median 356.7 ms, `frame-batch` median
  354.0 ms).
- Timing is not the risk. The two-hop `tick()` is throttle-invariant: 0 failures in 50 solution-runs with the tab
  **hidden**, where first-frame p99 was 873 ms and max 3,980 ms.
- **Delivery is the risk.** A document the browser is not rendering delivers no observer entries at all — which is
  precisely area 1, the largest payoff on the list.
- Two of the nine are not unblocked by "run it in Chrome" alone, because Chrome is where they fail. The async Clipboard
  API rejects **inside the preview frame in real Chrome** with `NotAllowedError: Document is not focused` — measured
  with the tab foregrounded and the top document's `hasFocus()` true, because it is the _frame_ document that is not
  focused. And `minlength`/`maxlength` correctly do nothing in Chrome until a value has been edited **by the user**,
  which no programmatic `.value` write satisfies.

_Inferred, and marked as such:_

- A driver that can focus the frame and deliver **trusted** input events would reach areas 4 and 7, and would also make
  `:focus-visible` a question that can be asked for the first time. An in-page route that merely loads the harness in a
  browser tab would not. **This is the argument for the driver shape and it has not been measured** — it follows from
  the two measured failures above plus the specifications, not from a run.
- Extrapolating the measured per-run costs, a full browser pass over ~100 challenges is on the order of a minute of
  wall clock: cheap enough for CI, too slow for a watch loop.

_The first thing to measure, before committing to any shape:_ **does the chosen driver, headless, deliver
`IntersectionObserver` entries and service `requestAnimationFrame`?** With a positive control, per §2 rule 2. The entire
route rests on it and it is currently unknown. If headless does not render, the route needs a headed display in CI and
that changes its cost.

_One design consequence to settle at the same time:_ AGENTS.md §10 requires `content.test.ts` to open **every**
challenge, and that totality is a real guarantee. A `browserOnly` marker punches a hole in it, so the hole must be
visible — the content suite should assert that every challenge it skips is registered in the browser suite's manifest,
rather than simply skipping. (Design suggestion, not a measurement.)

### 5.2 The `iframeHost` URL decision — a real trade, and it has not been made

History is blocked in `storage` because the preview frame is an `about:srcdoc` document. In real Chrome,
`history.pushState({...}, '', '?x=1')` throws:

```
SecurityError: Failed to execute 'pushState' on 'History': A history state object with URL '...' cannot be created
in a document with origin 'http://localhost:5199' and URL 'about:srcdoc'.
```

happy-dom accepts the same call happily, because its host document has a real URL. **This is the inverse of the blind
spot this project usually guards against: a green suite and a broken learner.** A History challenge would have shipped
looking perfect.

Four frame arrangements were measured on one page in real Chrome:

| arrangement                                      | `location.href`                | `pushState({}, '', '?x=1')`          | executes `<script>` |
| ------------------------------------------------ | ------------------------------ | ------------------------------------ | ------------------- |
| **A.** `srcdoc` (current)                        | `about:srcdoc`                 | `SecurityError` (URL `about:srcdoc`) | yes                 |
| **B.** `blob:`                                   | `blob:http://localhost:5199/…` | `SecurityError` (URL `''`)           | —                   |
| **C.** same-origin `src`                         | `…/preview-frame.html?x=1`     | **OK**                               | no, via `innerHTML` |
| **D.** same-origin `src` + `document.open/write` | **the parent's URL**, `?y=2`   | **OK**                               | yes                 |

B was the first report's one inference and it is wrong: a relative URL resolved against a `blob:` base gives the empty
string, so it fails for a different reason than A and it still fails.

**The trade, stated rather than decided:**

- **Stay on A.** Costs `storage` every History challenge and nothing else. Zero engine work, zero new risk.
- **Move to C.** Gains a stable, distinct preview URL that `pushState` accepts, and relative URLs in challenge markup
  that resolve against the preview rather than the learner's current route. Costs: `reset()` stops being "assign
  `srcdoc`, one navigation, one `load`", and `innerHTML` does **not** execute `<script>` — so a naive switch silently
  retires the host asymmetry AGENTS.md §3 documents and makes the browser host behave like the memory host.
- **Move to D.** Keeps `<script>` execution and accepts `pushState`, but `document.open()` re-points the frame at the
  **entry document's** URL, which is the parent's. Measured. Three consequences: a challenge reading
  `location.pathname` sees the app's own route; `pushState` writes into the app's namespace; relative URLs in challenge
  markup resolve against whatever route the learner is on. **D unblocks History mechanically and makes the
  entanglement worse.**

**The fact that decides this is orthogonal to A–D and is already true:** the preview shares the tab's **joint session
history** today. The state-only forms (`pushState(state, '')`) work in both hosts and grow `history.length`, which puts
the app's own back button inside the preview frame. Neither C nor D fixes that; D deepens it. **Whoever prices C or D
must price the joint-history fix in the same breath, and whether the preview's navigable can be detached from the tab's
session history at all while staying same-origin and script-executing has not been measured.** That is the question to
answer first.

### 5.3 Two smaller decisions, with recommendations

- **Do not shim `requestIdleCallback`.** It is absent from the pinned happy-dom. Its real-world use is mostly "with a
  `setTimeout` fallback" — so a challenge _about that fallback_ is authorable today and teaches the more useful thing.
  Same reasoning for IndexedDB: a shim would have the suite prove something about the shim.
- **`content-visibility`, virtualization and live-region announcement are presumed unauthorable** and were not probed.
  The first two need real geometry (measured absent); announcement is unobservable in both hosts, consistent with
  AGENTS.md §11's note that `RouteError`'s own announcement has never been heard with a screen reader. **Inference, not
  measurement** — probe before planning challenges on them.

---

## 6. The two Criticals, and why they are the argument for having done this at all

Both were **live defects in already-merged, reviewed, green code.** The reconnaissance did not introduce them; it was
the first work to drive the production host in a real browser, repeatedly, and that is what exposed them. The next
person needs to know the engine changed underneath them.

**C1 — the preview frame shares the app's `localStorage`, and one line of learner code destroyed every saved draft.**
The frame is same-origin with no `sandbox` attribute, deliberately, because the harness passes live function references
and reads `contentDocument`. Same-origin is not storage isolation: `localStorage.clear()` in submitted code emptied
`dom-challenges-editor`, which holds every challenge's drafts and has no copy anywhere else. No reachable frame
arrangement avoids the sharing — `sandbox="allow-scripts"` fixes it by dropping `allow-same-origin`, which nulls
`contentDocument` and breaks the whole `HostHandle` interface. Repaired by asking the store to re-persist itself at
frame boundaries (`reset`, `dispose`, and `pagehide` — closing a tab runs no React effect cleanup, so `dispose()` may
never happen).

**The mistake worth remembering is not the measurement, it is the severity.** The fact was in the first report,
correctly measured, filed as "a real hazard for any future storage challenge". It was not a future hazard; it was a
reachable data-loss path in shipped code.

**C2 — `FRAME_FALLBACK_MS = 50` sat inside the distribution it was written to clear.** Freshly created `srcdoc` iframe,
foregrounded tab, real workload: first-frame latency p50 ~22 ms, p90 ~25–27 ms, p99 ~29–34 ms — an order of magnitude
above the "~16 ms" the constant was justified against, with a tail that crossed 50 ms often enough to be routine (3/60
runs lost the race, and the failing set and the timer-won set were identical, which is what makes it a race rather than
a broken solution). It surfaced as an ~15% flake on `async/frame-batch` and was very nearly recorded as a content
defect.

**The fix was not a bigger number, and saying it was would have been the second mistake.** `tick()` now waits for two
chained frame hops with the escape timer re-armed once the first lands: reaching the first hop _proves_ the document is
being rendered, so the timer stopped being a deadline and became a capability probe that can only win when no frame was
serviced at all. After: 0/320 failures, 0/200 runs reaching the escape, and — the result that matters — 0 failures in 50
solution-runs in a **hidden** tab where first-frame p99 was 873 ms and max 3,980 ms. No fixed timeout survives that.
`FRAME_FALLBACK_MS` is now 250 ms, and it is the less important half of the change.

> Note for whoever next edits AGENTS.md §5: it still describes "its 50 ms timer". The constant is 250 ms, and the timer
> is no longer a deadline. The paragraph's conclusion — never make the preview frame `display: none` — is unaffected
> and still correct.

---

## 7. Recommended Phase 3 order

The ordering principle: **front-load the categories that need no engine work, and spend that time building the engine
work the back half needs.** The browser-only validation route (§5.1) and the URL decision (§5.2) should run as a
parallel track from day one, so that positions 9–11 are unblocked by the time the order reaches them. Nothing in
positions 1–8 waits on either.

| #   | Category      | Why here                                                                                                                                                           |
| --- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0   | _budgets_     | §5.0. The `/category/:categoryId` ceiling is reached inside the third full category. Derive before, not after.                                                     |
| 1   | `creation`    | The cleanest category measured in either pass. One named loss, no engine work, no per-challenge footguns. Fastest evidence that Phase 3 works.                     |
| 2   | `attributes`  | Clean, including the riskiest thing in it. One rule, and it is easy to obey.                                                                                       |
| 3   | `events`      | All ordinary propagation is full fidelity, which is the bulk of the category. The divergences sit at the shadow boundary, at its edge.                             |
| 4   | `styles`      | The subset is precisely bounded (§4.1) and contains the category's actual lesson — the cascade and the indirection, not the serialisation.                         |
| 5   | `async`       | Green on four schedulers. Lower than the above only because two rules (no idle, no cross-scheduler ordering) narrow what can be asked.                             |
| 6   | `forms`       | Green minus four enumerated things (§4.2), one of which removes a whole challenge shape. More design work per challenge than 1–5.                                  |
| 7   | `performance` | Green, but every challenge must be _instrumented_ rather than measured, and the instrumentation rule is unforgiving. Author it when the team has practice.         |
| 8   | `a11y`        | Green, and carries more per-challenge rules than any other green category (§4.3). Every ARIA write and every focus target is a decision.                           |
| 9   | `observers`   | Two of its three observers are blocked. `MutationObserver` alone is perhaps three challenges. **Wait for the browser route**; authoring now means authoring twice. |
| 10  | `web-apis`    | Mostly blocked. Shadow DOM and `ClipboardEvent` carry it partway. Same reasoning as 9.                                                                             |
| 11  | `storage`     | History blocked on the URL decision (§5.2), IndexedDB on the browser route. Last of the twelve because it is the only one blocked on a decision nobody has made.   |
| 12  | `react`       | Needs a spike before it can be ordered at all (§8).                                                                                                                |

If the parallel track slips, 9–11 slip with it and 1–8 are unaffected — which is the property the ordering was chosen
for.

---

## 8. What is still unknown

Everything here is **unmeasured**. None of it is an inference dressed as a finding.

- **`react` — the twelfth category, deliberately untouched.** Running React inside the frame realm is an architectural
  question, not a content one, and folding it into a content pass would have produced an answer nobody could trust. The
  seam exists and has never been used: `RunOptions.modules` injects modules into the frame's `require`. The open
  questions are at least: whether React objects constructed in the app realm can reconcile against the frame's
  document; what the realm rule (AGENTS.md §3) does to `instanceof` inside a React tree; whether the content suite can
  validate React under happy-dom at all; and what it costs `/challenge/:slug`, whose budget is at 98%. It deserves its
  own brainstorm.
- **Whether a headless driver renders.** §5.1. The first thing to measure, and the whole browser route rests on it.
- **Whether the preview's navigable can be detached from the tab's session history.** §5.2. The question that decides
  whether C or D is even priceable.
- **`fetch` + abort** (named in the design spec's Web APIs coverage) was never probed. `AbortController` itself is
  faithful; the network half is not known.
- **Custom elements.** Shadow DOM is proven by Phase 1, but `customElements.define` in the frame realm was not probed,
  and `attachInternals`/`ElementInternals` are measured absent under happy-dom.
- **`matchMedia` fidelity.** Present in both hosts; never compared.
- **Whether `minlength`/`maxlength` and the async Clipboard API are reachable even with a trusted-input driver.**
  Reasoned in §5.1, not run.
