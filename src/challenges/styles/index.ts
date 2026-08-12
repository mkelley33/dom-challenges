import type { ChallengeEntry } from '@/types/challenge';

/**
 * The Classes, Styles & CSSOM category, as metadata plus one dynamic import each.
 *
 * **The question this category lives or dies on is whether `getComputedStyle` resolves the cascade
 * or only inline styles. It resolves the cascade.** Measured in happy-dom and in real Chrome
 * through the production host, agreeing on every point: a `<style>` in the challenge's markup is
 * parsed and applied (and so is one appended afterwards), id beats class, descendant selectors
 * match, inherited properties inherit, an `!important` declaration beats an inline one, `insertRule`
 * takes effect, and `classList` (`add`/`toggle` with `force`/`replace`/`contains`) drives all of it.
 * Custom properties resolve through `var()` from an ancestor's rule, from `:root`, and from an
 * inline `setProperty`, and an element that declares its own beats what it would have inherited.
 *
 * **Four divergences, all in the value `getComputedStyle` hands back rather than in the cascade
 * that produced it. Every one of them is a way to write a challenge that goes green here and lies.**
 *
 * | read                                          | Chrome                | happy-dom     |
 * | --------------------------------------------- | --------------------- | ------------- |
 * | `color` from `color: red` or `#0000ff`        | `rgb(255, 0, 0)`      | `red`         |
 * | `padding` shorthand from a `padding-left` rule| `0px 0px 0px 4px`     | `''`          |
 * | `padding-left: 2em` with `font-size: 10px`    | `20px`                | `32px`        |
 * | `padding-left: 50%`                           | resolved px           | `50%`         |
 * | `--x` read off a **descendant** that inherits it| the value           | `''`          |
 * | `var(--missing, rgb(3, 3, 3))` fallback       | `rgb(3, 3, 3)`        | `''`          |
 * | an unstyled element's `color`                 | the UA/inherited value| `''`          |
 * | `::before` `content`                          | `none`                | `''`          |
 *
 * So the portable subset a challenge may assert on is: **px lengths written as px**, custom
 * properties read off the element that **declares** them, and any longhand the challenge's own CSS
 * sets. Never a colour (unless it is written as `rgb(r, g, b)` and compared to that exact string),
 * never a shorthand, never a relative length, never a UA default, never a pseudo-element, never a
 * `var()` fallback, and never an inherited custom property read through `getComputedStyle` on the
 * inheriting element -- read the longhand the `var()` fed instead, which is what `density-token`
 * does. `computedStyleMap` does not exist here at all. See AGENTS.md §3 and §10.
 *
 * **Re-measured when the category was filled out** (happy-dom 20.11.2 through `createMemoryHost`;
 * real Chrome through a `srcdoc` iframe injected into a served https page -- the production host's
 * frame arrangement, though not the app itself -- foregrounded, with a positive control read
 * first). Everything below was taken on both sides on the same day. The portable ground first,
 * then the traps; several of the traps are pinned from the engine side in
 * `src/test/happyDomGaps.test.ts`.
 *
 * **The composed challenges have since been run through the app's own host**, which is the claim
 * size the primitives above did not have: `pnpm test:browser` (AGENTS.md §1) runs every solution
 * and every starter in this category through `createIframeHost` in Chromium, `order-of-appearance`'s
 * adopted-sheet solution and both sheet-walking solutions included. All passed, first contact.
 *
 * **Portable, and load-bearing for these challenges:**
 *
 * - **Ties break on order of appearance, identically**: across two `<style>` elements, within one
 *   parsed sheet, and across two selectors of equal specificity matching one element. A sheet's
 *   rank is its element's document position *now*: `base.after(skin)` moves the skin's sheet later
 *   and re-decides every tie (`order-of-appearance` rests on this), and a sheet appended to
 *   `<head>` sorts **before** everything in `<body>` -- where this suite's challenge markup lives
 *   -- so an override layer must append to `body` or it loses the tie it exists to win
 *   (`token-dial`'s second solution says so in prose).
 * - **The inline declaration model, shorthand expansion included**: `margin: 8px 0px` becomes the
 *   four longhands (`style.length` 4), resets the unmentioned ones, serialises as
 *   `margin: 8px 0px;`, and an unitless `0` normalises to `0px` -- byte-identical in both engines
 *   (`shorthand-reset` rests on this). `setProperty(name, value, 'important')`,
 *   `getPropertyPriority`, and the `!important` attribute serialisation all agree.
 * - **`document.styleSheets`, `sheet.cssRules`, `selectorText`, `deleteRule`** agree, including
 *   spreading both lists and `rule instanceof CSSStyleRule` from the host realm, and *reading* a
 *   parsed rule's declaration (`rule.style.getPropertyValue` / `getPropertyPriority('width')` ===
 *   `'important'`). An empty `<style>` still counts one sheet in both.
 * - **The declaration `getComputedStyle` returns is live in both** -- a held object reports a
 *   class change and an inline write. But repeat calls hand back the **same** object here and a
 *   **new** object in Chrome, so never assert identity across two calls.
 * - **Constructed sheets work in both**: filled with `replaceSync` and adopted, they apply, rank
 *   after every markup sheet, and are excluded from `document.styleSheets`; post-adoption
 *   `replaceSync`, `insertRule` and un-adoption are honoured too -- but on this engine only
 *   lazily, per the staleness trap below (`order-of-appearance`'s second solution: build, fill,
 *   adopt, in that order).
 *
 * **The traps, each measured in both engines, each a way to go green here and lie -- or to reject
 * an answer a real browser accepts:**
 *
 * - **happy-dom caches an element's computed style and CSSOM-only edits do not invalidate it.**
 *   `insertRule`, `deleteRule`, a constructed sheet's `replaceSync`, and `adoptedStyleSheets`
 *   membership changes are all honoured on an element's *first* computed read afterwards, but an
 *   element read *before* the edit keeps reporting the old value until some DOM mutation (class,
 *   attribute, inline style, node insertion) touches it. Chrome recomputes always. This one
 *   mechanism was misread twice during measurement -- first as "insertRule at an explicit index
 *   does not apply", then as "adopted sheets freeze at adoption" -- both artefacts of reading
 *   before perturbing. Consequence for authors: **a test may not read an element's computed style
 *   before the *first* call under test that edits a sheet through the CSSOM** -- no test in this
 *   category does. That leaves room a blanket "reads only after" claim would hide:
 *   `state-in-a-class`'s tests 3 and 4 read a computed style *between* two calls under test
 *   (select, read 6px, deselect, read 4px), which is sound only because its shipped solutions edit
 *   through `classList`/inline styles, never the CSSOM. A CSSOM-editing implementation of
 *   `setSelected` -- `insertRule`/`deleteRule` per row, a plausible learner shape -- would be
 *   graded stale by this suite on that second read while passing in Chrome, so that challenge's
 *   grading is outside what this suite can vouch for against a CSSOM-based answer. DOM-mediated
 *   restyles (element append/move/remove, `textContent` rewrite) do invalidate, in both engines.
 * - **`insertRule` with the index omitted appends here and prepends in Chrome** (CSSOM defaults
 *   the index to 0; happy-dom returns `length`). So a tie "won" by bare `insertRule` is green in
 *   this suite and silently loses in a real browser -- measured as `specificity-not-order`'s w4,
 *   which passes here and, run through `createIframeHost` in Chromium, fails two of that
 *   challenge's four tests with `Expected "18px" to be "6px"`. Never author a tie that `insertRule`
 *   must win; append a `<style>` element, or pass `sheet.cssRules.length` explicitly and treat the
 *   index as the lesson (`specificity-not-order`'s first solution teaches it in prose).
 * - **Editing an existing rule's declaration never reaches the cascade here.**
 *   `rule.style.setProperty(...)` updates `rule.style` and `rule.cssText` and no element ever
 *   restyles, even after unrelated invalidation; Chrome restyles immediately. The Chrome-correct
 *   "edit the rule in place" answer is therefore unverifiable by this suite -- prose only, never a
 *   solution. Deleting the rule and re-adding is the authorable spelling.
 * - **`sheet.disabled` and `styleEl.disabled` are ignored here** and honoured in Chrome, so a
 *   toggle-the-sheet challenge would reject the browser-correct answer. Unauthorable; enabling /
 *   disabling is taught through element add/remove instead.
 * - **Live adopted-sheet retheming is authorable only under the no-pre-read discipline.** The
 *   dynamics themselves agree (see the portable list), but a learner's *own* code that reads a
 *   computed style and then calls `replaceSync` expecting the next read to move would be graded
 *   differently by the two hosts -- correct in Chrome, stale here. Prefer the build-fill-adopt
 *   shape in solutions, and never assert a computed value between two CSSOM edits.
 * - **A border width without a border style reads back as written here and as `0px` in Chrome**
 *   (style `none` computes the width to zero). Every *computed* border-width assertion in this
 *   category sits next to an explicit `border-left-style: solid` in the challenge's own CSS.
 *   `inline-wins` also asserts `border-left-width`, with no such rule in sight -- safely, because
 *   it reads `style.getPropertyValue('border-left-width')` off the inline declaration directly,
 *   never through `getComputedStyle`, so this divergence never enters into it.
 * - **`CSSStyleDeclaration` is not iterable here** -- `[...el.style]` throws where Chrome spreads
 *   to the declared names. Enumerate with `length`/`item(i)` (`inline-wins`' second solution says
 *   why its loop is spelled that way).
 * - **Logical properties are inert here**: `margin-block: 8px` is stored and serialised but
 *   computes nothing, where Chrome moves both vertical margins. The browser-correct `margin-block`
 *   answer to `shorthand-reset` fails this suite (measured as its w3); the challenge teaches it in
 *   prose and asserts the physical longhands.
 *
 * **Why the category stops at ten.** The reading side is covered by `computed-not-inline` (the
 * two "style" objects), `find-the-winner` (the cascade as evidence) and `density-token` (reading
 * through `var()`); the writing side by `state-in-a-class` / `toggle-not-generate` (states as
 * classes, at element and subtree scale), `token-dial` / `density-token` (values as custom
 * properties), and `shorthand-reset` (longhand discipline); the cascade's own axes each have one:
 * `inline-wins` (layer), `specificity-not-order` (weight), `order-of-appearance` (position).
 * Deliberately absent: **sheet toggling via `disabled`** and **rule-editing in place**
 * (unauthorable per the traps above), **colours, relative units, UA defaults and
 * pseudo-elements** (per the serialisation table), **transitions and animations** (no frame or
 * timing model here), and **`@media`/`matchMedia`-driven styling**, which belongs to the
 * responsive story and was not measured -- measure before authoring it.
 */
