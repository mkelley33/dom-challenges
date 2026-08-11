# Contributing to DOM Challenges

For a contributor, human or agent. `README.md` covers how to run the project; this file covers how to change it
without breaking things that are not obvious from the code.

Every rule below is written with its reason attached. A rule without its reason gets deleted by the next person who
finds it inconvenient — so if you disagree with one, argue with the reason, and if you win, delete both.

Where this file conflicts with a global or personal instruction file, this file wins: it is the one written against
this codebase.

---

## 1. Non-negotiables

**No `any`.** `typescript/no-explicit-any` is an error. Where a value genuinely arrives untyped — submitted code, a
`response.json()` body, a cross-realm window — the unsound step is confined to one named seam with a comment saying
why, never spread across call sites.

**No lint-suppression comments.** No `oxlint-disable`, no `eslint-disable`, no `@ts-ignore`, no `@ts-expect-error`.
There are currently zero in `src/` and `server/`; keep it that way. The escape hatch is a scoped `overrides` entry in
`.oxlintrc.json` that **lists the specific files** and carries a comment justifying it. The difference matters: a
suppression comment is invisible from outside the file it hides in and silently widens as the file grows, while an
override is reviewable in one place and its blast radius is written down. Every existing override lists files rather
than globbing them, for exactly that reason — do not convert one to a glob.

**Test first.** Write the failing test, watch it fail, then implement. See §8 for the specific failure modes this
codebase keeps producing; "I wrote a test" is not the standard, "I watched it fail for the right reason" is.

**Conventional Commits, atomic.** Accurate types. One logical change per commit. Never commit to `main`. Never bypass
git hooks. **Never add AI attribution, `Co-authored-by`, or `Generated with` lines** to a commit message or a PR body.

**Prettier owns formatting**, including Markdown: 120 columns, single quotes, trailing commas, semicolons, and import
sorting via `@ianvs/prettier-plugin-sort-imports`. Run `pnpm format`, do not hand-align anything, and do not argue
style in review.

**All four gates green before you claim done:** `pnpm typecheck && pnpm lint && pnpm test && pnpm build`.

---

## 2. The execution model, and the contract that holds it together

`src/runner/harness.ts` knows exactly one thing about where code runs:

```ts
interface HostHandle {
  reset(html: string): Promise<HostContext>; // a fresh document, per call
  dispose(): void;
}
```

The browser satisfies it with a `srcdoc` iframe (`src/runner/iframeHost.ts`); Vitest satisfies it with happy-dom
(`src/test/createMemoryHost.ts`). **Keep this interface this narrow.** It is what makes the content-correctness suite
meaningful: the suite proves solutions pass _the same engine the learner runs_, not a test-only reimplementation of it.
The moment the harness reaches for something only one host can provide, the suite starts proving something about
happy-dom instead, and the guarantee quietly evaporates while every test stays green.

Consequences worth knowing before you touch the runner:

- **`reset` rebuilds the document rather than rewriting it.** Window listeners, timers and observers registered by the
  previous attempt die with the frame that owned them. That is the isolation guarantee; do not "optimise" it into an
  `innerHTML` assignment.
- **The harness awaits tests sequentially, and must.** Every iteration resets the one shared host, so running tests
  concurrently would destroy the per-test isolation the harness exists to provide. `no-await-in-loop` is turned off for
  that file for this reason, not by oversight.
- **`dispose()` during an in-flight `reset` rejects with `HostDisposedError`.** It reaches the caller as a _rejection_,
  not a `RunResult`, and it means cancellation — a navigate-away, or a StrictMode remount — not a failed run. Treat it
  as nothing at all. `runChallenge`'s signature still reads as total, so nothing will remind you.
- **Two overlapping `reset` calls reject the first.** `runChallenge` awaits sequentially so it cannot hit this; any
  other caller must `await` or `.catch()`.
- **The frame is same-origin with no `sandbox` attribute, deliberately.** The harness passes live function references
  and reads `contentDocument`. This is DOM isolation, not a security boundary — do not describe it as one.

---

## 3. Authoring challenges

Every new challenge needs **at least one documented alternative solution with tradeoffs**. This is the point of the
app: it teaches _when_ to reach for a technique, not only _how_, and a challenge with one solution teaches only that
one way exists. `content.test.ts` enforces that every solution carries a label, an explanation and a tradeoff
analysis, and that labels are distinct — the labels key both the React list and the tab `value` in `SolutionsPanel`,
so a duplicate makes one solution unreachable.

### The realm rule

**Never write `toBeInstanceOf(SomeBareGlobal)` in challenge content. Use `ctx.win.X`, or a structural matcher.**

