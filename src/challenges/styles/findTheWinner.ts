import type { ChallengeContent } from '@/types/challenge';

import { requireElement } from './support';

type WidthSource = (tile: HTMLElement) => 'inline' | 'stylesheet';

export const findTheWinner: ChallengeContent = {
  prompt: [
    'Three product tiles, each with a width set somewhere: inline on the element, in a stylesheet',
    'rule, or — the interesting case — both, with a `!important` rule outranking the inline value.',
    '',
    'Export one function:',
    '',
    "- `widthSource(tile)` — `'inline'` if the inline declaration is the one actually deciding the",
    "  tile's width right now, `'stylesheet'` if a rule is.",
    '',
    'The starter checks whether an inline width *exists*, and that is a different question. The sale',
    'tile has an inline width and is not using it: `.sale { width: 260px !important }` outranks the',
    'style attribute. Presence is in the markup; **winning is a fact about the cascade**, and the',
    'cascade publishes only one thing — the computed style. Your answer must also track the',
    'document as it changes, because two of the tests move things after the markup loads.',
  ].join('\n'),
  html: [
    '<style>',
    '  .themed { width: 200px; }',
    '  .sale { width: 260px !important; }',
    '</style>',
    '<div id="shelf">',
    '  <div class="tile" id="plain" style="width: 480px">Plain</div>',
    '  <div class="tile themed" id="themed">Themed</div>',
    '  <div class="tile themed sale" id="sale" style="width: 480px">Sale</div>',
    '</div>',
  ].join('\n'),
  starterCode: [
    "export function widthSource(tile: HTMLElement): 'inline' | 'stylesheet' {",
    "  return tile.style.width !== '' ? 'inline' : 'stylesheet';",
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'an inline width with no challenger is the source',
      run: ({ doc, fn, expect }) => {
        expect(fn<WidthSource>('widthSource')(requireElement(doc, 'plain'))).toBe('inline');
      },
    },
    {
      name: 'a rule with no inline declaration is the source',
      run: ({ doc, fn, expect }) => {
        expect(fn<WidthSource>('widthSource')(requireElement(doc, 'themed'))).toBe('stylesheet');
      },
    },
    {
      name: 'an inline width that is being outranked is not the source',
      run: ({ doc, fn, expect }) => {
        // The style attribute says 480px; the computed width is 260px. Whatever the answer checks,
        // it has to notice that the inline declaration is present and losing.
        expect(fn<WidthSource>('widthSource')(requireElement(doc, 'sale'))).toBe('stylesheet');
      },
    },
    {
      name: 'the verdict tracks the document, not the markup',
      run: ({ doc, fn, expect }) => {
        // The discount ends: the class whose rule was winning is removed. The same inline
        // declaration that was losing a moment ago is now the only voice left.
        const sale = requireElement(doc, 'sale');
        sale.classList.remove('sale');

        expect(fn<WidthSource>('widthSource')(sale)).toBe('inline');
      },
    },
    {
      name: 'an inline width added after load is seen',
      run: ({ doc, fn, expect }) => {
        // The reverse move: a tile that had no inline width gains one, and the new declaration
        // beats the normal .themed rule. An answer built from a snapshot of the initial markup
        // answers yesterday's question.
        const themed = requireElement(doc, 'themed');
        themed.style.width = '333px';

        expect(fn<WidthSource>('widthSource')(themed)).toBe('inline');
      },
    },
    {
      name: 'outranking is not the same fact as being the sale tile',
      run: ({ doc, fn, expect }) => {
        // A wrong answer can pass every test above by hardcoding "outranked" as "is .sale" instead
        // of actually comparing claim to outcome -- .sale is the only source of an outranking
        // !important rule in the original markup, so the two questions happen to have the same
        // answer everywhere above. A second !important rule, aimed at a plain tile through an id
        // selector instead of .sale, breaks that coincidence.
        const style = doc.createElement('style');
        style.textContent = '#plain { width: 90px !important; }';
        doc.head.append(style);

        expect(fn<WidthSource>('widthSource')(requireElement(doc, 'plain'))).toBe('stylesheet');
      },
    },
  ],
  solutions: [
    {
      label: 'Compare the claim to the outcome',
      code: [
        "export function widthSource(tile: HTMLElement): 'inline' | 'stylesheet' {",
        '  const claimed = tile.style.width;',
        "  if (claimed === '') return 'stylesheet';",
        '',
        "  return getComputedStyle(tile).width === claimed ? 'inline' : 'stylesheet';",
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The cascade does not publish its reasoning. There is no API that answers "which declaration',
        'won" -- devtools shows you, but it computes that view privately. From script you hold',
        'exactly two facts, and this solution notices they are enough:',
        '',
        '- **What the inline declaration asks for**: `tile.style.width`, straight off the attribute.',
        '- **What actually happened**: `getComputedStyle(tile).width`, the settled result.',
        '',
        'If there is no inline claim, a rule is deciding by default. If there is one, compare it to',
        'the outcome. An inline declaration outranks every normal rule, so when the outcome differs',
        'from the claim, the inline value cannot be the winner -- something with more authority',
        '(here, an `!important` rule) must be deciding. Disagreement is proof of outranking.',
        '',
        'Both readings happen at call time, which is why the two moving-target tests pass without',
        'any effort: remove the `.sale` class and the outcome snaps back to the claim; add an inline',
        'width later and the claim exists now. Nothing is cached, so nothing goes stale.',
        '',
        'One honest limit: the comparison reads *values*, so if the outranking rule demanded the',
        "same 480px the inline attribute does, this function would answer 'inline' while devtools",
        'showed the rule winning. The answer would still be wrong for the right reason -- when two',
        'sources agree on the value, being wrong about the winner has no observable consequence',
        'until they disagree, at which point this function notices.',
      ].join('\n'),
      tradeoffs: [
        'Small, honest about what the platform exposes, and self-correcting as the document changes.',
        'For "is my inline style actually in charge" -- the debugging question this challenge is',
        'really about -- this is the tool.',
        '',
        'What it cannot do:',
        '',
        '- **Name the culprit.** It proves *that* the inline value lost, never *to which rule*. The',
        '  forensic solution exists for exactly that follow-up.',
        '- **Distinguish ties**, per the value-equality limit above.',
        '- **Width-specific nothing** -- but generalising it means threading the property name',
        '  through both reads, and remembering that only longhands compare cleanly.',
      ].join('\n'),
    },
    {
      label: 'Walk the stylesheets and find the outranking rule',
      code: [
        'function importantWidthRuleMatches(tile: HTMLElement): boolean {',
        '  for (const sheet of document.styleSheets) {',
        '    for (const rule of sheet.cssRules) {',
        '      if (!(rule instanceof CSSStyleRule)) continue;',
        '      if (!tile.matches(rule.selectorText)) continue;',
        "      if (rule.style.getPropertyPriority('width') === 'important') return true;",
        '    }',
        '  }',
        '  return false;',
        '}',
        '',
        "export function widthSource(tile: HTMLElement): 'inline' | 'stylesheet' {",
        "  if (tile.style.width === '') return 'stylesheet';",
        "  return importantWidthRuleMatches(tile) ? 'stylesheet' : 'inline';",
        '}',
        '',
      ].join('\n'),
      explanation: [
        'Devtools-in-code: instead of inferring the winner from the outcome, go and look at the',
        'contestants.',
        '',
        'An inline declaration loses only to `!important`, so the search has one question: does any',
        'rule that (a) currently matches this tile and (b) declares `width` with the important flag',
        'exist? Each test in the walk is an API worth knowing on its own:',
        '',
        '- `document.styleSheets` -- every sheet the document holds, one per style element.',
        '- `rule instanceof CSSStyleRule` -- sheets also hold `@media`, `@keyframes` and friends;',
        '  only style rules have a selector to match.',
        '- `tile.matches(rule.selectorText)` -- the selector is re-asked *now*, which is why the',
        '  class-removal test passes: after `.sale` is gone, the rule stops matching, the search',
        '  comes up empty, and the inline claim stands.',
        "- `rule.style.getPropertyPriority('width')` -- a rule's declaration block is a",
        '  `CSSStyleDeclaration` like any inline one, and the priority flag is readable per',
        '  property.',
        '',
        'Unlike the comparing solution, this one is immune to value coincidence -- it never looks at',
        'the values at all, only at authority.',
      ].join('\n'),
      tradeoffs: [
        'This is the answer that can *name the rule*, which makes it the seed of real tooling -- a',
        '"why is this element like this" inspector, a lint for `!important` creep. Build it when the',
        'follow-up question matters.',
        '',
        'Its costs are the costs of re-implementing a piece of the cascade:',
        '',
        "- **The walk shown is flat.** Rules nested in `@media` or `@supports` live in those rules'",
        '  own `cssRules` lists and are invisible to it -- and worse, a matching `@media` block',
        "  would need its condition *evaluated*, which is the cascade's job, not yours.",
        '- **It sees only `document.styleSheets`.** Constructed sheets adopted via',
        '  `adoptedStyleSheets` are deliberately absent from that list, and shadow trees keep their',
        '  own.',
        '- **Cross-origin sheets throw** on `cssRules` access in a real page; a robust version',
        '  wraps the read.',
        '- **It re-derives what the browser already knows.** Every capability above is a case the',
        '  comparing solution gets right for free, because the computed style already folded them',
        '  in. Forensics buys detail and pays in fidelity.',
      ].join('\n'),
    },
  ],
};
