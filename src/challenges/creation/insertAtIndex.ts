import type { ChallengeContent } from '@/types/challenge';

import { requireElement } from './support';

/**
 * Declared over `Element` for the step, because the test builds it and never needs more than a node
 * to pass along and an identity to compare. The prompt says `HTMLLIElement`, which is what a
 * learner's own signature should say.
 */
type InsertAt = (list: HTMLElement, step: Element, index: number) => void;

/** The step the test hands in, built here so no solution can reach the list through a string. */
function makeStep(doc: Document, text: string): Element {
  const step = doc.createElement('li');
  step.textContent = text;
  return step;
}

function stepTexts(list: HTMLElement): (string | null)[] {
  return [...list.children].map((step) => step.textContent);
}

export const insertAtIndex: ChallengeContent = {
  prompt: [
    'The recipe has three steps and someone forgot one. Export `insertAt(list, step, index)`, which',
    'puts the step the test built into the list at that position.',
    '',
    '`index` counts **steps**: `0` puts it first, `1` puts it before the second step, and an index',
    'equal to the number of steps puts it last.',
    '',
    'The step arrives as an element, already built — there is no markup to write here, only a place',
    'to put a node.',
  ].join('\n'),
  html: ['<ol id="steps">', '  <li>Wash</li>', '  <li>Rinse</li>', '  <li>Dry</li>', '</ol>'].join('\n'),
  starterCode: [
    'export function insertAt(list: HTMLElement, step: HTMLLIElement, index: number): void {',
    '  // Always last, whatever the index says.',
    '  list.append(step);',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'index 0 puts the step at the front',
      run: ({ doc, fn, expect }) => {
        const list = requireElement(doc, 'steps');
        const step = makeStep(doc, 'Sort');
        fn<InsertAt>('insertAt')(list, step, 0);

        expect(stepTexts(list)).toEqual(['Sort', 'Wash', 'Rinse', 'Dry']);
        // The node handed in is the node inserted -- not a copy of it, and not a new `<li>` built
        // from its text. Asked of the step first, so a solution that rebuilt the list from strings
        // answers `null` instead of an `<li>` the matcher describes exactly like the one it wanted.
        expect(step.parentElement).toBe(list);
        expect(list.firstElementChild).toBe(step);
      },
    },
    {
      name: 'an index in the middle puts the step before the step that is there now',
      run: ({ doc, fn, expect }) => {
        const list = requireElement(doc, 'steps');
        fn<InsertAt>('insertAt')(list, makeStep(doc, 'Sort'), 2);

        // The list is written across four lines, so `#steps` has seven child *nodes* -- three
        // elements and four runs of whitespace. Counting in `childNodes` therefore lands somewhere
        // else entirely: node 2 is the whitespace before Rinse, and the step arrives in position 1.
        expect(stepTexts(list)).toEqual(['Wash', 'Rinse', 'Sort', 'Dry']);
      },
    },
    {
      name: 'an index equal to the number of steps puts it last',
      run: ({ doc, fn, expect }) => {
        const list = requireElement(doc, 'steps');
        fn<InsertAt>('insertAt')(list, makeStep(doc, 'Fold'), 3);

        expect(stepTexts(list)).toEqual(['Wash', 'Rinse', 'Dry', 'Fold']);
      },
    },
    {
      name: 'the steps that were already there are the same nodes afterwards',
      run: ({ doc, fn, expect }) => {
        const list = requireElement(doc, 'steps');
        const [wash, rinse, dry] = [...list.children];
        if (!wash || !rinse || !dry) throw new Error('the challenge markup should start with three steps');
        fn<InsertAt>('insertAt')(list, makeStep(doc, 'Sort'), 1);

        // Position first, identity second, because they fail illegibly in the other order. These
        // steps carry no id and no class, so `describeElement` prints all four of them as `<li>` --
        // and a solution that put the step in the wrong place fails an identity assertion with
        // `Expected <li> to be <li>`. Asserting the order as a value reports it as a diff instead,
        // and leaves the identity checks to catch the one thing they alone can see.
        expect(stepTexts(list)).toEqual(['Wash', 'Sort', 'Rinse', 'Dry']);
        // Rebuilding the list from a string produces the right text and the wrong nodes, and every
        // listener, property and typed-in value on the old ones goes with it. A rebuilt list leaves
        // this node detached, and `null` says so.
        expect(wash.parentElement).toBe(list);
        expect(list.children[0]).toBe(wash);
        expect(list.children[2]).toBe(rinse);
        expect(list.children[3]).toBe(dry);
      },
    },
    {
      name: 'each call reads the list as it stands',
      run: ({ doc, fn, expect }) => {
        const list = requireElement(doc, 'steps');
        const insertAt = fn<InsertAt>('insertAt');

        insertAt(list, makeStep(doc, 'Sort'), 1);
        insertAt(list, makeStep(doc, 'Fold'), 3);

        expect(stepTexts(list)).toEqual(['Wash', 'Sort', 'Rinse', 'Fold', 'Dry']);
      },
    },
  ],
  solutions: [
    {
      label: 'insertBefore the element at that index',
      code: [
        'export function insertAt(list: HTMLElement, step: HTMLLIElement, index: number): void {',
        '  list.insertBefore(step, list.children[index] ?? null);',
        '}',
        '',
      ].join('\n'),
      explanation: [
        '`parent.insertBefore(newNode, referenceNode)` puts a node immediately before another one, and',
        'the whole problem is choosing the reference.',
        '',
        '**`children`, not `childNodes`.** The list is written across four lines, so the parser put a',
        'text node between every pair of tags: `#steps` has three element children and seven child',
        'nodes. `childNodes[2]` is the whitespace before Rinse, not Rinse — so an index that counts',
        'steps has to be looked up in a collection that holds only steps. This is the single most',
        'common way this function is written wrong, and the symptom is an off-by-a-bit that changes',
        'when someone reformats the HTML.',
        '',
        '**`?? null` is the "past the end" case.** `children[3]` on a three-item list is `undefined`,',
        'and `insertBefore` with a reference of `null` means *append* — so the last position needs no',
        'branch at all. That is a deliberate part of the API rather than a quirk, and it is why this',
        'older method is still the concise one. Writing `null` explicitly also documents the intent;',
        'passing `undefined` happens to work, because the argument is nullable and Web IDL converts',
        '`undefined` to `null`, but nothing about the code says so.',
        '',
        'The reference node must be a child of the parent you called `insertBefore` on. If it is not,',
        'the call throws `NotFoundError` rather than guessing — which is a good error to have met once,',
        'because it usually means the reference came from a different list than the one being edited.',
      ].join('\n'),
      tradeoffs: [
        'Reach for `insertBefore` when the position may be *past* the last element, which is most',
        '"insert at index" problems: it collapses "before that one" and "at the end" into one call.',
        '',
        'What it costs is readability. It is the only insertion method whose argument order is worth',
        'double-checking — new node first, reference second — and it names the parent even though the',
        'reference already knows its own parent. `list.children[index].before(step)` says the same',
        'thing in the direction people read it, at the cost of the branch.',
        '',
        'It also returns the inserted node, where `append`, `prepend`, `before` and `after` return',
        'nothing. That is occasionally useful and is the last remaining reason to prefer the older',
        '`appendChild` too.',
      ].join('\n'),
    },
    {
      label: 'before() on the step that is already there',
      code: [
        'export function insertAt(list: HTMLElement, step: HTMLLIElement, index: number): void {',
        '  const reference = list.children[index];',
        '',
        '  if (reference) reference.before(step);',
        '  else list.append(step);',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The same insertion said from the other side. `before` and `after` are methods on the element',
        'you are inserting *next to*, so the parent is never named — the reference element already',
        'knows it.',
        '',
        'They are the modern pair, and they behave like `append` and `prepend`: several arguments at',
        'once, and each may be a node **or a string**, where a string becomes a text node.',
        '`step.before("Then: ")` is a legal way to add a label, and it escapes, because it is text',
        'rather than markup. `insertBefore` takes exactly one node and nothing else.',
        '',
        'The `else` is the price. `before` needs an element to be called on, and past the end of the',
        'list there is not one — `children[3]` is `undefined` — so the last position has to be handled',
        'separately as an append.',
      ].join('\n'),
      tradeoffs: [
        'This reads better at the point of use, and it is the shape to reach for when you are holding',
        'the neighbour rather than the container: inserting a row after the one that was clicked, or a',
        'validation message after the field it belongs to, is `field.after(message)` and no lookup at',
        'all.',
        '',
        'The branch is the tell that it is the wrong fit here. An index-addressed insert has a position',
        'that is legitimately one past the end, and this API cannot express it. Two behaviours worth',
        'knowing before you rely on it:',
        '',
        '- `before` and `after` on a node with **no parent** do nothing at all. No error, no insertion.',
        '  A build-then-insert sequence in the wrong order fails silently this way.',
        '- Passing a node that is currently earlier in the same parent moves it, exactly as every other',
        '  insertion does. `first.after(second)` and `second.before(first)` are both reorderings.',
      ].join('\n'),
    },
  ],
};