Tests are authored in the app's realm; challenge code runs in the host's realm. `toBeInstanceOf(HTMLInputElement)`
resolves the constructor from the realm the _name_ is written in, so it compares an element built by the frame against
the app's constructor. happy-dom shares one class table across its windows, so this **passes under Vitest** — and fails
in a real browser, where `frameWin.Element !== window.Element` and a shadow-DOM element is `instanceof
frameWin.HTMLSpanElement` and not the app's. Both were verified in real Chrome.

This is the single most dangerous mistake available in this codebase, because the content suite cannot see it. It is
the one remaining way to reintroduce a class of bug that has already been removed once.

The same asymmetry is why `src/runner/expect.ts` and `harness.ts` check errors and elements **structurally** rather
than with `instanceof` — an error crossing out of the host realm is not an instance of this realm's `Error`.

### `<script>` inside a challenge's `html`

**You may traverse it. You may never rely on it having executed.** The iframe host assigns `srcdoc`, so the parser
runs the script; the memory host assigns `innerHTML`, which per spec never executes scripts. So a test asserting on a
script's _side effect_ passes in the browser and fails under Vitest, and — worse — the content suite is structurally
blind to the whole category. Assert on the script element and its text node, which both hosts have; never on
`win.someGlobalTheScriptSet`.

### Verify host-divergent challenges in a real browser

A green content suite proves the challenge is _self-consistent under happy-dom_. It does not prove the challenge runs
in Chrome. Challenges whose assertions rest only on structure, text and counts are covered by matchers that were
verified across a real realm boundary. Challenges that touch platform integers or APIs happy-dom models differently —
`compareDocumentPosition`'s bitmask, `TreeWalker` filter constants, `<template>.content`, shadow roots — must be run
once against a real iframe before they are trusted. Say which of the two claims you are making; they are not the same
size.

---

## 4. Progress persistence: writes send a whole record, never a delta

`saveProgress` PATCHes the **entire** `ProgressRecord` body. Therefore:

**Resolve the record at write time, never from a render-time closure. If it cannot be established, skip the write.**

Read it through `useStoredProgress`, which serves the cache when it has data and joins the in-flight fetch when it does
not, and returns `null` when it fails.

The failure this prevents: on a cold deep-link to `/challenge/:slug`, `GET /progress` is still in flight when a quick
first interaction lands, so a render-time closure still holds the synthesised `emptyProgress` placeholder. Spreading
that placeholder into a PATCH overwrites a real solve with an empty record — and the placeholder's `id` is the
_challenge_ id rather than the row id json-server assigned, so anything later keyed off it (a DELETE, say) aims at a
row that does not exist.

This defect appeared in **three consecutive tasks wearing three different disguises**: the run flow's status write, the
reveal write, and the clear path. Each time it looked like a new bug. It is one bug. Any new writer is the fourth
chance to reintroduce it.

Two related facts, both decided rather than inherited:

- **`useSaveProgress` invalidates with `refetchType: 'all'`; `useClearProgress` uses the `'active'` default.** The run
  flow reads the query imperatively, so on the challenge page there is no observer at all and an `'active'`
  invalidation would refetch nothing — leaving the optimistic record, carrying a client-invented `id`, as the only one
  in the cache. A delete has no server-assigned field to read back, so it does not need this. The asymmetry is
  correct; do not "align" them without an argument that survives that.
- **`deleteProgress` needs a real json-server `id` read off a fetched record**, never one constructed by hand.

---

## 5. Layout and accessibility facts — verified, do not re-derive

**The preview frame must never be `display: none`.** A document inside a non-rendered subtree never services
`requestAnimationFrame`, so the harness's `tick()` falls back to its 50 ms timer on every call and any paint-dependent
work in a learner's code simply does not happen. When the preview must step aside — the phone layout parks it while
another tab is showing — take it out of flow and move it off-screen (`absolute -left-[200vw]`), so it keeps a real box
and a real rendering. Whether it is parked is decided by **CSS**, so a broken `matchMedia` cannot move a panel;
JavaScript only decides the parts CSS cannot express.

**Use `inert` on the parked column, not `aria-hidden`.** `aria-hidden` over a live `<iframe>` whose content renders
real buttons and links leaves those controls in the sequential focus order — a phone learner tabbing past Clear loses
focus 200vw off-screen. `inert` removes them, and its inertness propagates into a nested navigable. Verified in Chrome
with real Tab keypresses: the walk was `before-A → before-B → after-C → before-A`, and the **wrap after three stops**
is the discriminator — it proves both parked stops were removed from the order rather than focus landing somewhere
invisible. `iframe.focus()` from the parent is a no-op under an inert ancestor.

