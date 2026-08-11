import type { ChallengeEntry } from '@/types/challenge';

/**
 * The Accessibility category, as metadata plus one dynamic import each.
 *
 * Reconnoitred before anything was authored, against the two things this category is made of:
 * computed ARIA state, and focus.
 *
 * **Focus is faithful for elements that really are focusable.** `element.focus()` called from the
 * app realm on an element inside the preview frame moves that frame's `activeElement` in real
 * Chrome, `focus` and `focusin` fire, `blur` returns focus to the body, a `tabindex="-1"` element
 * accepts programmatic focus, a disabled button refuses it, an `inert` subtree refuses it, `hidden`
 * and `tabIndex` reflect both ways, and `matches(':focus')` agrees. All of that is identical in
 * happy-dom.
 *
 * **ARIA state has to be written as attributes, and focus state cannot be read as a pseudo-class.**
 *
 * | read                                        | Chrome                | happy-dom            |
 * | ------------------------------------------- | --------------------- | -------------------- |
 * | `el.ariaExpanded = 'true'` → the attribute  | `aria-expanded="true"`| **no attribute**     |
 * | `aria-checked="mixed"` → `el.ariaChecked`   | `'mixed'`             | `undefined`          |
 * | `el.role` with no `role` attribute          | `null`                | `''`                 |
 * | `matches(':focus-within')` on the ancestor  | `true`                | `false`              |
 * | `focus()` on a plain `<div>`                | refused               | **accepted**         |
 * | `attachInternals` / `ElementInternals`      | present               | absent               |
 *
 * happy-dom implements the `ARIAMixin` IDL properties as **plain JavaScript properties that reflect
 * nothing** -- `el.ariaExpanded` reads back what you assigned and no `aria-expanded` attribute
 * appears, so nothing that queries or styles on the attribute sees it. A solution written that way
 * would be correct in a browser and red in the content suite, so **every ARIA state in this category
 * must be written with `setAttribute` and read with `getAttribute`.** `el.role` is the one exception:
 * it does reflect.
 *
 * `focus()` succeeding on a plain `<div>` is the divergence to design around: a challenge whose
 * focus assertions involve anything that is not natively focusable would pass here and fail in a
 * browser. Every focusable element in this challenge is a `<button>`.
 *
 * `:focus-visible` is a third thing again: both hosts report `true` after a programmatic `focus()`,
 * with or without a preceding synthetic click, because the heuristic is defined over **real** user
 * input and the harness can only produce untrusted events. It agrees today for a reason that has
 * nothing to do with either engine being right, so nothing may be built on it. `:focus-within`
 * simply does not match here. See AGENTS.md §3 and §10.
 */
export const a11yEntries: ChallengeEntry[] = [
  {
    id: 'a11y-roving-tabindex',
    slug: 'roving-tabindex',
    title: 'One stop in the tab order, whichever tab is selected',
    category: 'a11y',
    difficulty: 'advanced',
    concepts: ['roving tabindex', 'aria-selected', 'activeElement', 'keyboard navigation', 'hidden'],
    relatedIds: ['events-composed-path'],
    load: () => import('./rovingTabindex').then((module) => module.rovingTabindex),
  },
];
