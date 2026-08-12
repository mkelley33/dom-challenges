import type { ChallengeContent } from '@/types/challenge';

import { requireElement } from './support';

/**
 * Declared over `HTMLElement` rather than `HTMLParagraphElement`: the tests assert on `tagName`, a
 * string every element carries, so nothing here needs the narrower type. The prompt still says what
 * the learner's own signature should say.
 */
type AddNote = (board: HTMLElement, text: string) => HTMLElement;

export const createAndAppend: ChallengeContent = {
  prompt: [
    'The board below has a heading and nothing else. Export `addNote(board, text)` that builds one',
    '`<p class="note">` carrying that text, puts it at the end of the board, and returns it.',
    '',
    'Three things the tests insist on:',
    '',
    '- **The note has to be on the page.** Making an element and handing it back is not the same as',
    '  putting it somewhere — a created element belongs to the document but is not *in* it.',
    '- **The heading has to survive.** Adding a note must leave what was already there exactly as it',
    '  was, down to the same nodes.',
    '- **A note is text.** A note of `<em>urgent</em>` shows those angle brackets on screen.',
  ].join('\n'),
  html: ['<section id="board">', '  <h2 id="heading">Notes</h2>', '</section>'].join('\n'),
  starterCode: [
    'export function addNote(board: HTMLElement, text: string): HTMLElement {',
    "  const note = document.createElement('p');",
    "  note.className = 'note';",
    '  note.textContent = text;',
    '',
    '  // The note exists. Nothing on the page has it yet.',
    '  return note;',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'builds a paragraph with the class and the text',
      run: ({ doc, fn, expect }) => {
        const note = fn<AddNote>('addNote')(requireElement(doc, 'board'), 'Buy milk');

        expect(note.tagName).toBe('P');
        expect(note).toHaveClass('note');
        expect(note).toHaveTextContent('Buy milk');
      },
    },
    {
      name: 'puts the note in the board, where the document can find it',
      run: ({ doc, fn, expect }) => {
        const board = requireElement(doc, 'board');
        const note = fn<AddNote>('addNote')(board, 'Buy milk');

        // The two halves of "it is on the page", and they fail for different reasons: the first for
        // an element that was built and never inserted, the second for one inserted somewhere else.
        expect(note.parentElement).toBe(board);
        expect(doc.querySelectorAll('#board .note')).toHaveLength(1);
      },
    },
    {
      name: 'leaves the heading that was already there alone',
      run: ({ doc, fn, expect }) => {
        const board = requireElement(doc, 'board');
        const heading = requireElement(doc, 'heading');
        fn<AddNote>('addNote')(board, 'Buy milk');

        // Node identity, not "a heading is still there": `board.innerHTML += ...` reparses the whole
        // container, so the heading a learner sees afterwards is a *different* element that happens
        // to look the same -- with any listener, any property and any reference to it gone. Asked as
        // "is the node the test is holding still in the board", because the reparse leaves that one
        // detached and `null` is a legible answer where two identical-looking `<h2>`s are not.
        expect(heading.parentElement).toBe(board);
        expect(board.firstElementChild).toBe(heading);
      },
    },
    {
      name: 'adds one note per call, in the order they were added',
      run: ({ doc, fn, expect }) => {
        const board = requireElement(doc, 'board');
        const addNote = fn<AddNote>('addNote');

        addNote(board, 'First');
        addNote(board, 'Second');

        expect([...board.querySelectorAll('.note')].map((note) => note.textContent)).toEqual(['First', 'Second']);
      },
    },
    {
      name: 'a note that looks like markup is inserted as text',
      run: ({ doc, fn, expect }) => {
        const board = requireElement(doc, 'board');
        const note = fn<AddNote>('addNote')(board, '<em>urgent</em>');

        expect(board.querySelectorAll('em')).toHaveLength(0);
        expect(note).toHaveTextContent('<em>urgent</em>');
      },
    },
  ],
  solutions: [
    {
      label: 'Create the element, then append it',
      code: [
        'export function addNote(board: HTMLElement, text: string): HTMLElement {',
        "  const note = document.createElement('p');",
        "  note.className = 'note';",
        '  note.textContent = text;',
        '',
        '  board.append(note);',
        '',
        '  return note;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        '`document.createElement` makes an element that belongs to the document and is not in it. It',
        'has no parent, no position, no box; no selector finds it, no CSS rule applies to it, and',
        'nothing about it is rendered. That is not a half-built element — it is an ordinary element',
        'that is simply somewhere else, and it stays that way until something inserts it.',
        '',
        'Inserting is the separate step, and `append` is the ordinary way to do it: it adds the node as',
        'the last child of the parent it is called on. It takes several arguments at once, so',
        '`row.append(icon, label)` is one call, and each argument may be a **node or a string** —',
        '`row.append("Save")` creates a text node for you, which is why the string form escapes.',
        '',
        '`textContent = text` writes one text node holding exactly those characters. `<em>urgent</em>`',
        'ends up as eleven characters on screen rather than as an element, and that is the whole',
        'difference between rendering what someone typed and running it.',
        '',
        'Returning the element matters more than it looks. You built it, so you already have a',
        'reference to the exact node — no query to write, nothing to keep in step with a class name you',
        'might rename later. Code that has to go and *find* what it just inserted has thrown away',
        'something it was holding.',
      ].join('\n'),
      tradeoffs: [
        'This is the default, and the reason is that every step is a value you can hold: the element,',
        'its text, and the moment it becomes visible are three separate things you control. When the',
        'text comes from a person, a database or a URL, this route has no escaping question to get',
        'wrong, because at no point is there a string of HTML.',
        '',
        'What it costs is verbosity. Six elements deep, `createElement` plus `className` plus `append`',
        'describes a shape that one line of HTML describes better — which is when a `<template>` starts',
        'to earn its place.',
        '',
        'Two smaller choices inside it:',
        '',
        '- `append` versus `appendChild`. `appendChild` takes exactly one node, rejects strings, and',
        '  returns the node; `append` takes any number of nodes and strings and returns nothing. Reach',
        '  for `append` unless you want the return value.',
        '- `className = "note"` versus `classList.add("note")`. The first *replaces* whatever classes',
        '  the element had, which is safe on an element you just made and a bug on one you did not.',
      ].join('\n'),
    },
    {
      label: 'Insert the markup as a string, escaped by hand',
      code: [
        'function escapeHtml(value: string): string {',
        "  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');",
        '}',
        '',
        'export function addNote(board: HTMLElement, text: string): HTMLElement {',
        '  board.insertAdjacentHTML(\'beforeend\', `<p class="note">${escapeHtml(text)}</p>`);',
        '',
        '  const note = board.lastElementChild;',
        "  if (!(note instanceof HTMLElement)) throw new Error('the note was not inserted');",
        '',
        '  return note;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The same result from the other direction: write the markup, let the HTML parser build the',
        'nodes. `insertAdjacentHTML` parses its string and inserts the result at one of four places —',
        'here `beforeend`, meaning "inside this element, after its last child".',
        '',
        'The important word is *inserts*. This is not `board.innerHTML += …`, which reads the container',
        'back out as a string, throws away every node in it and parses the whole thing again. The',
        'heading survives this call as the same node because nothing here touched it.',
        '',
        '`escapeHtml` is doing the job `textContent` did for free above, and the order of the three',
        'replacements is not arbitrary: `&` has to go first, or it re-escapes the ampersands the later',
        'two just introduced and `<` comes out as `&amp;lt;`.',
        '',
        '`lastElementChild` is how the element is recovered afterwards. `insertAdjacentHTML` returns',
        'nothing at all, so there is no reference to keep — you have to go and find what you just made.',
        '(`insertAdjacentElement` returns the element it inserted, but then you are back to building it',
        'yourself, which is the solution above.)',
      ].join('\n'),
      tradeoffs: [
        'Reach for this when the thing you are inserting is genuinely a chunk of markup you wrote —',
        'several nested elements, no interpolation, or interpolation only of values you produced. Six',
        'lines of `createElement` for a fixed shape is worse code than one line of HTML.',
        '',
        'Refuse it the moment a string from outside your program is interpolated, and note that "I',
        'escaped it" is a claim you have to keep true forever:',
        '',
        '- The three replacements above are enough for text between tags and **not** enough inside an',
        '  attribute, where a value containing a quote closes it early. `<p title="${text}">` needs `"`',
        "  and `'` escaped as well, and getting that wrong is `<img src=x onerror=alert(1)>` in someone",
        "  else's page.",
        '- Every future edit to this function inherits the obligation. The `createElement` version',
        '  cannot be broken this way by anyone, ever, because it has no HTML in it.',
        '',
        'It is also slower per call — a string to serialise, a parser to run, nodes to build — though',
        'in the other direction it is the fast way to insert *many* elements at once, since one parse',
        'and one insertion beat a hundred of each. Correctness first: build the nodes, and reach for a',
        'string only when there is nothing in it that came from a user.',
      ].join('\n'),
    },
  ],
};
