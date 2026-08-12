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
  and reads `contentDocument`. This is DOM isolation, not a security boundary — do not describe it as one. **It is not
  storage isolation either**, and that one is not merely a wording matter: same-origin means the frame and the app share
  one `localStorage` area — two `Storage` objects over one backing store — so `localStorage.clear()` in submitted code
  empties `dom-challenges-editor`, which holds every challenge's drafts and has no copy anywhere else. Measured through
  the production host. `src/runner/appStorage.ts` snapshots and repairs around every run and at teardown; its docblock
  records why no reachable frame arrangement avoids the sharing (`sandbox="allow-scripts"` fixes it by dropping
  `allow-same-origin`, which nulls `contentDocument` and breaks this whole interface).

---

## 3. Authoring challenges

A challenge is two files' worth of edit: a module exporting a `ChallengeContent` — prompt, `html`, `starterCode`,
`tests`, `solutions` — and an entry in its category's `index.ts` carrying the metadata and the `import()` that fetches
it. The metadata lives only in the index and the content lives only in the module, so neither can drift from the other.
**Never statically import a challenge module**; §10 explains what that costs and what fails when you do. A helper
shared between a category's challenges goes in that category's `support.ts`, which is the one other filename the build
check treats as not-a-challenge.

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

### Ask an identity question in the direction that prints a legible failure

**When a test asserts node identity, ask "where is the node I am holding" rather than "is that node
this one".** `expect(row.parentElement).toBe(list)` and `expect(list.firstElementChild).toBe(row)`
are the same claim; only the first one fails usefully.

The reason is `describeElement` in `src/runner/expect.ts`, which prints an element as its tag, `id`
and `class` — everything a rebuilt-from-markup copy has in common with the original. So the second
form fails with `Expected <li id="beta" class="item"> to be <li id="beta" class="item">`, and a
learner is told that a thing is not itself. The first form fails with `Expected null to be <ul
id="pinned">`, because the operation being caught — an `innerHTML` rebuild, a clone-then-delete, a
list reassembled from strings — is exactly the one that leaves the held node **detached**.

Identity is the main tool for catching those, so this comes up constantly: it was written the wrong
way round first in six of `creation`'s eleven challenges. The same applies to text nodes
(`#text "Before "` describes both sides equally) and to `doc.getElementById('list')` against a
captured element, which reads `null` when something removed the container.

**The rule only covers failures that _detach_ the held node, and that gap is not theoretical — it is
how `insert-at-index` shipped with the rule in force.** A solution that inserts in the wrong
_position_ leaves every node attached, so the legible form has nothing to report and the comparison
prints `Expected <li> to be <li>` anyway. When the failure being caught is positional, assert the
position as a **value** before asserting identity — `expect(stepTexts(list)).toEqual([…])`, or
`expect([...list.children].indexOf(rinse)).toBe(2)` — or give the markup ids so `describeElement` can
tell the nodes apart at all. Identity then catches only what it alone can see.

Not a matcher bug to fix in passing — `expect.test.ts` pins those messages deliberately.

### `<script>` inside a challenge's `html`

**You may traverse it. You may never rely on it having executed.** The iframe host assigns `srcdoc`, so the parser
runs the script; the memory host assigns `innerHTML`, which per spec never executes scripts. So a test asserting on a
script's _side effect_ passes in the browser and fails under Vitest, and — worse — the content suite is structurally
blind to the whole category. Assert on the script element and its text node, which both hosts have; never on
`win.someGlobalTheScriptSet`.

### What a challenge may never do, because the two engines disagree

Each was measured in both hosts during Phase 2's reconnaissance, and each is invisible to the content suite — the suite
agrees with whichever engine it runs on. `src/test/happyDomGaps.test.ts` pins them from the engine side, so a
dependency bump reports itself instead of quietly widening what is allowed. Every negative there carries a positive
control in the same document; §5 explains why that is not optional.

The list below is the cross-cutting form. **The measured detail lives in each category's `index.ts` docblock**, which
is where an author of that category will actually be looking — read it before authoring in a category, and put what
you measure there.

- **Never patch a prototype from a challenge test.** happy-dom shares **one class table across every `Window` it
  creates** — verified: patching `w1.Element.prototype` is observed by an element built in `w2` — so a prototype patch
  escapes the challenge and applies to the rest of the Vitest process, including the app's own tests. Instrument
  per-element instead: `element.getBoundingClientRect = fn` is an own property, it shadows the prototype, it dies with
  the document, and it needs no restoring. `performance/layoutThrash.ts` is the worked example.
- **Never assert ordering between two schedulers.** A `setTimeout(0)` scheduled alongside a `requestAnimationFrame`
  runs `micro → timeout0 → raf` in Chrome and `micro → raf → timeout0` under happy-dom, which models frames with
  `setImmediate`. Ordering _within_ one scheduler is fine; across two it is a coin flip that lands the same way every
  time on whichever engine you happened to check.
