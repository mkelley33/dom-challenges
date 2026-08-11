import type { ChallengeContent } from '@/types/challenge';

import { requireElement, requireIn } from './support';

type Decorate = (quote: HTMLElement) => void;

export const adjacentPositions: ChallengeContent = {
  prompt: [
    'A `<blockquote>` holds one paragraph. Four pieces have to go around and inside that paragraph,',
    'and every one of them is a different position:',
    '',
    '```html',
    '<p class="lead">Steve Jobs said:</p>   <!-- before the quote, inside the blockquote -->',
    '<span class="open">“</span>            <!-- the quote’s first child -->',
    '<span class="close">”</span>           <!-- the quote’s last child -->',
    '<cite class="who">— Steve Jobs</cite>  <!-- after the quote, inside the blockquote -->',
    '```',
    '',
    'Export `decorate(quote)` that inserts all four. The paragraph’s own text must still be the same',
    'text node when you are finished — decorate the quote, do not rebuild it.',
    '',
    'The starter puts all four in one place. Exactly one of them is already right.',
  ].join('\n'),
  html: ['<blockquote id="wrap">', '  <p id="quote">Design is how it works.</p>', '</blockquote>'].join('\n'),
  starterCode: [
    'export function decorate(quote: HTMLElement): void {',
    "  quote.insertAdjacentHTML('beforebegin', '<p class=\"lead\">Steve Jobs said:</p>');",
    "  quote.insertAdjacentHTML('beforebegin', '<span class=\"open\">“</span>');",
    "  quote.insertAdjacentHTML('beforebegin', '<span class=\"close\">”</span>');",
    "  quote.insertAdjacentHTML('beforebegin', '<cite class=\"who\">— Steve Jobs</cite>');",
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'the lead and the citation are siblings of the quote, not children of it',
      run: ({ doc, fn, expect }) => {
        const wrap = requireElement(doc, 'wrap');
        const quote = requireElement(doc, 'quote');
        fn<Decorate>('decorate')(quote);

        // The whole `beforebegin` / `afterbegin` confusion shows up here and nowhere else: both
        // insert "at the start", and only one of them stays outside the element.
        expect(requireIn(wrap, '.lead').parentElement).toBe(wrap);
        expect(requireIn(wrap, '.who').parentElement).toBe(wrap);
        expect(quote.previousElementSibling).toHaveClass('lead');
        expect(quote.nextElementSibling).toHaveClass('who');
      },
    },
    {
      name: 'the quotation marks are inside the quote, first and last',
      run: ({ doc, fn, expect }) => {
        const quote = requireElement(doc, 'quote');
        fn<Decorate>('decorate')(quote);

        expect(requireIn(quote, '.open').parentElement).toBe(quote);
        expect(requireIn(quote, '.close').parentElement).toBe(quote);
        expect(quote.firstElementChild).toHaveClass('open');
        expect(quote.lastElementChild).toHaveClass('close');
      },
    },
    {
      name: 'the quote’s own text is the same text node afterwards',
      run: ({ doc, fn, expect }) => {
        const quote = requireElement(doc, 'quote');
        const text = quote.firstChild;
        if (!text) throw new Error('the quote should start with a text node');
        fn<Decorate>('decorate')(quote);

        // `quote.innerHTML = '<span…>' + quote.innerHTML + '<span…>'` produces the same picture and
        // a different tree: the paragraph's text is a new node, and anything a script was holding --
        // a Range, a selection, a reference kept for a highlight -- is now pointing at nothing.
        expect(text.parentNode).toBe(quote);
        expect(quote.childNodes[1]).toBe(text);
      },
    },
    {
      name: 'the four pieces land in document order',
      run: ({ doc, fn, expect }) => {
        const wrap = requireElement(doc, 'wrap');
        fn<Decorate>('decorate')(requireElement(doc, 'quote'));

        // `querySelectorAll` reports matches in document order, so this reads the finished tree the
        // way a reader would: the lead, then the two marks inside the quote, then the citation.
        const inserted = [...wrap.querySelectorAll('.lead, .open, .close, .who')];
        expect(inserted.map((piece) => piece.className)).toEqual(['lead', 'open', 'close', 'who']);
      },
    },
  ],
  solutions: [
    {
      label: 'One insertAdjacentHTML call per position',
      code: [
        'export function decorate(quote: HTMLElement): void {',
        "  quote.insertAdjacentHTML('beforebegin', '<p class=\"lead\">Steve Jobs said:</p>');",
        "  quote.insertAdjacentHTML('afterbegin', '<span class=\"open\">“</span>');",
        "  quote.insertAdjacentHTML('beforeend', '<span class=\"close\">”</span>');",
        "  quote.insertAdjacentHTML('afterend', '<cite class=\"who\">— Steve Jobs</cite>');",
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The four position names are all relative to the element’s **own tags**, and reading them that',
        'way makes them stop being confusable:',
        '',
        '```html',
        '<!-- beforebegin -->',
        '<p>',
        '  <!-- afterbegin -->',
        '  the existing content',
        '  <!-- beforeend -->',
        '</p>',
        '<!-- afterend -->',
        '```',
        '',
        'So `beforebegin` is before the opening tag and `afterbegin` is just inside it. Two of the four',
        'insert **siblings** and two insert **children**, and the trap is that "before" and "after"',
        'sound like they describe the same axis in all four.',
        '',
        'Each call parses its string and inserts the result. It does not read the element back out',
        'first, which is the entire difference from `quote.innerHTML = … + quote.innerHTML + …`: the',
        'text node in the paragraph is never touched, so anything holding a reference to it — a',
        '`Range`, the user’s current selection, a highlight — survives.',
        '',
        'The two outside positions need somewhere to go. On an element with no parent, `beforebegin`',
        'and `afterend` throw `NoModificationAllowedError`, because there is nothing to be adjacent to.',
      ].join('\n'),
      tradeoffs: [
        'This is the right tool when what you are inserting is markup you wrote: a fixed shape, several',
        'elements deep, with nothing interpolated. One line per insertion, and the HTML is readable as',
        'HTML.',
        '',
        'Three costs, in the order they usually bite:',
        '',
        '- **It takes markup, so a value interpolated into it is markup.** `insertAdjacentText` is the',
        '  same four positions for a string that must stay text, and it is the right call for anything',
        '  a user typed.',
        '- **It hands nothing back.** The return value is `undefined`, so if you need the element you',
        '  just inserted you have to go and find it. `insertAdjacentElement` is the same four positions',
        '  for a node, and it returns the element it inserted.',
        '- **It parses.** For one insertion that is nothing; inside a loop over a thousand rows, one',
        '  parse per row is the thing to notice.',
      ].join('\n'),
    },
    {
      label: 'The four node methods: before, prepend, append, after',
      code: [
        'function piece(tag: string, className: string, text: string): HTMLElement {',
        '  const element = document.createElement(tag);',
        '  element.className = className;',
        '  element.textContent = text;',
        '',
        '  return element;',
        '}',
        '',
        'export function decorate(quote: HTMLElement): void {',
        "  quote.before(piece('p', 'lead', 'Steve Jobs said:'));",
        "  quote.prepend(piece('span', 'open', '“'));",
        "  quote.append(piece('span', 'close', '”'));",
        "  quote.after(piece('cite', 'who', '— Steve Jobs'));",
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The same four positions, one method each, and the mapping is exact:',
        '',
        '| position       | method      | inserts a  |',
        '| -------------- | ----------- | ---------- |',
        '| `beforebegin`  | `before`    | sibling    |',
        '| `afterbegin`   | `prepend`   | child      |',
        '| `beforeend`    | `append`    | child      |',
        '| `afterend`     | `after`     | sibling    |',
        '',
        'Learning the four method names is usually easier than learning the four position strings,',
        'because `prepend` and `append` say which end and `before` and `after` say which side.',
        '',
        'The important difference is what they do with a **string**. All four of these accept strings',
        'as well as nodes, and a string becomes a **text node** — `quote.prepend("“")` inserts that one',
        'character, and `quote.prepend("<b>x</b>")` inserts eight characters rather than an element.',
        '`insertAdjacentHTML` takes the same string and parses it as markup. Same four places, opposite',
        'treatment of the argument, and that is the distinction to keep straight: these escape, that',
        'one does not.',
        '',
        'They also take several arguments at once, so `quote.before(lead, spacer)` is one call.',
      ].join('\n'),
      tradeoffs: [
        'Reach for these whenever a value from outside the program is involved, because there is no',
        'string of HTML anywhere in this version and therefore no escaping to get wrong. Reach for them',
        'too when you want the nodes afterwards: `piece(...)` hands each element back, so styling it,',
        'listening on it or measuring it needs no query.',
        '',
        'The cost is the element-building. Four lines of helper for four small pieces is fine; the same',
        'helper for a card with nine elements in it is worse than writing the HTML, which is where a',
        '`<template>` comes in.',
        '',
        'One asymmetry worth carrying away: `before` and `after` on an element with **no parent do',
        'nothing at all** — no error, no insertion — where `insertAdjacentHTML` throws for the same two',
        'positions. Silence is the more dangerous of the two behaviours, and it is the one you get from',
        'the friendlier API.',
      ].join('\n'),
    },
  ],
};
