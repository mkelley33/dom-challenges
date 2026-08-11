import type { Challenge } from '@/types/challenge';

/**
 * The extra item belongs to the test, not to the learner.
 *
 * Without it, `return ['Home', 'Docs', 'About']` passes every assertion about the contents -- the
 * expected values are printed in the prompt. Appending a fourth item before `itemTexts()` is ever
 * called means the answer cannot be known until the document is read.
 */
function appendItem(doc: Document, text: string): void {
  const menu = doc.getElementById('menu');
  if (!menu) throw new Error('#menu is missing from the challenge markup');
  const item = doc.createElement('li');
  item.className = 'item';
  item.textContent = text;
  menu.append(item);
}

export const queryAll: Challenge = {
  id: 'selection-query-all',
  slug: 'query-all',
  title: 'Collect the text of every item',
  category: 'selection',
  difficulty: 'novice',
  concepts: ['querySelectorAll', 'NodeList', 'Array.from', 'spread', 'textContent'],
  relatedIds: ['selection-query-basics'],
  prompt: [
    'The menu below holds three `.item` elements and one separator that is not an item.',
    '',
    'Export a function `itemTexts()` that returns the text of every `.item`, in document order, as a',
    '`string[]`.',
    '',
    'The separator must not appear in the result, and the array has to be a real `Array` — the test',
    'calls `filter` on what you hand back.',
  ].join('\n'),
  html: [
    '<ul id="menu">',
    '  <li class="item">Home</li>',
    '  <li class="item">Docs</li>',
    '  <li class="divider">—</li>',
    '  <li class="item">About</li>',
    '</ul>',
  ].join('\n'),
  starterCode: [
    'export function itemTexts(): string[] {',
    '  // Collect the text of every `.item` here.',
    '  return [];',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'returns the text of every .item, in document order, and nothing else',
      run: ({ fn, expect }) => {
        // The separator is an `<li>` in the same list, so a walk over `#menu`'s children returns
        // four entries here rather than three.
        expect(fn<() => string[]>('itemTexts')()).toEqual(['Home', 'Docs', 'About']);
      },
    },
    {
      name: 'reads the document rather than returning a list written out by hand',
      run: ({ doc, fn, expect }) => {
        appendItem(doc, 'Blog');
        expect(fn<() => string[]>('itemTexts')()).toEqual(['Home', 'Docs', 'About', 'Blog']);
      },
    },
    {
      name: 'returns a real Array, so the caller can use array methods on it',
      run: ({ fn, expect }) => {
        const texts = fn<() => string[]>('itemTexts')();
        // Named on its own because the failure is otherwise unreadable: `filter` on a NodeList --
        // or on the `undefined` that `return nodes.forEach(...)` produces -- throws a TypeError
        // several lines below, and this says which of the two happened.
        expect(Array.isArray(texts)).toBe(true);
        expect(texts.filter((text) => text.startsWith('D'))).toEqual(['Docs']);
      },
    },
  ],
  solutions: [
    {
      label: 'Array.from with a map function',
      code: [
        'export function itemTexts(): string[] {',
        "  const items = document.querySelectorAll('.item');",
        "  return Array.from(items, (item) => item.textContent ?? '');",
        '}',
        '',
      ].join('\n'),
      explanation: [
        '`querySelectorAll` returns a `NodeList`, and a `NodeList` is not an `Array`. It has `length`,',
        'it indexes, it is iterable, and it even has `forEach` — which is exactly what makes the missing',
        '`map` such a surprise. `items.map(...)` throws `items.map is not a function`.',
        '',
        '`Array.from` is the conversion. Its second argument is a mapping function applied during the',
        'conversion, so this builds one array rather than an array of elements that is immediately',
        'thrown away for an array of strings. It works on anything iterable or array-like, which',
        'includes both `NodeList` and `HTMLCollection`.',
        '',
        '`textContent` is `string | null` in the type system — `null` only for a `Document` or a',
        "doctype node, never for an element — so `?? ''` is what satisfies the `string[]` return type.",
        'Prefer it to `innerText`, which is defined in terms of *rendered* text: it consults layout, so',
        'it skips anything hidden with `display: none`, collapses whitespace the way the page does, and',
        'forces a reflow to answer. Here that would be three costs for no benefit.',
      ].join('\n'),
      tradeoffs: [
        'This is the one to reach for. The one thing to know about it is which collections it can take',
        'and what they can do on their own:',
        '',
        '- `NodeList` (from `querySelectorAll`, `childNodes`) has `forEach`, `entries`, `keys`, and',
        '  `values` — but no `map`, `filter`, `reduce`, `find`, or `slice`.',
        '- `HTMLCollection` (from `getElementsByClassName`, `getElementsByTagName`, `children`) has',
        '  none of them. Indexing, `length`, `item`, and `namedItem` are the entire API; it does not',
        '  even have `forEach`, which is where `getElementsByClassName(...).forEach(...)` comes from.',
        '',
        'Both are iterable in modern browsers, so `Array.from` and the spread work on either. That',
        'conversion also freezes a live collection into a snapshot — usually what the calling code',
        'wanted anyway, and the subject of the live-versus-static challenge.',
      ].join('\n'),
    },
    {
      label: 'Spread, then map',
      code: [
        'export function itemTexts(): string[] {',
        "  const items = document.querySelectorAll('.item');",
        "  return [...items].map((item) => item.textContent ?? '');",
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The spread copies the `NodeList` into an array by walking its iterator, and from there `map`',
        'is an ordinary array method. Two steps instead of one, and the step that matters is the same:',
        'you cannot map a `NodeList` until it has stopped being a `NodeList`.',
        '',
        'It reads more naturally than `Array.from(items, fn)` when the transformation is long, or when',
        'more than one array method is chained after it — `[...items].filter(...).map(...)` says what',
        'it does more plainly than nesting the conversion inside the first call.',
      ].join('\n'),
      tradeoffs: [
        'Equivalent for every purpose here, at the cost of one intermediate array: the spread',
        'materialises all the elements before `map` allocates the array of strings, where',
        '`Array.from(items, fn)` allocates once. That difference is invisible for a menu and worth',
        'knowing for a table with ten thousand rows.',
        '',
        'The real limit is that the spread needs an *iterable*. `Array.from` also accepts anything',
        'merely array-like — an object with `length` and numeric keys — which is what makes it the',
        'safer habit when the source is `arguments`, a jQuery-style object, or a collection in an old',
        'browser whose `Symbol.iterator` was never implemented.',
      ].join('\n'),
    },
    {
      label: 'forEach and push',
      code: [
        'export function itemTexts(): string[] {',
        '  const texts: string[] = [];',
        "  document.querySelectorAll('.item').forEach((item) => {",
        "    texts.push(item.textContent ?? '');",
        '  });',
        '  return texts;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        '`NodeList` does have `forEach`, so this iterates the list directly and accumulates into an',
        'array you made yourself. No conversion, and the result is unambiguously an `Array`.',
        '',
        'Note what is returned: `texts`, not the call. `forEach` returns `undefined` — always — so',
        "`return document.querySelectorAll('.item').forEach(...)` hands the caller `undefined` and",
        'fails the "returns a real Array" test with `Array.isArray(undefined)`. It is an easy line to',
        'write on muscle memory from `map`, which is why that assertion is named separately.',
      ].join('\n'),
      tradeoffs: [
        'Worth writing when the loop body does more than transform — when it also skips entries, reads',
        'two arrays at once, or stops early. `map` cannot break out of the iteration and neither can',
        '`forEach`; a `for...of` can, and is the honest choice at that point.',
        '',
        'Otherwise it costs clarity: three statements where one expression says the same thing, a',
        'mutable accumulator, and the type annotation on `texts` that TypeScript would have inferred',
        'from a `map`. And it is the version that breaks when the collection changes: swap',
        '`querySelectorAll` for `getElementsByClassName` and `forEach` is gone, because an',
        '`HTMLCollection` does not have it.',
      ].join('\n'),
    },
  ],
};