- **Never write a `dom-challenges-*` key from a challenge, and clean up the keys you do write.** The preview frame
  shares the app's storage area (§2), so that prefix is the app's own state and the runner treats any change to it as
  damage to be repaired — a Storage challenge about namespacing is exactly where someone would reach for it. Keys
  outside the prefix are yours, and are yours to remove in a `finally`; `storage/filterState.ts` is the worked example.
- **Never assert a `MutationRecord`'s `previousSibling` or `nextSibling`.** On a `childList` addition Chrome reports the
  preceding element and happy-dom reports `null`. Everything else about `MutationObserver` matches record for record —
  callback batching, `attributeOldValue`, `characterDataOldValue`, `addedNodes`/`removedNodes`, `takeRecords`,
  `disconnect` — so this one field is the whole exception and it is easy to reach for.
- **Never assert that an insertion was batched.** Chrome queues **one** `childList` record carrying every child of an
  inserted `DocumentFragment` (and of an `innerHTML` assignment); happy-dom queues one per child, so a fragment and a
  loop of `append` calls are indistinguishable here. "Prove you batched your inserts" is therefore unauthorable, which
  is a real loss to the `creation` category and not a small one.
- **Never assert a `getComputedStyle` value outside the portable subset.** The cascade itself is faithful — specificity,
  inheritance, `!important` over inline, `insertRule`, `var()` — but the _serialisation_ is not. Portable: **px lengths
  written as px**, and a custom property read off the element that **declares** it. Not portable, in the "green here,
  wrong in a browser" direction every time: colours (`red` and `#0000ff` stay as written instead of computing to
  `rgb(...)`), shorthands built from longhands, `em` and `%`, UA defaults, pseudo-elements, `var()` fallbacks, and an
  inherited custom property read off the element that inherits it. Read the longhand the `var()` fed instead.
- **Never build a Forms challenge on `minlength`, `maxlength`, a browser-supplied `validationMessage`, or
  `:invalid`/`:valid`/`:required`.** The length attributes apply only to a user-edited value and happy-dom ignores that
  condition, so they look like they work here and do nothing in a browser; `validationMessage` is `''` here for every
  built-in failure, so only a message the challenge set with `setCustomValidity` is assertable; the validity
  pseudo-classes never match at all. Filling out the category found four more, each pinned in
  `src/test/happyDomGaps.test.ts` and detailed in the category index's docblock: **never read a `<select multiple>`
  through `FormData`** (one entry here -- the select's `.value` -- versus one per selected option in a browser, so the
  recon's "`FormData` in full" was wider than its measurement; checkbox groups arrive whole and are the multi-value
  device to use), **never read `validity` off a disabled or readonly field** (its flags stay raised here where a
  browser computes them barred-aware -- `willValidate` and `checkValidity()` are the barred-aware reads that agree),
  **never assert anything about a no-argument `requestSubmit()`'s submitter** (the form element here, `null` per
  spec), and **never `reset()` a radio group carrying two `defaultChecked`** (both end up checked here, a state a
  browser cannot represent). The rest of the Constraint Validation API is faithful, including `checkValidity`, the
  `validity` flags on participating fields, the `invalid` event, `setCustomValidity`, `willValidate`, `noValidate`,
  `FormData` otherwise, and `requestSubmit` with a named button.
- **Never write ARIA state through the IDL properties.** happy-dom implements the `ARIAMixin` (`ariaExpanded`,
  `ariaSelected`, `ariaChecked`, …) as plain JavaScript properties that reflect **nothing**, so a solution written that
  way is right in a browser and invisible to every attribute selector in the suite. Use `setAttribute`/`getAttribute`.
  `element.role` is the one that does reflect.
- **Never assert focus on an element that is not natively focusable, and never assert `:focus-within` or
  `:focus-visible`.** `focus()` succeeds on a plain `<div>` here and is refused in Chrome; `:focus-within` never
  matches here; `:focus-visible` happens to agree in both, for a reason that recommends nothing — its heuristic is
  defined over **real** user input and the harness can only dispatch untrusted events. Focus itself is otherwise
  faithful, including `activeElement` moving when the app realm calls `focus()` on an element inside the frame.
- **Never assert `event.target` across a shadow boundary.** Chrome retargets an escaping event to the host; happy-dom
  does not, which makes `event.target.closest(...)` — the natural wrong answer — work here and fail in a browser. Nor a
  closed root's truncated `composedPath` (5 entries in Chrome, 7 here), nor `composedPath()` read after dispatch has
  ended (`[]` in Chrome, stale here), nor a listener attached with an already-aborted `AbortSignal` (never attached in
  Chrome, attached and fired here). `composedPath()` **during** dispatch is portable, contents and order, and so is the
  walk through `parentNode`/`ShadowRoot.host` — but never a `ShadowRoot`'s `nodeName`.