- **Do not add `tabindex="-1"` to the preview iframe.** `createIframeHost` builds the frame imperatively, so a static
  `-1` would apply on desktop too and cost the _visible_ preview its keyboard reachability. In an app that teaches the
  DOM, a learner tabbing into the buttons and links their own code rendered is a feature.
- Verified in **Chrome only**, on a layout whose target user is on iOS Safari. WebKit shipped `inert` in 15.5 with
  nested-navigable propagation, so it is expected to hold — but this is the one behaviour in the app whose target
  platform is not the one that was tested.

**How to probe focus, and the trap that produced a wrong reading first time.** A script running _inside_ a frame can
set the inner document's `activeElement` while `contentDocument.hasFocus()` stays `false`. In a **backgrounded** tab
that artefact reads as "the iframe accepted focus" — a false positive. Any focus probe must run in a **foreground**
tab, use real key events, and take the **wrap-around** as its evidence. Two more things that do not work here:
`HTMLElement.tabIndex` reads `-1` for an overflowing scroller, a plain div and a button-containing scroller alike, so
Chrome does not surface focusable-scroller through the IDL; and `.focus()` measures focusability, which is a
prerequisite for a sequential stop but is not the same claim.

**A control's accessible name is its identity — do not swap it while the control is focused and disabled.** Screen
readers do not reliably re-announce a focused button's changed name, and a name that changes under the user is a
different control appearing where theirs was. In-flight state is signalled by `aria-disabled`, the results live region,
and an `aria-hidden`, reduced-motion-guarded spinner — never by the label.

---

## 6. The UI toolkit

**The `shadcn` CLI cannot resolve this repo's `@/*` alias** under its project-references tsconfig setup. `shadcn add`
writes generated files into a literal `./@/...` directory; they must be relocated into `src/` by hand afterwards.

**`src/components/ui/dialog.tsx`, `select.tsx` and `scroll-area.tsx` carry hand-patches on CLI-generated code** —
render-prop JSX hoisted to module scope, an unused React import dropped. Re-running `shadcn add` for those three
silently reverts the patches and reintroduces the lint failures. `pnpm lint` catches it; the _reason_ will not be
obvious, so this is where it is written down.

**In `src/index.css`, the app's theme block must stay _after_ shadcn's.** Otherwise shadcn's `--color-muted` and
`--color-accent` win and the palette silently changes — silently, because nothing fails, the app just looks different.

---

## 7. Bundles

**Monaco must never load from a CDN.** `configureMonaco` points `@monaco-editor/react` at the bundled instance via
`loader.config({ monaco })` and wires its workers from local `?worker` imports. A CDN default makes the editor an
uncacheable third-party network dependency that fails offline and cannot be version-pinned with the lockfile.

**Monaco must stay in a lazy chunk.** It is only reachable from the challenge route. An eager import of
`configureMonaco` alone produced a 4.3 MB entry chunk once already — the import that defeats this is easy to add and
invisible until someone measures.

**Bundle claims must be measured at route level.** `vite build`'s size listing cannot distinguish a genuinely deferred
chunk from one the route statically imports and preloads via `__vite__mapDeps`. "A new chunk appeared" and "the entry
chunk did not grow" prove nothing on their own: a real case had a named chunk shed 110 kB while 64 kB of that was
re-chunking into files sitting in the same route's preload list, for a real saving of 46 kB. **Resolve the
`__vite__mapDeps` table per call site and report the route's total eager bytes.** Any chunk number in this repo's
history that was not checked that way should be treated as unverified.

**`vite build` always emits the 500 kB chunk warning.** It names Monaco's lazy chunks, none of which is referenced by
`index.html`, so it carries no signal — but a build that is permanently red masks the next real regression exactly as
thoroughly as a raised limit would. `chunkSizeWarningLimit` is a single global number, so there is no scoped middle
option: either raise it above Monaco's chunks _and_ add an explicit guard on the entry chunk's size, or accept the
noise knowingly. It is currently accepted knowingly. If you find that unacceptable, do the first option — do not
silently raise the limit alone.

---

## 8. Testing discipline

This is the thing that most shaped this codebase. The recurring defect across every task was **a test that passes
against a no-op**. Not a flaky test, not a wrong test — a test that would go green if you deleted the code it exists to
protect. Before you accept a test, ask what implementation would fail it.

**The specific shape, diagnosed late:** when a branch's correctness depends on **a value flowing through it
untouched**, the natural test asserts that the branch fired and not what it carried. Both real misses fit this — a
debounce cancel path that must preserve the whole form snapshot, and an unmount flush. Mutation testing found them;
test-writing did not. Watch for it anywhere a context, a snapshot, or a record is passed along unchanged — including
wherever `ctx` flows through challenge tests.

