import type { ChallengeContent } from '@/types/challenge';

export const queryBasics: ChallengeContent = {
  prompt: [
    'The menu below has three items. One of them has the id `target`.',
    '',
    'Add the class `found` to that element — **without disturbing the classes it already has**.',
  ].join('\n'),
  html: [
    '<ul id="menu">',
    '  <li class="item">Home</li>',
    '  <li class="item" id="target">Docs</li>',
    '  <li class="item">About</li>',
    '</ul>',
  ].join('\n'),
  starterCode: '// Add the class "found" to the element with id "target".\n',
  tests: [
    {
      name: 'the target element has the class "found"',
      run: ({ doc, expect }) => {
        expect(doc.getElementById('target')).toHaveClass('found');
      },
    },
    {
      name: 'exactly one element was marked',
      run: ({ doc, expect }) => {
        expect(doc.querySelectorAll('.found')).toHaveLength(1);
      },
    },
    {
      name: 'the original "item" class is preserved',
      run: ({ doc, expect }) => {
        expect(doc.getElementById('target')).toHaveClass('item');
      },
    },
  ],
  solutions: [
    {
      label: 'getElementById',
      code: ["const target = document.getElementById('target');", "target?.classList.add('found');"].join('\n'),
      explanation: [
        '`getElementById` is the most direct route to a unique element. It returns',
        '`HTMLElement | null`, so the optional chain is not defensive noise — it is the',
        'type system insisting you handle the case where the id is absent.',
        '',
        '`classList.add` appends to the existing token list. That is what keeps `item`',
        'intact, and it is the reason the third test exists.',
      ].join('\n'),
      tradeoffs: [
        'Fastest and clearest when you have an id. It is not scoped — it always searches the',
        'whole document, never a subtree — so it is unusable inside a component that must only',
        'look within itself. It also cannot express anything but an id.',
      ].join('\n'),
    },
    {
      label: 'querySelector',
      code: ["const target = document.querySelector('#target');", "target?.classList.add('found');"].join('\n'),
      explanation: [
        '`querySelector` takes any CSS selector and returns the first match. Using one API',
        'for ids, classes, attributes, and structural selectors keeps calling code uniform.',
      ].join('\n'),
      tradeoffs: [
        'More flexible and scopable — `container.querySelector(...)` searches only that subtree,',
        'which `getElementById` cannot do. Marginally slower for a plain id lookup, though never',
        'enough to matter outside a hot loop. The real cost is that selector typos fail silently',
        'as `null` rather than as an error.',
      ].join('\n'),
    },
  ],
};
