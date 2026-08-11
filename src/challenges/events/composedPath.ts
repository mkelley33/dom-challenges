import type { ChallengeContent } from '@/types/challenge';

/**
 * Local rather than in a `support.ts` because this category has one challenge -- a helper shared
 * between two of them earns its own file, one used by a single challenge belongs beside it.
 */
function requireElement(doc: Document, id: string): HTMLElement {
  const element = doc.getElementById(id);
  if (!element) throw new Error(`#${id} is missing from the challenge markup`);
  return element;
}

/**
 * Gives `#widget` the shadow tree the tests click inside, and hands back a lookup into it.
 *
 * The **test** builds this, not the submitted code. A challenge whose own function both creates the
 * tree and reports on it can agree with itself while being wrong about the DOM, and the shape of
 * the tree is the whole premise here -- `data-action` sits on the host (outside the root) and on a
 * button (inside it), which is what makes the two failure directions in the docblock of
 * `src/challenges/events/index.ts` reachable from one challenge.
 *
 * Declarative shadow DOM is not an option: the memory host assigns `innerHTML`, which never turns a
 * `<template shadowrootmode>` into a root, so the tree has to be attached imperatively.
 */
function attachWidget(doc: Document): (selector: string) => Element {
  const root = requireElement(doc, 'widget').attachShadow({ mode: 'open' });
  root.innerHTML = [
    '<div class="body" id="body">',
    '  <button class="chip" id="chip" data-action="save"><span class="glyph" id="glyph">S</span> Save</button>',
    '</div>',
  ].join('\n');

  return (selector: string): Element => {
    const found = root.querySelector(selector);
    if (!found) throw new Error(`${selector} is missing from the widget's shadow tree`);
    return found;
  };
}

type ActionFor = (event: Event) => string | null;

/** Just the two halves of the harness context this file dispatches through. */
interface ClickContext {
  doc: Document;
  win: Window & typeof globalThis;
}

/**
 * Clicks `target` and returns what `actionFor` made of the event, from a listener on the document.
 *
 * Throws when the listener never ran, so a `null` result can only ever mean "the function returned
 * null" and never "the click did not arrive". A test asserting on an absence needs the channel it is
 * asserting through to be proven live at the same moment -- AGENTS.md §5.
 */
function actionAtDocument(ctx: ClickContext, target: Element, actionFor: ActionFor): string | null {
  let called = false;
  let seen: string | null = null;

  const listener = (event: Event): void => {
    called = true;
    seen = actionFor(event);
  };

  ctx.doc.addEventListener('click', listener, { once: true });
  // Constructed from `ctx.win`, never from a bare global: the event has to be the host realm's, and
  // `composed: true` is what lets it cross out of a shadow tree at all. A real click carries the
  // flag; a constructed one has to say so.
  target.dispatchEvent(new ctx.win.MouseEvent('click', { bubbles: true, composed: true }));
  ctx.doc.removeEventListener('click', listener);

  if (!called) throw new Error('the click never reached the document listener');
  return seen;
}

