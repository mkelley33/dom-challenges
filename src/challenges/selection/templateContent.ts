import type { ChallengeContent } from '@/types/challenge';

import { requireElement } from './support';

/**
 * The template's own `DocumentFragment`, for the tests that have to change what the template holds.
 *
 * `querySelector<HTMLTemplateElement>` rather than `getElementById` plus a cast: the generic is the
 * standard way to tell the compiler which element a selector names, and `content` exists on no
 * other element type.
 */
function templateFragment(doc: Document, id: string): DocumentFragment {
  const template = doc.querySelector<HTMLTemplateElement>(`#${id}`);
  if (!template) throw new Error(`#${id} is missing from the challenge markup`);
  return template.content;
}

function makeRow(doc: Document, text: string): HTMLElement {
  const row = doc.createElement('li');
  row.className = 'row';
  row.textContent = text;
  return row;
}

export const templateContent: ChallengeContent = {
  prompt: [
    'The page below holds an empty list and a `<template>` containing three `<li class="row">`',
    'elements.',
    '',
    'Export a function `templateItemCount()` that returns how many `.row` elements the template',
    'holds — three, as the page stands.',
    '',
    '`document.querySelectorAll(".row")` returns **nothing** here, and that is not a bug in the',
    'markup. Counting must also leave the page exactly as it found it: the rows stay in the template.',
  ].join('\n'),
  html: [
    '<h2>Rows</h2>',
    '<ul id="rows"></ul>',
    '<template id="row-template">',
    '  <li class="row">Alpha</li>',
    '  <li class="row">Beta</li>',
    '  <li class="row">Gamma</li>',
    '</template>',
  ].join('\n'),
  starterCode: [
    'export function templateItemCount(): number {',
    "  return document.querySelectorAll('.row').length;",
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'counts the rows the template holds',
      run: ({ doc, fn, expect }) => {
        // The premise, asserted rather than described: a document-level query finds none of them.
        // The rows are in the template's `content` fragment, which is not part of the document at
        // all, so no selector rooted at `document` can reach them.
        expect(doc.querySelectorAll('.row')).toHaveLength(0);
        expect(fn<() => number>('templateItemCount')()).toBe(3);
      },
    },
    {
      name: 'leaves the template where it is instead of emptying it into the page',
      run: ({ doc, fn, expect }) => {
        const templateItemCount = fn<() => number>('templateItemCount');
        templateItemCount();

        // `list.append(template.content)` *moves* the fragment's children into the document, which
        // makes a document-level count report 3 -- once. The template is empty afterwards, so the
        // second call answers 0 and the page has grown three rows nobody asked for.
        expect(doc.querySelectorAll('#rows .row')).toHaveLength(0);
        expect(templateItemCount()).toBe(3);
      },
    },
    {
      name: 'counts what the template holds now, not a number written by hand',
      run: ({ doc, fn, expect }) => {
        templateFragment(doc, 'row-template').append(makeRow(doc, 'Delta'));
        expect(fn<() => number>('templateItemCount')()).toBe(4);
      },
    },
    {
      name: 'counts the template’s rows, not the page’s',
      run: ({ doc, fn, expect }) => {
        // A real row, in the document, of the same class. It is not in the template, so it is not
        // part of the answer -- which is what separates reading `content` from counting `.row`
        // wherever it happens to be.
        requireElement(doc, 'rows').append(makeRow(doc, 'Live row'));
        expect(fn<() => number>('templateItemCount')()).toBe(3);
      },
    },
  ],
  solutions: [
    {
      label: 'Query the template’s content fragment',
      code: [
        'export function templateItemCount(): number {',
        "  const template = document.getElementById('row-template');",
        '  if (!(template instanceof HTMLTemplateElement)) return 0;',
        '',
        "  return template.content.querySelectorAll('.row').length;",
        '}',
        '',
      ].join('\n'),
      explanation: [
        'A `<template>` is the one element whose children are not its children. The parser takes',
        'everything between the tags and puts it in a `DocumentFragment` hanging off the element as',
        '`.content` — so `template.children` is empty, `template.innerHTML` reads the markup back as',
        'text, and `document.querySelectorAll` cannot reach any of it. The fragment is not in the',
        'document, and a query rooted at the document searches the document.',
        '',
        'The fragment is a node like any other, though, so `template.content.querySelectorAll` works',
        'exactly as it would on an element.',
        '',
        'That separation is the point of the element: template contents are **inert**. `<img>` inside a',
        'template fetches nothing. `<script>` inside it does not run. Custom elements are not upgraded,',
        'stylesheets in it are not applied, and `<video autoplay>` does not start. The fragment even',
        'belongs to a different document — the "template contents owner" — which is what makes all of',
        'that fall out of one rule rather than a list of special cases. Markup you can hold without',
        'paying for it is precisely what a template is for.',
        '',
        '`instanceof HTMLTemplateElement` narrows the `HTMLElement | null` from `getElementById` down',
        'to the one type that has `content`. It is the right check here because the element and the',
        'code checking it live in the same window; the same test written in a challenge *test*, which',
        'runs in the app realm against elements built in the host realm, would be false for a perfectly',
        'good template.',
      ].join('\n'),
      tradeoffs: [
        'This is how you read a template. What to watch is what happens next, when the rows are',
        'actually used:',
        '',
        "- `list.append(template.content)` **moves** the fragment's children into the document. The",
        '  template is empty afterwards and the second render produces nothing — the single most',
        '  common template bug there is.',
        '- `list.append(template.content.cloneNode(true))` copies them, leaving the template intact.',
        '  This is nearly always what you want.',
        '- `document.importNode(template.content, true)` is the same thing said explicitly, and is what',
        '  you need when the template comes from another document.',
        '',
        'Appending a fragment also inserts its children rather than the fragment itself, which is why',
        'it is the cheap way to add many nodes at once: one insertion, one layout invalidation.',
      ].join('\n'),
    },
    {
      label: 'Count the fragment’s element children',
      code: [
        'export function templateItemCount(): number {',
        "  const template = document.querySelector<HTMLTemplateElement>('#row-template');",
        '  if (!template) return 0;',
        '',
        '  return template.content.childElementCount;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        "The rows are the fragment's direct children, so counting them needs no selector at all.",
        '`childElementCount` is the element-only count — the whitespace text nodes between the `<li>`',
        'elements are in the fragment too, and `childNodes.length` would report seven.',
        '',
        '`querySelector<HTMLTemplateElement>` is the other way to get a typed template: the generic',
        'tells the compiler what the selector names. It is an assertion rather than a check — nothing',
        'verifies at runtime that `#row-template` really is a template — which is the trade against the',
        '`instanceof` narrowing above.',
      ].join('\n'),
      tradeoffs: [
        'Cheaper than a query and exactly right while the template holds nothing but rows. It answers',
        'a subtly different question, though: "how many elements are in the template" rather than "how',
        'many `.row` elements". Add a `<caption>` or a comment-wrapped section to the template and the',
        'two answers separate, silently.',
        '',
        'Reach for the selector version when the template holds a structure, and for this when the',
        'template *is* the list.',
      ].join('\n'),
    },
  ],
};
