import type { ChallengeContent } from '@/types/challenge';

import { computedValue, requireElement } from './support';

type SetRhythm = (entry: HTMLElement, px: number) => void;

export const shorthandReset: ChallengeContent = {
  prompt: [
    'A comment feed. Replies are indented by the stylesheet — `.entry.indented { margin-left: 24px }`',
    '— and a density control lets the reader tune the **vertical** spacing between entries.',
    '',
    'Export one function:',
    '',
    '- `setRhythm(entry, px)` — set that entry’s top and bottom margins to `px` pixels, touching',
    '  nothing horizontal.',
    '',
    'The starter writes `entry.style.margin = `${px}px 0px``, and the indent vanishes. Not because',
    'anything removed it: `margin` is a **shorthand**, and a shorthand sets every longhand it covers',
    '— the ones you wrote and the ones you didn’t. That `0px` became a real inline `margin-left`,',
    'and an inline declaration beats the `.indented` rule.',
  ].join('\n'),
  html: [
    '<style>',
    '  .entry { margin-top: 4px; margin-bottom: 4px; }',
    '  .entry.indented { margin-left: 24px; }',
    '</style>',
    '<ul id="feed">',
    '  <li class="entry" id="post">Original post</li>',
    '  <li class="entry indented" id="reply">A reply, indented under it</li>',
    '</ul>',
  ].join('\n'),
  starterCode: [
    'export function setRhythm(entry: HTMLElement, px: number): void {',
    '  entry.style.margin = `${px}px 0px`;',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'the vertical margins move',
      run: ({ doc, win, fn, expect }) => {
        const post = requireElement(doc, 'post');
        fn<SetRhythm>('setRhythm')(post, 10);

        expect(computedValue(win, post, 'margin-top')).toBe('10px');
        expect(computedValue(win, post, 'margin-bottom')).toBe('10px');
      },
    },
    {
      name: 'the indent is not collateral damage',
      run: ({ doc, win, fn, expect }) => {
        const reply = requireElement(doc, 'reply');
        fn<SetRhythm>('setRhythm')(reply, 10);

        expect(computedValue(win, reply, 'margin-top')).toBe('10px');
        // The stylesheet's indent must still win. The starter fails here with 0px: its shorthand
        // quietly wrote an inline margin-left, and inline beats the `.indented` rule.
        expect(computedValue(win, reply, 'margin-left')).toBe('24px');
      },
    },
    {
      name: 'calling again replaces the rhythm, it does not stack',
      run: ({ doc, win, fn, expect }) => {
        const post = requireElement(doc, 'post');
        const setRhythm = fn<SetRhythm>('setRhythm');
        setRhythm(post, 10);
        setRhythm(post, 2);

        expect(computedValue(win, post, 'margin-top')).toBe('2px');
        expect(computedValue(win, post, 'margin-bottom')).toBe('2px');
      },
    },
    {
      name: 'nothing horizontal is written inline, even as a copy of the right value',
      run: ({ doc, fn, expect }) => {
        // A four-value shorthand that re-states the indent -- `10px 0 10px 24px` -- reads correctly
        // today and is a different bug: the indent is now frozen inline, so the stylesheet can never
        // change it again. The inline declaration itself is the evidence, so that is what is read.
        const reply = requireElement(doc, 'reply');
        fn<SetRhythm>('setRhythm')(reply, 10);

        expect(reply.style.marginLeft).toBe('');
        expect(reply.style.marginRight).toBe('');
      },
    },
  ],
  solutions: [
    {
      label: 'Write the two longhands',
      code: [
        'export function setRhythm(entry: HTMLElement, px: number): void {',
        '  entry.style.marginTop = `${px}px`;',
        '  entry.style.marginBottom = `${px}px`;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        '`margin` is not a property with four values -- it is four properties wearing one name.',
        'Writing the shorthand always produces four longhand declarations: the ones you spelled out,',
        'and the ones you left implicit, which are filled in as if you had written their reset',
        'values. `margin: 10px 0px` *is* `margin-top: 10px; margin-right: 0px; margin-bottom: 10px;',
        'margin-left: 0px`, no more and no less, and you can watch the CSSOM say so: after the',
        'starter runs, `entry.style.length` is 4, not 1.',
        '',
        'That is not a design flaw. "This shorthand states the whole story" is what makes',
        '`margin: 0` a reliable reset -- it would be useless if it only changed the sides you',
        'happened to mention. The flaw is in reaching for a whole-story tool to tell half a story.',
        '',
        'The longhands are the half-story tool. Each one is a single declaration; the other two',
        'margins are simply never mentioned, so the `.indented` rule keeps supplying `margin-left`',
        'exactly as before. This is the same shape as the `class` lesson from the attributes',
        'category -- `className` replaces the whole list where `classList` edits one token -- played',
        'out one property family at a time.',
        '',
        'Worth knowing as you leave: this trap is not margin-specific. `background`, `border`,',
        '`font`, `flex`, `grid`, `animation` are all shorthands, and some reset longhands people',
        'rarely realise they cover -- `background: red` resets `background-image`, and `font: 16px',
        'sans-serif` resets `line-height`. The rule of thumb: write shorthands when you mean the',
        'whole story, longhands when you mean a sentence of it.',
      ].join('\n'),
      tradeoffs: [
        'Two longhand writes is the direct answer at this scale, and the right default.',
        '',
        'What it costs, and when to reach past it:',
        '',
        '- **It is per property, per element, forever.** Every new "rhythm also affects X" becomes',
        '  another write here and another removal in whatever undoes it. The other solution moves',
        '  that growth into the stylesheet.',
        '- **In production CSS you would likely write `margin-block`** -- the logical shorthand that',
        '  covers exactly the two flow-relative margins, resetting nothing horizontal, and following',
        "  the writing mode instead of assuming top-and-bottom. It is the platform's own answer to",
        "  this challenge; it is spelled as two physical longhands here only because this suite's",
        '  engine does not compute logical properties.',
      ].join('\n'),
    },
    {
      label: 'One custom property, spent by a rule',
      code: [
        "const layer = document.createElement('style');",
        'layer.textContent = [',
        "  '.entry.rhythmed {',",
        "  '  margin-top: var(--rhythm);',",
        "  '  margin-bottom: var(--rhythm);',",
        "  '}',",
        "].join('\\n');",
        'document.head.append(layer);',
        '',
        'export function setRhythm(entry: HTMLElement, px: number): void {',
        "  entry.classList.add('rhythmed');",
        "  entry.style.setProperty('--rhythm', `${px}px`);",
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The density-token pattern, pointed at this problem: the *value* travels inline as one',
        'custom property, and the decision about which longhands spend it is made once, in CSS.',
        '',
        'The module installs a single rule at load time -- `.entry.rhythmed` sets the two vertical',
        'longhands from `var(--rhythm)` -- and after that, `setRhythm` never mentions a margin',
        'again. It marks the entry and writes one number. Both shorthand traps disappear',
        'structurally: nothing horizontal can be reset, because nothing horizontal is ever written,',
        'inline or otherwise.',
        '',
        'The specificity is worth checking rather than assuming: `.entry.rhythmed` (two classes)',
        'outranks `.entry` (one), so the rule wins the vertical margins regardless of where the',
        'layer sheet sits in the document. The `.indented` rule is never in the fight -- it sets a',
        'different longhand.',
      ].join('\n'),
      tradeoffs: [
        'For two longhands on one element this is plainly more machinery: a stylesheet layer, a',
        'class contract, and a custom property, versus two assignments. Ship the longhands.',
        '',
        'The shape starts winning as soon as "rhythm" stops being two margins:',
        '',
        '- When rhythm grows to five properties, the rule grows and `setRhythm` does not.',
        '- When design wants the rhythm also felt by `.entry .avatar`, that is another `var(--rhythm)`',
        '  in CSS, not another element walk in JavaScript.',
        '- The JS-to-CSS interface narrows to one documented name, which is the property that makes',
        '  design systems out of scripts.',
        '',
        'Its own trap, inherited from everything rule-based: the layer is global state. Two modules',
        'both installing `.entry.rhythmed` rules will fight by source order, and the loser will look',
        'exactly like a cascade mystery.',
      ].join('\n'),
    },
  ],
};