export const composedPath: ChallengeContent = {
  prompt: [
    'One delegated listener on the document has to work out which action was clicked — including',
    'inside a web component, whose internals the page is not supposed to know about.',
    '',
    'Export `actionFor(event)`, returning the `data-action` of the **innermost** element at or above',
    'the real click target that carries one, or `null` when nothing above it does.',
    '',
    'Before each test, `#widget` is given an open shadow root containing:',
    '',
    '```html',
    '<div class="body" id="body">',
    '  <button class="chip" id="chip" data-action="save"><span class="glyph" id="glyph">S</span> Save</button>',
    '</div>',
    '```',
    '',
    'The host `#widget` carries `data-action="expand"` and the shadow button carries',
    '`data-action="save"`, so both directions are live: a click on the glyph is a save, and a click on',
    'the shadow tree’s padding is an expand.',
    '',
    'The starter is the answer everyone writes first. It is wrong, and the tests say where.',
  ].join('\n'),
  html: [
    '<div id="page">',
    '  <div id="widget" data-action="expand">Widget</div>',
    '  <button id="close" data-action="close" type="button">Close</button>',
    '  <p id="nothing">Nothing to do here</p>',
    '</div>',
  ].join('\n'),
  starterCode: [
    'export function actionFor(event: Event): string | null {',
    '  const target = event.target;',
    '  if (!(target instanceof HTMLElement)) return null;',
    '',
    "  return target.closest<HTMLElement>('[data-action]')?.dataset.action ?? null;",
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'a click deep inside the shadow tree finds the action declared inside it',
      run: ({ doc, win, fn, expect }) => {
        const inWidget = attachWidget(doc);
        const action = actionAtDocument({ doc, win }, inWidget('#glyph'), fn<ActionFor>('actionFor'));

        // In a browser the document listener's `event.target` is `#widget` -- the host -- because an
        // event that leaves a shadow tree is retargeted to the element the page is allowed to know
        // about. Anything that starts from `event.target` therefore never sees `#chip` at all and
        // answers "expand" for a click on the Save button.
        expect(action).toBe('save');
      },
    },
    {
      name: 'a click on shadow content with no action of its own falls out to the host',
      run: ({ doc, win, fn, expect }) => {
        const inWidget = attachWidget(doc);
        const action = actionAtDocument({ doc, win }, inWidget('#body'), fn<ActionFor>('actionFor'));

        // The other direction, and the one `closest` cannot do: walking up from inside the tree
        // stops at the shadow root, because a root is not an element and has no parent element. The
        // composed path is the only thing that carries on out to the host.
        expect(action).toBe('expand');
      },
    },
    {
      name: 'an ordinary click in the page still resolves the nearest action',
      run: ({ doc, win, fn, expect }) => {
        attachWidget(doc);
        const action = actionAtDocument({ doc, win }, requireElement(doc, 'close'), fn<ActionFor>('actionFor'));

        expect(action).toBe('close');
      },
    },
    {
      name: 'a click with no action anywhere above it reports null',
      run: ({ doc, win, fn, expect }) => {
        attachWidget(doc);
        // `actionAtDocument` throws if the listener never ran, so this null is the function's answer
        // rather than a click that went missing.
        const action = actionAtDocument({ doc, win }, requireElement(doc, 'nothing'), fn<ActionFor>('actionFor'));

        expect(action).toBeNull();
      },
    },
  ],
  solutions: [
    {
      label: 'Read the composed path',
      code: [
        'export function actionFor(event: Event): string | null {',
        '  for (const node of event.composedPath()) {',
        '    if (node instanceof HTMLElement && node.dataset.action) return node.dataset.action;',
        '  }',
        '',
        '  return null;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'An event has two different ideas of where it came from, and a shadow boundary is where they',
        'come apart.',
        '',
        '`event.target` is retargeted. As the event crosses out of a shadow tree it is rewritten to the',
        'nearest ancestor the current listener is allowed to see — for a listener on the document, that',
        'is the host element. This is not an inconvenience to work around; it is the encapsulation',
        'working. A page that could read `#chip` off an event would be coupled to a component’s',
        'internals, and the component could not rename anything without breaking its users.',
        '',
        '`event.composedPath()` is the other idea: the full list of objects the event will visit, from',
        'the real innermost target out through every shadow root, its host, the ancestors, the document',
        'and finally the window. It is what the event system itself walks, and it is available to you',
        'because sometimes — a delegated click handler is exactly the case — you own both sides and',
        'genuinely need the whole path.',
        '',
        'So this loop is a `closest` that crosses boundaries. It walks outward, and the first element',
        'carrying `data-action` wins, which is what "innermost" means. Because the path is ordered, no',
        'comparison of depths is needed.',
        '',
        'The `instanceof HTMLElement` check is doing real work: the path is not all elements. It holds',
        'the `ShadowRoot` (a `DocumentFragment`), the `Document`, and the `Window`, none of which have',
        'a `dataset`. Reading `node.dataset` unguarded throws on the first of them.',
        '',
        'One property to know before you rely on it: `composedPath()` is only populated **while the',
        'event is being dispatched**. Call it from a `setTimeout` inside your handler and a browser',
        'hands back an empty array, because the path is cleared when dispatch finishes. Read what you',
        'need during the handler.',
      ].join('\n'),
      tradeoffs: [
        'This is the right shape for delegation in a page that contains web components, and it is why',
        '`composedPath` exists. Three things to weigh:',
        '',
        '- **It is a snapshot, not a live walk.** Fine here, and a problem if you wanted to answer the',
        '  same question later — see the alternative, which keeps a node and walks it on demand.',
        '- **It respects closed roots, which is the point and also the limit.** For a listener outside',
        '  a `{ mode: "closed" }` root, the path is truncated at the host: no `#chip`, no root. If you',
        '  need to reach inside, the component has to hand you something — a custom event carrying',
        '  what it wants to expose is the designed way, and it is a better interface than reaching in.',
        '- **A composed event is not the default.** Only some built-in events are `composed`, and a',
        '  `CustomEvent` you dispatch is not unless you pass `{ composed: true, bubbles: true }`. A',
        '  component that fires uncomposed events keeps them inside its own root, which is often what',
        '  you want.',
        '',
        'The alternative shape worth naming: stop delegating across the boundary at all. A listener',
        'inside the shadow root sees untargeted events and can re-dispatch a `CustomEvent` describing',
        'what happened in the component’s own vocabulary. That is more code, and it is the version that',
        'survives the component being rewritten.',
      ].join('\n'),
    },
    {
      label: 'Walk the composed tree by hand',
      code: [
        'export function actionFor(event: Event): string | null {',
        '  const deepest = event.composedPath()[0];',
        '  let node: Node | null = deepest instanceof Node ? deepest : null;',
        '',
        '  while (node) {',
        '    if (node instanceof HTMLElement && node.dataset.action) return node.dataset.action;',
        '',
        '    const parent = node.parentNode;',
        '    node = parent instanceof ShadowRoot ? parent.host : parent;',
        '  }',
        '',
        '  return null;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The same answer, with the walk written out — which is worth doing once, because it shows',
        'exactly where `closest` and `parentElement` stop.',
        '',
        'Inside a shadow tree, the top-level nodes have a `parentNode` (the `ShadowRoot`) and a',
        '`parentElement` of `null`, because a root is not an element. Every ancestor-walking helper in',
        'the DOM — `closest`, `parentElement`, `matches` against an ancestor selector — is built on the',
        'element chain, so all of them stop dead at that point. `node.getRootNode()` answers "which',
        'tree am I in", and `root.host` is the one deliberate door back out.',
        '',
        'Hopping from the root to its host is the entire difference between the element tree and the',
        '*composed* tree, and it is what `composedPath()` did for you in the first solution.',
        '',
        'The starting node still comes from `composedPath()[0]`. There is no way around that from a',
        'listener on the outside: `event.target` has already been retargeted by the time you see it,',
        'and the real target is not recoverable from it.',
      ].join('\n'),
      tradeoffs: [
        'Prefer this when you need to keep walking **after** the event is over. `composedPath()` is',
        'emptied when dispatch ends, so if you stash the event and read the path in a later task you',
        'get nothing; stash `composedPath()[0]` instead and this walk still works.',
        '',
        'Prefer the first version for everything else. This one is longer, it needs two type guards',
        'that are easy to get subtly wrong, and it silently walks *through* a closed root you happen to',
        'hold a reference into — where `composedPath()` would have stopped, deliberately. Reimplementing',
        'a platform walk means reimplementing the rules it enforces, and this version does not enforce',
        'them.',
        '',
        'Both versions share one limitation worth stating: they answer "which action", not "which',
        'element". If you need the element as well, return it and let the caller read the action off',
        'it — but be aware you are then handing a page-level caller a node from inside a component,',
        'which is the coupling the boundary existed to prevent.',
      ].join('\n'),
    },
  ],
};