**Polled negative assertions guarantee nothing.** `expect.poll(...).toHaveLength(0)`, `not.toHaveBeenCalled()` and
their relatives succeed on their **first** evaluation, so the poll contributes exactly nothing and **the preceding wait
is the entire guarantee**. Three tests discriminated only because an unrelated `waitFor` happened to yield long enough
for the buggy write to land. Always wait on a condition that strictly _implies_ the thing whose absence you are
asserting has had its chance to happen.

**A vacuous assertion is worse than none.** `.filter(...)` over an empty array is an empty array, and a `describe.each`
over an empty list expands to no tests at all — so "nothing failed" and "nothing ran" look identical. Pin the counts:
`content.test.ts` asserts the registry is non-empty and that the result count equals the test count, precisely so those
two cannot be confused.

**Duplicated predicates are acceptable only when both divergence directions fail loudly.** `ChallengeList.test.tsx`
holds a copy of the production `matchesQuery` predicate on that basis — but a change to one needs a matching edit to
the other.

**Cross-file timing dependencies get a comment at the constant.** `QUERY_WRITE_DELAY_MS` (200 ms) is depended on by a
live-region test in a different file, which waits against `waitFor`'s 1000 ms default. Raising it past ~800 ms flakes
that test.

---

## 9. Owner decisions — settled, not open

Do not reverse these without the owner. Both look like bugs from a distance.

**Solved is sticky.** A failing re-run on a solved challenge increments `attempts` and updates `lastCode` but keeps
`status: 'solved'` and the original `solvedAt`. Only **Clear** un-solves. Re-running a solved challenge is
experimentation, not a regression of the achievement, and an app that revokes a solve for exploring punishes exactly
the behaviour it wants.

**A learner who reveals sees exactly the same solutions as one who solved unaided.** `earned` (solved with
`revealedAt === null`) drives the _framing_ only — heading copy, and the absence of a confirm dialog. It never changes
which solutions or which tradeoff analyses are shown. Withholding teaching material from someone who struggled
inverts the point of the app.

Two consequences that follow from these and have already been got wrong once each:

- **Never stamp `revealedAt` on a record you have not confirmed is still locked.** Check `solutionAccess(stored)
.unlocked` against the _settled_ record. On a cold deep-link the panel renders the placeholder, offers "Reveal
  solution" for an already-solved challenge, and stamping it downgrades an earned solve permanently — an irreversible
  mislabel caused by an action the app offered only because it had not finished loading. First reveal also wins: a
  second click is the same decision, not a later one.
- **Clearing is atomic.** The draft and the on-screen result are cleared only after the DELETE lands, so a failed
  delete leaves everything intact. And "there is no row to delete" is **not** `unattempted` + zero attempts — a learner
  who reveals before ever running has a real server row with exactly those fields. Use `isUnrecorded`, which is
  type-coupled to `ProgressRecord` so a new field is a compile error until it is compared or deliberately excluded.

---

## 10. Known constraints

**`allChallenges` is eager, and it does not scale.** `Dashboard` imports the whole registry, so every challenge module
— prompt, `html`, `starterCode`, every solution's explanation and tradeoffs, and the test functions — ships in the
landing page's static closure. Measured at 13 challenges: ~191 kB of a 452,812 B closure for `/`, i.e. **42%**, at
~7.2 kB minified each, and almost none of it is rendered by `/`. The plan targets ~103 challenges; at the same rate
that is roughly +650 kB of eager weight on the first paint of a page that shows only counts and titles.

`Dashboard` needs `{id, slug, title, category, difficulty}` per challenge and nothing else. The fix is a generated
index module plus a per-challenge dynamic import, and it gets structurally harder the longer it waits, because each
new challenge is another static edge to unpick. **Decide it before the next category is authored, not after.**

**`RouteError`'s announcement has never been heard with a real screen reader.** A polite region is generally not
announced for content already present at insertion, and `RouteError` is a whole-page replacement. The
focus-the-`h1`-on-mount fix is the conventional SPA pattern and is applied — but it is untested by ear. Do not cite it
as verified.

**`ResultPanel`'s wrapper is `min-h-40 flex-1` with no `min-h-0`**, so it grows instead of scrolling and never becomes
a scroll container. Adding `min-h-0` would make it scroll — which is probably the better layout, and would also make an
otherwise-latent focus stop live were the guard in §5 not there. Treat this as an open layout question, not as settled.

**There is no error banner when json-server is unreachable.** The spec calls for one; reads and writes currently fail
quietly. Drafts are local, so editing keeps working — but a learner gets no explanation for why nothing is being
recorded.
