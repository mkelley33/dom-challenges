import type { ChallengeContent } from '@/types/challenge';

import { requireElement } from './support';

/**
 * The whitespace inside an element, as a node.
 *
 * `nodeType === 3` rather than `instanceof Text`: this runs in the app realm against nodes built in
 * the host realm, which has its own `Text` constructor. The numbers are the same in every realm.
 */
function firstTextNode(element: Element): Node {
  const text = Array.from(element.childNodes).find((node) => node.nodeType === 3);
  if (!text) throw new Error(`#${element.id} has no text node inside it`);
  return text;
}

export const containsAndPosition: ChallengeContent = {
  prompt: [
    'Two questions a click-outside handler and a range-selection helper ask constantly. Export both:',
    '',
    '- `isInside(ancestor, node)` — is `node` **inside** `ancestor`? An element is not inside itself,',
    '  so `isInside(panel, panel)` is `false`. `node` may be a text node, not only an element.',
    '- `comesFirst(a, b)` — does `a` come before `b` in document order? An element comes before its',
    '  own descendants, since its opening tag is what you reach first reading the document top to',
    '  bottom.',
  ].join('\n'),
  html: [
    '<div id="outer">',
    '  <p id="first">first</p>',
    '  <div id="panel">',
    '    <span id="inner">inner</span>',
    '  </div>',
    '  <p id="last">last</p>',
    '</div>',
  ].join('\n'),
  starterCode: [
    'export function isInside(ancestor: Element, node: Node): boolean {',
    '  return false;',
    '}',
    '',
    'export function comesFirst(a: Node, b: Node): boolean {',
    '  return false;',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'a descendant is inside its ancestor, however deep',
      run: ({ doc, fn, expect }) => {
        const isInside = fn<(ancestor: Element, node: Node) => boolean>('isInside');
        expect(isInside(requireElement(doc, 'panel'), requireElement(doc, 'inner'))).toBe(true);
        expect(isInside(requireElement(doc, 'outer'), requireElement(doc, 'inner'))).toBe(true);
      },
    },
    {
      name: 'an element is not inside itself',
      run: ({ doc, fn, expect }) => {
        const isInside = fn<(ancestor: Element, node: Node) => boolean>('isInside');
        const panel = requireElement(doc, 'panel');
        // `panel.contains(panel)` is `true` -- the spec defines `contains` in terms of *inclusive*
        // descendants. Returning it unqualified is the whole trap: for a click-outside handler that
        // inclusiveness is the desired behaviour, so the habit is easy to pick up, and for "does
        // this node live under that one" it reports a node as its own child.
        expect(isInside(panel, panel)).toBe(false);
      },
    },
    {
      name: 'a node outside the subtree is not inside it',
      run: ({ doc, fn, expect }) => {
        const isInside = fn<(ancestor: Element, node: Node) => boolean>('isInside');
        expect(isInside(requireElement(doc, 'panel'), requireElement(doc, 'first'))).toBe(false);
      },
    },
    {
      name: 'a text node inside the subtree is inside it too',
      run: ({ doc, fn, expect }) => {
        const isInside = fn<(ancestor: Element, node: Node) => boolean>('isInside');
        const panel = requireElement(doc, 'panel');
        // Selection and range code deals in text nodes far more than in elements, so a check that
        // narrows to `Element` first -- or reaches for `closest` -- answers the wrong question here.
        expect(isInside(panel, firstTextNode(panel))).toBe(true);
        expect(isInside(panel, firstTextNode(requireElement(doc, 'outer')))).toBe(false);
      },
    },
    {
      name: 'two siblings are ordered by where they appear in the document',
      run: ({ doc, fn, expect }) => {
        const comesFirst = fn<(a: Node, b: Node) => boolean>('comesFirst');
        const first = requireElement(doc, 'first');
        const last = requireElement(doc, 'last');
        expect(comesFirst(first, last)).toBe(true);
        // Asked in reverse as well: a function that always returns `true` passes the line above.
        expect(comesFirst(last, first)).toBe(false);
      },
    },
    {
      name: 'an ancestor comes before its own descendant',
      run: ({ doc, win, fn, expect }) => {
        const panel = requireElement(doc, 'panel');
        const inner = requireElement(doc, 'inner');

        // Why `compareDocumentPosition(...) === Node.DOCUMENT_POSITION_FOLLOWING` is wrong, stated
        // as an assertion rather than as a comment: `#inner` both follows `#panel` and is contained
        // by it, so the return value carries both bits -- 4 | 16, which is 20, and is not 4.
        // Constants read off `win`, the realm the nodes belong to, rather than off a bare global.
        const following = win.Node.DOCUMENT_POSITION_FOLLOWING;
        expect(panel.compareDocumentPosition(inner)).toBe(following | win.Node.DOCUMENT_POSITION_CONTAINED_BY);

        const comesFirst = fn<(a: Node, b: Node) => boolean>('comesFirst');
        expect(comesFirst(panel, inner)).toBe(true);
        expect(comesFirst(inner, panel)).toBe(false);
      },
    },
  ],
  solutions: [
    {
      label: 'contains, plus a mask for the order',
      code: [
        'export function isInside(ancestor: Element, node: Node): boolean {',
        '  return node !== ancestor && ancestor.contains(node);',
        '}',
        '',
        'export function comesFirst(a: Node, b: Node): boolean {',
        '  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        "`contains` is the fast path for containment, and its one surprise is in the spec's wording:",
        'it returns `true` when the argument is an *inclusive* descendant. A node contains itself.',
        'That is usually what a click-outside handler wants — a click on the panel itself is not',
        'outside it — and it is not what "is this node inside that one" means. `node !== ancestor` is',
        'the whole fix, and it has to come first, because `contains` alone cannot tell you.',
        '',
        '`compareDocumentPosition` answers the ordering question, and it returns a **bitmask**, not an',
        'enum. The bits are `DISCONNECTED` (1), `PRECEDING` (2), `FOLLOWING` (4), `CONTAINS` (8),',
        '`CONTAINED_BY` (16), and `IMPLEMENTATION_SPECIFIC` (32), and more than one is set at a time.',
        'A node that follows *and* is contained returns `4 | 16`, which is `20` — so',
        '`=== DOCUMENT_POSITION_FOLLOWING` is `false` for every descendant, and a comparison written',
        'that way reports that a container comes after its own contents. `& FOLLOWING` asks whether',
        'that one bit is set and ignores the rest, which is what a mask is for.',
        '',
        'Both nodes are read as `Node`, not `Element`, on purpose: `Selection` and `Range` hand you',
        'text nodes, and both APIs work on any node.',
      ].join('\n'),
      tradeoffs: [
        'This is the pair to reach for. `contains` is a single native walk and is the cheapest',
        'containment test available; the mask is the only correct way to read the ordering.',
        '',
        'Two edges worth knowing. Neither crosses a shadow boundary in the way you might hope:',
        '`host.contains(nodeInsideShadowRoot)` is `false`, because the shadow tree is a different',
        'tree — `event.composedPath()` is what answers "was this click inside my component" for a',
        'component with a shadow root.',
        '',
        'And for nodes in different trees entirely (one detached, one in the document),',
        '`compareDocumentPosition` sets `DISCONNECTED` and then makes up a consistent but arbitrary',
        'order, flagged with `IMPLEMENTATION_SPECIFIC`. It is stable within a session, which makes it',
        'usable for sorting, and it is meaningless as an answer about document position — so check',
        'the `DISCONNECTED` bit when detached nodes are possible.',
      ].join('\n'),
    },
    {
      label: 'compareDocumentPosition for both',
      code: [
        'export function isInside(ancestor: Element, node: Node): boolean {',
        '  const position = ancestor.compareDocumentPosition(node);',
        '  return (position & Node.DOCUMENT_POSITION_CONTAINED_BY) !== 0;',
        '}',
        '',
        'export function comesFirst(a: Node, b: Node): boolean {',
        '  return (b.compareDocumentPosition(a) & Node.DOCUMENT_POSITION_PRECEDING) !== 0;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'One API for both questions. `CONTAINED_BY` means "the argument is contained by the node this',
        'was called on" — strictly contained, so the self case needs no guard at all: comparing a node',
        'with itself returns `0`, and `0 & anything` is `0`.',
        '',
        '`comesFirst` is written from the other side here to show the symmetry:',
        '`b.compareDocumentPosition(a)` describes where `a` sits relative to `b`, so `a` coming first',
        'is `PRECEDING` on that result. It is the same fact as `FOLLOWING` on',
        '`a.compareDocumentPosition(b)` — the direction of the call decides which name you use, and',
        'mixing them up is the easiest way to write a comparator that sorts backwards.',
        '',
        'Reading the mask consistently in both functions is the point of preferring this version: once',
        'you are treating the return value as bits everywhere, there is no line left where `===` looks',
        'reasonable.',
      ].join('\n'),
      tradeoffs: [
        'More expressive and slower. `compareDocumentPosition` computes the full relationship — both',
        'directions of containment and the ordering — where `contains` stops as soon as it can answer',
        'yes or no. In a hot path over thousands of nodes that difference is measurable; anywhere else',
        'it is not.',
        '',
        'It is also the only one of the two that can answer the other three questions at all:',
        '"does this contain that", "which comes first", and "are these even in the same tree" all come',
        'off one call, which is exactly what a comparator for sorting nodes into document order needs:',
        '`nodes.sort((a, b) => (comesFirst(a, b) ? -1 : 1))`.',
      ].join('\n'),
    },
    {
      label: 'Walk the parents by hand',
      code: [
        'export function isInside(ancestor: Element, node: Node): boolean {',
        '  let parent: Node | null = node.parentNode;',
        '  while (parent !== null) {',
        '    if (parent === ancestor) return true;',
        '    parent = parent.parentNode;',
        '  }',
        '  return false;',
        '}',
        '',
        'export function comesFirst(a: Node, b: Node): boolean {',
        '  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        "Containment written out: start at the node's parent and climb until you find the ancestor or",
        'run out of tree. Starting at `parentNode` rather than at `node` is what makes the self case',
        '`false` for free — the node itself is never compared.',
        '',
        '`parentNode` rather than `parentElement`, because the walk has to pass through nodes that are',
        "not elements. A text node's parent is an element, so that much is fine either way, but the",
        'walk from inside a `DocumentFragment` or up to the `Document` node only works with',
        '`parentNode`; `parentElement` is `null` at `<html>` and stops the loop early.',
        '',
        'Note there is no equivalent hand-written `comesFirst`. Document order between two arbitrary',
        'nodes means finding their common ancestor and comparing child indices along the way — twenty',
        'lines to reimplement one native call, and the native one is what the browser uses internally',
        'for `Range` anyway.',
      ].join('\n'),
      tradeoffs: [
        'Slower than `contains` — one JavaScript step per level rather than one native walk — and it',
        'is a loop with an off-by-one waiting in it: start at `node` instead of `node.parentNode` and',
        'you have rebuilt `contains`, self case and all.',
        '',
        'It earns its place when something has to happen *on the way up*: collecting the ancestors,',
        'finding the nearest scroll container, or stopping at a shadow root boundary. Note that the',
        'walk crosses a boundary `contains` will not, if you make it: `node.getRootNode().host` steps',
        'from a shadow root out into the light DOM, which is how "is this node inside my component,',
        'shadow tree included" is written.',
      ].join('\n'),
    },
  ],
};