export const stylesEntries: ChallengeEntry[] = [
  {
    id: 'styles-computed-not-inline',
    slug: 'computed-not-inline',
    title: 'The width that reads back empty',
    category: 'styles',
    difficulty: 'novice',
    concepts: ['getComputedStyle', 'element.style', 'inline styles', 'classList', 'cascade'],
    relatedIds: ['attributes-style-attribute', 'styles-inline-wins'],
    load: () => import('./computedNotInline').then((module) => module.computedNotInline),
  },
  {
    id: 'styles-state-in-a-class',
    slug: 'state-in-a-class',
    title: 'Selected is a state, not a paint job',
    category: 'styles',
    difficulty: 'novice',
    concepts: ['classList', 'toggle force', 'cascade', 'removeProperty', 'inline styles'],
    relatedIds: ['attributes-class-three-ways', 'styles-computed-not-inline'],
    load: () => import('./stateInAClass').then((module) => module.stateInAClass),
  },
  {
    id: 'styles-inline-wins',
    slug: 'inline-wins',
    title: 'The rule that could not win',
    category: 'styles',
    difficulty: 'intermediate',
    concepts: ['cascade', 'inline styles', 'specificity', 'removeProperty', '!important'],
    relatedIds: ['styles-computed-not-inline', 'attributes-style-attribute'],
    load: () => import('./inlineWins').then((module) => module.inlineWins),
  },
  {
    id: 'styles-shorthand-reset',
    slug: 'shorthand-reset',
    title: 'The shorthand that resets what it never mentions',
    category: 'styles',
    difficulty: 'intermediate',
    concepts: ['shorthand properties', 'longhands', 'margin', 'inline styles', 'var()'],
    relatedIds: ['attributes-style-attribute', 'styles-inline-wins'],
    load: () => import('./shorthandReset').then((module) => module.shorthandReset),
  },
  {
    id: 'styles-token-dial',
    slug: 'token-dial',
    title: 'A default you can borrow and hand back',
    category: 'styles',
    difficulty: 'intermediate',
    concepts: ['custom properties', 'getComputedStyle', 'setProperty', 'removeProperty', 'source order'],
    relatedIds: ['styles-density-token', 'attributes-style-attribute'],
    load: () => import('./tokenDial').then((module) => module.tokenDial),
  },
  {
    id: 'styles-specificity-not-order',
    slug: 'specificity-not-order',
    title: 'Later is not stronger',
    category: 'styles',
    difficulty: 'advanced',
    concepts: ['specificity', 'source order', 'styleSheets', 'deleteRule', 'selectorText'],
    relatedIds: ['styles-inline-wins', 'selection-attribute-selectors'],
    load: () => import('./specificityNotOrder').then((module) => module.specificityNotOrder),
  },
  {
    id: 'styles-find-the-winner',
    slug: 'find-the-winner',
    title: 'Who set this width?',
    category: 'styles',
    difficulty: 'expert',
    concepts: ['cascade', '!important', 'getComputedStyle', 'getPropertyPriority', 'matches'],
    relatedIds: ['styles-inline-wins', 'styles-specificity-not-order'],
    load: () => import('./findTheWinner').then((module) => module.findTheWinner),
  },
  {
    id: 'styles-toggle-not-generate',
    slug: 'toggle-not-generate',
    title: 'The stylesheet already knows both states',
    category: 'styles',
    difficulty: 'advanced',
    concepts: ['classList', 'cascade', 'runtime CSS', 'styleSheets', 'descendant selectors'],
    relatedIds: ['styles-state-in-a-class', 'styles-density-token', 'attributes-class-three-ways'],
    load: () => import('./toggleNotGenerate').then((module) => module.toggleNotGenerate),
  },
  {
    id: 'styles-order-of-appearance',
    slug: 'order-of-appearance',
    title: 'The override that arrived too early',
    category: 'styles',
    difficulty: 'advanced',
    concepts: ['source order', 'styleSheets', 'adoptedStyleSheets', 'CSSStyleSheet', 'cascade'],
    relatedIds: ['styles-specificity-not-order', 'styles-toggle-not-generate'],
    load: () => import('./orderOfAppearance').then((module) => module.orderOfAppearance),
  },
  {
    id: 'styles-density-token',
    slug: 'density-token',
    title: 'One value, every row that inherits it',
    category: 'styles',
    difficulty: 'advanced',
    concepts: ['custom properties', 'getComputedStyle', 'var()', 'inheritance', 'CSSOM'],
    relatedIds: ['styles-token-dial', 'attributes-style-attribute'],
    load: () => import('./densityToken').then((module) => module.densityToken),
  },
];
