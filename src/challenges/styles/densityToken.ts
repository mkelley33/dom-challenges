import type { ChallengeContent } from '@/types/challenge';

/**
 * Local rather than in a `support.ts` because this category has one challenge -- a helper shared
 * between two of them earns its own file, one used by a single challenge belongs beside it.
 */
function requireElement(doc: Document, id: string): HTMLElement {
  const element = doc.getElementById(id);
  if (!element) throw new Error(`#${id} is missing from the challenge markup`);
  return element;
}

/** A `.row` the test builds itself, so "did this element exist when you ran?" is a real question. */
function appendRow(doc: Document, panel: HTMLElement, id: string): HTMLElement {
  const row = doc.createElement('p');
  row.className = 'row';
  row.id = id;
  row.textContent = 'Added later';
  panel.append(row);
  return row;
}

type SetDensity = (panel: HTMLElement, px: number) => void;
type ReadPad = (element: Element) => string;

export const densityToken: ChallengeContent = {
  prompt: [
    'The rows get their left padding from a custom property. `:root` declares `--row-pad: 4px`, the',
    '`.row` rule spends it as `padding-left: var(--row-pad)`, and the pinned row overrides it to',
    '`24px` **on itself**.',
    '',
    'Export two functions:',
    '',
    '- `setDensity(panel, px)` — make every row inside `panel` use `px` pixels of left padding,',
    '  except the ones that declare their own.',
    '- `readPad(element)` — the left padding that element actually ends up with, as a string like',
    '  `"16px"`.',
    '',
    'One of the tests adds a brand new `.row` to the panel **after** `setDensity` has already run,',
    'and expects it to have the new padding as well. Setting the padding on the rows you can find is',
    'therefore not a solution, and that is the whole point of the exercise: a custom property is a',
    'value the rows inherit, not a value you push onto them.',
  ].join('\n'),
  html: [
    '<style>',
    '  :root { --row-pad: 4px; }',
    '  .row { padding-left: var(--row-pad); border-left: 2px solid #d4d4d8; margin: 4px 0; }',
    '  .row.pinned { --row-pad: 24px; }',
    '</style>',
    '<div id="panel">',
    '  <p class="row" id="first">First</p>',
    '  <p class="row pinned" id="pinned">Pinned</p>',
    '  <p class="row" id="last">Last</p>',
    '</div>',
  ].join('\n'),
  starterCode: [
    'export function setDensity(panel: HTMLElement, px: number): void {',
    '  // The rows read `--row-pad`. Change it where they will inherit it from.',
    '}',
    '',
    'export function readPad(element: Element): string {',
    "  return '';",
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'readPad reports what the cascade produced, not what is written inline',
      run: ({ doc, fn, expect }) => {
        const readPad = fn<ReadPad>('readPad');
        const first = requireElement(doc, 'first');

        // Nothing is declared inline on this element, so `element.style.paddingLeft` is the empty
        // string here. Only the *computed* style knows what the stylesheet worked out.
        expect(first.style.paddingLeft).toBe('');
        expect(readPad(first)).toBe('4px');
        expect(readPad(requireElement(doc, 'pinned'))).toBe('24px');
      },
    },
    {
      name: 'setting the density moves every row that inherits the value',
      run: ({ doc, fn, expect }) => {
        fn<SetDensity>('setDensity')(requireElement(doc, 'panel'), 16);

        const readPad = fn<ReadPad>('readPad');
        expect(readPad(requireElement(doc, 'first'))).toBe('16px');
        expect(readPad(requireElement(doc, 'last'))).toBe('16px');
      },
    },
    {
      name: 'a row that declares its own value keeps it',
      run: ({ doc, fn, expect }) => {
        fn<SetDensity>('setDensity')(requireElement(doc, 'panel'), 16);

        // `.row.pinned` sets `--row-pad` on the pinned row itself. A declaration on the element wins
        // over one it would otherwise inherit, however specific the ancestor's rule is -- which is
        // what makes custom properties a default rather than a command.
        expect(fn<ReadPad>('readPad')(requireElement(doc, 'pinned'))).toBe('24px');
      },
    },
    {
      name: 'a row added after the density was set gets it too',
      run: ({ doc, fn, expect }) => {
        const panel = requireElement(doc, 'panel');
        fn<SetDensity>('setDensity')(panel, 16);

        // Built by the test, after the fact, so nothing the submitted code did could have touched
        // it. This is the assertion that separates "changed the value the rows read" from "wrote the
        // answer onto the three rows that happened to exist".
        const added = appendRow(doc, panel, 'added');
        expect(fn<ReadPad>('readPad')(added)).toBe('16px');
      },
    },
    {
      name: 'the density can be changed again',
      run: ({ doc, fn, expect }) => {
        const panel = requireElement(doc, 'panel');
        const setDensity = fn<SetDensity>('setDensity');
        setDensity(panel, 16);
        setDensity(panel, 2);

        const readPad = fn<ReadPad>('readPad');
        expect(readPad(requireElement(doc, 'first'))).toBe('2px');
        expect(readPad(requireElement(doc, 'pinned'))).toBe('24px');
      },
    },
  ],
  solutions: [
    {
      label: 'Set the custom property on the panel',
      code: [
        'export function setDensity(panel: HTMLElement, px: number): void {',
        "  panel.style.setProperty('--row-pad', `${px}px`);",
        '}',
        '',
        'export function readPad(element: Element): string {',
        '  return getComputedStyle(element).paddingLeft;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'A custom property is an ordinary inherited CSS property that happens to hold a value nothing',
        'in the engine understands. `--row-pad: 4px` on `:root` is inherited by every element in the',
        'document; `padding-left: var(--row-pad)` on `.row` is where that value is finally spent.',
        '',
        'That indirection is what makes one write reach an unbounded number of elements. Setting the',
        'property on `#panel` gives every descendant a closer declaration to inherit, so all of them',
        're-resolve their `var()` — including elements that did not exist when you set it. There is no',
        'list to keep up to date, because there was never a list.',
        '',
        '`setProperty` rather than `panel.style["--row-pad"] = ...`. Custom properties are not IDL',
        'properties of `CSSStyleDeclaration`, so the dashed name has to go through `setProperty`,',
        '`getPropertyValue` and `removeProperty`. The same is true reading them back:',
        '`getComputedStyle(el).getPropertyValue("--row-pad")` works, `getComputedStyle(el)["--row-pad"]`',
        'does not.',
        '',
        'The pinned row is untouched, and it is untouched for a reason worth internalising: a',
        'declaration **on** an element always beats a value it would have inherited. Specificity only',
        'settles fights between rules matching the same element — it never lets an ancestor overrule a',
        'descendant. So a custom property set high up is a default, and any element is free to decline',
        'it.',
        '',
        '`readPad` has to go through `getComputedStyle`. `element.style` is only the inline `style`',
        'attribute, and none of these rows have one — it reads `""` for all three, which is exactly the',
        'kind of "nothing is broken, nothing is right" answer that costs an afternoon.',
      ].join('\n'),
      tradeoffs: [
        'Setting the property inline is immediate, scoped to one subtree, and trivially reversible',
        '(`panel.style.removeProperty("--row-pad")` puts the `:root` default back). For a value that is',
        'genuinely per-instance — this panel is dense, that one is not — it is the right answer.',
        '',
        'What it costs:',
        '',
        '- The value now lives in the `style` attribute, which is the highest-specificity place it',
        '  could be short of `!important`. Nothing in your stylesheet can override it afterwards, and',
        '  it will be there in the DOM inspector confusing whoever reads it next.',
        '- It is one element at a time. Theming forty panels means forty writes and a list of the forty',
        '  — the problem the property was supposed to remove, moved up a level.',
        '',
        'The other axis to consider is *where* the default should live. `:root` is the conventional home',
        'for design tokens precisely because everything inherits from it, and a token is usually',
        'something the whole product agrees on. Component-scoped custom properties (declared on the',
        'component root, consumed inside it) are the other half of the pattern, and they are how a',
        'component exposes a deliberate theming hook without exposing its internals — including through',
        'a shadow boundary, which custom properties cross and ordinary styles do not.',
      ].join('\n'),
    },
    {
      label: 'Write the value into a stylesheet rule',
      code: [
        "const sheet = document.createElement('style');",
        'document.head.append(sheet);',
        '',
        'export function setDensity(panel: HTMLElement, px: number): void {',
        '  if (!panel.id) return;',
        '',
        '  sheet.textContent = `#${panel.id} { --row-pad: ${px}px; }`;',
        '}',
        '',
        'export function readPad(element: Element): string {',
        "  return getComputedStyle(element).getPropertyValue('padding-left');",
        '}',
        '',
      ].join('\n'),
      explanation: [
        'Same idea, different place to put it: instead of an inline declaration the value goes into a',
        'rule, and the rule matches the panel by id.',
        '',
        'The `<style>` element is created once, at module scope, and its `textContent` is **replaced**',
        'on every call. Appending a new rule each time would work too — the last matching declaration',
        'of equal specificity wins — but the sheet would grow without bound, and reading it later would',
        'tell you the history rather than the state.',
        '',
        'Specificity is doing real work here. `#panel` is an id selector, so it beats the `:root` rule',
        'that supplies the default. It still does not beat `.row.pinned`, and not because of',
        'specificity: that rule declares the property on the pinned row itself, and an element always',
        'prefers its own declaration to an inherited one.',
        '',
        '`getPropertyValue("padding-left")` and `.paddingLeft` are the same lookup spelled two ways —',
        'the dashed CSS name and the camelCase IDL name. Custom properties only have the first form,',
        'which is why `setProperty` and `getPropertyValue` exist at all.',
      ].join('\n'),
      tradeoffs: [
        'Reach for this when one write has to reach many elements that share no ancestor — a `.dense`',
        'body class, a `prefers-reduced-motion` block, a theme switch. A rule is a rule, so it applies',
        'to whatever matches it now and to whatever matches it later, and nothing has to be re-applied',
        'when the DOM changes.',
        '',
        'What it costs, and the first two are visible in the code above:',
        '',
        '- **It needs a selector.** The panel has to have an id, or a class, or something stable to',
        '  match on — the `if (!panel.id) return;` is that requirement wearing a guard. The inline',
        '  version needs no name for anything, because it already has the element.',
        '- **It is global state.** One shared `<style>` element means two panels cannot have two',
        '  densities without generating a rule per panel and inventing names for them, which is how',
        '  hand-rolled CSS-in-JS is born.',
        '- Rewriting `textContent` reparses the rule. That is cheap here and not free in a loop;',
        '  `CSSStyleSheet.replaceSync` or `sheet.insertRule`/`deleteRule` edit the parsed sheet instead,',
        '  and a constructed `CSSStyleSheet` in `adoptedStyleSheets` shares one parsed copy across every',
        '  document and shadow root that adopts it.',
        '',
        'For a single element the inline property is simpler and more direct. This shape earns its keep',
        'at the point where you would otherwise be writing a loop.',
      ].join('\n'),
    },
  ],
};