- **Never assert that the capture flag is part of a registration's identity at removal time, in either direction.**
  Chrome matches a removal on `(type, callback, capture)`, so `addEventListener(t, fn, true)` +
  `removeEventListener(t, fn)` removes **nothing**, and neither does `addEventListener(t, fn)` +
  `removeEventListener(t, fn, true)`; happy-dom ignores the flag and removes it both ways. Measured in both spellings.
  This is the dangerous direction — the buggy removal is the one that passes here — and it is not the Events category's
  problem alone: anything that hands back a teardown can reach for it. It cost `listener-identity` the sharpest test of
  its own thesis. **The thesis is unauthorable; the wrong answer is not.** A listener registered with `capture` is
  observable through _ordering_ — at the target, capture-registered listeners run before bubble-registered ones, in both
  engines — so bracketing the submitted subscription with test-owned listeners and asserting the order rejects it
  portably. That is a weaker claim than the removal, and it is the one an outside observer can make. Everything else
  about registration identity is portable, including de-duplication by that same triple, the fact that a duplicate add
  neither reorders the listener nor updates its options, and registration order within one target.
- **Never assert what a `once` listener does when its own callback re-dispatches the event.** DOM's "inner invoke"
  removes the registration **before** calling the callback, so Chrome fires it once; happy-dom removes it afterwards, so
  a re-entrant dispatch finds it still there and it fires twice. Measured in both. The consequence is sharper than it
  looks: a hand-rolled `removeEventListener` written _after_ the callback is a real bug that **no test on this engine
  can reject**, because the correct `{ once: true }` answer fails the same test here. Say so in the challenge rather
  than leaving the gap implied. The rest of `once` is faithful — it fires once, it re-arms, it is per registration, it
  is spent even when the callback throws, and an ignored duplicate add does not clear it.
- **Never assert `eventPhase`, and never assert a removal that takes effect mid-dispatch.** At the target, a
  capture-registered listener reports `AT_TARGET` (2) in Chrome and `CAPTURING_PHASE` (1) here — an ancestor reports 1
  and 3 in both, so the single divergent reading is exactly the one a challenge about the three passes would want. Teach
  the passes with an ordered log instead. Separately, a listener removed **during** a dispatch — by `removeEventListener`
  from a preceding listener on that target, or by `AbortController.abort()` from inside one — is skipped in Chrome and
  still runs here, because happy-dom invokes the copy of the list it took when the event arrived. Removing a listener on
  an object the event has **not reached yet** is honoured in both, and so is the mirror fact that a listener _added_ to
  such an object does run — that pair is portable, and it is what `events/outsideClick.ts` is built on.
- **Never build on the legacy `cancelBubble`/`returnValue` setters, or on where an `onclick` handler sits in the
  listener list.** happy-dom ignores `event.cancelBubble = true` and `event.returnValue = false`, which Chrome honours
  as `stopPropagation()` and `preventDefault()`; and happy-dom runs an `onclick` handler after every
  `addEventListener` listener, where Chrome registers it at the position it was first assigned. All three are the safe
  direction — this engine rejects answers a browser accepts — but a learner writing legacy code is graded differently by
  the two hosts, so no test may depend on any of them.
- **Never assert a resolved URL, and never compare anything to the frame's `location`.** `a.href` and
  `img.src` resolve against the document's base, which is `https://challenges.local/` here and the
  **app's current route** in the `about:srcdoc` frame. Worse, that frame's **`location.origin` is the
  string `"null"`** in Chrome and the memory host's URL here — so `link.origin !== location.origin`,
  the correct way to ask "does this link leave the site", is `true` for every same-origin link in the
  real host and `false` for a `mailto:`. Measured; it cost the Attributes category a challenge. The
  relative-versus-absolute distinction is fine to teach, and an href written **absolute in the markup**
  decomposes identically in both (`pathname`, `search`, `hash`, `origin`); a resolved string is not
  assertable and neither is a same-origin test.
- **Never iterate `element.attributes` while removing attributes from that element, and never ask a
  challenge for bulk attribute removal.** Chrome's `NamedNodeMap` gets its iterator from its indexed
  getter, so the walk advances an index while the map shrinks and **skips every other attribute**;
  happy-dom's iterator snapshots and removes them all. The buggy loop is the one that passes here.
  Reading the map without mutating it is portable, and so are `getAttributeNames()` (a snapshot), the
  map's live `length`, and `[...element.attributes]`.
- **Never index `dataset` with a dashed name.** `dataset['view-count']` reads `"3"` here and
  `undefined` in Chrome; writing one sets `data-foo-bar` here and throws `SyntaxError` there. The
  camelCase mapping itself agrees in both directions, as does the lowercasing of attribute names by
  the HTML parser.
- **Never assert that a class token was rejected.** `classList.add('')` throws `SyntaxError` in Chrome
  and `classList.add('a b')` throws `InvalidCharacterError`; happy-dom accepts both and splits the
  second into two tokens. Everything else about `DOMTokenList` matches, `toggle`'s `force` argument
  and its de-duplication included.
- **Never write a dashed CSS property as an index, and never read `removeProperty`'s return value.**
  `style['margin-bottom'] = '5px'` is a real declaration in Chrome — CSSOM defines a dashed attribute
  per hyphenated property — and a no-op here; `removeProperty` returns the removed value in Chrome and
  `undefined` here. Both point the _safe_ way for the suite, but a learner writing either in the app
  is graded differently by the two hosts. The rest of the inline-`style` model matches exactly,
  including `setProperty` for custom properties, `style.length`, and the serialised attribute text.
