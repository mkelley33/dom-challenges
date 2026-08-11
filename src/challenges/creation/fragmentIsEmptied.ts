import type { ChallengeContent } from '@/types/challenge';

import { requireElement } from './support';

type FillBoth = (left: HTMLElement, right: HTMLElement, names: string[]) => void;

function rowTexts(list: HTMLElement): (string | null)[] {
  return [...list.children].map((row) => row.textContent);
}

export const fragmentIsEmptied: ChallengeContent = {
  prompt: [
    'The board shows the same shortlist twice, side by side. Export `fillBoth(left, right, names)`,',
    'which fills **both** lists with one `<li class="name">` per name, in order, and replaces whatever',
    'was in them before.',
    '',
    'It cannot be done by putting the same rows in both places: a node has exactly one parent, so',
    'inserting a row into the right list would take it out of the left one. Both lists need rows of',
    'their own.',
    '',
    'The starter builds the rows in a `DocumentFragment` and inserts that fragment twice. Read what',
    'the second insertion actually does before you change anything.',
  ].join('\n'),
  html: ['<section id="board">', '  <ul id="left"></ul>', '  <ul id="right"></ul>', '</section>'].join('\n'),
  starterCode: [
    'export function fillBoth(left: HTMLElement, right: HTMLElement, names: string[]): void {',
    '  const rows = document.createDocumentFragment();',
    '',
    '  for (const name of names) {',
    "    const row = document.createElement('li');",
    "    row.className = 'name';",
    '    row.textContent = name;',
    '    rows.append(row);',
    '  }',
    '',
    '  left.replaceChildren(rows);',
    '  right.replaceChildren(rows);',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'the left list gets one row per name, in order',
      run: ({ doc, fn, expect }) => {
        const left = requireElement(doc, 'left');
        fn<FillBoth>('fillBoth')(left, requireElement(doc, 'right'), ['Ada', 'Grace', 'Edsger']);

        expect(left.querySelectorAll('.name')).toHaveLength(3);
        expect(rowTexts(left)).toEqual(['Ada', 'Grace', 'Edsger']);
      },
    },
    {
      name: 'the right list gets them too',
      run: ({ doc, fn, expect }) => {
        const right = requireElement(doc, 'right');
        fn<FillBoth>('fillBoth')(requireElement(doc, 'left'), right, ['Ada', 'Grace', 'Edsger']);

        // Inserting a fragment splices its children into the document and leaves the fragment
        // *empty*. It is a shipping container, not a copy: the second insertion inserts nothing, and
        // nothing anywhere reports an error.
        expect(right.querySelectorAll('.name')).toHaveLength(3);
        expect(rowTexts(right)).toEqual(['Ada', 'Grace', 'Edsger']);
      },
    },
    {
      name: 'filling the left list did not empty it again',
      run: ({ doc, fn, expect }) => {
        const left = requireElement(doc, 'left');
        const right = requireElement(doc, 'right');
        fn<FillBoth>('fillBoth')(left, right, ['Ada', 'Grace']);

        // The other direction of the same rule, and the other tempting shortcut: filling the right
        // list with `right.append(...left.children)` moves those rows out of the left one.
        expect(left.querySelectorAll('.name')).toHaveLength(2);
        expect(right.querySelectorAll('.name')).toHaveLength(2);
      },
    },
    {
      name: 'a second call replaces the rows in both lists',
      run: ({ doc, fn, expect }) => {
        const left = requireElement(doc, 'left');
        const right = requireElement(doc, 'right');
        const fillBoth = fn<FillBoth>('fillBoth');

        fillBoth(left, right, ['Ada', 'Grace', 'Edsger']);
        fillBoth(left, right, ['Linus']);

        expect(rowTexts(left)).toEqual(['Linus']);
        expect(rowTexts(right)).toEqual(['Linus']);
      },
    },
    {
      name: 'no names clears both lists',
      run: ({ doc, fn, expect }) => {
        const left = requireElement(doc, 'left');
        const right = requireElement(doc, 'right');
        const fillBoth = fn<FillBoth>('fillBoth');

        fillBoth(left, right, ['Ada', 'Grace']);
        fillBoth(left, right, []);

        expect(left.children).toHaveLength(0);
        expect(right.children).toHaveLength(0);
      },
    },
    {
      name: 'a name that looks like markup is inserted as text',
      run: ({ doc, fn, expect }) => {
        const left = requireElement(doc, 'left');
        const right = requireElement(doc, 'right');
        fn<FillBoth>('fillBoth')(left, right, ['<b>bold</b>']);

        expect(doc.querySelectorAll('b')).toHaveLength(0);
        expect(rowTexts(right)).toEqual(['<b>bold</b>']);
      },
    },
  ],
  solutions: [
    {
      label: 'Build the rows twice',
      code: [
        'function nameRows(names: string[]): DocumentFragment {',
        '  const rows = document.createDocumentFragment();',
        '',
        '  for (const name of names) {',
        "    const row = document.createElement('li');",
        "    row.className = 'name';",
        '    row.textContent = name;',
        '    rows.append(row);',
        '  }',
        '',
        '  return rows;',
        '}',
        '',
        'export function fillBoth(left: HTMLElement, right: HTMLElement, names: string[]): void {',
        '  left.replaceChildren(nameRows(names));',
        '  right.replaceChildren(nameRows(names));',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'A `DocumentFragment` is a node with no parent, no document position and no rendering. Its',
        'purpose is to hold a group of nodes so they can be inserted in one operation, and the way it',
        'does that is the thing to internalise:',
        '',
        '> **Inserting a fragment inserts its children and leaves the fragment empty.**',
        '',
        'The fragment itself never enters the document. Its children are spliced in where it was',
        'inserted, and it is left holding nothing — so the second `replaceChildren(rows)` in the starter',
        'inserts an empty fragment, which clears the right list and adds nothing. No error, no warning,',
        'and the left list looks perfect.',
        '',
        'This follows from the rule the rest of this category keeps running into rather than being a',
        'special case: **a node has exactly one parent.** Those `<li>` elements went into the left list,',
        'so they are in the left list. Nothing can put the same node in two places, which is why two',
        'lists need two sets of rows.',
        '',
        'Making the builder a function that returns a **fresh** fragment each time is what makes that',
        'obvious at the call site: two calls, two sets of rows, and no shared value that could be',
        'consumed by the first insertion.',
        '',
        '`replaceChildren` is the replace half — it removes what was there and inserts the new children',
        'in one call, which is what makes the second call replace rather than accumulate and what makes',
        'an empty list of names clear both lists.',
      ].join('\n'),
      tradeoffs: [
        'The rows are built twice, so this does 2N `createElement` calls where the clone below does N',
        'plus a copy. For lists of any ordinary size that is not the deciding factor, and this version',
        'has the property that matters more often: the two sets of rows were built the same way, by the',
        'same code, and are independent from the moment they exist.',
        '',
        'That independence stops being free the moment the builder does anything a clone cannot copy —',
        'attaching a listener to each row, stashing a property on it, wiring a custom element. Building',
        'twice does that work twice and correctly; cloning does it once and silently drops it from the',
        'copy.',
        '',
        'A third route exists and is worth knowing: `left.innerHTML = right.innerHTML = rowMarkup`, with',
        'the names escaped. One parse per list, no node-building at all, and it is the fastest way to',
        'fill two empty containers with the same static markup. It cannot carry listeners, it hands back',
        'no references, and the escaping is yours forever.',
      ].join('\n'),
    },
    {
      label: 'Clone the fragment for the second list',
      code: [
        'export function fillBoth(left: HTMLElement, right: HTMLElement, names: string[]): void {',
        '  const rows = document.createDocumentFragment();',
        '',
        '  for (const name of names) {',
        "    const row = document.createElement('li');",
        "    row.className = 'name';",
        '    row.textContent = name;',
        '    rows.append(row);',
        '  }',
        '',
        '  // Cloned first, while the fragment still has children in it.',
        '  const copy = rows.cloneNode(true);',
        '',
        '  left.replaceChildren(rows);',
        '  right.replaceChildren(copy);',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'Build the rows once, and make the second set by copying the first. `cloneNode(true)` on a',
        'fragment returns a **new fragment** holding copies of its children — the same deep copy that',
        'stamps a row out of a `<template>`, applied to the container rather than to one row.',
        '',
        'The comment is the whole solution. Clone **before** the first insertion: after',
        '`left.replaceChildren(rows)` the fragment is empty, and cloning an empty fragment gives you an',
        'empty fragment. The order of these two lines is the difference between a working function and',
        'one that fills exactly one list, which is the same bug the starter has wearing a different',
        'hat.',
        '',
        'Cloning the fragment rather than the rows is what keeps this to one extra line: there is no',
        'loop over the copies and no second builder to keep in step with the first.',
      ].join('\n'),
      tradeoffs: [
        'Reach for this when the rows are **pure markup** and there are a lot of them: one build pass',
        'plus a subtree copy is less work than running your builder twice, and the copy is done by the',
        'engine rather than by your loop.',
        '',
        'Refuse it when the builder does anything that is not markup. A clone copies elements,',
        'attributes and text and copies **no** listeners, **no** properties a script assigned, and not',
        'the current value of any form control it contains. A builder that does `row.addEventListener`',
        'produces a left list that works and a right list that does not, and nothing about the code says',
        'so — which is a strictly nastier failure than the one this challenge starts with, because the',
        'rows do appear.',
        '',
        'The ordering dependency is a real cost too. Someone tidying this function later, moving the',
        'clone down beside the insertion it belongs to, breaks it silently. The two-builds version has',
        'no order to get wrong.',
      ].join('\n'),
    },
  ],
};
