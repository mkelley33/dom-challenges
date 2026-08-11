import type { ChallengeEntry } from '@/types/challenge';

/**
 * The Attributes, Properties & Data category, as metadata plus one dynamic import each.
 *
 * Reconnoitred before anything was authored, and — like `creation` — it came back clean where it
 * matters. The whole attribute/property split behaves identically in happy-dom and in real Chrome
 * through the production host, **including the dirty value flag**, which was the riskiest thing
 * here: after `input.value = 'typed'`, `setAttribute('value', 'x')` moves the attribute and leaves
 * the property alone in both engines, and `defaultValue` follows the attribute in both. Same for
 * `defaultChecked`. `dataset` matches on dashed/camelCase mapping, string coercion (`= false` gives
 * `"false"`), and `delete` removing the attribute; so do `toggleAttribute`, boolean attributes
 * (`disabled="false"` is still disabled), attribute-name lowercasing, `getAttributeNames`, the live
 * `NamedNodeMap`, `input.type` falling back to `"text"` for an unknown value, numeric reflection,
 * and `setAttributeNS` on SVG.
 *
 * **One divergence, and it is about URLs.** A URL-reflecting property resolves against the
 * document's base URL, and the two hosts have different ones:
 *
 * | `<a href="/docs/page">` | `getAttribute('href')` | `a.href`                             |
 * | ----------------------- | ---------------------- | ------------------------------------ |
 * | happy-dom               | `/docs/page`           | `https://challenges.local/docs/page` |
 * | Chrome (`about:srcdoc`) | `/docs/page`           | `http://localhost:5173/docs/page`    |
 *
 * The frame is `about:srcdoc`, which inherits its base URL from the parent — so in the real app it
 * is whatever route the learner is on, and a relative `src` in a challenge's markup resolves against
 * that route. **No challenge may assert an absolute `href`, `src`, `action` or `formAction`**; the
 * relative/absolute *distinction* is fine to teach and to assert on (`getAttribute` versus the
 * property), the resolved string is not. See AGENTS.md §3 and §10.
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
    relatedIds: [],
    load: () => import('./dirtyValue').then((module) => module.dirtyValue),
  },
];