- **Never build an SVG element with `insertAdjacentHTML`, and never write an SVG element's class through
  `className`.** Both diverge, in opposite directions, and SVG built by script is not one category's problem —
  Styles, Accessibility, Web APIs and Performance can all reach for it. `svg.insertAdjacentHTML('beforeend',
'<circle …>')` yields an SVG-namespaced `circle` in Chrome and an `HTMLUnknownElement` named `CIRCLE` here, so a
  challenge built on it is green in the suite and renders nothing for the learner. `className = 'dot'` on an SVG
  element is the reverse: here it reflects to the `class` attribute like an HTML element's, while in Chrome
  `className` is a read-only `SVGAnimatedString`, so the assignment **throws** under the strict-mode code the harness
  runs (`Cannot set property className of #<SVGElement> which has only a getter`) and no class is set — the suite
  accepts an answer a browser refuses to run. Use `createElementNS`, `cloneNode`, or `innerHTML` on an element already
  inside the SVG tree; set classes with `setAttribute('class', …)` or `classList`, both of which agree. Everything
  else about namespaces matches:
  `createElement` gives XHTML/`CIRCLE`/`HTMLUnknownElement`, `createElementNS` gives SVG/`circle`/`SVGCircleElement`,
  parsed markup and `cloneNode` keep the namespace, and a `<template>` holding an `<svg>` wrapper parses its contents
  as foreign content.

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

### Nothing may remove a `dom-challenges-*` key

**The runner reads an absent one as damage and puts it back.** The preview frame is same-origin with the app and shares
its `localStorage` (§2), so submitted code can empty it; `protectAppStorage` repairs a missing key at the next `reset`,
at `dispose`, and on `pagehide`. That repair is only sound because the app never removes one of these keys — zustand
rewrites the whole blob, `partialize` returns all three slices unconditionally, and clearing the last draft writes
`{"drafts":{}}` rather than deleting the entry.

So the obvious "Reset my data" button calling `persist.clearStorage()` **breaks this**, and it breaks it in the worst
available way: nothing fails, the user's deliberate deletion is silently undone at the next reset, and it reads as a
persistence bug rather than as a guard doing what it was told. If a deliberate erasure is ever wanted, it has to write
an empty state through the store — or teach the guard the difference, which today it has no way to know.

Two tests hold the invariant from the store's side: clearing the last draft leaves the key present, and `partialize`
writes all three slices. Both were checked against a mutation that calls `clearStorage()`; the first one fails.

---

## 5. Layout and accessibility facts — verified, do not re-derive

**The preview frame must never be `display: none`.** A document inside a non-rendered subtree never services
`requestAnimationFrame`. `tick()` now waits for a frame it has **seen serviced** — two chained `rAF` hops, with
`FRAME_FALLBACK_MS` (250 ms) as a genuine escape rather than a deadline — so in a non-rendered subtree it escapes on
every call, and any paint-dependent work in a learner's code simply does not happen. Note the escape is the _only_
thing standing between a non-rendered preview and a permanent hang, which is why it exists at all; it is not a bet on
how long a frame takes. When the preview must step aside — the phone layout parks it while
another tab is showing — take it out of flow and move it off-screen (`absolute -left-[200vw]`), so it keeps a real box
and a real rendering. Whether it is parked is decided by **CSS**, so a broken `matchMedia` cannot move a panel;
JavaScript only decides the parts CSS cannot express.

**Use `inert` on the parked column, not `aria-hidden`.** `aria-hidden` over a live `<iframe>` whose content renders
real buttons and links leaves those controls in the sequential focus order — a phone learner tabbing past Clear loses
focus 200vw off-screen. `inert` removes them, and its inertness propagates into a nested navigable. `iframe.focus()`
from the parent is a no-op under an inert ancestor. Verified in Chrome with real Tab keypresses.

**The evidence is the wrap, not a stop count.** Tab from the last focusable control before the parked column and keep
going: the walk must reach the first control after it, and must eventually come back round to where it started,
without ever landing inside the parked column. Wrapping having visited only what is outside is what distinguishes
"those stops were removed from the order" from "focus went somewhere invisible" — the second is exactly the failure
being ruled out, and it is silent. This was originally recorded as a literal three-stop sequence, which only
reproduces against the precise set of focusable controls the page had on the day; re-derive the walk instead, at the
width where the column is actually parked.

- **Do not add `tabindex="-1"` to the preview iframe.** `createIframeHost` builds the frame imperatively, so a static
  `-1` would apply on desktop too and cost the _visible_ preview its keyboard reachability. In an app that teaches the
  DOM, a learner tabbing into the buttons and links their own code rendered is a feature.
