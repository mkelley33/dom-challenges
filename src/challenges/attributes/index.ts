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
