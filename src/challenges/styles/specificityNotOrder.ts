import type { ChallengeContent } from '@/types/challenge';

import { computedValue, requireElement } from './support';

type CompactBoard = (doc: Document) => void;

export const specificityNotOrder: ChallengeContent = {
  prompt: [
    'The app’s stylesheet defines a compact note — `.note { padding-left: 6px }` — and then two',
    'containers opt out of it: `#board .note` gets comfortable 18px padding, `#dock .note` gets',
    '12px. Product has changed its mind about the board.',
    '',
    'Export one function:',
    '',
    '- `compactBoard(doc)` — the board’s notes use the compact 6px padding again. The dock is not',
    '  part of this decision and must keep its 12px.',
    '',
    'The natural move — append `.note { padding-left: 6px }` and let “later wins” do the rest —',
    'changes nothing. Later only wins **ties**. `#board .note` outranks any lone class selector on',
    'specificity, and a thousand later class rules lose to it identically. To win this you must',
    'either match its weight, or take the rule off the board.',
  ].join('\n'),
  html: [
    '<style id="app-styles">',
    '  .note { padding-left: 6px; }',
    '  #board .note { padding-left: 18px; }',
    '  #dock .note { padding-left: 12px; }',
    '</style>',
    '<section id="board">',
    '  <p class="note" id="plan">Plan the launch</p>',
    '  <p class="note" id="brief">Brief the team</p>',
    '</section>',
    '<aside id="dock">',
    '  <p class="note" id="scratch">Scratchpad</p>',
    '</aside>',
  ].join('\n'),
  starterCode: [
    'export function compactBoard(doc: Document): void {',
    '  // Appended last, so it wins... right?',
    "  const sheet = doc.createElement('style');",
    "  sheet.textContent = '.note { padding-left: 6px; }';",
    '  doc.body.append(sheet);',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'the board notes go compact',
      run: ({ doc, win, fn, expect }) => {
        fn<CompactBoard>('compactBoard')(doc);

        expect(computedValue(win, requireElement(doc, 'plan'), 'padding-left')).toBe('6px');
        expect(computedValue(win, requireElement(doc, 'brief'), 'padding-left')).toBe('6px');
      },
    },
    {
      name: 'the dock is not the board',
      run: ({ doc, win, fn, expect }) => {
        fn<CompactBoard>('compactBoard')(doc);

        // The measure of a targeted fix is what it does not hit. An `!important` version of the
        // starter turns every note compact -- including this one, which nobody asked about.
        expect(computedValue(win, requireElement(doc, 'scratch'), 'padding-left')).toBe('12px');
      },
    },
    {
      name: 'a note pinned to the board later is compact too',
      run: ({ doc, win, fn, expect }) => {
        fn<CompactBoard>('compactBoard')(doc);

        const late = doc.createElement('p');
        late.className = 'note';
        late.textContent = 'Added after the change';
        requireElement(doc, 'board').append(late);

        // Built by the test after compactBoard ran, so per-element answers -- walking the board's
        // notes and writing on each -- have nothing to say about it. Only a rule change covers
        // elements that do not exist yet.
        expect(computedValue(win, late, 'padding-left')).toBe('6px');
      },
    },
    {
      name: 'the notes themselves are untouched',
      run: ({ doc, fn, expect }) => {
        fn<CompactBoard>('compactBoard')(doc);

        // `toBe(null)` rather than `toBeNull()`: the failure prints the style attribute an inline
        // answer wrote, next to a single legible `null`.
        expect(requireElement(doc, 'plan').getAttribute('style')).toBe(null);
        expect(requireElement(doc, 'brief').getAttribute('style')).toBe(null);
      },
    },
  ],
  solutions: [
    {
      label: 'Match the specificity and let order break the tie',
      code: [
        'export function compactBoard(doc: Document): void {',
        "  const sheet = doc.createElement('style');",
        "  sheet.textContent = '#board .note { padding-left: 6px; }';",
        '  doc.body.append(sheet);',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The cascade sorts competing declarations in a strict sequence, and the starter fails',
        'because it plays the tiebreaker before winning the tie:',
        '',
        '1. **Importance** -- `!important` declarations beat normal ones, full stop.',
        '2. **Specificity** -- among equals, count (ids, classes/attributes/pseudo-classes, types).',
        '   `#board .note` is 1-1-1; `.note` is 0-1-1. The id column decides alone; no number of',
        '   later `.note` rules ever catches up, because the columns do not trade.',
        '3. **Source order** -- only among declarations still tied after both of the above does',
        '   "later wins" apply.',
        '',
        'So the winning move is to enter the contest at the same weight: another `#board .note`',
        'rule, 1-1-1 against 1-1-1, tie -- and *now* source order speaks. The new sheet sits at the',
        'end of the body, after the app sheet, so the compact declaration is later and wins. Both',
        'facts are load-bearing: the selector buys the tie, the position converts it.',
        '',
        'One habit this should install: when a rule mysteriously does not apply, do not reach for',
        '`!important` and do not shuffle order first -- *count*. The dock test shows why the',
        'sledgehammer is wrong here: `.note { padding-left: 6px !important }` beats `#board .note`',
        'and `#dock .note` alike, because importance outranks specificity for every note in the',
        'document. It passes the board test and flattens the dock.',
        '',
        'A note on `insertRule`, the API-shaped way to add a rule: `sheet.insertRule(text)` inserts',
        'at index **0** -- it *prepends*. A rule prepended into the app sheet is *earlier* in source',
        'order and loses the exact tie this solution needs to win; appending means passing',
        '`sheet.cssRules.length` as the second argument. A fresh `<style>` element at the end of the',
        'document says "last" without arithmetic.',
      ].join('\n'),
      tradeoffs: [
        'Additive, reversible, and honest about its intent -- the override reads as an override.',
        'This is the default way to change a style decision you do not own.',
        '',
        'What it costs:',
        '',
        '- **The old rule is still there**, lying to the next reader: `#board .note { padding-left:',
        '  18px }` looks authoritative and is dead. Overrides accumulate into archaeology; the',
        '  deleting solution keeps the sheet telling the truth.',
        "- **It is coupled to the original selector's weight.** If the app sheet later strengthens",
        '  the rule, the tie breaks and the override silently dies. Matching specificity is a',
        '  contract with a rule you do not control.',
        '- **Each override is one more sheet.** Fine once; a pattern of these wants a single owned',
        '  layer whose content is replaced, not a trail of appended elements.',
      ].join('\n'),
    },
    {
      label: 'Delete the rule that is in the way',
      code: [
        'export function compactBoard(doc: Document): void {',
        '  for (const sheet of doc.styleSheets) {',
        '    const rules = [...sheet.cssRules];',
        '    for (let index = rules.length - 1; index >= 0; index -= 1) {',
        '      const rule = rules[index];',
        "      if (rule instanceof CSSStyleRule && rule.selectorText === '#board .note') {",
        '        sheet.deleteRule(index);',
        '      }',
        '    }',
        '  }',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The other honest answer: instead of outweighing the comfortable rule, remove it. With',
        "`#board .note` gone, the board's notes match only `.note`, and the compact padding that",
        'was there all along -- the challenge never writes "6px" anywhere -- applies again. The dock',
        'rule is a different selector and is never touched.',
        '',
        "The machinery is the CSSOM's editing surface. `document.styleSheets` lists one",
        '`CSSStyleSheet` per style element; `sheet.cssRules` lists parsed rules in source order;',
        "a style rule's `selectorText` is its selector as the parser kept it, which is what the",
        'search matches on. Deletion is by index -- there is no `deleteRule(selector)` -- so the',
        'loop walks a snapshot of the list and deletes **from the end backwards**, because every',
        'deletion renumbers the rules after it; walking forward while deleting is the classic way',
        'to skip a neighbour.',
        '',
        '`instanceof CSSStyleRule` is doing quiet work too: a sheet can hold `@media` blocks,',
        '`@keyframes` and other rule kinds that have no `selectorText`, and the guard skips them',
        'by type rather than by hoping.',
      ].join('\n'),
      tradeoffs: [
        'Reach for deletion when the rule is genuinely wrong -- when leaving it in place means every',
        'future reader must know it is overridden. A stylesheet that says what it means beats a',
        'stylesheet plus a list of exceptions.',
        '',
        'Its sharp edges:',
        '',
        '- **It is destructive and unversioned.** Nothing remembers the 18px; undo means re-adding',
        '  a rule from knowledge the document no longer holds. The additive solution can be peeled',
        '  off; this cannot.',
        "- **`selectorText` matching is exact-string matching** against the parser's",
        '  serialisation, not "matches the same elements". A refactor to `section#board .note`',
        '  breaks the search silently.',
        "- **This walk is flat.** A rule inside `@media` lives in that rule's own `cssRules`, not",
        "  the sheet's top level; a thorough version recurses into grouping rules.",
        '- **Deleting rules you do not own is surgery on shared state.** In a team codebase the',
        '  additive override is a smaller claim; deletion is the right tool when this code *is* the',
        "  sheet's owner.",
      ].join('\n'),
    },
  ],
};
