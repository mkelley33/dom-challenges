import type { ChallengeContent } from '@/types/challenge';

import { requireElement } from './support';

type ClearDone = (list: HTMLElement) => number;

function rowIds(list: HTMLElement): string[] {
  return [...list.children].map((row) => row.id);
}

export const removeWhileIterating: ChallengeContent = {
  prompt: [
    'Five rows, three of them marked `done` — and two of those three are next to each other, which is',
    'the detail that matters.',
    '',
    'Export `clearDone(list)` that removes every `.done` row from the list and returns how many it',
    'removed. The rows that stay must be the same elements they were.',
    '',
    'The starter is the loop everybody writes. Run it before you change it: it removes two of the',
    'three, reports two, and leaves one `.done` row sitting in the list — with no error anywhere.',
    'Work out which one survives and why before you fix it.',
  ].join('\n'),
  html: [
    '<ul id="list">',
    '  <li class="row" id="r1">Alpha</li>',
    '  <li class="row done" id="r2">Beta</li>',
    '  <li class="row done" id="r3">Gamma</li>',
    '  <li class="row" id="r4">Delta</li>',
    '  <li class="row done" id="r5">Epsilon</li>',
    '</ul>',
  ].join('\n'),
  starterCode: [
    'export function clearDone(list: HTMLElement): number {',
    '  let removed = 0;',
    '',
    '  for (const row of list.children) {',
    "    if (row.classList.contains('done')) {",
    '      row.remove();',
    '      removed += 1;',
    '    }',
    '  }',
    '',
    '  return removed;',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'every done row is gone, and only those',
      run: ({ doc, fn, expect }) => {
        const list = requireElement(doc, 'list');
        fn<ClearDone>('clearDone')(list);

        // `#r3` is the one that survives the obvious loop. Removing `#r2` shifts every later row
        // down one index, so index 1 now holds `#r3` -- and the loop has already moved on to index 2.
        expect(list.querySelectorAll('.done')).toHaveLength(0);
        expect(rowIds(list)).toEqual(['r1', 'r4']);
      },
    },
    {
      name: 'it reports how many rows it removed',
      run: ({ doc, fn, expect }) => {
        expect(fn<ClearDone>('clearDone')(requireElement(doc, 'list'))).toBe(3);
      },
    },
    {
      name: 'the rows that stay are the same elements',
      run: ({ doc, fn, expect }) => {
        const list = requireElement(doc, 'list');
        const first = requireElement(doc, 'r1');
        const fourth = requireElement(doc, 'r4');
        fn<ClearDone>('clearDone')(list);

        // Rebuilding the list from a filtered string gets the right ids and the wrong nodes.
        expect(first.parentElement).toBe(list);
        expect(list.children[0]).toBe(first);
        expect(list.children[1]).toBe(fourth);
      },
    },
    {
      name: 'a second call finds nothing to remove and reports zero',
      run: ({ doc, fn, expect }) => {
        const list = requireElement(doc, 'list');
        const clearDone = fn<ClearDone>('clearDone');

        clearDone(list);

        expect(clearDone(list)).toBe(0);
        expect(rowIds(list)).toEqual(['r1', 'r4']);
      },
    },
    {
      name: 'it reads the list as it stands rather than a fixed answer',
      run: ({ doc, fn, expect }) => {
        const list = requireElement(doc, 'list');
        // Four in a row are now done, three of them adjacent -- a different shape from the markup, so
        // nothing tuned to the original arrangement survives this.
        requireElement(doc, 'r1').classList.add('done');

        expect(fn<ClearDone>('clearDone')(list)).toBe(4);
        expect(rowIds(list)).toEqual(['r4']);
      },
    },
  ],
  solutions: [
    {
      label: 'Take a static snapshot first, then remove',
      code: [
        'export function clearDone(list: HTMLElement): number {',
        "  const done = list.querySelectorAll('.done');",
        '',
        '  for (const row of done) row.remove();',
        '',
        '  return done.length;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        '`list.children` is an `HTMLCollection`, and an `HTMLCollection` is not an array of the elements',
        'that matched. It is a **standing query**: every read of `length`, and every index, re-consults',
        'the document as it is at that instant.',
        '',
        'So the obvious loop is walking a list that changes underneath it. Removing `#r2` at index 1',
        'takes it out of the collection immediately — `#r3` becomes index 1, `#r4` becomes index 2 —',
        'and the loop’s next step is index 2. `#r3` is never visited. It is skipped, not failed: no',
        'error, no warning, and a count of two that is internally consistent with everything the',
        'function saw. That is why the markup puts two done rows next to each other; with them apart,',
        'the same bug produces the right answer and waits.',
        '',
        '`querySelectorAll` returns a **static** `NodeList` — the matches are resolved once, at call',
        'time, and the list never changes again. Removing every element in it changes the document and',
        'leaves the list exactly as it was, which is what makes iterating it safe and `done.length` a',
        'count that is still true afterwards.',
        '',
        'Worth memorising, because the naming gives you nothing:',
        '',
        '- **live:** `children`, `getElementsByClassName`, `getElementsByTagName`, `document.forms`,',
        '  `document.images` — and `childNodes`, which is a `NodeList` and live anyway.',
        '- **static:** `querySelectorAll`, and any array you built with `Array.from` or a spread.',
      ].join('\n'),
      tradeoffs: [
        'This is the version to write. It says what it means, the snapshot is explicit, and the count',
        'falls out of it — and a selector expresses "the ones to remove" far better than a condition',
        'buried inside a loop over everything.',
        '',
        'Two things to know about it:',
        '',
        '- **It searches the whole subtree**, not just the direct children. `list.querySelectorAll(":scope > .done")`',
        '  is the one that matches the loop’s scope. Here every row is a direct child, so the two agree;',
        '  in a nested list they would not.',
        '- **It allocates.** For a handful of rows this is nothing. Somewhere past tens of thousands of',
        '  elements the collection is a real cost, and that is the point at which the backwards walk',
        '  below starts to be worth its explanation.',
        '',
        'The other snapshot spelling is `[...list.children]` or `Array.from(list.children)`, which',
        'converts the live collection into an ordinary array — and that conversion is worth recognising',
        'in its own right, since it is how a live collection becomes safe to iterate at all.',
      ].join('\n'),
    },
    {
      label: 'Walk the live collection backwards',
      code: [
        'export function clearDone(list: HTMLElement): number {',
        '  let removed = 0;',
        '',
        '  for (let index = list.children.length - 1; index >= 0; index -= 1) {',
        '    const row = list.children[index];',
        '',
        "    if (row?.classList.contains('done')) {",
        '      row.remove();',
        '      removed += 1;',
        '    }',
        '  }',
        '',
        '  return removed;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The same live collection, iterated in the one direction where its liveness cannot hurt you.',
        '',
        'Removing the element at index `i` shifts every element **after** `i` down by one. Walking',
        'forwards, those are the ones you have not visited yet, so one of them slides into the slot you',
        'just left and the next step steps over it. Walking backwards, they are the ones you have',
        'already dealt with — the indices below `i` are untouched, and `i - 1` is still the element it',
        'was before the removal.',
        '',
        'Nothing is copied, so this is the allocation-free version. It also keeps working if the',
        'collection is enormous, since it never materialises it.',
      ].join('\n'),
      tradeoffs: [
        'Correct, and write-only. Nothing in the code says why the loop counts down, and a later reader',
        '"tidying" it into a forward loop reintroduces the bug in a form that removes most of the right',
        'rows — the worst kind, because it looks like it works. If you write this, the comment is not',
        'optional.',
        '',
        'Reach for it when the collection is genuinely large and the snapshot is genuinely expensive.',
        'Reach for the snapshot everywhere else.',
        '',
        'The same liveness has a louder failure mode worth knowing, in the other direction: a forward',
        'loop bounded by `list.children.length` that **appends** a matching element never terminates,',
        'because the bound is re-read on every iteration and keeps moving. Skipping half the elements',
        'is quiet; that one at least hangs the page and tells you.',
      ].join('\n'),
    },
  ],
};
