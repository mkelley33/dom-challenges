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
 * inheriting element -- read the longhand the `var()` fed instead, which is what this challenge
 * does. `computedStyleMap` does not exist here at all. See AGENTS.md §3 and §10.
 */
export const stylesEntries: ChallengeEntry[] = [
  {
    id: 'styles-computed-not-inline',
    slug: 'computed-not-inline',
    title: 'The width that reads back empty',
    category: 'styles',
    difficulty: 'novice',
    concepts: ['getComputedStyle', 'element.style', 'inline styles', 'classList', 'cascade'],
    relatedIds: ['attributes-style-attribute'],
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
    id: 'styles-density-token',
    slug: 'density-token',
    title: 'One value, every row that inherits it',
    category: 'styles',
    difficulty: 'advanced',
    concepts: ['custom properties', 'getComputedStyle', 'var()', 'inheritance', 'CSSOM'],
    relatedIds: [],
    load: () => import('./densityToken').then((module) => module.densityToken),
  },
];
