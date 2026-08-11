import type { Challenge } from '@/types/challenge';

import { requireElement } from './support';

/**
 * The host's open shadow root, or a failure that names what is missing.
 *
 * A closed root lands here as "no shadow root", which is exactly what a page sees: `shadowRoot` is
 * `null` for `{ mode: 'closed' }`, so the message says which mode the challenge asked for.
 */
function requireShadowRoot(doc: Document, id: string): ShadowRoot {
  const root = requireElement(doc, id).shadowRoot;
  if (!root) throw new Error(`#${id} has no open shadow root -- attach one with { mode: 'open' }`);
  return root;
}

function makeChip(doc: Document, text: string): HTMLElement {
  const chip = doc.createElement('span');
  chip.className = 'chip';
  chip.textContent = text;
  return chip;
}

export const shadowBoundary: Challenge = {
  id: 'selection-shadow-boundary',
  slug: 'shadow-boundary',
  title: 'Behind the shadow boundary',
  category: 'selection',
  difficulty: 'expert',
  concepts: ['attachShadow', 'shadowRoot', 'ShadowRoot', 'encapsulation'],
  relatedIds: [],
  prompt: [
    'Two empty containers below. Your code has two jobs:',
    '',
    '1. Attach an **open** shadow root to `#host` and put three `<span class="chip">` elements inside',
    '   it. They belong in the shadow tree — not in the page.',
    '2. Export `countInside(host)`, which returns how many `.chip` elements are inside that',
    "   element's shadow root. An element with no shadow root counts `0` rather than throwing —",
    '   `#plain` never gets one.',
    '',
    'The test checks that `document.querySelectorAll(".chip")` finds **nothing**, so appending the',
    'chips to the host itself is not a shortcut that passes.',
  ].join('\n'),
  html: ['<div id="host"></div>', '<div id="plain"></div>'].join('\n'),
  starterCode: [
    '// 1. Attach an open shadow root to #host and put three <span class="chip"> elements in it.',
    '',
    '// 2. Count the chips inside a host element’s shadow root.',
    'export function countInside(host: Element): number {',
    '  return 0;',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'the chips end up in an open shadow root, where a document query cannot reach them',
      run: ({ doc, expect }) => {
        // Asserted against what the code actually built, not against what `countInside` reports:
        // three chips appended to `#host` itself would satisfy any counting function you like, and
        // this is the line that says they are not in the page.
        expect(doc.querySelectorAll('.chip')).toHaveLength(0);
        expect(requireShadowRoot(doc, 'host').querySelectorAll('.chip')).toHaveLength(3);
      },
    },
    {
      name: 'countInside reports the chips inside the host’s shadow root',
      run: ({ doc, fn, expect }) => {
        expect(fn<(host: Element) => number>('countInside')(requireElement(doc, 'host'))).toBe(3);
      },
    },
    {
      name: 'an element with no shadow root counts zero instead of throwing',
      run: ({ doc, fn, expect }) => {
        // `#plain.shadowRoot` is `null`, and so is the `shadowRoot` of every element that never had
        // one attached -- the common case for anything a generic helper is handed.
        expect(fn<(host: Element) => number>('countInside')(requireElement(doc, 'plain'))).toBe(0);
      },
    },
    {
      name: 'the count comes from the shadow root, not from a number written by hand',
      run: ({ doc, fn, expect }) => {
        requireShadowRoot(doc, 'host').append(makeChip(doc, 'Delta'));
        expect(fn<(host: Element) => number>('countInside')(requireElement(doc, 'host'))).toBe(4);
      },
    },
  ],
  solutions: [
    {
      label: 'attachShadow and query through shadowRoot',
      code: [
        "const hostElement = document.getElementById('host');",
        '',
        'if (hostElement) {',
        "  const root = hostElement.attachShadow({ mode: 'open' });",
        '',
        "  for (const label of ['Alpha', 'Beta', 'Gamma']) {",
        "    const chip = document.createElement('span');",
        "    chip.className = 'chip';",
        '    chip.textContent = label;',
        '    root.append(chip);',
        '  }',
        '}',
        '',
        'export function countInside(host: Element): number {',
        "  return host.shadowRoot?.querySelectorAll('.chip').length ?? 0;",
        '}',
        '',
      ].join('\n'),
      explanation: [
        '`attachShadow` gives an element a second tree. The `ShadowRoot` it returns is a root node in',
        "its own right — a sibling world to the document, rendered in the host's place — and nothing",
        'inside it is a descendant of the document. That is what makes',
        "`document.querySelectorAll('.chip')` come back empty while three chips are plainly on screen.",
        '',
        'Selectors do not cross the boundary in either direction. A page-level `.chip` rule does not',
        'style them, `document.querySelector` cannot find them, and from inside, a query rooted at the',
        'shadow root cannot see the page. Crossing it is always explicit: `host.shadowRoot` on the way',
        'in, `shadowRoot.host` on the way out, and `node.getRootNode()` when you have a node and need',
        'to know which tree you are in.',
        '',
        'The chips are created with `document.createElement` even though they end up in another tree.',
        'A shadow root has no `createElement` of its own — it is a node, not a document — and',
        '`document` here means "the document this element belongs to", which is the right owner.',
        '',
        '`?.` plus `?? 0` covers the element that has no shadow root: `shadowRoot` is `null` for every',
        'ordinary element, so a helper written without the guard throws on the first plain `<div>` it',
        'is handed.',
      ].join('\n'),
      tradeoffs: [
        'This is the shape every web component has. The costs are the ones encapsulation always',
        'brings, and they are worth naming before you reach for it:',
        '',
        '- Anything that walks the document misses the shadow tree. Your own `querySelectorAll`,',
        '  yes — but also analytics scripts, translation tools, password managers, and end-to-end test',
        '  selectors. Testing libraries need explicit shadow-piercing support.',
        '- Events are **retargeted**: a listener on the page sees `event.target` as the host, not the',
        '  chip that was clicked, because the internal node is not something the page is supposed to',
        '  know about. `event.composedPath()[0]` is the real target, and an event only escapes at all',
        '  if it was created with `composed: true`.',
        '- Page styles do not reach in. That is usually the point, and it means theming has to be',
        '  designed for — CSS custom properties inherit through the boundary, and `::part` and',
        '  `::slotted` are the deliberate openings.',
        '',
        '`{ mode: "open" }` versus `{ mode: "closed" }` is not a security decision. Closed only makes',
        '`host.shadowRoot` `null`, so the component has to keep its own reference; anyone with the',
        'element can still reach the tree by patching `attachShadow` before the component runs. Open is',
        'the default choice, and closed is for discouraging accidental coupling, not for hiding',
        'anything.',
      ].join('\n'),
    },
    {
      label: 'Build the shadow tree from markup',
      code: [
        "const hostElement = document.getElementById('host');",
        '',
        'if (hostElement) {',
        "  const root = hostElement.attachShadow({ mode: 'open' });",
        '  root.innerHTML = [',
        "    '<style>.chip { border: 1px solid; border-radius: 999px; padding: 2px 8px; }</style>',",
        '    \'<span class="chip">Alpha</span>\',',
        '    \'<span class="chip">Beta</span>\',',
        '    \'<span class="chip">Gamma</span>\',',
        "  ].join('');",
        '}',
        '',
        'export function countInside(host: Element): number {',
        '  const root = host.shadowRoot;',
        '  if (!root) return 0;',
        '',
        "  return root.querySelectorAll('.chip').length;",
        '}',
        '',
      ].join('\n'),
      explanation: [
        'A `ShadowRoot` supports `innerHTML`, so the whole subtree can be written as markup in one',
        'assignment — which is how most component libraries set up their initial shadow tree.',
        '',
        'The `<style>` element is the part worth noticing. Inside a shadow root its rules apply to that',
        'tree and to nothing else on the page, no matter how generic the selector is. `.chip` here',
        'cannot collide with a `.chip` class anywhere in the document. Scoped styling with no naming',
        'convention required is the other half of what shadow DOM buys.',
        '',
        'The explicit `if (!root) return 0;` says the same thing as the optional chain above it; which',
        'one reads better is a matter of taste, and both are load-bearing.',
      ].join('\n'),
      tradeoffs: [
        '`innerHTML` parses a string, so it is the wrong tool the moment any of the content comes from',
        'data: interpolating a user-supplied name into that template is an XSS bug inside your',
        'component, and the shadow boundary does not contain it in any useful sense. Build nodes and',
        'set `textContent` for anything dynamic, and keep `innerHTML` for the static skeleton.',
        '',
        'For a component that renders more than once, neither version is the whole story: a',
        '`<template>` cloned per instance parses the markup once instead of on every construction,',
        'and adopted stylesheets (`root.adoptedStyleSheets`) share one parsed stylesheet across every',
        'instance rather than re-parsing a `<style>` element in each shadow root.',
      ].join('\n'),
    },
  ],
};
