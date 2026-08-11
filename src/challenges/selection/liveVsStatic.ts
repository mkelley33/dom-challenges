import type { ChallengeContent } from '@/types/challenge';

/**
 * The shape `capture()` hands back.
 *
 * Deliberately `ArrayLike` rather than `HTMLCollection`/`NodeList`: the tests distinguish the two
 * by behaviour, never by type or by `instanceof`. A learner who returns `list.children` and a
 * spread copy has understood the same thing, and typing the contract by what it does rather than
 * by which API produced it is also what keeps the assertions realm-safe.
 */
interface Captured {
  live: ArrayLike<Element>;
  snapshot: ArrayLike<Element>;
}

/**
 * The mutation belongs to the test, not to the learner.
 *
 * If `capture()` owned both the capture and the append, no assertion on its return value could
 * tell a standing live query from a re-query performed afterwards -- the challenge's whole subject
 * would be skippable. Appending here means the row does not exist until `capture()` has already
 * returned, so the only way `live` can count it is by being live.
 */
function appendRow(doc: Document): void {
  const list = doc.getElementById('list');
  if (!list) throw new Error('#list is missing from the challenge markup');
  const row = doc.createElement('li');
  row.className = 'row';
  list.append(row);
}

export const liveVsStatic: ChallengeContent = {
  prompt: [
    'The list below holds two `.row` items. Not every DOM query hands back the same kind of result:',
    'one kind keeps tracking the document as it changes, the other is a snapshot of the instant it',
    'was taken.',
    '',
    'Export a function `capture()` that returns both kinds of `.row` collection, and changes nothing:',
    '',
    '- `live` — a collection that keeps tracking the document, so a `.row` added *after* `capture()`',
    '  has returned is counted by it;',
    '- `snapshot` — a collection fixed at the moment `capture()` ran, which later changes leave alone.',
    '',
    'Return `{ live, snapshot }`.',
    '',
    'The test does the mutating: it calls `capture()`, appends one more `<li class="row">` to `#list`,',
    'and only then reads `length` from the two collections you handed back. Re-querying the document',
    'is not available to you — by the time the third row exists, your function has already returned.',
  ].join('\n'),
  html: '<ul id="list"><li class="row">1</li><li class="row">2</li></ul>',
  starterCode: [
    'export interface Captured {',
    '  live: ArrayLike<Element>;',
    '  snapshot: ArrayLike<Element>;',
    '}',
    '',
    'export function capture(): Captured {',
    '  return { live: [], snapshot: [] };',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'both collections start with the two rows already in the list',
      run: ({ fn, expect }) => {
        const { live, snapshot } = fn<() => Captured>('capture')();
        expect(live).toHaveLength(2);
        expect(snapshot).toHaveLength(2);
      },
    },
    {
      name: 'the live collection counts a row appended after capture() returned',
      run: ({ doc, fn, expect }) => {
        const { live } = fn<() => Captured>('capture')();
        appendRow(doc);
        expect(live).toHaveLength(3);
      },
    },
    {
      name: 'the snapshot ignores a row appended after capture() returned',
      run: ({ doc, fn, expect }) => {
        const { snapshot } = fn<() => Captured>('capture')();
        appendRow(doc);
        expect(snapshot).toHaveLength(2);
      },
    },
  ],
  solutions: [
    {
      label: 'Live HTMLCollection versus static NodeList',
      code: [
        'export interface Captured {',
        '  live: HTMLCollectionOf<Element>;',
        '  snapshot: NodeListOf<Element>;',
        '}',
        '',
        'export function capture(): Captured {',
        '  return {',
        "    live: document.getElementsByClassName('row'),",
        "    snapshot: document.querySelectorAll('.row'),",
        '  };',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'Both queries run at the same instant, against the same two-row document, and `capture()`',
        'returns before the third row exists. Yet one of the two values notices it and the other never',
        'does. The difference is in what each query returns.',
        '',
        '`getElementsByClassName` returns a live `HTMLCollection`. It is not an array of the elements',
        'that matched; it is a standing query against the document. Every property access re-consults',
        'the tree, so `live.length` answers "how many `.row` elements are in the document *right now*"',
        'and reports 3 once the test has appended — even though nothing re-ran your function. The same',
        'is true of `getElementsByTagName`, `document.forms`, `document.images`, and `element.children`;',
        "returning `document.getElementById('list')!.children` here would pass the same tests.",
        '',
        '`querySelectorAll` returns a static `NodeList` — the matches are resolved once, at call time,',
        'and the list never changes again. It reports 2 both times because it is a snapshot of a',
        'document that had two rows. (`element.childNodes` is the exception that spoils the neat rule:',
        'it is a `NodeList`, but a live one.)',
        '',
        'Neither is more correct. The bug is holding one while thinking you hold the other — which is',
        'why the test, not your code, appends the row: a value you can only re-query is a value whose',
        'liveness you never actually tested.',
      ].join('\n'),
      tradeoffs: [
        'Reach for the live collection when you genuinely want a standing answer — a count you read',
        'occasionally and want current, without re-querying — exactly what the test does with `live`.',
        'Reach for `querySelectorAll` for anything you are about to iterate, which is nearly always.',
        '',
        'The reason is that iterating a live collection while mutating the document is a trap:',
        '',
        '- `for (let i = 0; i < live.length; i++)` that appends a matching element in the body never',
        '  terminates. Each append grows `live.length`, and the bound is re-read on every iteration, so',
        '  the loop chases a finish line it keeps moving.',
        '- Removing elements in the same loop is the quieter bug: `live[0]` is dropped from the',
        '  collection the moment it leaves the document, every later element shifts down one index, and',
        '  `i++` then steps past the element that moved into the slot. You silently process half of',
        '  them. Iterating backwards, or snapshotting first, avoids it.',
        '',
        'Ergonomics push the same way. `NodeList` has `forEach`. `HTMLCollection` has no `forEach` and',
        'no array methods at all — indexing and `length` are the whole API. Both are spreadable, so',
        '`Array.from(live)` or `[...live]` gets you to `map` and `filter`; note that the conversion is',
        'also what turns a live collection into a snapshot, which is usually what the code wanted in',
        'the first place.',
      ].join('\n'),
    },
  ],
};
