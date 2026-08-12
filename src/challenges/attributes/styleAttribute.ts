import type { ChallengeContent } from '@/types/challenge';

import { requireElement } from './support';

type SetHeight = (bar: HTMLElement, px: number) => void;
type SetTone = (bar: HTMLElement, tone: string) => void;
type ClearHeight = (bar: HTMLElement) => void;

/** The markup's inline styles, so a test can say "this bar was not touched" as one string. */
const Q2_STYLE = 'width: 65px; --tone: plum; border-left-width: 2px';

export const styleAttribute: ChallengeContent = {
  prompt: [
    'Two bars in a chart. Each one carries three inline declarations from the server: a width, a',
    '`--tone` custom property the stylesheet reads, and a border width.',
    '',
    'Export three functions, each of which must leave every declaration it was not asked about',
    'exactly as it found it:',
    '',
    '- `setHeight(bar, px)` — set the bar’s `height` to that many pixels.',
    '- `setTone(bar, tone)` — set the `--tone` custom property.',
    '- `clearHeight(bar)` — remove the height declaration, whoever set it.',
    '',
    'The `style` attribute looks like a place to put a string. It is really a **list of declarations**,',
    'and writing the attribute replaces the whole list.',
  ].join('\n'),
  html: [
    '<ul id="chart">',
    '  <li id="bar-q1" class="bar" style="width: 40px; --tone: teal; border-left-width: 2px">Q1</li>',
    `  <li id="bar-q2" class="bar" style="${Q2_STYLE}">Q2</li>`,
    '</ul>',
  ].join('\n'),
  starterCode: [
    'export function setHeight(bar: HTMLElement, px: number): void {',
    '  bar.setAttribute(`style`, `height: ${px}px`);',
    '}',
    '',
    'export function setTone(bar: HTMLElement, tone: string): void {',
    '  bar.style.cssText = `--tone: ${tone}`;',
    '}',
    '',
    'export function clearHeight(bar: HTMLElement): void {',
    "  bar.setAttribute('style', '');",
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'setting the height twice leaves one height, and keeps the width, tone and border',
      run: ({ doc, fn, expect }) => {
        const q1 = requireElement(doc, 'bar-q1');
        const setHeight = fn<SetHeight>('setHeight');
        setHeight(q1, 24);
        setHeight(q1, 30);

        expect(q1.style.height).toBe('30px');
        expect(q1.style.width).toBe('40px');
        expect(q1.style.getPropertyValue('--tone')).toBe('teal');
        expect(q1.style.getPropertyValue('border-left-width')).toBe('2px');
        // Four declarations, not one. `style.length` counts them, custom properties included.
        expect(q1.style).toHaveLength(4);
        // Counted in the attribute text for the same reason as the tone test below, and this is the
        // function a learner reaches for first: appending `height` to the attribute reads back
        // correctly through the CSSOM -- a later declaration of a property wins -- while the block
        // grows by one declaration on every call. One call could never see it.
        const written = (q1.getAttribute('style') ?? '').split(';').filter((part) => part.trim().startsWith('height'));
        expect(written).toHaveLength(1);
      },
    },
    {
      name: 'setting the tone twice leaves one tone, and keeps the other declarations',
      run: ({ doc, fn, expect }) => {
        // Inverted control: `padding-left` is put there by the test after the markup was parsed, so
        // "write the three declarations I know the markup has, plus mine" cannot pass.
        const q1 = requireElement(doc, 'bar-q1');
        q1.style.setProperty('padding-left', '6px');

        const setTone = fn<SetTone>('setTone');
        setTone(q1, 'amber');
        setTone(q1, 'rose');

        expect(q1.style.getPropertyValue('--tone')).toBe('rose');
        expect(q1.style.getPropertyValue('padding-left')).toBe('6px');
        expect(q1.style.width).toBe('40px');
        // A custom property is not a JavaScript property: `bar.style.tone` and `bar.style['--tone']`
        // both write an ordinary field onto the declaration object and change no CSS at all. The
        // only route in is `setProperty`, and this is where it has to show up.
        expect(q1.getAttribute('style')).toContain('--tone: rose');
        // Counted in the attribute text rather than through the CSSOM, because the CSSOM cannot see
        // this failure: a later declaration of the same property wins, so appending `--tone` to the
        // attribute reads back correctly while the block grows by one declaration on every call.
        const written = (q1.getAttribute('style') ?? '').split(';').filter((part) => part.trim().startsWith('--tone'));
        expect(written).toHaveLength(1);
      },
    },
    {
      name: 'clearing the height removes that one declaration and no other',
      run: ({ doc, fn, expect }) => {
        const q1 = requireElement(doc, 'bar-q1');
        fn<SetHeight>('setHeight')(q1, 24);
        fn<ClearHeight>('clearHeight')(q1);

        expect(q1.style.getPropertyValue('height')).toBe('');
        expect(q1.style).toHaveLength(3);
        expect(q1.style.width).toBe('40px');
        expect(q1.style.getPropertyValue('--tone')).toBe('teal');
        expect(q1.style.getPropertyValue('border-left-width')).toBe('2px');
      },
    },
    {
      name: 'clearing a height the test set works too',
      run: ({ doc, fn, expect }) => {
        // Inverted again: the declaration being removed was never written by the submitted code, so
        // "remember what I set and unset it" is not a way through.
        const q2 = requireElement(doc, 'bar-q2');
        q2.style.height = '12px';

        fn<ClearHeight>('clearHeight')(q2);

        expect(q2.style.getPropertyValue('height')).toBe('');
        expect(q2.style.width).toBe('65px');
        expect(q2.style.getPropertyValue('--tone')).toBe('plum');
      },
    },
    {
      name: 'the other bar is not touched at all',
      run: ({ doc, fn, expect }) => {
        const q2 = requireElement(doc, 'bar-q2');
        fn<SetHeight>('setHeight')(requireElement(doc, 'bar-q1'), 24);
        fn<SetTone>('setTone')(requireElement(doc, 'bar-q1'), 'amber');

        // The attribute is compared as the raw text the parser stored: until something writes through
        // the CSSOM, the browser keeps the author's string exactly, spacing and all. So this fails
        // for anything that rewrote it -- including a rewrite that happened to produce the same
        // declarations in a different form.
        expect(q2.getAttribute('style')).toBe(Q2_STYLE);
      },
    },
  ],
  solutions: [
    {
      label: 'Edit the declarations through element.style',
      code: [
        'export function setHeight(bar: HTMLElement, px: number): void {',
        '  bar.style.height = `${px}px`;',
        '}',
        '',
        'export function setTone(bar: HTMLElement, tone: string): void {',
        "  bar.style.setProperty('--tone', tone);",
        '}',
        '',
        'export function clearHeight(bar: HTMLElement): void {',
        "  bar.style.removeProperty('height');",
        '}',
        '',
      ].join('\n'),
      explanation: [
        '`element.style` is a **`CSSStyleDeclaration`** — a live, parsed view of the `style` attribute,',
        'in the same way `classList` is a live, parsed view of `class`. There is one place the data',
        'lives, and two ways to reach it:',
        '',
        '- `setAttribute("style", …)` and `style.cssText = …` **replace the entire declaration block**.',
        '  Every declaration you did not mention is gone. That is the starter, and it is why setting a',
        '  height deletes the width, the tone and the border in one line that reads like it only adds',
        '  something.',
        '- `style.height = …`, `style.setProperty(…)` and `style.removeProperty(…)` edit **one',
        '  declaration**, leaving the rest alone.',
        '',
        'Three details of the per-declaration API:',
        '',
        '- **The camelCase properties only cover the CSS the specification names.** `style.height`,',
        '  `style.borderLeftWidth`, `style.paddingLeft` — one property per known CSS property, with the',
        '  dashes turned into capitals. Assigning a name it does not know does nothing to the CSS:',
        '  `style.tone = "amber"` adds an ordinary JavaScript field to the declaration object.',
        '- **Custom properties have no camelCase form at all**, because the browser cannot know their',
        "  names. `--tone` is reachable only through `setProperty('--tone', …)` and",
        "  `getPropertyValue('--tone')`, and — unlike the ordinary properties — the name is written",
        '  with its dashes and is **case-sensitive**.',
        '- **`removeProperty(name)` is the eraser**, and `style.height = ""` is the same thing said',
        '  through the property. Both remove the declaration rather than setting it to nothing, which',
        '  is what lets the stylesheet underneath take over again.',
        '',
        'Assigning an invalid value is silently ignored — `style.height = 24` (a number, no unit) is',
        'not a CSS length, so the declaration is left exactly as it was and nothing anywhere complains.',
      ].join('\n'),
      tradeoffs: [
        'This is the right default for editing inline styles, and `setProperty` in particular is the',
        'only route to a custom property. Two places where the whole-block write is still correct:',
        '',
        '- **You own every declaration.** A node you just created, or an element whose inline style is',
        '  entirely yours, can take `style.cssText = "…"` in one write rather than five.',
        '- **You are clearing it.** `removeAttribute("style")` really does mean "drop all of this".',
        '',
        'The larger tradeoff is whether to be here at all. An inline style is the most specific thing',
        'in the cascade short of `!important`, so every declaration written this way is one a',
        'stylesheet can no longer override — which is exactly why the pattern in this challenge is',
        'popular: **write a custom property inline and let CSS do the rest.** `--tone` is one hook the',
        'stylesheet reads, instead of a colour, a border and a shadow that the stylesheet can now never',
        'change. A class is better still when the values are known in advance; a custom property is for',
        'the ones that are not, like a bar whose height is data.',
        '',
        'Priority is the other half of `setProperty`: a third argument of `"important"` sets the flag,',
        'and `getPropertyPriority(name)` reads it back. There is no way to express that through the',
        'camelCase properties.',
      ].join('\n'),
    },
    {
      label: 'Rewrite the attribute, preserving what was there',
      code: [
        'function declarations(bar: HTMLElement): [string, string][] {',
        "  return (bar.getAttribute('style') ?? '')",
        "    .split(';')",
        '    .map((part) => part.trim())',
        '    .filter(Boolean)',
        '    .map((part) => {',
        "      const colon = part.indexOf(':');",
        '      return [part.slice(0, colon).trim(), part.slice(colon + 1).trim()] as [string, string];',
        '    });',
        '}',
        '',
        'function write(bar: HTMLElement, next: [string, string][]): void {',
        "  bar.setAttribute('style', next.map(([name, value]) => `${name}: ${value}`).join('; '));",
        '}',
        '',
        'function put(bar: HTMLElement, name: string, value: string | null): void {',
        '  const rest = declarations(bar).filter(([existing]) => existing !== name);',
        '  write(bar, value === null ? rest : [...rest, [name, value]]);',
        '}',
        '',
        'export function setHeight(bar: HTMLElement, px: number): void {',
        "  put(bar, 'height', `${px}px`);",
        '}',
        '',
        'export function setTone(bar: HTMLElement, tone: string): void {',
        "  put(bar, '--tone', tone);",
        '}',
        '',
        'export function clearHeight(bar: HTMLElement): void {',
        "  put(bar, 'height', null);",
        '}',
        '',
      ].join('\n'),
      explanation: [
        'What `CSSStyleDeclaration` is doing, written out: read the attribute, split it into',
        '`name: value` pairs, edit the list, join it back.',
        '',
        'Seeing it spelled out makes two things concrete. First, that a `style` attribute really is a',
        'list rather than a string, which is the whole point of this challenge — the starter is wrong',
        'because it throws the list away, not because it formats it oddly. Second, that a custom',
        'property is not special here at all: `--tone` is a name like any other once you are working',
        'with the text, which is why this version needs no `setProperty` branch.',
        '',
        'It is also the only version in which you control the **order and the formatting** of the',
        'result. The CSSOM re-serialises the whole block on every write, in its own normalised form,',
        'so a `setProperty` call reflows the attribute even for the declarations it did not touch.',
      ].join('\n'),
      tradeoffs: [
        'Do not do this to a `style` attribute in real code. The parser above is wrong for any value',
        'containing a semicolon or a colon — `background: url(a;b.png)`, `content: ":"`,',
        '`grid-template-areas` with quotes — and it silently drops `!important`, which it treats as',
        'part of the value and then writes back in a position that may not mean the same thing.',
        '',
        'It also cannot validate. `style.height = "purple"` is rejected by the CSSOM and leaves the',
        'declaration alone; the version above writes `height: purple` into the attribute and produces',
        'a declaration the browser will drop at parse time, so the two disagree about what happened.',
        '',
        'What the technique *is* good for is the same as it was for `class`: **any other attribute',
        'holding a structured string.** `srcset`, `sizes`, `accept`, a `content-security-policy` in a',
        '`<meta>`, an SVG `transform` list, a `data-*` attribute holding your own format. None of those',
        'has a parsed view, and the shape above — read, split, edit, join — is what you write for them.',
        '',
        'And if you find yourself reaching for it on `style` because you want a diff-stable attribute:',
        'the answer is usually to stop putting the value inline at all. A class, or one custom property',
        'the stylesheet reads, moves the churn out of the markup entirely.',
      ].join('\n'),
    },
  ],
};
