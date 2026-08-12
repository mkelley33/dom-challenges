import type { ChallengeContent } from '@/types/challenge';

import { computedValue, requireElement } from './support';

type SetSelected = (row: HTMLElement, on: boolean) => void;

export const stateInAClass: ChallengeContent = {
  prompt: [
    'An inbox. A selected row shows a thicker accent border — the stylesheet already says so, in the',
    '`.row.selected` rule. Some rows are also `pinned` (a heavier border of their own) or `compact`',
    '(tighter padding), and other code relies on those classes staying put.',
    '',
    'Export one function:',
    '',
    '- `setSelected(row, on)` — put the row into, or out of, the selected state.',
    '',
    'Two things make this harder than it looks. Calling it with the same answer twice must not flip',
    'the row back. And deselecting must restore **whatever that row had before** — which is not the',
    'same value for every row, so writing the "normal" border back by hand is already a bug.',
  ].join('\n'),
  html: [
    '<style>',
    '  .row { border-left-style: solid; border-left-width: 2px; padding-left: 8px; }',
    '  .row.pinned { border-left-width: 4px; }',
    '  .row.compact { padding-left: 4px; }',
    '  .row.selected { border-left-width: 6px; }',
    '</style>',
    '<ul id="inbox">',
    '  <li class="row" id="first">Quarterly numbers</li>',
    '  <li class="row pinned" id="pinned">Launch checklist</li>',
    '  <li class="row compact starred" id="compact">Standup notes</li>',
    '</ul>',
  ].join('\n'),
  starterCode: [
    'export function setSelected(row: HTMLElement, on: boolean): void {',
    "  row.className = on ? 'row selected' : 'row';",
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'selecting a row thickens its accent border',
      run: ({ doc, win, fn, expect }) => {
        const first = requireElement(doc, 'first');
        fn<SetSelected>('setSelected')(first, true);

        expect(computedValue(win, first, 'border-left-width')).toBe('6px');
        expect(computedValue(win, first, 'padding-left')).toBe('8px');
      },
    },
    {
      name: 'selecting twice is still selected',
      run: ({ doc, win, fn, expect }) => {
        // `classList.toggle(name)` with no second argument flips, so an answer written that way is
        // correct until something repeats itself -- a re-render, a double click, a retry.
        const first = requireElement(doc, 'first');
        const setSelected = fn<SetSelected>('setSelected');
        setSelected(first, true);
        setSelected(first, true);

        expect(computedValue(win, first, 'border-left-width')).toBe('6px');
      },
    },
    {
      name: 'deselecting restores what the row had, not factory settings',
      run: ({ doc, win, fn, expect }) => {
        // The pinned row's unselected border is 4px, not the base 2px. An answer that "restores" by
        // writing the normal value back has no way to know that -- only the cascade does.
        const pinned = requireElement(doc, 'pinned');
        const setSelected = fn<SetSelected>('setSelected');
        setSelected(pinned, true);
        expect(computedValue(win, pinned, 'border-left-width')).toBe('6px');

        setSelected(pinned, false);
        expect(computedValue(win, pinned, 'border-left-width')).toBe('4px');
      },
    },
    {
      name: 'the row keeps every class it arrived with',
      run: ({ doc, win, fn, expect }) => {
        const compact = requireElement(doc, 'compact');
        const setSelected = fn<SetSelected>('setSelected');
        setSelected(compact, true);

        // `compact` still does its job while the row is selected...
        expect(computedValue(win, compact, 'padding-left')).toBe('4px');

        setSelected(compact, false);
        // ...and `starred`, which no stylesheet even mentions, survives the round trip. Classes are
        // shared state; a function that owns one of them may not rewrite the rest.
        expect(compact).toHaveClass('starred');
        expect(compact).toHaveClass('compact');
        expect(computedValue(win, compact, 'padding-left')).toBe('4px');
      },
    },
    {
      name: 'only the row you passed changes',
      run: ({ doc, win, fn, expect }) => {
        fn<SetSelected>('setSelected')(requireElement(doc, 'first'), true);

        expect(computedValue(win, requireElement(doc, 'pinned'), 'border-left-width')).toBe('4px');
        expect(computedValue(win, requireElement(doc, 'compact'), 'border-left-width')).toBe('2px');
      },
    },
  ],
  solutions: [
    {
      label: 'Toggle the class and let the stylesheet answer',
      code: [
        'export function setSelected(row: HTMLElement, on: boolean): void {',
        "  row.classList.toggle('selected', on);",
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The stylesheet already knows what selected looks like -- `.row.selected` was written,',
        "reviewed and shipped before this function was ever called. So the function's whole job is",
        'one bit: does this row match that rule or not.',
        '',
        '`toggle(name, force)` with the second argument is the exact verb for "put this class into',
        'this state". Without `force` it flips, and flipping is only correct if every call is news --',
        'the second test is the one that punishes that assumption. With `force` the call is',
        'idempotent: selected twice is selected.',
        '',
        'Everything else in the tests falls out for free, and *why* it falls out is the lesson:',
        '',
        "- **Deselecting restores the pinned row's 4px** because this code never knew about the 4px.",
        '  Removing the class does not write an answer, it re-asks the question, and the cascade',
        '  answers per row: `.row.pinned` for one, plain `.row` for another.',
        '- **`starred` and `compact` survive** because `toggle` edits one token. The starter rewrites',
        '  the whole `className` string, which is why it destroys classes it never heard of.',
        '- **If a designer later adds a background to `.row.selected`**, this function is already',
        '  correct. State code that describes *which state*, rather than *what the state looks like*,',
        '  does not need to change when the look does.',
      ].join('\n'),
      tradeoffs: [
        'This is the default, and it should win whenever the state is known ahead of time -- which is',
        'nearly always. Selected, open, disabled, dragging, invalid: enumerable states belong in the',
        'stylesheet as rules, with JavaScript flipping membership.',
        '',
        'Its honest limits:',
        '',
        '- **The stylesheet must know the state.** A value that is genuinely data -- a width in',
        '  pixels, a per-user colour -- has no rule to toggle. That is where an inline custom',
        '  property takes over (the density-token challenge is that pattern).',
        '- **The class name is a contract.** `selected` is now shared between this function, the',
        '  stylesheet, and anything else that queries it; renaming it is a cross-file change. That',
        '  is not a flaw so much as a fact -- but inline styles have no such contract, which is',
        '  occasionally why people reach for them.',
      ].join('\n'),
    },
    {
      label: 'Write the border inline, and remove it to restore',
      code: [
        'export function setSelected(row: HTMLElement, on: boolean): void {',
        '  if (on) {',
        "    row.style.borderLeftWidth = '6px';",
        '  } else {',
        "    row.style.removeProperty('border-left-width');",
        '  }',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The same behaviour built by hand, and it passes every test for one precise reason: the off',
        'branch **removes** the declaration instead of writing a value.',
        '',
        '`removeProperty` does not mean "set this to nothing" -- it means "withdraw my opinion". With',
        "the inline declaration gone, the cascade's next-best answer takes over again, and that",
        'answer is per row: 4px for the pinned row, 2px for the rest. An off branch written as',
        "`row.style.borderLeftWidth = '2px'` fails the third test, and it fails it in the way that",
        'matters: it works on every row you tested by hand and breaks on the one variant you forgot.',
        '',
        'The on branch is idempotent by nature -- writing the same declaration twice is one',
        'declaration -- so the second test passes without any care taken. And because only the',
        "`border-left-width` declaration is ever touched, the row's classes are never in danger.",
      ].join('\n'),
      tradeoffs: [
        'This version works, and knowing exactly why it works is worth having. It is still the weaker',
        'shape for state, on three counts:',
        '',
        '- **The look is now in two places.** The stylesheet says selected means a 6px border; so',
        '  does this function, in its own copy. When design changes one, the other lies.',
        '- **It scales per property, not per state.** The day selected also means a background and a',
        '  font weight, this function grows an on-line and an off-line for each -- and the off lines',
        '  must enumerate exactly what the on lines set, forever.',
        '- **While selected, the row is armoured against its own stylesheet.** The inline declaration',
        '  outranks every rule, so a `.row.urgent` that wants an 8px border loses silently.',
        '',
        'Where it genuinely wins: when the value is data (a computed width, a user colour) there is',
        'no class to toggle, and inline-plus-`removeProperty` -- ideally through one custom property',
        '-- is the right tool.',
      ].join('\n'),
    },
  ],
};
