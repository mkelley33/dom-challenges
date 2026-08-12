import type { ChallengeContent } from '@/types/challenge';

import { computedValue, requireElement } from './support';

type Restore = (card: HTMLElement) => void;

/** The promo card's inline declarations as the markup ships them, for the "untouched" test. */
const PROMO_STYLE = 'width: 320px';

export const inlineWins: ChallengeContent = {
  prompt: [
    'An experiment framework wrote `style="width: 480px"` onto the hero card months ago. The',
    'experiment is over, the stylesheet says `.card { width: 240px }`, and yet the hero is still',
    '480px wide — no rule you write will change it, however specific, because an inline declaration',
    'outranks **every** normal rule in every stylesheet.',
    '',
    'Export one function:',
    '',
    '- `restore(card)` — give control of the card’s width back to the stylesheets.',
    '',
    'Two constraints. The card’s other inline declarations (`--accent`, `border-left-width`) are',
    'load-bearing and must survive. And “back to the stylesheets” means exactly that: after',
    '`restore`, a rule that targets the card must be able to size it again.',
  ].join('\n'),
  html: [
    '<style>',
    '  .card { width: 240px; }',
    '</style>',
    '<div id="deck">',
    '  <div class="card" id="hero" style="width: 480px; --accent: coral; border-left-width: 3px">Hero</div>',
    `  <div class="card" id="promo" style="${PROMO_STYLE}">Promo</div>`,
    '</div>',
  ].join('\n'),
  starterCode: [
    'export function restore(card: HTMLElement): void {',
    '  // Surely a more specific rule wins? (It will not: specificity only ranks selectors,',
    '  // and the style attribute is not a selector.)',
    "  const sheet = document.createElement('style');",
    '  sheet.textContent = `#${card.id} { width: 240px; }`;',
    '  document.head.append(sheet);',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'the stylesheet width applies again',
      run: ({ doc, win, fn, expect }) => {
        const hero = requireElement(doc, 'hero');
        fn<Restore>('restore')(hero);

        expect(computedValue(win, hero, 'width')).toBe('240px');
      },
    },
    {
      name: 'the declarations you were not asked about survive',
      run: ({ doc, fn, expect }) => {
        const hero = requireElement(doc, 'hero');
        fn<Restore>('restore')(hero);

        // Read from the inline declaration itself: these two live in the style attribute and must
        // still be there, which rules out clearing the attribute and rebuilding "what mattered".
        expect(hero.style.getPropertyValue('--accent')).toBe('coral');
        expect(hero.style.getPropertyValue('border-left-width')).toBe('3px');
      },
    },
    {
      name: 'control really returns to the stylesheet',
      run: ({ doc, win, fn, expect }) => {
        const hero = requireElement(doc, 'hero');
        fn<Restore>('restore')(hero);

        // A new rule arrives after the fact and asks for the card. If restore() answered the 480px
        // with a bigger hammer -- an !important rule of its own -- this ordinary rule loses and the
        // card is right back where it started: styled by something no stylesheet can reach.
        const roomy = doc.createElement('style');
        roomy.textContent = '.card.roomy { width: 360px; }';
        doc.body.append(roomy);
        hero.classList.add('roomy');

        expect(computedValue(win, hero, 'width')).toBe('360px');
      },
    },
    {
      name: 'the other card keeps its own inline width',
      run: ({ doc, win, fn, expect }) => {
        fn<Restore>('restore')(requireElement(doc, 'hero'));

        const promo = requireElement(doc, 'promo');
        expect(computedValue(win, promo, 'width')).toBe('320px');
        // Compared as the raw attribute text: until something writes through the CSSOM the parser's
        // string survives verbatim, so this fails for any answer that swept every card.
        expect(promo.getAttribute('style')).toBe(PROMO_STYLE);
      },
    },
  ],
  solutions: [
    {
      label: 'Remove the one declaration',
      code: [
        'export function restore(card: HTMLElement): void {',
        "  card.style.removeProperty('width');",
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The cascade is a ranking, and it helps to know the actual ladder. From weakest to',
        'strongest: browser defaults, then normal rules in stylesheets (ranked among themselves by',
        'specificity, then source order), then the inline `style` attribute, then `!important`',
        'declarations -- which invert the ladder rather than extend it.',
        '',
        'The starter loses because it fights on the wrong rung. `#hero` is the most specific',
        'selector there is, and it does not matter: **specificity only ranks selectors against other',
        'selectors.** The style attribute is not a selector; it sits above the whole selector',
        'contest. No quantity of ids can reach it.',
        '',
        'Which leaves two honest exits, one down and one up:',
        '',
        '- **Down: delete the inline declaration.** With `width` withdrawn from the style attribute,',
        '  the contest among the rules decides again -- `.card { width: 240px }` today, `.card.roomy`',
        '  tomorrow. This is what "restore" means, and it is why the third test passes: the fix does',
        '  not pick a winner, it reopens the game.',
        '- **Up: out-shout it with `!important`.** A rule like `#hero { width: 240px !important }`',
        '  does move the card to 240px -- and fails the third test, because it is not a restoration,',
        '  it is a new occupation. The ordinary `.card.roomy` rule that arrives later now loses to',
        "  *your* declaration, and the next person's only move is a second `!important`. That",
        '  arms race is how legacy stylesheets are made.',
        '',
        '`removeProperty("width")` and `card.style.width = ""` are the same edit spelled through the',
        'two halves of the API -- assigning the empty string removes the declaration rather than',
        'setting an empty one. Both leave every other declaration in the attribute alone, which is',
        'what the second test is watching.',
      ].join('\n'),
      tradeoffs: [
        'For "a stale inline value is blocking the stylesheet", targeted removal is simply correct,',
        'and the alternatives are all worse: `removeAttribute("style")` throws away declarations',
        'other code depends on, and `!important` converts a data problem into a political one.',
        '',
        'What to know before generalising it:',
        '',
        '- **It assumes the declaration is stale.** If something wrote that width on purpose and',
        '  will write it again, removal is a tug-of-war with whatever wrote it; the real fix is',
        '  upstream, in the thing doing the writing.',
        '- **Removal is per property.** Clearing a whole abandoned experiment means knowing every',
        '  property it wrote -- which is the enumeration problem the other solution takes on',
        '  directly.',
      ].join('\n'),
    },
    {
      label: 'Rebuild the attribute without the width',
      code: [
        'export function restore(card: HTMLElement): void {',
        '  const names = Array.from({ length: card.style.length }, (_, i) => card.style.item(i));',
        '  const keep = names',
        "    .filter((name) => name !== 'width')",
        '    .map((name) => ({',
        '      name,',
        '      value: card.style.getPropertyValue(name),',
        '      priority: card.style.getPropertyPriority(name),',
        '    }));',
        '',
        "  card.style.cssText = '';",
        '  for (const declaration of keep) {',
        '    card.style.setProperty(declaration.name, declaration.value, declaration.priority);',
        '  }',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The same outcome reached by treating `card.style` as what it is: a list.',
        '',
        '`CSSStyleDeclaration` is an indexed collection -- `length` counts the declarations,',
        '`item(i)` names them in order, and per name `getPropertyValue` and `getPropertyPriority`',
        'recover the full declaration, `!important` flag included. That is everything needed to take',
        'an inventory, drop the one entry, wipe the slate with `cssText = ""`, and write the',
        'survivors back with `setProperty`.',
        '',
        'Carrying `priority` through matters: `setProperty(name, value)` writes a *normal*',
        'declaration, so a rebuild that forgets the third argument silently demotes any inline',
        '`!important` it re-writes -- the kind of bug that changes nothing today and something next',
        'quarter.',
        '',
        'One honesty note about the enumeration: in a browser you could write',
        '`for (const name of card.style)` -- the declaration is iterable. It is spelled through',
        '`length` and `item` here because that is the lowest common denominator across engines, and',
        'because it makes the "this is an indexed list" point explicit.',
      ].join('\n'),
      tradeoffs: [
        'As a fix for one known property this is strictly more machinery than `removeProperty`, and',
        'you should not ship it for that. It earns its keep when the job is bigger than one name:',
        '',
        '- **Policy removals.** "Drop every layout property but keep the custom properties" is a',
        '  filter over the inventory -- unwritable as a fixed list of `removeProperty` calls, natural',
        '  here.',
        '- **Auditing.** The inventory is also how you *look at* an inline style: log it, diff it,',
        '  decide. Debugging "what did the experiment framework leave on this element" starts with',
        '  exactly this loop.',
        '',
        'Its cost beyond length: the wipe-and-rewrite briefly holds the element with no inline style',
        'at all, and it re-serialises the attribute in normalised order -- anything diffing markup',
        'sees churn `removeProperty` would not cause.',
      ].join('\n'),
    },
  ],
};
