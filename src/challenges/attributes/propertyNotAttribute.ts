import type { ChallengeContent } from '@/types/challenge';

import { idsOf, requireElement } from './support';

type Select = (card: HTMLElement) => void;
type IsSelected = (card: HTMLElement) => boolean;
type SelectedIds = (root: HTMLElement) => string[];

export const propertyNotAttribute: ChallengeContent = {
  prompt: [
    'A gallery of cards. The stylesheet highlights a chosen card with the selector `[data-selected]`,',
    'and a separate export button reads the same attribute to decide what to export. Neither of them',
    'can call your code — they only look at the DOM.',
    '',
    'Export three functions:',
    '',
    '- `select(card)` — mark a card as chosen.',
    '- `isSelected(card)` — report whether a card is marked. It has to answer for a card **anything**',
    '  marked, not only the ones your own `select` touched.',
    '- `selectedIds(root)` — the ids of the marked cards inside `root`, in document order.',
    '',
    'The starter keeps the selection in a `Set`, which is what most of us reach for. It agrees with',
    'itself perfectly and the highlight never appears.',
  ].join('\n'),
  html: [
    '<ul id="gallery">',
    '  <li class="card" id="card-sunrise">Sunrise</li>',
    '  <li class="card" id="card-noon">Noon</li>',
    '  <li class="card" id="card-evening">Evening</li>',
    '</ul>',
  ].join('\n'),
  starterCode: [
    'const chosen = new Set<Element>();',
    '',
    'export function select(card: HTMLElement): void {',
    '  chosen.add(card);',
    '}',
    '',
    'export function isSelected(card: HTMLElement): boolean {',
    '  return chosen.has(card);',
    '}',
    '',
    'export function selectedIds(root: HTMLElement): string[] {',
    '  return [...root.children].filter((card) => chosen.has(card)).map((card) => card.id);',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'a selected card is marked where the stylesheet is looking',
      run: ({ doc, fn, expect }) => {
        const gallery = requireElement(doc, 'gallery');
        fn<Select>('select')(requireElement(doc, 'card-noon'));

        // The value is not asserted, only the presence: `[data-selected]` matches an attribute
        // whatever it holds, so "" and "true" are both correct answers here.
        expect(idsOf(gallery.querySelectorAll('[data-selected]'))).toEqual(['card-noon']);
      },
    },
    {
      name: 'isSelected answers for a card the test marked itself',
      run: ({ doc, fn, expect }) => {
        // Inverted control: the mark is written by the test, never by the submitted code. A function
        // that both records the selection and reports it can agree with itself forever and still be
        // saying nothing about the document -- which is exactly the starter's failure.
        requireElement(doc, 'card-evening').setAttribute('data-selected', '');

        const isSelected = fn<IsSelected>('isSelected');
        expect(isSelected(requireElement(doc, 'card-evening'))).toBe(true);
        expect(isSelected(requireElement(doc, 'card-sunrise'))).toBe(false);
      },
    },
    {
      name: 'selectedIds reports marks it did not make, in document order',
      run: ({ doc, fn, expect }) => {
        requireElement(doc, 'card-evening').setAttribute('data-selected', 'true');
        requireElement(doc, 'card-sunrise').dataset.selected = '';

        // The cards are named so that document order and alphabetical order disagree: sunrise comes
        // first in the markup and second in the alphabet. With ids that happened to sort the right
        // way, a `selectedIds` ending in `.sort()` would pass this and "in document order" would be
        // a claim nothing checked.
        expect(fn<SelectedIds>('selectedIds')(requireElement(doc, 'gallery'))).toEqual([
          'card-sunrise',
          'card-evening',
        ]);
      },
    },
    {
      name: 'the mark travels with a copy of the card',
      run: ({ doc, fn, expect }) => {
        const evening = requireElement(doc, 'card-evening');
        fn<Select>('select')(evening);

        // `cloneNode` copies attributes and nothing else. A selection held in a Set, a WeakMap or a
        // property on the element is not part of the node, so it does not survive being copied,
        // serialised, or sent to a server -- and the copy is the honest way to ask whether the state
        // is really *in* the DOM.
        const copy = evening.cloneNode(true);
        expect(copy).toHaveAttribute('data-selected');
        expect(requireElement(doc, 'gallery').innerHTML).toContain('data-selected');
      },
    },
    {
      name: 'selecting a second card leaves the first one selected',
      run: ({ doc, fn, expect }) => {
        const select = fn<Select>('select');
        select(requireElement(doc, 'card-sunrise'));
        select(requireElement(doc, 'card-evening'));

        expect(idsOf(requireElement(doc, 'gallery').querySelectorAll('[data-selected]'))).toEqual([
          'card-sunrise',
          'card-evening',
        ]);
      },
    },
  ],
  solutions: [
    {
      label: 'Put the state in an attribute',
      code: [
        'export function select(card: HTMLElement): void {',
        "  card.setAttribute('data-selected', '');",
        '}',
        '',
        'export function isSelected(card: HTMLElement): boolean {',
        "  return card.hasAttribute('data-selected');",
        '}',
        '',
        'export function selectedIds(root: HTMLElement): string[] {',
        "  return [...root.querySelectorAll('[data-selected]')].map((card) => card.id);",
        '}',
        '',
      ].join('\n'),
      explanation: [
        'An element has two quite different kinds of state hanging off it, and only one of them is in',
        'the document.',
        '',
        '**Attributes** are the document. They are what the markup declared, what `outerHTML` prints,',
        'what `cloneNode` copies, what CSS selectors match, what `querySelectorAll` searches, and what',
        'devtools shows. **JavaScript properties** — including a `Set` on the side, a `WeakMap` keyed by',
        'the element, or a field you invent with `card.selected = true` — are ordinary values in your',
        "program. Nothing outside your program can see them, and `card.selected = true` doesn't fail,",
        'warn, or appear anywhere: it just adds a property to an object that happens to be an element.',
        '',
        'That is why the starter is so convincing. `select` writes to the `Set`, `isSelected` reads the',
        '`Set`, `selectedIds` filters on the `Set` — the three of them are perfectly consistent, and the',
        'stylesheet, the export button and the clone all see an unselected card.',
        '',
        '`setAttribute` takes a name and a **string**. Here the string is `""`, because nothing reads',
        'the value — `[data-selected]` asks whether the attribute is present, and an empty attribute is',
        'present. `hasAttribute` is the matching read, and it is not the same as `getAttribute(...)`',
        "being truthy: `getAttribute` returns `''` for an empty attribute and `null` when there is none,",
        'and only one of those two is falsy for the reason you meant.',
        '',
        'The `data-` prefix is not decoration either. It is the part of the attribute namespace HTML',
        'promises never to use, so `data-selected` cannot collide with an attribute the platform adds',
        'later. Inventing a bare `selected` attribute on an `<li>` works today and is a bet.',
      ].join('\n'),
      tradeoffs: [
        'This is the right default whenever anything **outside your JavaScript** has to see the state:',
        'CSS, a selector, a copy, a server-rendered page, a screenshot, another script on the page.',
        '',
        'What it costs:',
        '',
        '- **Everything is a string.** An object, a number or a `Date` has to be serialised on the way',
        '  in and parsed on the way out, and `setAttribute(name, {id: 1})` writes the string',
        '  `"[object Object]"` without complaining.',
        '- **It is public.** Anything on the page can read it, overwrite it, or collide with it, and so',
        '  can the user with devtools open.',
        '- **It costs a DOM write**, which invalidates style for that element. Irrelevant for a click;',
        '  measurable if you are doing it to ten thousand rows in a loop.',
        '',
        'When none of that applies — state that is genuinely private to one module, keyed by element,',
        'holding a real object — a `WeakMap<Element, T>` is the better tool: no serialisation, no',
        'collisions, no DOM writes, and entries disappear when the elements do. The mistake the starter',
        'makes is not *having* a `Set`; it is expecting the rest of the page to be able to see it.',
      ].join('\n'),
    },
    {
      label: 'Write the same attribute through dataset',
      code: [
        'export function select(card: HTMLElement): void {',
        "  card.dataset.selected = '';",
        '}',
        '',
        'export function isSelected(card: HTMLElement): boolean {',
        "  return 'selected' in card.dataset;",
        '}',
        '',
        'export function selectedIds(root: HTMLElement): string[] {',
        "  return [...root.children].filter((card) => card.matches('[data-selected]')).map((card) => card.id);",
        '}',
        '',
      ].join('\n'),
      explanation: [
        '`dataset` is a **view over the `data-*` attributes**, not a separate store. Writing',
        '`card.dataset.selected` writes the `data-selected` attribute, and the two spellings are',
        'interchangeable — which is the point worth taking from this version. There is no third place',
        'the state could be.',
        '',
        'Two details that are easy to get wrong:',
        '',
        "- `'selected' in card.dataset` is the presence check. `card.dataset.selected` is `''` here,",
        '  which is falsy, so `if (card.dataset.selected)` reports a selected card as unselected. If you',
        "  prefer a truthy value, write `'true'` and read it back with `=== 'true'` — but then you have",
        '  to keep the two spellings in step, which is what the empty-string convention avoids.',
        '- `dataset` gives `undefined` for an attribute that is not there, where `getAttribute` gives',
        '  `null`. Both are falsy; only one of them survives `??` the way you expect.',
        '',
        '`root.children` filtered with `matches` answers a slightly different question from',
        "`querySelectorAll`: it looks at the gallery's own children rather than at every descendant.",
      ].join('\n'),
      tradeoffs: [
        'Reach for `dataset` when the names are **written down in your code**: it reads better than the',
        'string, and it is checkable — `card.dataset.selcted` is a typo TypeScript can be told about,',
        'where `getAttribute("data-selcted")` is a string that is always spelled correctly.',
        '',
        'Reach for `setAttribute`/`getAttribute` when the name is **data**: a name that arrives in a',
        'variable has to go through the dash-to-camelCase transform before `dataset` will accept it,',
        'and that transform has rules people get wrong (`data-view-count` is `dataset.viewCount`, not',
        '`dataset["view-count"]`). It is also the only spelling for attributes that are not `data-*`.',
        '',
        'The `children`/`querySelectorAll` choice is the same shape of decision:',
        '',
        '- `querySelectorAll` is one pass in the engine, returns document order, and finds a card at any',
        '  depth — which is what you want the moment cards can nest, and wrong if a nested gallery',
        '  should keep its own selection.',
        '- Filtering `children` with `matches` is explicit about depth and lets you ask questions no',
        '  selector can express, at the cost of walking the list in JavaScript.',
      ].join('\n'),
    },
  ],
};