- Verified in **Chrome only**, on a layout whose target user is on iOS Safari. WebKit shipped `inert` in 15.5 with
  nested-navigable propagation, so it is expected to hold — but this is the one behaviour in the app whose target
  platform is not the one that was tested.

**A browser probe whose answer is "X never happened" needs a positive control, in the same document, over the same
wait.** This is the general form of the focus trap below, and it has now produced a confident wrong reading twice. The
second time, a first pass reported that `IntersectionObserver`, `ResizeObserver` and `requestAnimationFrame` were all
dead **in real Chrome** — the tab was merely backgrounded, and a document the browser is not rendering services no
frames and delivers no observer entries. Re-run foregrounded, every one of them worked.

The obvious mitigation — check `document.visibilityState` first — is necessary and **not sufficient**, on two measured
counts. Visibility is not the only suppressor: a `display: none` subtree stops frames while `visibilityState` stays
`visible`, which is the very thing the paragraph above this one is about. And it reads the wrong document — measured at
one instant, the top document was `visible` with `hasFocus(): true` while the frame's `document.hasFocus()` was
`false`, and it is the _frame's_ focus that makes `navigator.clipboard.writeText()` reject with `NotAllowedError`.

So the rule is not a checklist item, it is a shape: **show that a known-good channel did fire, in the same document, at
the same moment, before recording that another one did not.** "It never fired" and "the wait was too short" are the
same observation until something separates them. `src/test/happyDomGaps.test.ts` writes every one of its negatives this
way, and a mutation that stops its control channel from firing turns those tests red — which is the check that the
control is load-bearing rather than decorative.

**How to probe focus, and the trap that produced a wrong reading first time.** A script running _inside_ a frame can
set the inner document's `activeElement` while `contentDocument.hasFocus()` stays `false`. In a **backgrounded** tab
that artefact reads as "the iframe accepted focus" — a false positive. Any focus probe must run in a **foreground**
tab, use real key events, and take the **wrap-around** as its evidence. Two more things that do not work here:
`HTMLElement.tabIndex` reads `-1` for an overflowing scroller, a plain div and a button-containing scroller alike, so
Chrome does not surface focusable-scroller through the IDL; and `.focus()` measures focusability, which is a
prerequisite for a sequential stop but is not the same claim.

**The resize handles are the desktop grid's only gutters, and `lg:gap-x-0` is load-bearing.** From `lg` up the row is
`prompt fr | auto | editor fr | auto | result fr`, and the two `auto` tracks are the `PaneResizer` handles. They are
the only tracks in that row that are not a share of it, which is what lets the handle turn a pointer's pixels into a
percentage by subtracting nothing but its own width, twice. Put a column gap back and the arithmetic is wrong by the
gap's share of the row — the handle trails the pointer, and trails further the further it is dragged. Nothing fails;
it just feels broken. Verified in Chrome against real geometry: a 52.7px drag of a 542px track space moved the
boundary 54px, which is the 1%-rounding step and nothing else.

**Both input paths go through `resizePanes`, and the clamp is not cosmetic.** The split is persisted under
`dom-challenges-editor`, so a pane dragged to zero is still zero after a reload — with the handle that would undo it
sitting in a pane of no width. `MIN_PANE_PERCENT` is what prevents that, and it has to be enforced in one place
because a pointer delta and an arrow key are the same request in different units. Only the leading pane of a pair is
ever written; the trailing one takes the rest of the pair's total, which is what holds the three at 100 across any
number of moves. happy-dom has no layout engine, so the pixel half of this is untestable there — that is the reason
the arithmetic is a pure exported function with its own tests rather than logic inside the handlers.

**The handle is a `<div role="separator" tabIndex={0}>`, and `.oxlintrc.json` turns off `prefer-tag-over-role` for
that one file.** It is the ARIA window-splitter pattern: a focusable separator carrying `aria-valuenow`, which is a
widget rather than a thematic break. No element satisfies all of oxlint's a11y rules at once — `<hr>` with a tabindex
trips `no-noninteractive-tabindex` and `no-noninteractive-element-interactions`, and `<hr role="separator">` trips
`no-redundant-roles` and `no-noninteractive-element-to-interactive-role`. Each was run through `pnpm lint` before the
override was written; the evidence is in the override's comment.

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
re-chunking into files sitting in the same route's preload list, for a real saving of 46 kB. **Resolve the static
import graph per call site and report the route's total eager bytes** — never sum the `__vite__mapDeps` table whole.
Any chunk number in this repo's history that was not checked that way should be treated as unverified. In particular,
**an entry-chunk figure is not a first-paint saving**: Task 13's headline (entry 746.77 → 324.96 kB) is entry-chunk
only, and that task _created_ a route chunk fetched on the same navigation. Do not cite it as one.

**`pnpm build` measures that for you, and fails on it.** `scripts/routeBudget.ts` runs as the build's last step. It
reads Vite's build manifest — the same static-import edges the preload helper is generated from, which is why it does
not have to parse `__vite__mapDeps` back out of the emitted chunk — and reports the eager JavaScript for `/`,
`/category/:categoryId` and `/challenge/:slug` against the budgets in `scripts/budgets.ts`. A budget it trips is a
measurement, so answer it by measuring: raising the number is the last resort, not the first. It also fails outright
when a route's `lazy()` module stops being a chunk of its own, because that is the regression whose cost lands on a
_different_ route's line — and, for the same reason, when a challenge module stops being one (§10).

