import type { ChallengeContent } from '@/types/challenge';

import { requireElement, requireIn } from './support';

type Pin = (item: HTMLElement, target: HTMLElement) => void;

export const moveNotCopy: ChallengeContent = {
  prompt: [
    'Pinning a row takes it out of the inbox and puts it at the **top** of the pinned list. The row',
    'itself is handed to you — there is nothing to look up and nothing to build.',
    '',
    'Export `pin(item, target)`, which leaves the row at the top of `target` and no longer in the',
    'list it came from.',
    '',
    'Each row holds a Star button, and one test attaches a click listener to the one it is about to',
    'pin. Whatever ends up in the pinned list has to be the row that listener was attached to.',
    '',
    'The starter is the answer everyone writes first. It is wrong in three separate ways, and the',
    'tests say which.',
  ].join('\n'),
  html: [
    '<ul id="inbox">',
    '  <li class="item" id="alpha">Alpha <button class="star" type="button">Star</button></li>',
    '  <li class="item" id="beta">Beta <button class="star" type="button">Star</button></li>',
    '  <li class="item" id="gamma">Gamma <button class="star" type="button">Star</button></li>',
    '</ul>',
    '<ul id="pinned"></ul>',
  ].join('\n'),
  starterCode: [
    'export function pin(item: HTMLElement, target: HTMLElement): void {',
    '  // A copy of the row, at the top of the target list.',
    '  target.prepend(item.cloneNode(true));',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'the pinned row is the row that was handed in, at the top of the target list',
      run: ({ doc, fn, expect }) => {
        const item = requireElement(doc, 'beta');
        const target = requireElement(doc, 'pinned');
        fn<Pin>('pin')(item, target);

        expect(target.children).toHaveLength(1);
        // Identity, not "a row that looks like Beta": a copy satisfies every description of this row
        // and is a different node, which is the entire subject of this challenge. Asked as "where is
        // the node the test is holding" rather than "is the top row this node", because a copy leaves
        // the original detached and `null` reads as an answer where two identical `<li>`s do not.
        expect(item.parentElement).toBe(target);
        expect(target.firstElementChild).toBe(item);
      },
    },
    {
      name: 'the row leaves the list it came from, and the rest keep their order',
      run: ({ doc, fn, expect }) => {
        const inbox = requireElement(doc, 'inbox');
        fn<Pin>('pin')(requireElement(doc, 'beta'), requireElement(doc, 'pinned'));

        expect(inbox.querySelectorAll('.item')).toHaveLength(2);
        expect([...inbox.children].map((row) => row.id)).toEqual(['alpha', 'gamma']);
      },
    },
    {
      name: 'the listener attached before the move still fires after it',
      run: ({ doc, fire, fn, expect }) => {
        const item = requireElement(doc, 'beta');
        const target = requireElement(doc, 'pinned');
        const clicks: string[] = [];
        requireIn(item, '.star').addEventListener('click', () => clicks.push('star'));

        // The positive control, in the same document at the same moment: the listener is proven live
        // *before* anything moves, so a silent button afterwards can only mean it is a different
        // button -- never a click that failed to arrive. AGENTS.md section 5.
        fire.click(requireIn(item, '.star'));
        expect(clicks).toHaveLength(1);

        fn<Pin>('pin')(item, target);

        // Read out of the target rather than through `item`: a copy-then-delete solution leaves the
        // test still holding the original, and a detached button fires its own listener perfectly
        // well. The only button that answers this is the one now in the pinned list.
        fire.click(requireIn(target, '.star'));
        expect(clicks).toHaveLength(2);
      },
    },
    {
      name: 'a second pin goes above the first',
      run: ({ doc, fn, expect }) => {
        const target = requireElement(doc, 'pinned');
        const pin = fn<Pin>('pin');

        pin(requireElement(doc, 'beta'), target);
        pin(requireElement(doc, 'gamma'), target);

        expect([...target.children].map((row) => row.id)).toEqual(['gamma', 'beta']);
      },
    },
  ],
  solutions: [
    {
      label: 'Insert the node itself',
      code: [
        'export function pin(item: HTMLElement, target: HTMLElement): void {',
        '  target.prepend(item);',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'One line, and the surprise is that it is one line. There is no removal step, because a node',
        'has **exactly one parent**. Inserting it somewhere else is not a copy and is not an error —',
        'the DOM takes it out of wherever it was and puts it where you asked, in a single operation.',
        '',
        'This is true of every insertion method: `append`, `prepend`, `before`, `after`,',
        '`insertBefore`, `replaceWith`, `replaceChildren`. Pass a node that is already in the document',
        'and you have moved it. The mental model to drop is "the DOM holds elements"; it holds a *tree*,',
        'and an element is at one position in it.',
        '',
        'Because it is the same node, everything hanging off it comes too: listeners added with',
        '`addEventListener`, whatever a script assigned to it as a property, the text a user typed into',
        'an `<input>` inside it, a checkbox they ticked, the position of a scrolled container. None of',
        'that is markup, so none of it would survive a copy.',
        '',
        '`prepend` is the "top of the list" half. It is `append`\'s mirror — first child rather than',
        'last — and like `append` it takes several arguments and accepts strings as well as nodes.',
      ].join('\n'),
      tradeoffs: [
        'This is the right default, and the alternative below is the same thing written out. What is',
        'worth knowing is that a move is a **remove followed by an insert**, and a few things notice:',
        '',
        '- an `<iframe>` reloads its document from scratch;',
        '- running CSS transitions and animations restart;',
        '- focus is lost, so a moved input stops being the one receiving keystrokes;',
        '- a custom element gets `disconnectedCallback` and then `connectedCallback`, so anything it',
        '  set up on connect is torn down and rebuilt.',
        '',
        '`target.moveBefore(item, target.firstChild)` is the newer method that does not do any of that',
        '— an atomic move that keeps the node connected throughout, which is what makes it safe for',
        'iframes, animations and focus. It is genuinely new (Chrome 133), it throws if the node and the',
        'destination are not both already in the same document, and it is worth reaching for exactly',
        'when one of the four costs above is real. `prepend` is the one to write the rest of the time.',
      ].join('\n'),
    },
    {
      label: 'Remove it first, then insert it',
      code: [
        'export function pin(item: HTMLElement, target: HTMLElement): void {',
        '  item.remove();',
        '  target.prepend(item);',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The same two steps, one of them written out. `remove()` takes the node out of the tree; the',
        'node itself is untouched by that — it keeps its children, its attributes and its listeners,',
        'and the only thing that has changed is that `item.parentNode` is now `null`.',
        '',
        'Nothing is destroyed by a removal. The node stays alive for exactly as long as something holds',
        'a reference to it, which here is the `item` parameter, and putting it back is an ordinary',
        'insertion. A node between the two calls is *detached*, not deleted.',
        '',
        'This is worth being able to write because the gap between the two lines is sometimes the whole',
        'point: work done on a detached node changes nothing on screen and costs no layout, so a big',
        'rebuild is cheapest done out of the tree and inserted once at the end.',
      ].join('\n'),
      tradeoffs: [
        'For a plain move, the extra line buys nothing — the insertion would have removed it anyway —',
        'and it makes the code read as though the two steps were separately necessary, which is exactly',
        'the misunderstanding this challenge is about.',
        '',
        'It stops being redundant when something has to happen *while* the node is out of the tree:',
        'rewriting a hundred rows, swapping a class that would otherwise animate, or reading nothing at',
        'all — a detached element has no box, so `getBoundingClientRect()` is all zeros and',
        '`offsetParent` is `null`. Measuring in that window is the classic version of this mistake.',
        '',
        'One asymmetry to keep in mind: `remove()` returns `undefined`, so this shape only works',
        'because the caller was already holding the node. `parent.removeChild(node)` returns the node',
        'instead, which is what you want when the thing you are removing is the result of a query.',
      ].join('\n'),
    },
  ],
};
