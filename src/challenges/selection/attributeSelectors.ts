import type { Challenge } from '@/types/challenge';

import { requireElement } from './support';

function idsOf(elements: Element[]): string[] {
  return elements.map((element) => element.id);
}

export const attributeSelectors: Challenge = {
  id: 'selection-attribute-selectors',
  slug: 'attribute-selectors',
  title: 'Match on an attribute without matching too much',
  category: 'selection',
  difficulty: 'intermediate',
  concepts: ['attribute selectors', 'data-*', 'classList', 'getAttribute'],
  relatedIds: ['selection-scoped-query'],
  prompt: [
    'The toolbar below is marked up with `data-role` attributes, links, and utility classes. Export',
    'three functions, each returning an `Element[]` in document order, each searching only inside the',
    '`root` it is given:',
    '',
    '- `findByRole(root, role)` — the elements whose `data-role` is **exactly** `role`. A role may',
    '  contain a space: `findByRole(root, "primary action")` has to work.',
    '- `externalLinks(root)` — the `<a>` elements whose `href` **starts with** `http`, so they leave',
    '  the site. A relative path that merely mentions `http` somewhere is not one of them.',
    '- `elementsWithClass(root, className)` — the elements whose class list **contains** `className`',
    '  as a whole class. `btn-danger` is not the class `btn`.',
  ].join('\n'),
  html: [
    '<nav id="bar">',
    '  <button id="role-menu" data-role="menu">Menu</button>',
    '  <button id="role-menu-item" data-role="menu-item">Docs</button>',
    '  <button id="role-primary" data-role="primary action">Save</button>',
    '  <a id="link-secure" href="https://example.com/docs">External docs</a>',
    '  <a id="link-plain" href="http://example.org">Old protocol</a>',
    '  <a id="link-local" href="/docs/http-guide">Local guide</a>',
    '  <span id="btn-real" class="btn">Real</span>',
    '  <span id="btn-danger" class="btn-danger">Danger</span>',
    '  <span id="btn-ghost" class="ghost btn">Ghost</span>',
    '</nav>',
    '<p id="outside" data-role="menu">outside the toolbar</p>',
  ].join('\n'),
  starterCode: [
    'export function findByRole(root: Element, role: string): Element[] {',
    '  return [];',
    '}',
    '',
    'export function externalLinks(root: Element): Element[] {',
    '  return [];',
    '}',
    '',
    'export function elementsWithClass(root: Element, className: string): Element[] {',
    '  return [];',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'findByRole matches the whole attribute value, and only inside the root',
      run: ({ doc, fn, expect }) => {
        const findByRole = fn<(root: Element, role: string) => Element[]>('findByRole');
        const found = findByRole(requireElement(doc, 'bar'), 'menu');
        expect(Array.isArray(found)).toBe(true);
        // `#role-menu-item` is the near miss that `[data-role*="menu"]` and `[data-role^="menu"]`
        // both take, and `#outside` carries the same role from outside the root, which is what a
        // query starting at `document` returns.
        expect(idsOf(found)).toEqual(['role-menu']);
      },
    },
    {
      name: 'findByRole handles a role with a space in it',
      run: ({ doc, fn, expect }) => {
        const findByRole = fn<(root: Element, role: string) => Element[]>('findByRole');
        // `[data-role=primary action]` is not a valid selector -- an unquoted attribute value is a
        // CSS identifier, and identifiers cannot contain a space. `querySelectorAll` throws rather
        // than returning nothing, so a selector built without quotes fails here loudly.
        expect(idsOf(findByRole(requireElement(doc, 'bar'), 'primary action'))).toEqual(['role-primary']);
      },
    },
    {
      name: 'externalLinks keeps the links that start with http, not the ones that mention it',
      run: ({ doc, fn, expect }) => {
        const externalLinks = fn<(root: Element) => Element[]>('externalLinks');
        // `#link-local` is `/docs/http-guide`: a relative path with `http` in the middle of it,
        // which is exactly what `[href*="http"]` picks up.
        expect(idsOf(externalLinks(requireElement(doc, 'bar')))).toEqual(['link-secure', 'link-plain']);
      },
    },
    {
      name: 'elementsWithClass matches a whole class token, not a substring of one',
      run: ({ doc, fn, expect }) => {
        const elementsWithClass = fn<(root: Element, className: string) => Element[]>('elementsWithClass');
        // `#btn-danger` has the class `btn-danger` and not the class `btn`. `[class*="btn"]` cannot
        // tell them apart, because it is looking at the attribute as one long string.
        expect(idsOf(elementsWithClass(requireElement(doc, 'bar'), 'btn'))).toEqual(['btn-real', 'btn-ghost']);
      },
    },
    {
      name: 'elementsWithClass matches the class it is asked for, whichever one that is',
      run: ({ doc, fn, expect }) => {
        const elementsWithClass = fn<(root: Element, className: string) => Element[]>('elementsWithClass');
        // The argument has to reach the query: a selector with `btn` written into it passes the
        // test above and returns the wrong list here.
        expect(idsOf(elementsWithClass(requireElement(doc, 'bar'), 'ghost'))).toEqual(['btn-ghost']);
      },
    },
  ],
  solutions: [
    {
      label: 'Attribute selectors',
      code: [
        'export function findByRole(root: Element, role: string): Element[] {',
        '  return Array.from(root.querySelectorAll(`[data-role="${role}"]`));',
        '}',
        '',
        'export function externalLinks(root: Element): Element[] {',
        '  return Array.from(root.querySelectorAll(\'a[href^="http"]\'));',
        '}',
        '',
        'export function elementsWithClass(root: Element, className: string): Element[] {',
        '  return Array.from(root.querySelectorAll(`[class~="${className}"]`));',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'Attribute selectors come in more shapes than the `[attr=value]` everyone knows, and the whole',
        'challenge is picking the right one:',
        '',
        '- `[data-role="menu"]` — exact match on the entire value. `menu-item` is a different value,',
        '  so it does not match.',
        '- `[href^="http"]` — value *starts with*. `$=` is "ends with", `*=` is "contains anywhere".',
        '- `[class~="btn"]` — value is a **whitespace-separated list** and one of its words is `btn`.',
        '  This is the one people never reach for, and it is exactly what a class attribute is.',
        '  (`[attr|="en"]` is its cousin: the value is `en` or starts with `en-`, for language tags.)',
        '',
        'The quotes around the interpolated value are load-bearing. Without them the value is parsed',
        'as a CSS identifier, and an identifier cannot contain a space — so `[data-role=primary action]`',
        'is not a selector that matches nothing, it is a syntax error, and `querySelectorAll` throws',
        '`SyntaxError` at you. Quoting is not decoration; it is what makes arbitrary text legal there.',
        '',
        "Every query is called on `root`, so the toolbar's own elements are the only candidates —",
        '`document.querySelectorAll` would also return the `data-role="menu"` paragraph outside it.',
      ].join('\n'),
      tradeoffs: [
        'This is the version to write when the values are simple, and it is the one to stop and think',
        'about when they are not, because it builds a selector by string concatenation.',
        '',
        'A value containing a `"` or a `\\` breaks out of the quoted string and turns a lookup into a',
        'parse error — the CSS equivalent of an injection bug, with a thrown `SyntaxError` where SQL',
        'would have given you something worse. `CSS.escape(value)` exists for this, though note it',
        'escapes for an *identifier*: `[data-role=${CSS.escape(role)}]`, no quotes of your own.',
        '',
        'The class case has a plainer alternative worth knowing: `.btn` is a class selector and is',
        'exactly equivalent to `[class~="btn"]`. It only stops being usable when the name comes from a',
        'variable and may contain characters a selector treats specially, which is the situation this',
        'challenge is built on.',
      ].join('\n'),
    },
    {
      label: 'Read the attribute and compare it yourself',
      code: [
        'export function findByRole(root: Element, role: string): Element[] {',
        "  const candidates = Array.from(root.querySelectorAll('[data-role]'));",
        "  return candidates.filter((element) => element.getAttribute('data-role') === role);",
        '}',
        '',
        'export function externalLinks(root: Element): Element[] {',
        "  const links = Array.from(root.querySelectorAll('a[href]'));",
        "  return links.filter((link) => (link.getAttribute('href') ?? '').startsWith('http'));",
        '}',
        '',
        'export function elementsWithClass(root: Element, className: string): Element[] {',
        "  const candidates = Array.from(root.querySelectorAll('[class]'));",
        '  return candidates.filter((element) => element.classList.contains(className));',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'Select on the attribute being *present*, then decide in JavaScript. Nothing is interpolated',
        'into a selector, so no value can change how the selector parses — a role of `" ] a[href^="h`',
        'is compared as a string and simply matches nothing.',
        '',
        '`classList.contains` is the precise answer to the `[class*="btn"]` trap, and for the same',
        'reason `~=` was: `classList` is a `DOMTokenList`, so `contains` asks whether one of the',
        'space-separated tokens is exactly `btn`, never whether the attribute text happens to include',
        'those three letters.',
        '',
        "Note `getAttribute('href')` rather than `link.href`. The property is *reflected* and resolved",
        'against the document base URL, so `/docs/http-guide` reads back as',
        "`https://example.com/docs/http-guide` — and `.startsWith('http')` would then be true of every",
        'link on the page. The attribute is what was written in the markup; the property is what the',
        'browser resolved it to. That split is the subject of its own challenge, and this is the',
        'cheapest place to meet it.',
      ].join('\n'),
      tradeoffs: [
        'Reach for this when the values are untrusted or arbitrary, when the comparison is not one a',
        'selector can express (case-insensitive, numeric, "starts with one of these five prefixes"), or',
        'when you want the reading to be obvious to whoever maintains it.',
        '',
        'The cost is two passes: the engine collects every element carrying the attribute, then your',
        'filter walks them again. For a toolbar that is nothing; for a query over a large table it is',
        'measurably slower than letting the selector engine do all of it at once, since the engine can',
        'short-circuit on the attribute value while your filter cannot.',
        '',
        'It also loses composability. A selector is one string you can pass around, cache, or hand to',
        '`matches` inside a delegated handler; a filter is a function that has to travel with it.',
      ].join('\n'),
    },
  ],
};
