import type { ChallengeContent } from '@/types/challenge';

import { computedValue, requireElement } from './support';

type ReadWidth = (el: HTMLElement) => string;
type MatchWidth = (copy: HTMLElement, original: HTMLElement) => void;

export const computedNotInline: ChallengeContent = {
  prompt: [
    'A rail of cards. The sample card gets its width from the stylesheet; the draft card is still at',
    'the base width and needs to match it.',
    '',
    'Export two functions:',
    '',
    '- `readWidth(el)` — the width the element actually has, as a string like `"120px"`, wherever it',
    '  was set.',
    '- `matchWidth(copy, original)` — make `copy` as wide as `original` actually is.',
    '',
    'The starter reads `el.style.width`, and for the sample card that is the empty string — not',
    'because the card has no width, but because `element.style` is only a parsed view of the `style`',
    '**attribute**, and nothing ever wrote one. The width lives in a stylesheet rule, and the only',
    'object that knows what the stylesheet worked out is the one `getComputedStyle` returns.',
  ].join('\n'),
  html: [
    '<style>',
    '  .card { width: 40px; }',
    '  .wide { width: 120px; }',
    '  .narrow { width: 80px; }',
    '</style>',
    '<div id="rail">',
    '  <div class="card wide" id="sample">Sample</div>',
    '  <div class="card ghost" id="draft">Draft</div>',
    '</div>',
  ].join('\n'),
  starterCode: [
    'export function readWidth(el: HTMLElement): string {',
    '  return el.style.width;',
    '}',
    '',
    'export function matchWidth(copy: HTMLElement, original: HTMLElement): void {',
    '  copy.style.width = original.style.width;',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'readWidth reports the width the stylesheet produced, not the inline attribute',
      run: ({ doc, fn, expect }) => {
        const readWidth = fn<ReadWidth>('readWidth');
        const sample = requireElement(doc, 'sample');

        // No inline declaration exists on this card, so `style.width` is the empty string. The
        // width is real all the same -- it just lives in the `.wide` rule, on the far side of the
        // cascade.
        expect(sample.style.width).toBe('');
        expect(readWidth(sample)).toBe('120px');
      },
    },
    {
      name: 'readWidth sees an inline width too',
      run: ({ doc, fn, expect }) => {
        // The computed style is the end of the cascade, so it does not matter which layer supplied
        // the value -- an inline declaration comes back just as readable as a rule's.
        const draft = requireElement(doc, 'draft');
        draft.style.width = '64px';
        expect(fn<ReadWidth>('readWidth')(draft)).toBe('64px');
      },
    },
    {
      name: 'matching copies the actual width and leaves the sample alone',
      run: ({ doc, win, fn, expect }) => {
        const sample = requireElement(doc, 'sample');
        const draft = requireElement(doc, 'draft');
        fn<MatchWidth>('matchWidth')(draft, sample);

        expect(computedValue(win, draft, 'width')).toBe('120px');
        // The sample was read, never written: no style attribute appeared on it. `toBe(null)`
        // rather than `toBeNull()` so a failure prints what was written next to one legible `null`.
        expect(sample.getAttribute('style')).toBe(null);
      },
    },
    {
      name: 'matching follows the sample as it is now, not as the markup shipped it',
      run: ({ doc, win, fn, expect }) => {
        // The test moves the sample first, so an answer that hard-codes "120px" -- or remembers
        // anything from before this call -- has the rug pulled out. `.narrow` is written after
        // `.wide` in the stylesheet, and between two rules of equal specificity the later one wins.
        const sample = requireElement(doc, 'sample');
        sample.classList.add('narrow');

        const draft = requireElement(doc, 'draft');
        fn<MatchWidth>('matchWidth')(draft, sample);
        expect(computedValue(win, draft, 'width')).toBe('80px');
      },
    },
    {
      name: 'the draft keeps its own classes',
      run: ({ doc, fn, expect }) => {
        const draft = requireElement(doc, 'draft');
        fn<MatchWidth>('matchWidth')(draft, requireElement(doc, 'sample'));

        // Whatever route the answer takes, it may not cost the draft its identity: `ghost` was on
        // the draft before the call and must still be there after it.
        expect(draft).toHaveClass('ghost');
        expect(draft).toHaveClass('card');
      },
    },
  ],
  solutions: [
    {
      label: 'Read the computed style, write the inline one',
      code: [
        'export function readWidth(el: HTMLElement): string {',
        '  return getComputedStyle(el).width;',
        '}',
        '',
        'export function matchWidth(copy: HTMLElement, original: HTMLElement): void {',
        '  copy.style.width = readWidth(original);',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'There are two objects here that both answer to the name "style", and the whole challenge is',
        'telling them apart:',
        '',
        '- **`element.style`** is the `style` *attribute*, parsed. It knows only what was written',
        '  inline on that element. For the sample card that is nothing, so every read answers `""` --',
        '  which is the worst kind of wrong answer, because nothing errors and the code looks done.',
        "- **`getComputedStyle(element)`** is the cascade's verdict: every stylesheet rule, the inline",
        '  attribute, inheritance and the defaults, fought out and settled, one value per property.',
        '',
        'The asymmetry is the lesson. You *read* from the computed style and *write* to the inline',
        'one -- there is no `setComputedStyle`, because the computed style is not a place, it is a',
        'result. Writing means adding a cause somewhere (an inline declaration, a class, a rule) and',
        'letting the cascade produce a new result.',
        '',
        'Two properties of the returned object worth knowing before they surprise you:',
        '',
        "- **It is live.** Hold it in a variable, change the element's class, and the same object",
        '  reports the new value. A `string` you copied out of it is the only real snapshot.',
        '- **It is read-only.** Assigning to it throws; it is a view, not a control panel.',
      ].join('\n'),
      tradeoffs: [
        'Copying the value is the direct answer, and the right one when the copy should be',
        'independent from now on -- a measurement taken, applied, done.',
        '',
        'What it costs:',
        '',
        '- **The copy is frozen.** The fourth test only passes because the copy is taken *after* the',
        '  sample changed; change the sample again afterwards and the draft stays where it was. A',
        '  copied value has no memory of where it came from.',
        '- **The value now lives inline**, which is the strongest position in the cascade short of',
        '  `!important`. Every stylesheet rule that later tries to size the draft loses to this one',
        '  frozen number -- a cost that comes due much later, in a debugging session about "why does',
        '  this card ignore my CSS".',
        '',
        'The other solution avoids both costs by copying the *cause* instead of the *result*, at the',
        'price of only working when the cause is a class.',
      ].join('\n'),
    },
    {
      label: 'Share the class instead of copying the value',
      code: [
        'export function readWidth(el: HTMLElement): string {',
        '  return getComputedStyle(el).width;',
        '}',
        '',
        'export function matchWidth(copy: HTMLElement, original: HTMLElement): void {',
        '  copy.classList.add(...original.classList);',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'Instead of asking "what width did the cascade give the sample" and carrying the number over,',
        'this version gives the draft the same *inputs* the sample has and lets the cascade run',
        'again. The width never appears in the JavaScript at all.',
        '',
        '`classList.add(...original.classList)` adds every class the sample has to the classes the',
        'draft already has. `add` is the important verb: assigning `copy.className =',
        "original.className` would match the width too, but it *replaces* the draft's class list,",
        'and the fifth test -- the draft still being a `ghost` afterwards -- is exactly what that',
        'destroys. A token list can be merged; a string can only be overwritten.',
        '',
        'Because the draft now matches `.wide` (and, in the fourth test, `.narrow`) itself, it does',
        'not merely have the same width -- it has the same *reason* for its width. If the stylesheet',
        'changes what `.wide` means, both cards follow.',
      ].join('\n'),
      tradeoffs: [
        'Copying causes is the more durable link, and it is the answer that scales: a theme, a',
        'density, a breakpoint variant are all "make this element match that rule", not "make this',
        'element match that number".',
        '',
        'What it costs:',
        '',
        "- **It copies every class**, not the one that matters. The draft gains the sample's whole",
        '  wardrobe, including classes with meanings this function has never heard of -- event hooks,',
        '  analytics markers, `wide` *and* `narrow`. Sharing more than you meant to share is this',
        "  solution's characteristic bug, and nothing here fails when it happens.",
        '- **It only works when the value comes from a class.** Hand it a sample whose width is a',
        '  genuinely per-element inline style and there is nothing to copy -- which is why the value',
        '  copy is the general tool and this is the precise one.',
      ].join('\n'),
    },
  ],
};