**All three budgets are derived from the challenge count. None is a literal.** A challenge costs every route 414 B of
index entry and buys back 414 B of ceiling on every route, so ordinary authoring never needs a re-baseline — which
matters because a routine re-baseline is indistinguishable from someone raising a number to bury a regression. The
shared floor (365,115 B, `/` with **every** category's entries emptied), the slack (a fixed 9,500 B per route, for
growth that is not challenges) and the two split routes' extra chunks (166,155 B and 415,218 B) are measured constants
pinned by `scripts/budgets.test.ts`, so moving one means editing a test that records a measurement. Emptying
`selectionEntries` alone was that method when `selection` was the only populated category and is now wrong by eleven
index entries: it measures 369,309 B, 4,194 B above the floor.

**One coefficient covers three routes because the build gives it one.** The whole challenge index compiles into a
single chunk that every route's closure already contains, so registering a challenge moves that one chunk and no other
— verified file by file at 1, 2, 11, 13, 14, 17, 20, 24, 34, 54 and 104 challenges, with each split route sitting an
_exactly_ constant 166,155 B and 415,218 B above `/` at all eleven counts. The 427.8 B and 438.2 B those routes were
previously thought to pay per challenge were an artefact of the baseline: a **zero**-challenge build has no `import()`
in any category index, so it has no preload helper and no split-chunk runtime and is structurally a different build —
`/`'s closure is four files at zero challenges and six at one. Crossing 0 → 1 costs those routes 176 B and 311 B
**once**, and 414.2 + 176/13 = 427.7, 414.2 + 311/13 = 438.1. It was a one-time re-chunking cost divided by thirteen,
not a per-challenge term, and the library does not return to empty.

**`/` pays that step too, so 414.2 was never a clean per-challenge figure either.** The same subtraction produced it,
and `/`'s own 0 → 1 cost is at least 260 B measured directly outside the index chunk. Net it out and Phase 2's entries
cost ~393.5 B; the 23 real entries added between the N=1 and N=24 builds — both structurally the same build, so an
honest subtraction — cost 365.6 B. When re-measuring either the floor or the coefficient, do not subtract a
zero-challenge build.

**414 is a mean, not a bound on one entry.** It was justified here for a while as exceeding every figure an entry had
ever measured; filling out `attributes` falsified that. Measured against a 46-challenge build by emptying one
category's array and moving its modules out together, `selection`'s 13 entries cost **382.0 B** each and
`attributes`' 11 cost **454.2 B** — the difference is the length of the ids, titles, concepts and `relatedIds`
themselves, and nothing structural. The fixed slack absorbs the variance both ways (`attributes` takes 442 B of it,
`selection` gives 416 B back, and every route still has 9,648 B left), so ordinary authoring still needs no
re-baseline. Do not trim a challenge's metadata to hit the number: the budget exists to catch a step change, not a few
tens of bytes of prose. `scripts/budgets.ts` carries the table.

Deriving moved `/challenge/:slug` down 5,231 B and `/category/:categoryId` up 706 B from the round literals they
replaced, and left all three leaving the **same** headroom — which is the property worth keeping, not the figure. It
was 10,217 B when that was written and is 9,648 B today, because headroom is a **shared pool** every category draws
from: a route's remaining bytes equal the 9,500 B slack exactly when the 414 B model is exactly right, and the
difference is the library's accumulated error in it. `pnpm build` therefore prints remaining bytes as well as a
percentage — the percentage alone made the largest route look nearest the edge when all three are equidistant — and
prints the pool's position against the modelled slack on its own line, so the drawdown is a reading on every build
rather than something discovered when a ceiling is finally crossed. It is deliberately **not** a failure: a number
that had to be re-baselined whenever a category was written would be indistinguishable from someone raising a ceiling
to bury a regression.

**`chunkSizeWarningLimit` is raised to 7500 kB, and is not a budget.** Every build warned before that, always about
the same Monaco workers — chunks no route references and no learner downloads until the editor opens — and a build
that is permanently red masks the next real regression exactly as thoroughly as a raised limit would. The limit is a
single global number compared against one chunk at a time, so it could never say anything about a route in the first
place. It is set by Monaco's largest chunk (`ts.worker`, ~6,914 kB) and by nothing else; the route budgets above are
what replaced its signal. Do not read it as a size target, and do not lower it hoping it will act as one.

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

**"I ran the wrong answer" must mean the exact code, not one that rhymes with it.** The most expensive content defect
so far was authored by someone who _did_ run a wrong solution and _did_ see it rejected — but ran a variant. In
`detach-and-reattach`, rebuilding the list and returning a hand-built copy is caught; rebuilding the list and returning
the **real detached node** passes all five tests while silently destroying every other row. The two spellings differ
only in what they return, and that difference is the entire challenge. The rejection of one was generalised into a
claim about the other, and the report said the technique had been tested. It had not.

