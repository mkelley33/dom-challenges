import type { ChallengeContent } from '@/types/challenge';

import { requireElement, requireIn } from './support';

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

type AddDot = (chart: Element, cx: string, cy: string) => Element;

export const svgNamespace: ChallengeContent = {
  prompt: [
    'The chart is an inline `<svg>` holding a title and one `<circle class="dot">` to copy the styling',
    'from. Export `addDot(chart, cx, cy)` that adds another dot at that position and returns it:',
    '',
    '```html',
    '<circle class="dot" cx="…" cy="…" r="4"></circle>',
    '```',
    '',
    'The starter builds that element and appends it, and the chart renders **nothing new**. What comes',
    'out has the right tag name, the right attributes and the right parent, so nothing looks wrong —',
    'the two tests that fail are the ones asking what the element actually *is*.',
    '',
    'The title and the existing dot must still be the same nodes when you are done, and the dot you',
    'add carries no `id` — there is already an element using the one in the markup.',
  ].join('\n'),
  html: [
    '<svg id="chart" viewBox="0 0 100 100" width="120" height="120">',
    '  <title id="caption">Weekly totals</title>',
    '  <circle id="first" class="dot" cx="10" cy="90" r="4"></circle>',
    '</svg>',
  ].join('\n'),
  starterCode: [
    'export function addDot(chart: Element, cx: string, cy: string): Element {',
    "  const dot = document.createElement('circle');",
    "  dot.setAttribute('class', 'dot');",
    "  dot.setAttribute('cx', cx);",
    "  dot.setAttribute('cy', cy);",
    "  dot.setAttribute('r', '4');",
    '',
    '  chart.append(dot);',
    '',
    '  return dot;',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'the dot belongs to the SVG namespace',
      run: ({ doc, fn, expect }) => {
        const chart = requireElement(doc, 'chart');
        const dot = fn<AddDot>('addDot')(chart, '50', '20');

        // The whole challenge. `createElement` always builds an HTML element, whatever name you give
        // it, so this reads the XHTML namespace -- an `HTMLUnknownElement` that SVG rendering ignores
        // completely. Compared against the string rather than with `instanceof`, which would be the
        // app realm's constructor against the frame's element (AGENTS.md section 3).
        expect(dot.namespaceURI).toBe(SVG_NAMESPACE);
        // The namespace the existing dot has, asserted from the document rather than assumed, so this
        // is a comparison between two elements in one tree.
        expect(requireElement(doc, 'first').namespaceURI).toBe(SVG_NAMESPACE);
      },
    },
    {
      name: 'its tag name keeps the lower case that SVG uses',
      run: ({ doc, fn, expect }) => {
        const dot = fn<AddDot>('addDot')(requireElement(doc, 'chart'), '50', '20');

        // A second, independent witness of the same fact, and the one you can see in a debugger:
        // `tagName` is upper-cased for HTML elements and left alone for foreign ones, so an
        // `HTMLUnknownElement` named circle reports `CIRCLE` where a real SVG circle reports `circle`.
        expect(dot.tagName).toBe('circle');
        expect(requireElement(doc, 'first').tagName).toBe('circle');
      },
    },
    {
      name: 'the dot is in the chart, and it is the element that was returned',
      run: ({ doc, fn, expect }) => {
        const chart = requireElement(doc, 'chart');
        const dot = fn<AddDot>('addDot')(chart, '50', '20');

        expect(dot.parentElement).toBe(chart);
        expect(chart.querySelectorAll('.dot')).toHaveLength(2);
      },
    },
    {
      name: 'it carries the position it was given',
      run: ({ doc, fn, expect }) => {
        // Values that match neither the existing dot's nor each other, so a hardcoded attribute and a
        // swapped pair of arguments both show up.
        const dot = fn<AddDot>('addDot')(requireElement(doc, 'chart'), '73', '21');

        expect(dot).toHaveAttribute('cx', '73');
        expect(dot).toHaveAttribute('cy', '21');
        expect(dot).toHaveAttribute('r', '4');
        expect(dot).toHaveAttribute('class', 'dot');
        // A clone copies attributes, and `id` is an attribute. Two elements answering to `#first` is
        // the quiet half of that, and `getElementById` picks whichever comes first in the document.
        expect(dot).not.toHaveAttribute('id');
        expect(requireIn(requireElement(doc, 'chart'), '#first')).toBe(requireElement(doc, 'first'));
      },
    },
    {
      name: 'the title and the first dot are the same nodes afterwards',
      run: ({ doc, fn, expect }) => {
        const chart = requireElement(doc, 'chart');
        const caption = requireElement(doc, 'caption');
        const first = requireElement(doc, 'first');
        fn<AddDot>('addDot')(chart, '50', '20');

        // `chart.innerHTML += '<circle …>'` does produce a correctly namespaced circle, because the
        // context element is the `<svg>` and the parser is in foreign content there. It also rebuilds
        // everything already in the chart, which is what this rejects.
        expect(caption.parentElement).toBe(chart);
        expect(first.parentElement).toBe(chart);
      },
    },
  ],
  solutions: [
    {
      label: 'createElementNS with the SVG namespace',
      code: [
        "const SVG_NS = 'http://www.w3.org/2000/svg';",
        '',
        'export function addDot(chart: Element, cx: string, cy: string): Element {',
        "  const dot = document.createElementNS(SVG_NS, 'circle');",
        '',
        "  dot.setAttribute('class', 'dot');",
        "  dot.setAttribute('cx', cx);",
        "  dot.setAttribute('cy', cy);",
        "  dot.setAttribute('r', '4');",
        '',
        '  chart.append(dot);',
        '',
        '  return dot;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'An element’s name is not its identity. Every element also belongs to a **namespace**, and that',
        'is what decides which class it gets, which attributes mean anything, and whether a renderer',
        'draws it at all.',
        '',
        '`document.createElement(name)` creates an **HTML** element, always. Give it a name HTML does',
        'not define and you get an `HTMLUnknownElement` in the XHTML namespace that happens to be',
        'called `circle`. Append it inside an `<svg>` and it sits there in the tree, matches',
        '`querySelector(".dot")`, carries every attribute you set — and draws nothing, because the SVG',
        'renderer only knows about elements in the SVG namespace. Nothing throws. Nothing warns.',
        '',
        '`document.createElementNS(ns, name)` is the one that takes the namespace as an argument, and',
        '`http://www.w3.org/2000/svg` is a fixed string worth recognising on sight (MathML’s is',
        '`http://www.w3.org/1998/Math/MathML`).',
        '',
        'Two ways to see the difference from the outside:',
        '',
        '- `element.namespaceURI` says it directly.',
        '- **`tagName` case.** HTML elements report their name upper-cased; foreign elements report it',
        '  exactly as written. So `CIRCLE` is the broken one and `circle` is the real one, which is why',
        '  a debugger showing `<CIRCLE>` inside an `<svg>` is the tell.',
        '',
        'The attributes go through `setAttribute` rather than through properties, and for `class` that',
        'is not a style choice: on an SVG element `className` is a **read-only** `SVGAnimatedString`,',
        'not a string. `dot.className = "dot"` does not quietly fail — it throws',
        '`TypeError: Cannot set property className of #<SVGElement> which has only a getter`, because',
        'module code runs in strict mode. `setAttribute("class", …)` and `classList` both work, on SVG',
        'and HTML alike, which is why they are the ones to reach for when the element might be either.',
        '',
        'Parsing gets this right without being told, which is why the markup in the page is fine: an',
        '`<svg>` start tag switches the HTML parser into foreign content mode, so everything inside it',
        'is built in the SVG namespace. It is only the DOM API that needs to be told, because',
        '`createElement` has no surrounding markup to infer it from — the element does not know where',
        'it is going to be put.',
      ].join('\n'),
      tradeoffs: [
        'This is the correct answer and there is no real argument against it. What is worth carrying',
        'away is where the same trap is waiting:',
        '',
        '- **Any SVG built by script.** Icons, charts, sparklines, annotation overlays — every element',
        '  in them needs `createElementNS`, not just the outer `<svg>`.',
        '- **MathML**, identically.',
        '- **Copy-pasted helpers.** A `createElement`-based element factory that has only ever made',
        '  `<div>`s will silently produce non-rendering nodes the first time someone points it at SVG.',
        '',
        'And where it is *not* waiting: anything the parser built. Markup in the page, `innerHTML`',
        'assigned to an element inside the SVG tree, and a `<template>` whose content includes the',
        '`<svg>` wrapper all come out correctly namespaced, because in each case the parser could see',
        'where the element was going.',
      ].join('\n'),
    },
    {
      label: 'Clone the dot that is already in the chart',
      code: [
        'export function addDot(chart: Element, cx: string, cy: string): Element {',
        "  const prototype = chart.querySelector('.dot');",
        "  if (!prototype) throw new Error('the chart has no dot to copy');",
        '',
        '  const dot = prototype.cloneNode(false) as Element;',
        '',
        "  dot.removeAttribute('id');",
        "  dot.setAttribute('cx', cx);",
        "  dot.setAttribute('cy', cy);",
        '',
        '  chart.append(dot);',
        '',
        '  return dot;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'A clone keeps the namespace of what it copied. The dot in the markup was built by the parser',
        'inside an `<svg>`, so it is a real SVG circle, and so is every copy of it — no namespace',
        'constant appears anywhere in this version.',
        '',
        'It also arrives with the attributes already on it, which is why only the two that vary are set',
        'afterwards. `r="4"` and `class="dot"` come along for free.',
        '',
        '`cloneNode(false)` because a circle has no children worth copying; a shape that did — a',
        '`<g>` holding several elements — would need `true`, and that is the case where this approach',
        'really earns its place.',
        '',
        '`removeAttribute("id")` is the part that is easy to forget. The prototype has an `id`, a clone',
        'copies attributes, and two elements sharing an id is a bug that surfaces somewhere else',
        'entirely.',
      ].join('\n'),
      tradeoffs: [
        'Reach for this when the thing being added is a *shape* rather than a single element: a marker',
        'made of a circle and a label, a legend swatch, a chart annotation. Cloning a prototype keeps',
        'the structure and the styling in the markup where they can be seen, and the JavaScript only',
        'moves it and fills in what varies — the same bargain as a `<template>`, which is the other way',
        'to hold one (its content parses correctly as long as the `<svg>` wrapper is inside it).',
        '',
        'What it costs:',
        '',
        '- **A selector links the two halves.** Rename `.dot` in the markup and this throws, or worse,',
        '  finds the wrong element. `createElementNS` has nothing to keep in step.',
        '- **The prototype has to exist**, which means the markup carries an element whose only job is',
        '  to be copied — usually one that is also being displayed, as here, or a hidden one that has to',
        '  be kept out of the rendering.',
        '- **A clone copies everything**, including the `id` and including any attribute someone added',
        '  to the prototype for its own sake.',
        '',
        'One route to avoid: `chart.insertAdjacentHTML("beforeend", "<circle …>")`. It reads like the',
        'obvious string equivalent, and its namespace handling is **not portable** — this project has',
        'measured the two engines disagreeing on it. `chart.innerHTML +=` gets the namespace right in',
        'both and destroys everything already in the chart, which the last test rejects.',
      ].join('\n'),
    },
  ],
};
