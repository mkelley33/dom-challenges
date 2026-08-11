import type { ChallengeContent } from '@/types/challenge';

import { requireElement, requireIn } from './support';

/**
 * Declared over `Element` rather than `HTMLElement`, which is everything the tests read -- parent,
 * siblings, children, class and attributes -- and is what `requireIn` hands back without an
 * assertion. The prompt and the solutions still say `HTMLElement`, because that is what a learner's
 * own signature should say.
 */
type Duplicate = (card: Element) => Element;

export const cloneDepth: ChallengeContent = {
  prompt: [
    'The gallery holds one card: a heading and a body, wrapped in an `<article class="card">` that',
    'carries a `data-id`.',
    '',
    'Export `duplicate(card)`, which puts a copy of that card immediately after it and returns the',
    'copy. The original stays exactly as it is.',
    '',
    'A copy means the whole card — the wrapper, its attributes, and everything inside it. One test',
    'attaches a click listener to the original’s heading and clicks **both** headings afterwards; read',
    'what it expects before you assume a copy is a second reference.',
  ].join('\n'),
  html: [
    '<div id="gallery">',
    '  <article class="card" data-id="7">',
    '    <h3 class="title">Original</h3>',
    '    <p class="body">Body text</p>',
    '  </article>',
    '</div>',
  ].join('\n'),
  starterCode: [
    'export function duplicate(card: HTMLElement): HTMLElement {',
    '  const copy = card.cloneNode() as HTMLElement;',
    '  card.after(copy);',
    '',
    '  return copy;',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'the copy goes straight after the original, in the gallery',
      run: ({ doc, fn, expect }) => {
        const gallery = requireElement(doc, 'gallery');
        const card = requireIn(gallery, '.card');
        const copy = fn<Duplicate>('duplicate')(card);

        expect(gallery.querySelectorAll('.card')).toHaveLength(2);
        // Asked before anything about the copy, and asked of the node the test is holding: a
        // solution that rebuilds the gallery from a string leaves the original detached, and `null`
        // says so where comparing two identical-looking `<article>` elements would not.
        expect(card.parentElement).toBe(gallery);
        // The returned node has to be the one that was inserted, not a copy that stayed in a
        // variable: a solution that builds one node and inserts another passes neither of these.
        expect(copy.parentElement).toBe(gallery);
        expect(copy.previousElementSibling).toBe(card);
      },
    },
    {
      name: 'the copy carries the original’s attributes',
      run: ({ doc, fn, expect }) => {
        const copy = fn<Duplicate>('duplicate')(requireIn(requireElement(doc, 'gallery'), '.card'));

        expect(copy).toHaveClass('card');
        expect(copy).toHaveAttribute('data-id', '7');
      },
    },
    {
      name: 'the copy carries everything inside the card, not just the card',
      run: ({ doc, fn, expect }) => {
        const copy = fn<Duplicate>('duplicate')(requireIn(requireElement(doc, 'gallery'), '.card'));

        // `cloneNode()` with no argument is `cloneNode(false)`, which copies the element and stops.
        // The result is a correctly classed, correctly attributed, completely empty card -- which is
        // why the default being the shallow one is worth meeting once on purpose.
        expect(copy.children).toHaveLength(2);
        expect(requireIn(copy, '.title')).toHaveTextContent('Original');
        expect(requireIn(copy, '.body')).toHaveTextContent('Body text');
      },
    },
    {
      name: 'the original keeps its own children',
      run: ({ doc, fn, expect }) => {
        const card = requireIn(requireElement(doc, 'gallery'), '.card');
        fn<Duplicate>('duplicate')(card);

        // A hand-rolled copy that does `copy.append(...card.children)` moves them: insertion is a
        // move, so the "copy" ends up holding the original's only heading and body.
        expect(card.children).toHaveLength(2);
        expect(requireIn(card, '.title')).toHaveTextContent('Original');
      },
    },
    {
      name: 'the copy is not a second reference to the original',
      run: ({ doc, fire, fn, expect }) => {
        const card = requireIn(requireElement(doc, 'gallery'), '.card');
        const clicks: string[] = [];
        requireIn(card, '.title').addEventListener('click', () => clicks.push('title'));

        const copy = fn<Duplicate>('duplicate')(card);

        // The positive control comes first and shares this document and this moment with the
        // assertion after it: the listener is proven live, so the copy's heading staying silent is a
        // fact about the copy rather than about a click that went missing. AGENTS.md section 5.
        fire.click(requireIn(card, '.title'));
        expect(clicks).toHaveLength(1);

        fire.click(requireIn(copy, '.title'));
        expect(clicks).toHaveLength(1);
      },
    },
  ],
  solutions: [
    {
      label: 'Deep clone with cloneNode(true)',
      code: [
        'export function duplicate(card: HTMLElement): HTMLElement {',
        '  const copy = card.cloneNode(true) as HTMLElement;',
        '  card.after(copy);',
        '',
        '  return copy;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        '`cloneNode` takes one argument, `deep`, and it **defaults to `false`**. That default is the',
        'whole lesson: a shallow clone copies the element and its attributes and copies nothing inside',
        'it. `<article class="card" data-id="7">` comes back correctly classed, correctly attributed',
        'and completely empty — including the text, because text is a child node too, so a shallow',
        'clone of `<h3 class="title">Original</h3>` is `<h3 class="title"></h3>`.',
        '',
        '`cloneNode(true)` copies the node and its entire subtree. That is what "duplicate this card"',
        'means, and it is what you want almost every time you type this method.',
        '',
        '`card.after(copy)` inserts the copy as the original’s next sibling. `before` and `after` are',
        'the pair that place a node **beside** a reference element rather than inside a parent, which',
        'is what makes them the right shape here — the parent never has to be named. Both accept',
        'several arguments and accept strings as text, and both do nothing at all if the element you',
        'called them on has no parent, which is a quiet way to lose an insertion.',
        '',
        'What no clone carries, at any depth:',
        '',
        '- **listeners added with `addEventListener`.** They are not part of the node’s markup, so',
        '  there is nothing to copy. An `onclick="…"` *attribute* does come along, because that is an',
        '  attribute.',
        '- **properties a script assigned.** `card.myState = {…}` is on that object and no other.',
        '- **the current value of a form control.** Only the `value` *attribute* is copied, and typing',
        '  into an input changes the property, not the attribute — so a half-filled form clones back to',
        '  empty. The same goes for a ticked checkbox and a scrolled container.',
        '',
        'And one thing it does carry that you often do not want: `id`. It is an attribute like any',
        'other, so cloning an element with an id gives you two elements with that id, `getElementById`',
        'answers with the first one, and nothing anywhere complains.',
      ].join('\n'),
      tradeoffs: [
        'This is the cheap, exact copy: no serialising, no parsing, and the result is structurally',
        'identical to what you cloned. It is what makes `<template>` stamping work, and it is the',
        'default choice.',
        '',
        'Weigh three things before reaching for it:',
        '',
        '- **Exactness cuts both ways.** Ids, `for`/`aria-labelledby` pairs and anything else that has',
        '  to be unique on a page is duplicated verbatim, and you have to fix them up afterwards.',
        '- **It is proportional to the subtree.** Cloning a small template row a hundred times is',
        '  nothing; cloning a large section repeatedly is real work, and the copy is a whole second',
        '  tree in memory.',
        '- **It copies markup, not behaviour.** If the thing being duplicated is a component whose',
        '  listeners were wired up in JavaScript, the copy is scenery. Delegation — one listener on an',
        '  ancestor, matching with `closest` — is what makes cloned rows work without rewiring each',
        '  one, and it is the reason delegation and cloning turn up together so often.',
        '',
        '`document.importNode(node, true)` is the same operation for a node that belongs to a',
        '*different* document — a `DOMParser` result, or another frame. Insertion adopts a foreign node',
        'anyway in modern browsers, so `cloneNode` then `append` also works; `importNode` says out loud',
        'that a document boundary is being crossed.',
      ].join('\n'),
    },
    {
      label: 'Copy through outerHTML',
      code: [
        'export function duplicate(card: HTMLElement): HTMLElement {',
        "  card.insertAdjacentHTML('afterend', card.outerHTML);",
        '',
        '  const copy = card.nextElementSibling;',
        "  if (!(copy instanceof HTMLElement)) throw new Error('the copy was not inserted');",
        '',
        '  return copy;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The other way to copy a node: serialise it to markup and let the parser build a new one.',
        '`outerHTML` reads the element *and* its own tags back as a string, where `innerHTML` reads',
        "only what is inside it, and `insertAdjacentHTML('afterend', …)` parses that string and inserts",
        'the result as the next sibling.',
        '',
        'The visible result is the same, and so are the two facts this challenge is about: the copy has',
        'all the descendants (they were in the markup) and none of the listeners (they were not).',
        '',
        'The copy has to be found afterwards — `insertAdjacentHTML` returns nothing — so',
        '`nextElementSibling` is doing the job the `copy` variable did above.',
      ].join('\n'),
      tradeoffs: [
        'Reach for this when the copy is meant to be a *fresh* one rather than a faithful one — reset',
        'to whatever the markup says, with any state a user or a script had put into it deliberately',
        'dropped. That is occasionally exactly the requirement.',
        '',
        'Otherwise `cloneNode(true)` is better on every axis that matters here:',
        '',
        '- **It is slower.** Serialising a subtree to a string and parsing it back is real work that',
        '  `cloneNode` skips entirely.',
        '- **It loses state silently.** Typed-in values, ticked boxes, scroll positions — the same list',
        '  as above, except that here a reader cannot tell the difference from the code.',
        '- **It depends on the element being valid on its own.** HTML parsing is context-sensitive: a',
        '  `<tr>`’s `outerHTML` parsed anywhere a row is not allowed is discarded, and the insertion',
        '  quietly produces nothing.',
        '- **It normalises the markup.** Attribute order and quoting come back as the serialiser writes',
        '  them, which matters the moment anything compares HTML strings.',
        '',
        'What it is *not* is an injection hole by itself — the text inside the original was escaped on',
        'the way out, so it round-trips as text. It becomes one the moment anything is concatenated',
        'into that string.',
      ].join('\n'),
    },
  ],
};
