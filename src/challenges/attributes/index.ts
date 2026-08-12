import type { ChallengeEntry } from '@/types/challenge';

/**
 * The Attributes, Properties & Data category, as metadata plus one dynamic import each.
 *
 * Reconnoitred before anything was authored, and the spine came back clean: the whole
 * attribute/property split behaves identically in happy-dom and in real Chrome through the
 * production host, **including the dirty value flag**, which was the riskiest thing here. After
 * `input.value = 'typed'`, `setAttribute('value', 'x')` moves the attribute and leaves the property
 * alone in both engines; `defaultValue` and `defaultChecked` follow the attribute in both;
 * `innerHTML` serialises the attribute and not the typed value in both; and a `<textarea>`'s
 * default is its child text in both. Also matching, attribute for attribute: `toggleAttribute` with
 * and without `force`, boolean attributes (`disabled="false"` is still disabled), enumerated ones
 * (`toggleAttribute('aria-expanded', true)` leaves an existing `"false"` alone), attribute-name
 * lowercasing for HTML elements and its *absence* for SVG ones, `getAttributeNames`, the live
 * `NamedNodeMap`'s length, `setAttribute(name, null)` writing `"null"`, `getAttribute` answering
 * `null` for absent and `''` for empty, the `dataset` camelCase mapping and its string coercion,
 * `input.type` falling back to `"text"`, numeric reflection with defaults (`colSpan` is `1` for an
 * absent attribute and for `colspan="wat"`), `htmlFor`, `classList` in every method used here, and
 * the whole inline-`style` declaration model down to the serialised attribute text.
 *
 * **Re-measured in real Chrome when the category was filled out**, through the production
 * `createIframeHost` on a Vite-served page, in a foregrounded tab (`visibilityState: 'visible'`,
 * `hasFocus(): true`) with a positive control asserted first — the frame services a
 * `requestAnimationFrame` within 500 ms — and repeated. Both runs identical: **20 solution runs, 0
 * failures; 10 starters, all running cleanly and all failing a named assertion; 84 hand-written
 * wrong solutions, 0 accepted; `localStorage` 0 keys -> 0 keys.** Every failure message matched the
 * memory host's except one, noted below.
 *
 * **Seven divergences, five of them forbidding something.** Each was measured in both hosts and each
 * is pinned with a positive control in `src/test/happyDomGaps.test.ts`.
 *
 * 1. **A resolved URL is unassertable**, and worse than the reconnaissance thought. `a.href`
 *    resolves against the document base, which is `https://challenges.local/` here and the app's
 *    current route in the `about:srcdoc` frame. On top of that the frame's **`location.origin` is
 *    the string `"null"`** in Chrome, where it is the memory host's URL here — so
 *    `link.origin !== location.origin`, the correct way to ask "does this link leave the site", is
 *    `true` for every same-origin link in the real host and `false` for `mailto:`. That killed a
 *    planned `url-attributes` challenge outright. Assert the **attribute**, or a decomposition of an
 *    href that was written absolute in the markup (`pathname`, `search`, `hash`, `origin` of
 *    `https://example.com:8443/…` agree exactly); never a resolved string and never a comparison
 *    against `location`.
 * 2. **Never index `dataset` with a dashed name.** `dataset['view-count']` answers `"3"` here and
 *    `undefined` in Chrome; writing one sets `data-foo-bar` here and throws `SyntaxError` there.
 *    happy-dom also misses `data--x` -> `dataset.X`. The read is the dangerous direction, so
 *    `dataAttributes.ts` only ever hands `dataset` a camelCase key.
 * 3. **Never iterate `element.attributes` while removing attributes from that element.** Chrome's
 *    `NamedNodeMap` takes its iterator from its indexed getter, so the walk advances an index while
 *    the map shrinks and **skips every other attribute**; happy-dom's iterator snapshots and removes
 *    them all. The buggy loop passes here, which is why **no challenge in this category asks for
 *    bulk attribute removal** — `copyAttributes.ts` only ever writes to a different element, and
 *    says so in its tradeoffs. Reading the map without mutating it is portable, as are
 *    `getAttributeNames()`, the map's live length, and `[...element.attributes]`.
 * 4. **Never assert that a class token was rejected.** `classList.add('')` throws `SyntaxError` in
 *    Chrome and `classList.add('a b')` throws `InvalidCharacterError`; happy-dom accepts both and
 *    splits the second into two tokens.
 * 5. **Never write a dashed CSS property as an index, and never read `removeProperty`'s return
 *    value.** `style['margin-bottom'] = '5px'` is a real declaration in Chrome (CSSOM defines a
 *    dashed attribute per hyphenated property) and a no-op here; `removeProperty` returns the old
 *    value in Chrome and `undefined` here. Both are the *safe* direction for the suite — it rejects
 *    a correct answer rather than accepting a wrong one — but a learner writing either in the app
 *    would be graded differently by the two hosts, so `styleAttribute.ts` uses neither.
 * 6. **Never write ARIA state through the IDL properties** (AGENTS.md §3, already recorded).
 *    Re-confirmed here: `ariaExpanded` is `undefined` and reflects nothing in happy-dom, while
 *    Chrome reflects it; `element.role` reads `''` here and `null` there. `enumeratedState.ts` uses
 *    `setAttribute` and discusses the properties only as a portability note.
 * 7. **`cloneNode` copies an input's dirty value but not its dirty checkedness.** HTML's cloning
 *    steps propagate value, checkedness and both dirty flags, and Chrome does all three; here the
 *    text controls carry their dirty value onto the clone while the checkboxes revert to their
 *    content attributes. Measured twice through the production host, with the dirty value on the
 *    *same clone* as the control. Safe direction, and it has one consequence: the "clone the form
 *    and sync the clone" advice in `formStateSnapshot.ts`'s tradeoffs is correct in a browser and
 *    would fail that challenge's checkbox test here, which is why it is prose and not a solution.
 *
 * One wrong answer is rejected by both engines for *different* reasons, which is worth knowing
 * before someone "simplifies" a test: `Object.assign(button, preset)` copies nothing in Chrome
 * (every DOM member lives on a prototype) and copies the id and the parent linkage in happy-dom,
 * where some are own properties. It fails two assertions there and two different ones here.
 *
 * Two more things measured and deliberately not built on. `setAttribute('2cool', 'x')` is accepted
 * by both engines even though the name fails the XML Name production, so nothing here rests on an
 * invalid-name throw except `'has space'`, which both reject with `InvalidCharacterError`. And
 * `matches('[viewbox]')` against an SVG element carrying `viewBox` is `true` in Chrome and `false`
 * here — attribute *selectors* with mismatched case are not assertable, though
 * `getAttribute`/`getAttributeNames` on the same element agree exactly.
 *
 * **Why the category stops at eleven.** The target was ten to twelve, and eleven is where the
 * ground runs out rather than where the budget did. The attribute/property split is covered from
 * five angles (`property-not-attribute`, `reflected-properties`, `dirty-value`,
 * `form-state-snapshot`, and `empty-or-absent` for the three-state case); the four kinds of
 * attribute each have their own challenge (ordinary, boolean, enumerated, `data-*`); the two
 * attributes with a parsed view each have one (`class`, `style`); and enumeration has one
 * (`copy-attributes`). What is deliberately absent: **URLs**, unauthorable per divergence 1 above;
 * **bulk attribute removal**, unauthorable per divergence 3; **attribute-name casing as its own
 * challenge**, because HTML lowercasing and the SVG exception are knowledge with no action attached
 * — a learner does nothing differently knowing them — so they are taught inside
 * `reflected-properties` and `data-attributes` where a wrong answer turns on them; and **`aria-*`
 * naming and roles**, which belong to the Accessibility category rather than here.
 *
 * See AGENTS.md §3 and §10.
 */
