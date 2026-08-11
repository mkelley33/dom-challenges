import type { ChallengeContent } from '@/types/challenge';

import { requireElement } from './support';

type ApplyAlt = (image: HTMLImageElement, text: string | null) => void;
type AltState = (image: HTMLImageElement) => string;

/**
 * `HTMLElement` rather than `HTMLImageElement`: `requireElement` returns the wider type, the tests
 * only read attributes off it, and the submitted functions are declared over whatever they like.
 * Narrowing here would buy an assertion and nothing else.
 */
function requireImage(doc: Document, id: string): HTMLElement {
  return requireElement(doc, id);
}

export const emptyOrAbsent: ChallengeContent = {
  prompt: [
    'Three states, not two. An `<img>` with **no** `alt` attribute is an image nobody described — a',
    'screen reader falls back to reading the file name. An `<img alt="">` is a **deliberately** empty',
    'description: "this is decoration, skip it". They are different claims, and the platform keeps',
    'them apart.',
    '',
    'Export two functions:',
    '',
    '- `applyAlt(image, text)` — `text` is a description, `""` for "decorative", or `null` for "we do',
    '  not know yet". The last one has to leave the image carrying **no `alt` attribute at all**.',
    '- `altState(image)` — `"described"`, `"decorative"` or `"missing"`, for any image, including ones',
    '  your own code never touched.',
    '',
    'The starter goes through the `alt` **property**, which cannot see the difference: it reads `""`',
    'for a decorative image and `""` for one with no attribute at all.',
  ].join('\n'),
  html: [
    '<ul id="gallery">',
    '  <li><img id="chart" src="/chart.png" alt="Revenue by quarter"></li>',
    '  <li><img id="divider" src="/divider.png" alt=""></li>',
    '  <li><img id="mystery" src="/mystery.png"></li>',
    '</ul>',
  ].join('\n'),
  starterCode: [
    'export function applyAlt(image: HTMLImageElement, text: string | null): void {',
    "  image.alt = text ?? '';",
    '}',
    '',
    'export function altState(image: HTMLImageElement): string {',
    "  return image.alt === '' ? 'missing' : 'described';",
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'a description lands in the alt attribute',
      run: ({ doc, fn, expect }) => {
        const mystery = requireImage(doc, 'mystery');
        fn<ApplyAlt>('applyAlt')(mystery, 'A hand-drawn map');

        expect(mystery).toHaveAttribute('alt', 'A hand-drawn map');
        expect(fn<AltState>('altState')(mystery)).toBe('described');
      },
    },
    {
      name: 'the empty string is written as an empty attribute, not as no attribute',
      run: ({ doc, fn, expect }) => {
        const mystery = requireImage(doc, 'mystery');
        fn<ApplyAlt>('applyAlt')(mystery, '');

        // `hasAttribute` is the whole point of this test: `alt=""` is *present*, and a screen reader
        // reads presence as a promise that the image was looked at and judged decorative.
        expect(mystery.hasAttribute('alt')).toBe(true);
        expect(mystery.getAttribute('alt')).toBe('');
        expect(doc.querySelectorAll('#gallery img[alt]')).toHaveLength(3);
      },
    },
    {
      name: 'null removes the attribute the image already had',
      run: ({ doc, fn, expect }) => {
        // Inverted control: the attribute being removed is the one the *markup* declared, so the
        // only way to pass is to remove it rather than to avoid writing it.
        const chart = requireImage(doc, 'chart');
        fn<ApplyAlt>('applyAlt')(chart, null);

        // `setAttribute('alt', null)` writes the four-character string "null" and leaves `[alt]`
        // matching. Nothing throws, nothing warns, and the tooltip reads "null".
        expect(chart.hasAttribute('alt')).toBe(false);
        expect(chart.getAttribute('alt')).toBe(null);
        expect(doc.querySelectorAll('#gallery img[alt]')).toHaveLength(1);
      },
    },
    {
      name: 'altState reads the three images the markup declared',
      run: ({ doc, fn, expect }) => {
        // Nothing here is written by the submitted code at all: `altState` has to answer for markup
        // it never saw, which is what stops a solution keeping its own record on the side.
        const altState = fn<AltState>('altState');

        expect(altState(requireImage(doc, 'chart'))).toBe('described');
        expect(altState(requireImage(doc, 'divider'))).toBe('decorative');
        expect(altState(requireImage(doc, 'mystery'))).toBe('missing');
      },
    },
    {
      name: 'an image can be walked through all three states and back',
      run: ({ doc, fn, expect }) => {
        const divider = requireImage(doc, 'divider');
        const applyAlt = fn<ApplyAlt>('applyAlt');
        const altState = fn<AltState>('altState');

        applyAlt(divider, 'A thin rule');
        expect(altState(divider)).toBe('described');

        applyAlt(divider, null);
        expect(divider.hasAttribute('alt')).toBe(false);
        expect(altState(divider)).toBe('missing');

        applyAlt(divider, '');
        expect(divider.getAttribute('alt')).toBe('');
        expect(altState(divider)).toBe('decorative');
      },
    },
  ],
  solutions: [
    {
      label: 'setAttribute and removeAttribute, read back with getAttribute',
      code: [
        'export function applyAlt(image: HTMLImageElement, text: string | null): void {',
        '  if (text === null) {',
        "    image.removeAttribute('alt');",
        '    return;',
        '  }',
        '',
        "  image.setAttribute('alt', text);",
        '}',
        '',
        'export function altState(image: HTMLImageElement): string {',
        "  const alt = image.getAttribute('alt');",
        '',
        "  if (alt === null) return 'missing';",
        "  return alt === '' ? 'decorative' : 'described';",
        '}',
        '',
      ].join('\n'),
      explanation: [
        'Four calls make up the whole attribute API, and the interesting one is the one people forget:',
        '',
        '- `setAttribute(name, value)` — put it there, with that value.',
        '- `getAttribute(name)` — the value, or **`null`** if the attribute is not there.',
        '- `hasAttribute(name)` — present or not, whatever the value.',
        '- `removeAttribute(name)` — take it away. **This is the only thing that erases an attribute.**',
        '',
        '`getAttribute` returning `null` rather than `undefined` is what makes the three states',
        'distinguishable in one read: `null` is absent, `""` is present-and-empty, anything else is a',
        'value. Note it is `null` — so `??` works and `||` does not, since `""` is falsy and would be',
        'swept into the same branch as absent.',
        '',
        '`setAttribute` takes a **string**, and it does not check that you gave it one. Hand it `null`',
        'and it stringifies: the attribute is set to the four characters `n-u-l-l`, `[alt]` still',
        'matches, and the image is announced as "null". `undefined` gives `"undefined"`, `0` gives',
        '`"0"`, and an object gives `"[object Object]"`. Nothing throws, so the only sign is on screen.',
        '',
        'That is why "clear this attribute" is `removeAttribute` and never `setAttribute(name, null)`',
        'or `setAttribute(name, "")` — the first writes a word, the second writes an empty attribute,',
        'and here the empty attribute is a *different, meaningful claim*.',
      ].join('\n'),
      tradeoffs: [
        'This is the version to reach for whenever absence is meaningful, and `alt` is only the',
        'clearest example. `aria-label`, `title`, `lang`, `download` and every `data-*` attribute all',
        'have an absent state their property cannot express.',
        '',
        'The cost is that everything is a string and the name is quoted text your compiler will not',
        'check. `image.getAttribute("altt")` is `null`, which is the same answer as "no description",',
        'so a typo here reads as data rather than as a bug.',
        '',
        'Where it is the wrong tool: when you only ever set a value and absence has no meaning. Then',
        'the property below is shorter, checked, and says what you mean.',
      ].join('\n'),
    },
    {
      label: 'The property for the value, the attribute for the absence',
      code: [
        'export function applyAlt(image: HTMLImageElement, text: string | null): void {',
        '  if (text === null) {',
        "    image.removeAttribute('alt');",
        '    return;',
        '  }',
        '',
        '  image.alt = text;',
        '}',
        '',
        'export function altState(image: HTMLImageElement): string {',
        "  if (!image.hasAttribute('alt')) return 'missing';",
        "  return image.alt === '' ? 'decorative' : 'described';",
        '}',
        '',
      ].join('\n'),
      explanation: [
        '`alt` is a **reflected** property: reading `image.alt` reads the attribute, and assigning it',
        'writes the attribute. `image.alt = "A map"` and `image.setAttribute("alt", "A map")` leave the',
        'document in exactly the same state, and either is correct here.',
        '',
        'What the property cannot do is express absence. Its type is `string`, so it has no value for',
        '"there is no attribute" and the platform gives it `""` — the same `""` a decorative image has.',
        'That is the starter\'s whole failure: `image.alt = text ?? ""` writes an empty attribute where',
        '`null` was meant to remove one, and `image.alt === ""` cannot tell the two apart afterwards.',
        '',
        'So the split in this version is deliberate: the **property** carries the value, because it is',
        'type-checked and reads well, and the **attribute** answers the presence question, because it',
        'is the only one that can. `hasAttribute` first, property second.',
        '',
        'The same shape recurs across the platform. `input.value` is `""` for a missing `value`',
        'attribute, `a.href` is `""` for a missing `href`, and `td.colSpan` is `1` for a missing',
        '`colspan`. In every case the property substitutes a default and the attribute tells the truth.',
      ].join('\n'),
      tradeoffs: [
        'Reach for the property when you are writing a value you already know is a string and the',
        'attribute name is a literal in your source: `image.alt = caption` is checked by the compiler,',
        '`image.setAttribute("alt", caption)` is not, and only one of them catches `image.altt`.',
        '',
        'Reach for `setAttribute` when the name is data — from a config, a loop over a map of',
        'attributes, a `data-*` key — because no property lookup can be built from a string at all.',
        '',
        'The catch worth remembering is that not every attribute has a property, and the ones that do',
        'often spell it differently: `class` is `className`, `for` is `htmlFor`, `colspan` is `colSpan`.',
        'Guessing wrong is silent — `image.altText = "x"` adds an ordinary JavaScript property to the',
        'element and changes the document not at all.',
      ].join('\n'),
    },
  ],
};