So: run the specific code a learner would write, one variant at a time, and record the failure message each one
produces. Where a challenge's thesis is "operation X preserves the rest of the document", **at least one test must
assert on the nodes the wrong answer would have replaced** — held by reference before the call.

**The same defect applies to your own measurements, and that form is harder to see.** Three of the four defects found
in the `events` review were one mistake in different clothes: a narrow thing was measured, and a wider claim was
written from it that was never tested. `eventPhase` diverges _only_ for a capture-registered listener at the target —
recorded as "`eventPhase` is unauthorable". `{ once: true }` was measured re-arming correctly — recorded as "full
fidelity", when its removal does not precede the callback here as it does per spec. And "the thesis is unauthorable"
was carried across to "the wrong answer is unrejectable", which are different claims — the answer turned out to be
rejectable by a test that watches listener _order_ instead. When you write down what a measurement means, check that
the sentence is not wider than the thing you ran.

**And the count in the paragraph above was itself wrong, in the same way.** It originally read "five of the six
challenges around it already did; the one that did not is the one that shipped a hole" — a generalisation from one
sweep, written by the same hand, inside the rule against generalising from one run. A reviewer then ran the variants
against the whole category and found **three** challenges with the hole, not one: `detach-and-reattach`,
`move-not-copy` (surviving rows asserted by `id`) and `table-context` (the header asserted with `toEqual`, which never
discriminates nodes — see below). Two of the three were written _after_ the rule was, by an author who had just
written it. Reading a rule is not the same as having applied it; the check is the run, every time.

**A vacuous assertion is worse than none.** `.filter(...)` over an empty array is an empty array, and a `describe.each`
over an empty list expands to no tests at all — so "nothing failed" and "nothing ran" look identical. Pin the counts:
`content.test.ts` asserts the registry is non-empty and that the result count equals the test count, precisely so those
two cannot be confused.

**`expect(...).toEqual(...)` never discriminates DOM nodes. Use `toBe`, or compare a projection.** The runner's
`deepEqual` (`src/runner/expect.ts`) compares own enumerable keys, and a DOM node has none — every property it looks
like it has lives on a prototype. So `toEqual` is `true` for **any** two nodes: measured, a freshly created `<div>`
equals an `<li class="a">`, and a text node equals an element. An assertion of the form
`expect([...list.children]).toEqual(capturedChildren)` therefore passes against a list rebuilt entirely from clones,
which is exactly the check it was written to prevent. It shipped once, in `creation/table-context`.

Compare node identity with `toBe`, one node at a time — `expect(cell.parentElement).toBe(row)` — or map to something
`deepEqual` can see, like `.map((el) => el.id)`. Note the projection answers a weaker question: ids and text survive a
rebuild, so a projection catches _order and content_ and never catches _identity_. When the claim is preservation, it
has to be `toBe`.

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

## 10. The challenge registry is an index, and challenge content is lazy

**Nothing but the challenge route may reach a challenge module.** The type is split in two, and the split is the whole
architecture:

- `ChallengeMeta` — `{id, slug, title, category, difficulty, concepts, relatedIds}`. What `/` and
  `/category/:categoryId` render and search. Cheap, and eager.
- `ChallengeContent` — `prompt`, `html`, `starterCode`, `tests`, `solutions`. What only `/challenge/:slug` renders, and
  only for the one challenge it is showing. Expensive, and never eager.
- `ChallengeEntry` is the metadata plus `load()`, the dynamic import that fetches the rest. `Challenge` is the two
  halves joined, which is what `loadChallenge` returns and what the runner, the editor and the prompt panel see.

A category's `index.ts` holds one entry per challenge — metadata inline, `load: () => import('./x').then(m => m.x)` —
and is the only place a challenge is registered. Metadata therefore has exactly one home; there is no generated file to
regenerate and nothing that can drift out of step with the module beside it.

`ChallengePage` looks the slug up in the index synchronously (so an unknown slug is a not-found page immediately, not a
spinner that becomes one) and then reads `loadChallenge(entry)` with React's `use`. That is why `loadChallenge` caches
its promises by id: `use` requires the same promise across renders.

**A rejected promise stays in that cache, and must.** Evicting it so the next caller could retry looks like the kinder
branch and is a livelock: the next caller _is_ the retry render `use` schedules, so it calls `load()` again, gets a
fresh pending promise, and suspends again. Measured at **21,528 imports in two seconds** with the page pinned to the
loading fallback and `RouteError` never reached — worse than the failure it was softening, and worse than the eager
registry it replaced, where content never suspended at all. Keeping the rejection is what lets the failure settle into
a throw the boundary can catch.

Evicting would not buy a retry anyway: per the HTML module map a repeat `import()` of a specifier that already failed
resolves to the recorded failure without re-fetching — the same conclusion `routes.errorElement.test.tsx` records for
`lazy`, that only a fresh document re-issues the request. `RouteError`'s reload button is that fresh document. An
in-session retry would have to be its own entry point the error UI calls deliberately, never the path a render reads.