export const attributesEntries: ChallengeEntry[] = [
  {
    id: 'attributes-empty-or-absent',
    slug: 'empty-or-absent',
    title: 'The empty attribute and the missing one',
    category: 'attributes',
    difficulty: 'novice',
    concepts: ['getAttribute', 'setAttribute', 'removeAttribute', 'hasAttribute', 'alt'],
    relatedIds: [],
    load: () => import('./emptyOrAbsent').then((module) => module.emptyOrAbsent),
  },
  {
    id: 'attributes-property-not-attribute',
    slug: 'property-not-attribute',
    title: 'The selection the stylesheet cannot see',
    category: 'attributes',
    difficulty: 'novice',
    concepts: ['setAttribute', 'hasAttribute', 'data-*', 'expando properties', 'cloneNode'],
    relatedIds: ['attributes-empty-or-absent', 'selection-attribute-selectors'],
    load: () => import('./propertyNotAttribute').then((module) => module.propertyNotAttribute),
  },
  {
    id: 'attributes-boolean-attributes',
    slug: 'boolean-attributes',
    title: 'The button that disabled="false" disables',
    category: 'attributes',
    difficulty: 'novice',
    concepts: ['boolean attributes', 'toggleAttribute', 'disabled', 'hidden', 'reflection'],
    relatedIds: ['attributes-empty-or-absent'],
    load: () => import('./booleanAttributes').then((module) => module.booleanAttributes),
  },
  {
    id: 'attributes-class-three-ways',
    slug: 'class-three-ways',
    title: 'One class attribute, three ways in',
    category: 'attributes',
    difficulty: 'intermediate',
    concepts: ['classList', 'className', 'DOMTokenList', 'toggle force', 'reflection'],
    relatedIds: ['attributes-boolean-attributes', 'selection-attribute-selectors'],
    load: () => import('./classThreeWays').then((module) => module.classThreeWays),
  },
  {
    id: 'attributes-dirty-value',
    slug: 'dirty-value',
    title: 'The value on screen and the value in the markup',
    category: 'attributes',
    difficulty: 'intermediate',
    concepts: ['defaultValue', 'defaultChecked', 'dirty value flag', 'dataset', 'setAttribute'],
    relatedIds: ['attributes-form-state-snapshot', 'attributes-boolean-attributes'],
    load: () => import('./dirtyValue').then((module) => module.dirtyValue),
  },
  {
    id: 'attributes-data-attributes',
    slug: 'data-attributes',
    title: 'The setting spelled two different ways',
    category: 'attributes',
    difficulty: 'intermediate',
    concepts: ['dataset', 'data-*', 'attribute names', 'getAttributeNames', 'string values'],
    relatedIds: ['attributes-property-not-attribute', 'attributes-dirty-value'],
    load: () => import('./dataAttributes').then((module) => module.dataAttributes),
  },
  {
    id: 'attributes-reflected-properties',
    slug: 'reflected-properties',
    title: 'The property that is not spelled like its attribute',
    category: 'attributes',
    difficulty: 'intermediate',
    concepts: ['reflection', 'htmlFor', 'colSpan', 'attribute name lowercasing', 'expando properties'],
    relatedIds: ['attributes-empty-or-absent', 'attributes-class-three-ways'],
    load: () => import('./reflectedProperties').then((module) => module.reflectedProperties),
  },
  {
    id: 'attributes-style-attribute',
    slug: 'style-attribute',
    title: 'What writing the style attribute throws away',
    category: 'attributes',
    difficulty: 'advanced',
    concepts: ['style attribute', 'CSSStyleDeclaration', 'setProperty', 'custom properties', 'removeProperty'],
    relatedIds: ['attributes-class-three-ways'],
    load: () => import('./styleAttribute').then((module) => module.styleAttribute),
  },
  {
    id: 'attributes-enumerated-state',
    slug: 'enumerated-state',
    title: 'Absent is not the same as false',
    category: 'attributes',
    difficulty: 'advanced',
    concepts: ['enumerated attributes', 'aria-expanded', 'toggleAttribute', 'hidden', 'boolean attributes'],
    relatedIds: ['attributes-boolean-attributes', 'attributes-empty-or-absent'],
    load: () => import('./enumeratedState').then((module) => module.enumeratedState),
  },
  {
    id: 'attributes-copy-attributes',
    slug: 'copy-attributes',
    title: 'Copy every attribute, not the ones you thought of',
    category: 'attributes',
    difficulty: 'advanced',
    concepts: ['getAttributeNames', 'attributes', 'NamedNodeMap', 'Attr', 'outerHTML'],
    relatedIds: ['attributes-data-attributes', 'attributes-reflected-properties', 'creation-replace-in-place'],
    load: () => import('./copyAttributes').then((module) => module.copyAttributes),
  },
  {
    id: 'attributes-form-state-snapshot',
    slug: 'form-state-snapshot',
    title: 'The markup that does not know what you typed',
    category: 'attributes',
    difficulty: 'expert',
    concepts: ['defaultValue', 'defaultChecked', 'dirty value flag', 'innerHTML', 'boolean attributes'],
    relatedIds: ['attributes-dirty-value', 'attributes-boolean-attributes', 'creation-inner-html-cost'],
    load: () => import('./formStateSnapshot').then((module) => module.formStateSnapshot),
  },
];
