import type { ChallengeContent } from '@/types/challenge';

import { computedValue, requireElement, requireStyle } from './support';

type ReadGap = (doc: Document) => string;
type SetGap = (doc: Document, px: number) => void;
type ResetGap = (doc: Document) => void;

export const tokenDial: ChallengeContent = {
  prompt: [
    'The theme sheet declares one design token — `:root { --gap: 12px }` — and the rows spend it as',
    '`margin-top: var(--gap)`. You are writing the dial for it.',
    '',
    'Export three functions:',
    '',
    '- `readGap(doc)` — the gap currently in force, as a string like `"12px"`.',
    '- `setGap(doc, px)` — override the gap for this document.',
    '- `resetGap(doc)` — hand control back to the theme sheet’s default, **whatever it is by then**.',
    '',
    'That last clause is the challenge. One of the tests edits the theme sheet before resetting, so',
    'any answer that remembers `12px` — in a constant, in a variable saved at load time, or written',
    'back by hand — resets to a default that no longer exists.',
  ].join('\n'),
  html: [
    '<style id="theme">',
    '  :root { --gap: 12px; }',
    '  .row { margin-top: var(--gap); }',
    '</style>',
    '<div id="list">',
    '  <p class="row" id="first">First</p>',
    '  <p class="row" id="second">Second</p>',
    '</div>',
  ].join('\n'),
  starterCode: [
    'export function readGap(doc: Document): string {',
    "  return doc.documentElement.style.getPropertyValue('--gap');",
    '}',
    '',
    'export function setGap(doc: Document, px: number): void {',
    "  doc.documentElement.style.setProperty('--gap', `${px}px`);",
    '}',
    '',
    'export function resetGap(doc: Document): void {',
    "  doc.documentElement.style.setProperty('--gap', '12px');",
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'the default is readable where it is declared',
      run: ({ doc, fn, expect }) => {
        // Nothing has written the token inline, so the inline declaration is empty -- the value
        // lives in the `:root` rule, and only the computed style has done the work of finding it.
        expect(doc.documentElement.style.getPropertyValue('--gap')).toBe('');
        expect(fn<ReadGap>('readGap')(doc)).toBe('12px');
      },
    },
    {
      name: 'setting the gap is visible to the reader and to the rows',
      run: ({ doc, win, fn, expect }) => {
        fn<SetGap>('setGap')(doc, 16);

        expect(fn<ReadGap>('readGap')(doc)).toBe('16px');
        // The token is not decoration -- the rows spend it, so the override must reach them.
        expect(computedValue(win, requireElement(doc, 'second'), 'margin-top')).toBe('16px');
      },
    },
    {
      name: 'resetting leaves no override behind',
      run: ({ doc, fn, expect }) => {
        fn<SetGap>('setGap')(doc, 16);
        fn<ResetGap>('resetGap')(doc);

        expect(fn<ReadGap>('readGap')(doc)).toBe('12px');
        // The difference between "hand control back" and "write the old value again": after a real
        // reset the inline slot is empty. An override that happens to equal the default is still an
        // override, and it will shadow the theme's next change.
        expect(doc.documentElement.style.getPropertyValue('--gap')).toBe('');
      },
    },
    {
      name: 'the default can change under you',
      run: ({ doc, fn, expect }) => {
        // The theme sheet is edited before the dial is used -- a redesign shipped. Whatever the
        // code captured at load time is now a lie, and only the cascade knows the truth.
        const theme = requireStyle(doc, 'theme');
        theme.textContent = ':root { --gap: 14px; }\n.row { margin-top: var(--gap); }';

        fn<SetGap>('setGap')(doc, 16);
        fn<ResetGap>('resetGap')(doc);
        expect(fn<ReadGap>('readGap')(doc)).toBe('14px');
      },
    },
  ],
  solutions: [
    {
      label: 'Override inline, reset by removal',
      code: [
        'export function readGap(doc: Document): string {',
        "  return getComputedStyle(doc.documentElement).getPropertyValue('--gap');",
        '}',
        '',
        'export function setGap(doc: Document, px: number): void {',
        "  doc.documentElement.style.setProperty('--gap', `${px}px`);",
        '}',
        '',
        'export function resetGap(doc: Document): void {',
        "  doc.documentElement.style.removeProperty('--gap');",
        '}',
        '',
      ].join('\n'),
      explanation: [
        'Three small functions, each of which is a rule about custom properties worth keeping:',
        '',
        '**Read the computed style, from the element that declares the token.** The `:root` rule',
        'declares `--gap` on the document element, so that is where the settled value can be read',
        'back -- `getComputedStyle(...).getPropertyValue("--gap")`. The starter read',
        '`documentElement.style` instead, which is only the inline attribute: empty until someone',
        'overrides, which is precisely the "nothing is broken, nothing is right" reading. And note',
        'the spelling: custom properties have no camelCase form, so `getPropertyValue` is not a',
        'stylistic choice -- it is the only door.',
        '',
        '**Override by declaring closer.** The cascade applies to custom properties like any other:',
        'an inline declaration on the same element beats the `:root` rule, so `setProperty` on',
        '`documentElement.style` wins without touching the theme sheet. The rows re-resolve their',
        '`var(--gap)` because inheritance is how the value reaches them -- one write, every spender.',
        '',
        '**Reset by removing, never by restating.** `removeProperty` withdraws the override, and the',
        "theme's declaration -- whichever declaration that is by now -- takes over again. The last",
        'test is the whole argument: the theme changed to `14px` after this module loaded, so any',
        'remembered default is stale. There is a general principle here that outlives this',
        'challenge: **a default belongs to exactly one owner.** The dial may defer to it or override',
        "it, but the moment the dial writes the default's *value*, there are two copies of the",
        'truth, and one of them is wrong within a quarter.',
      ].join('\n'),
      tradeoffs: [
        'The inline override is the standard shape for a per-document (or per-subtree) dial:',
        'immediate, scoped to the element it is set on, and reversible with one `removeProperty`.',
        'It is how theme switchers, density toggles and user preferences are usually wired.',
        '',
        'Its limits:',
        '',
        '- **The override is invisible in the stylesheet.** Whoever debugs the gap next quarter will',
        "  find the answer in an element's style attribute, not where the token is documented. The",
        '  rule-based alternative keeps the override in CSS, where style debugging tools expect it.',
        '- **One element, one override.** Scoping a different gap to one panel means setting the',
        "  property on that panel instead -- which works, and is the density-token challenge's whole",
        '  subject -- but the "document dial" framing quietly becomes a tree of dials.',
      ].join('\n'),
    },
    {
      label: 'Override with a second rule, reset by emptying it',
      code: [
        "const override = document.createElement('style');",
        'document.body.append(override);',
        '',
        'export function readGap(doc: Document): string {',
        "  return getComputedStyle(doc.documentElement).getPropertyValue('--gap');",
        '}',
        '',
        'export function setGap(doc: Document, px: number): void {',
        '  override.textContent = `:root { --gap: ${px}px; }`;',
        '}',
        '',
        'export function resetGap(doc: Document): void {',
        "  override.textContent = '';",
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The same dial with the override kept in the same medium as the default: a second `:root`',
        'rule, in a `<style>` element this module owns.',
        '',
        'Why the override wins is worth being able to say precisely: both rules are `:root`, so',
        'specificity ties, and between tied rules **the later one in document order wins**. The',
        'override sheet is appended to the end of `<body>`, after the theme sheet, so its',
        'declaration is the survivor. Note the deliberate choice of `body` over `head`: "document',
        'order" means where the `<style>` *elements* sit, and the theme sheet lives in the body',
        'here, so a sheet appended to the head would sort *before* it and lose the very tie it',
        'exists to win. Order is doing real work in this solution -- move either element and the',
        'dial silently stops, with nothing to say why.',
        '',
        'Reset is `textContent = ""`: the rule ceases to exist, the tie disappears, and the theme\'s',
        'declaration -- current edition -- stands alone again. The element stays where it is, parsed',
        'and empty, ready for the next `setGap`; replacing its text is also why repeated calls do',
        'not pile up rules.',
      ].join('\n'),
      tradeoffs: [
        'Choose this when overrides should be *inspectable as CSS*: devtools shows a `:root` rule',
        'with a file of origin, the style attribute stays clean, and the whole override story can be',
        'read by looking at one `<style>` element.',
        '',
        'What it costs:',
        '',
        '- **It leans on source order**, a global property of the document that nothing enforces.',
        '  The inline version cannot lose that particular fight.',
        '- **The override element is module state.** Two instances of this module would fight over',
        '  the last word; the inline version is idempotent by construction.',
        '- **Scoping requires selectors.** A per-panel gap means writing rules that name panels,',
        '  which is exactly the bookkeeping the inline-on-the-panel version never does.',
      ].join('\n'),
    },
  ],
};