Two tests hold this and neither can see it alone: `loader.test.ts` pins the promise identity across a rejection, and
`ChallengePage.loadFailure.test.tsx` renders the real route with an unloadable challenge module and waits for the error
page. The unit test passed against the eviction, because calling `loadChallenge` directly is not composing it with
`use` — §8's recurring defect, in the form where the assertion checks that the branch fired rather than what it does to
the thing consuming it.

**What it cost and what it saved, measured by route-level delta** (`pnpm build`, then empty the category's entries and
rebuild — §7's method, and the only one that is trustworthy here):

| `/` eager JavaScript          | before  | after   |
| ----------------------------- | ------- | ------- |
| with the 13 selection entries | 452,947 | 370,500 |
| with the category emptied     | 365,115 | 365,115 |
| **cost of 13 challenges**     | 87,832  | 5,385   |
| **per challenge**             | 6,756   | 414     |

The floor is byte-identical either way, so the refactor added no fixed overhead: a challenge went from **6,756 B on the
first paint to 414 B**, a factor of sixteen. At the ~103 challenges the project targets, that is ~408 kB of eager
JavaScript on `/` rather than ~1.05 MB.

Both columns subtract a zero-challenge build, which §7 records is structurally a different one. For the after column
that is measurable and measured: net out `/`'s own one-time 0 → 1 cost and its 414.2 B becomes ~393.5 B. For the before
column it is not — that architecture is gone from the tree and cannot be rebuilt — so whether 6,756 B carries an
equivalent step is unknown, and the factor of sixteen should be read as the order-of-magnitude claim it is rather than
recomputed. The conclusion it supports is not close enough to the line for this to matter. The derived budget's 414 is
justified separately, in `scripts/budgets.ts`, and not by this table.

**Two checks hold this, and they fail for different reasons.** `pnpm build` runs both:

- `scripts/routeBudget.ts` budgets each route's eager bytes against `scripts/budgets.ts`. Every ceiling is the measured
  365,115 B shared floor, plus 414 B for every challenge module on disk, plus a fixed 9,500 B of slack, plus that
  route's own measured chunks (0, 166,155 B, 415,218 B) — 384,551 B, 550,706 B and 799,769 B for the 24 challenges here
  today, against measured 374,334 B, 540,489 B and 789,552 B. Authoring therefore moves every budget and every route's
  bytes by the same 414 B and needs no re-baseline; what has to fit in the fixed slack is everything that is _not_ a
  challenge.
  **Do not read it as the laziness check** — it cannot see a challenge going eager at all. Re-measured after the
  derivation: statically importing the cheapest module (`queryBasics`) adds 2,178 B and the most expensive
  (`treeWalker`) 9,225 B, and **all three routes still pass**, the worst case landing at 100% with 951 B to spare.
  Deriving the split routes did not change that and could not: a challenge raises every ceiling and every route's bytes
  by the same amount, so an eager module has only the fixed slack to fit inside on `/challenge/:slug` exactly as it
  always did on `/`. What this budget does catch is the step change: a dependency dragged out of a lazy route into the
  entry.
- `assertChallengesAreLazy` in the same script reads every challenge module off disk and requires each to be its own
  chunk in the build manifest. A module reached only through `import()` is emitted as a chunk under its own source
  path; one that someone statically imported is folded into its importer and disappears from the manifest entirely.
  **This is the ungameable half**, and per the figures above it is the only half that can see this regression. Verified
  by mutation against both ends of the size range; each time it failed naming the file. A challenge file that no index
  registers fails it too, which is what keeps "every challenge on disk" equal to "every challenge in the index".

Both read the same file list, from disk rather than from the manifest, and that is deliberate: a manifest-derived count
would shrink by one exactly when a module went eager, tightening `/`'s ceiling by 414 B to describe a module that had
just added thousands to the entry. The equality that lets a file count stand in for `challengeIndex.length` — which a
Node script cannot import — is pinned from the source side by `registry.test.ts` and from the build side by the check
above.

`src/challenges/loader.test.ts` covers the same rule from the source side: it asserts an index entry's keys
**exhaustively**, so a `{...challenge, load}` spread fails rather than passing every "it has a title" assertion. Both
halves are needed. Neither replaces the other.

**`content.test.ts` still opens every challenge, and must.** It awaits `loadChallenge` for the whole index at the top
of the file, which is eager on purpose — it is a test, not a route — and it buys a check nothing else makes: every
entry has to resolve to a module that really exports what the entry says. A mistyped path or export name is a challenge
that 404s for a learner and for no one else. If this suite is ever narrowed to a subset, the project's correctness
guarantee has a hole in it that nothing else can see.

**One accepted cost:** opening a challenge is now two sequential fetches — the route chunk, then the challenge chunk —
where it used to be one. The second is a few kilobytes. Prefetching on hover from `ChallengeList` would remove it and
has not been done.

---

## 11. Known constraints

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
