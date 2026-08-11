import type { ChallengeContent } from '@/types/challenge';

import { requireElement, requireIn } from './support';

/**
 * `Element` rather than `HTMLElement`: everything these tests do with the returned row -- parent,
 * children, descendants, clicks -- is on `Element`, so nothing here needs a narrowing assertion. The
 * prompt and the solutions say `HTMLElement`, which is what a learner's own signature should say.
 */
type Take = (list: HTMLElement, id: string) => Element;

export const detachAndReattach: ChallengeContent = {
  prompt: [
    'The list has three rows, each with an Undo button. Export `take(list, id)`, which removes the row',
    'with that id **from the list** and hands it back.',
    '',
    'The row you hand back has to be usable afterwards. One test attaches a listener to a row’s Undo',
    'button, calls `take`, puts the row back into the list itself, and clicks that button again — so',
    'whatever comes out of your function has to be the row that went in, with everything still on it.',
    '',
    'Watch which node you remove. `remove()` takes **no arguments**, and the extra one you pass it is',
    'ignored rather than rejected.',
  ].join('\n'),
  html: [
    '<ul id="list">',
    '  <li class="row" id="r1"><button class="undo">Undo</button><span class="label">Alpha</span></li>',
    '  <li class="row" id="r2"><button class="undo">Undo</button><span class="label">Beta</span></li>',
    '  <li class="row" id="r3"><button class="undo">Undo</button><span class="label">Gamma</span></li>',
    '</ul>',
  ].join('\n'),
  starterCode: [
    'export function take(list: HTMLElement, id: string): HTMLElement {',
    '  const row = list.querySelector<HTMLElement>(`#${id}`);',
    '  if (!row) throw new Error(`no row with id "${id}"`);',
    '',
    '  // Found, and still exactly where it was.',
    '  return row;',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'the row leaves the list, and the list stays where it is',
      run: ({ doc, fn, expect }) => {
        const list = requireElement(doc, 'list');
        fn<Take>('take')(list, 'r2');

        // Asserted first, and it is not paranoia: `list.remove(row)` reads as "remove this row from
        // this list" and removes the *list*, because `remove()` takes no arguments and ignores the
        // one you gave it. The rows all survive inside the detached list, so every other assertion
        // here can still pass.
        expect(doc.getElementById('list')).toBe(list);
        expect(list.children).toHaveLength(2);
        expect(doc.getElementById('r2')).toBeNull();
      },
    },
    {
      name: 'the row that comes back is the row that was in the list',
      run: ({ doc, fn, expect }) => {
        const list = requireElement(doc, 'list');
        const row = requireElement(doc, 'r2');
        const taken = fn<Take>('take')(list, 'r2');

        expect(row.parentElement).toBeNull();
        expect(taken).toBe(row);
      },
    },
    {
      name: 'the removed row still holds everything that was inside it',
      run: ({ doc, fn, expect }) => {
        const taken = fn<Take>('take')(requireElement(doc, 'list'), 'r2');

        // Removal detaches; it does not empty. The subtree comes out of the document intact, which
        // is what makes putting it back a single insertion rather than a rebuild.
        expect(taken.children).toHaveLength(2);
        expect(requireIn(taken, '.label')).toHaveTextContent('Beta');
        expect(requireIn(taken, '.undo')).toHaveTextContent('Undo');
      },
    },
    {
      name: 'a listener attached before the removal still fires once the row is put back',
      run: ({ doc, fire, fn, expect }) => {
        const list = requireElement(doc, 'list');
        const row = requireElement(doc, 'r2');
        const clicks: string[] = [];
        requireIn(row, '.undo').addEventListener('click', () => clicks.push('undo'));

        // The positive control, before anything is removed: the listener is live in this document at
        // this moment, so a silent button at the end is a fact about the row rather than about the
        // click. AGENTS.md section 5.
        fire.click(requireIn(row, '.undo'));
        expect(clicks).toHaveLength(1);

        const taken = fn<Take>('take')(list, 'r2');
        // The test does the putting back, so nothing about the round trip is the solution's to fake:
        // the node it hands over is the only thing that can answer.
        list.append(taken);

        fire.click(requireIn(list, '#r2 .undo'));
        expect(clicks).toHaveLength(2);
      },
    },
    {
      name: 'the rows that stay keep their order',
      run: ({ doc, fn, expect }) => {
        const list = requireElement(doc, 'list');
        fn<Take>('take')(list, 'r2');

        expect([...list.children].map((row) => row.id)).toEqual(['r1', 'r3']);
      },
    },
  ],
  solutions: [
    {
      label: 'remove(), holding the reference yourself',
      code: [
        'export function take(list: HTMLElement, id: string): HTMLElement {',
        '  const row = list.querySelector<HTMLElement>(`#${id}`);',
        '  if (!row) throw new Error(`no row with id "${id}"`);',
        '',
        '  row.remove();',
        '',
        '  return row;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        '**Removing a node does not destroy it.** `row.remove()` takes it out of the tree and changes',
        'nothing else about it: the same object, the same children, the same attributes, the same',
        'listeners, the same properties any script put on it. The only difference is that',
        '`row.parentNode` is now `null` and no query rooted at the document can reach it.',
        '',
        'That is what makes the round trip in the last test work. The row goes out, comes back in, and',
        'its Undo button still fires — because it is the same button it always was.',
        '',
        'A detached node stays alive for exactly as long as something holds a reference to it. Here',
        'that is the `row` variable, and then the caller. Let go of every reference and the node',
        'becomes collectable; there is no "delete this node" call, and there does not need to be. The',
        'same rule read the other way is a real memory leak: a listener whose closure captures a',
        'removed subtree keeps the whole subtree alive indefinitely.',
        '',
        '`remove()` returns `undefined`, so this shape only works because the reference was obtained',
        'first. Writing `return row.remove();` hands back nothing at all.',
        '',
        'And the trap the prompt warns about: **`remove()` takes no arguments.** `list.remove(row)`',
        'reads like `removeChild` and does something else entirely — it removes `list`, ignoring the',
        'argument, exactly as `element.remove()` always does. The rows survive inside the now-detached',
        'list, so the page loses a whole section and every assertion about the rows still passes.',
      ].join('\n'),
      tradeoffs: [
        'This is the one to reach for when you have the node and do not care where it lives. It needs',
        'no parent, so nothing has to be looked up, and it is the same call whether the node is a row',
        'in a list or the last child of something you have never seen.',
        '',
        'Two costs:',
        '',
        '- **It returns nothing**, which is why the reference has to exist first. A pipeline that finds',
        '  and removes in one expression cannot be written with it.',
        '- **It is silent on a node with no parent.** Calling it twice is not an error, and neither is',
        '  calling it on something that was never inserted — which is convenient right up until it is',
        '  hiding the fact that you removed the wrong thing.',
      ].join('\n'),
    },
    {
      label: 'removeChild, which hands the node back',
      code: [
        'export function take(list: HTMLElement, id: string): HTMLElement {',
        '  const row = list.querySelector<HTMLElement>(`#${id}`);',
        '  if (!row) throw new Error(`no row with id "${id}"`);',
        '',
        '  return list.removeChild(row);',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The older API, and the reason it survives: `removeChild` **returns the node it removed**. That',
        'is precisely the value this function exists to produce, so find-and-remove collapses into one',
        'expression.',
        '',
        'It is also stricter. The node must be a child of the element you called it on, and if it is',
        'not, the call throws `NotFoundError` rather than doing nothing. When your code believes a node',
        'is in a particular parent, that is a claim worth having checked — `remove()` cannot check it,',
        'because it never asks about the parent at all.',
        '',
        'The removed node is in exactly the same state as it is above. Which of the two calls did the',
        'removing makes no difference to what comes out.',
      ].join('\n'),
      tradeoffs: [
        'Reach for it when the return value is the point — removing something you have just found, or',
        'moving a node through a variable in a single expression — and when the parent is already in',
        'hand.',
        '',
        'Reach for `remove()` the rest of the time. `removeChild` makes you name the parent, which is a',
        'lookup you often do not have (`node.parentNode?.removeChild(node)` is the giveaway: it is the',
        'long spelling of `node.remove()`, with an optional chain to paper over the case `remove()`',
        'handles by definition).',
        '',
        'One shape neither of them is: **`row.innerHTML = ""` does not remove the row.** It empties it,',
        'leaving an element in the document with nothing inside — and it destroys the children rather',
        'than detaching them, so there is nothing to put back. `replaceChildren()` with no arguments is',
        'the same clearing done without serialising or parsing anything.',
      ].join('\n'),
    },
  ],
};
