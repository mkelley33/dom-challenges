import type { ChallengeContent } from '@/types/challenge';

import { computedValue, requireElement, requireStyle } from './support';

type Repair = (doc: Document) => void;

export const orderOfAppearance: ChallengeContent = {
  prompt: [
    'Two stylesheets. The base sheet defines the cards; the skin sheet was written to override',
    'their padding and to style the promo badge. But an async loader injected them in the wrong',
    'order — the skin’s `<style>` sits **before** the base’s — so wherever the two tie on',
    'specificity, the base wins and the skin is silently dead.',
    '',
    'Export one function:',
    '',
    '- `repair(doc)` — make the skin’s declarations win the ties they were written to win.',
    '',
    'Both sheets are load-bearing. The base still supplies everything the skin does not mention',
    '(the cards’ accent border), the skin still supplies things only it has (the badge), and cards',
    'created after the repair must be skinned too. So neither “delete the base” nor “walk the cards',
    'and write styles” survives the tests — the thing that is wrong is the *order*, and the fix',
    'should be about the order.',
  ].join('\n'),
  html: [
    '<style id="skin">',
    '  .card { padding-left: 20px; }',
    '  .badge { border-left-style: solid; border-left-width: 4px; }',
    '</style>',
    '<style id="base">',
    '  .card { padding-left: 8px; }',
    '  .card { border-left-style: solid; border-left-width: 1px; }',
    '</style>',
    '<div id="wall">',
    '  <div class="card" id="one">One <span class="badge" id="new-badge">new</span></div>',
    '  <div class="card" id="two">Two</div>',
    '</div>',
  ].join('\n'),
  starterCode: [
    'export function repair(doc: Document): void {',
    '  // If the base sheet keeps winning, remove it from the fight...',
    "  doc.getElementById('base')?.remove();",
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'the skin wins the tie it was written to win',
      run: ({ doc, win, fn, expect }) => {
        fn<Repair>('repair')(doc);

        expect(computedValue(win, requireElement(doc, 'one'), 'padding-left')).toBe('20px');
        expect(computedValue(win, requireElement(doc, 'two'), 'padding-left')).toBe('20px');
      },
    },
    {
      name: 'the base still supplies what only it defines',
      run: ({ doc, win, fn, expect }) => {
        fn<Repair>('repair')(doc);

        // The accent border exists only in the base sheet. The starter's remove() wins the padding
        // fight by killing the other fighter -- and this is what it costs.
        expect(computedValue(win, requireElement(doc, 'one'), 'border-left-width')).toBe('1px');
      },
    },
    {
      name: 'rules only the skin has still apply',
      run: ({ doc, win, fn, expect }) => {
        fn<Repair>('repair')(doc);

        expect(computedValue(win, requireElement(doc, 'new-badge'), 'border-left-width')).toBe('4px');
      },
    },
    {
      name: 'a card dealt after the repair is skinned too',
      run: ({ doc, win, fn, expect }) => {
        fn<Repair>('repair')(doc);

        const late = doc.createElement('div');
        late.className = 'card';
        late.textContent = 'Three';
        requireElement(doc, 'wall').append(late);

        expect(computedValue(win, late, 'padding-left')).toBe('20px');
      },
    },
    {
      name: 'the base sheet is intact, rule for rule',
      run: ({ doc, fn, expect }) => {
        fn<Repair>('repair')(doc);

        // `requireStyle` makes the starter's failure legible -- "style#base is missing from the
        // challenge markup" names exactly what remove() did. The rule count then rules out answers
        // that won the tie by deleting the base's competing rule; a value-level rewrite would
        // already have failed the border test above.
        const base = requireStyle(doc, 'base');
        const sheet = base.sheet;
        if (!sheet) throw new Error('style#base has no sheet');
        expect(sheet.cssRules).toHaveLength(2);
      },
    },
  ],
  solutions: [
    {
      label: 'Move the skin after the base',
      code: [
        'export function repair(doc: Document): void {',
        "  const skin = doc.getElementById('skin');",
        "  const base = doc.getElementById('base');",
        '  if (!skin || !base) return;',
        '',
        '  base.after(skin);',
        '}',
        '',
      ].join('\n'),
      explanation: [
        "Among tied declarations, the cascade's last resort is **order of appearance**: the one",
        'that comes later in the document wins. And "comes later" is not about when a sheet was',
        'created or parsed -- it is about where its `<style>` element *sits in the tree right now*.',
        "A stylesheet's rank is a live property of the DOM.",
        '',
        'Which makes the fix a DOM operation. `base.after(skin)` inserts the skin element',
        'immediately after the base element -- and because an element can only be in one place,',
        '"insert" here means **move**. There is no copy to clean up and no second sheet: the same',
        'sheet, same rules, reappears one position later, and every tie in the document is',
        "re-decided under the new order. Both `.card` padding declarations still exist; the skin's",
        'is simply the later one now, which is the entire difference.',
        '',
        'Everything the tests protect follows from nothing having been created or destroyed. The',
        "base's border rule never had a competitor, so it still applies. The badge rule moved with",
        'its sheet, so it still applies. And the late card is covered because rules apply to',
        'whatever matches them for as long as the sheet is in the document -- position changed,',
        'reach did not.',
        '',
        'The starter\'s `remove()` also "fixes" the padding, and the second test is its bill: the',
        "base was not just the skin's rival, it was the supplier of everything the skin never",
        'mentions. Deleting a whole layer to win one tie trades a scoped problem for a diffuse one.',
      ].join('\n'),
      tradeoffs: [
        'When the diagnosis is "the order is wrong", moving the element is the fix that says so --',
        'smallest possible change, trivially reversible, and legible in devtools where the element',
        'list *is* the cascade order.',
        '',
        'Its limits:',
        '',
        '- **It is a fight with whatever ordered them.** If the async loader that injected these',
        '  runs again, the order may revert; the durable fix is in the loader. A repair function',
        '  like this is a tourniquet, and should be commented as one.',
        '- **Position is one global axis.** With three or four sheets whose ties interleave, "move',
        '  this one after that one" stops composing -- reordering to satisfy several constraints at',
        '  once is exactly the job CSS gave up on order for and invented `@layer` to solve.',
      ].join('\n'),
    },
    {
      label: 'Promote the skin to the adopted layer',
      code: [
        'export function repair(doc: Document): void {',
        "  const skin = doc.getElementById('skin');",
        '  if (!skin) return;',
        '',
        '  const promoted = new CSSStyleSheet();',
        "  promoted.replaceSync(skin.textContent ?? '');",
        '  doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, promoted];',
        '  skin.remove();',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'Instead of jockeying for position among the `<style>` elements, leave that contest',
        'entirely. Documents have a second collection of stylesheets -- `adoptedStyleSheets`, an',
        "array of **constructed** `CSSStyleSheet` objects -- and in the cascade's order of",
        'appearance, every adopted sheet comes **after every sheet in the markup**. Membership in',
        'the array is rank; no DOM position is involved at all.',
        '',
        'So the skin is rebuilt as a constructed sheet: `new CSSStyleSheet()`, then `replaceSync`',
        'with the same text the `<style>` element held. Adoption appends it to the array',
        '(spread-and-assign, because the property expects a whole array), and from that moment its',
        "`.card` declaration is later than the base's by construction. The original element is then",
        "removed so the document does not carry two copies of the skin's rules.",
        '',
        'Note what `replaceSync` is doing quietly: the constructed sheet is parsed and finished',
        '*before* it is adopted. That order -- build, fill, adopt -- is the reliable one across',
        'engines, and it reads better too: you adopt a sheet, not a promise of one.',
      ].join('\n'),
      tradeoffs: [
        "This is the modern layering tool, and the right home for styles that are *code's* --",
        'themes, embeds, component systems. An adopted sheet stays live: `replaceSync` again later',
        'and the document re-styles, which makes it the natural vehicle for a skin that changes at',
        'runtime. The same object can also be adopted by many shadow roots, one parsed copy serving',
        'all of them.',
        '',
        'What it costs here:',
        '',
        '- **The skin stops being findable where it was.** `document.styleSheets` deliberately',
        '  excludes adopted sheets, and the `<style id="skin">` element is gone -- tooling and',
        '  teammates that audit the DOM for sheets will undercount.',
        '- **Highest rank is the only rank.** Adopted sheets cannot be slotted *between* markup',
        '  sheets; if some third sheet must outrank the skin, it has to join the adopted array',
        '  after it.',
        "- **It is a copy, not a move.** The element's text and the constructed sheet part ways at",
        '  the moment of promotion; edits to one no longer reach the other.',
      ].join('\n'),
    },
  ],
};
