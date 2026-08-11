import type { ChallengeContent } from '@/types/challenge';

import { requireElement } from './support';

type LinkLabel = (label: HTMLElement, field: HTMLElement) => void;
type SpanColumns = (cell: HTMLElement, count: number) => void;
type ColumnCount = (cell: HTMLElement) => number;

/**
 * A `<td>`, typed by the selector that found it, so a test can read `colSpan` off it.
 *
 * The tag is in the selector rather than asserted afterwards: the generic tells the compiler which
 * element the selector names, and `td#...` is what makes that claim true at run time as well.
 */
function requireCell(doc: Document, id: string): HTMLTableCellElement {
  const cell = doc.querySelector<HTMLTableCellElement>(`td#${id}`);
  if (!cell) throw new Error(`#${id} is missing from the challenge markup, or is not a <td>`);
  return cell;
}

export const reflectedProperties: ChallengeContent = {
  prompt: [
    'Most attributes have a matching JavaScript property, and the two stay in step in both',
    'directions. The trouble is that the property is not always spelled — or typed — the same way.',
    '',
    'Export three functions:',
    '',
    '- `linkLabel(label, field)` — point the `<label>` at the field, so `label[for="…"]` finds it.',
    '- `spanColumns(cell, count)` — make the cell span `count` columns.',
    '- `columnCount(cell)` — how many columns the cell spans, **as a number**. A cell that says',
    '  nothing about it spans one.',
    '',
    'The starter writes each attribute using the name it has in JavaScript. One of those three lines',
    'happens to work anyway, and the reason it works is not the reason you would guess.',
  ].join('\n'),
  html: [
    '<form id="signup">',
    '  <label id="email-label">Email address</label>',
    '  <input id="email" name="email" type="email">',
    '</form>',
    '<table id="summary">',
    '  <tbody>',
    '    <tr><td id="total-cell">Total</td><td id="plain-cell">0</td></tr>',
    '  </tbody>',
    '</table>',
  ].join('\n'),
  starterCode: [
    'export function linkLabel(label: HTMLLabelElement, field: HTMLElement): void {',
    "  label.setAttribute('htmlFor', field.id);",
    '}',
    '',
    'export function spanColumns(cell: HTMLTableCellElement, count: number): void {',
    "  cell.setAttribute('colSpan', String(count));",
    '}',
    '',
    'export function columnCount(cell: HTMLTableCellElement): number {',
    "  return Number(cell.getAttribute('colSpan'));",
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'linkLabel writes the for attribute, and writes only that one',
      run: ({ doc, fn, expect }) => {
        const label = requireElement(doc, 'email-label');
        fn<LinkLabel>('linkLabel')(label, requireElement(doc, 'email'));

        expect(label.getAttribute('for')).toBe('email');
        // `setAttribute('htmlFor', …)` is not a no-op and not an error: the name is ASCII-lowercased
        // on the way in, so it writes a real attribute called `htmlfor` that nothing reads.
        expect(label.getAttributeNames()).toEqual(['id', 'for']);
        expect(doc.querySelector('label[for="email"]')).toBe(label);
      },
    },
    {
      name: 'linkLabel uses the id the field has now',
      run: ({ doc, fn, expect }) => {
        // Inverted control: the id is changed by the test after the markup was written, so a
        // solution with `email` spelled into it passes the test above and fails here.
        const field = requireElement(doc, 'email');
        field.id = 'signup-email';

        const label = requireElement(doc, 'email-label');
        fn<LinkLabel>('linkLabel')(label, field);

        expect(label.getAttribute('for')).toBe('signup-email');
        expect(doc.querySelector('label[for="signup-email"]')).toBe(label);
      },
    },
    {
      name: 'spanColumns lands in the colspan attribute and in the property together',
      run: ({ doc, fn, expect }) => {
        const cell = requireCell(doc, 'total-cell');
        fn<SpanColumns>('spanColumns')(cell, 3);

        // Reflection is not a synchronisation step that runs later: the attribute and the property
        // are two views of one value, so both are true the instant either is written.
        expect(cell.getAttribute('colspan')).toBe('3');
        expect(cell.colSpan).toBe(3);
        expect(doc.querySelectorAll('#summary td[colspan]')).toHaveLength(1);
      },
    },
    {
      name: 'columnCount reads a span the test wrote, as a number',
      run: ({ doc, fn, expect }) => {
        const cell = requireCell(doc, 'total-cell');
        cell.setAttribute('colspan', '4');

        const count = fn<ColumnCount>('columnCount')(cell);
        expect(count).toBe(4);
        // `getAttribute` hands back the string "4". Every attribute value is text, and a reflected
        // property is where the parsing happens -- `4` and `"4"` are different answers, and only one
        // of them survives `count + 1`.
        expect(typeof count).toBe('number');
      },
    },
    {
      name: 'a cell that says nothing about colspan spans one column',
      run: ({ doc, fn, expect }) => {
        const cell = requireCell(doc, 'plain-cell');

        // The attribute is absent and the property is `1`, because a reflected property with a
        // *default* answers with the default rather than with nothing. `Number(null)` is `0`, which
        // is a plausible-looking answer that no table has ever had.
        expect(cell.getAttribute('colspan')).toBe(null);
        expect(fn<ColumnCount>('columnCount')(cell)).toBe(1);
      },
    },
  ],
  solutions: [
    {
      label: 'Use the reflected properties',
      code: [
        'export function linkLabel(label: HTMLLabelElement, field: HTMLElement): void {',
        '  label.htmlFor = field.id;',
        '}',
        '',
        'export function spanColumns(cell: HTMLTableCellElement, count: number): void {',
        '  cell.colSpan = count;',
        '}',
        '',
        'export function columnCount(cell: HTMLTableCellElement): number {',
        '  return cell.colSpan;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'A **reflected** property is one the specification defines as being backed by an attribute.',
        'Reading it reads the attribute; assigning it writes the attribute; and there is no',
        'synchronisation step in between, so the two can never be out of step.',
        '',
        'Two things about them are easy to get wrong, and the starter gets one of each:',
        '',
        '**The names differ.** `class` is `className`, `for` is `htmlFor` — both because `class` and',
        '`for` were reserved words. `colspan` is `colSpan`, `readonly` is `readOnly`, `maxlength` is',
        '`maxLength`, `tabindex` is `tabIndex`: multi-word attribute names are lowercase in HTML and',
        'camelCase in JavaScript. Guessing the wrong direction is silent both ways:',
        '',
        '```js',
        "label.for = 'email';               // an ordinary JS property. No attribute, no error.",
        "label.setAttribute('htmlFor', id); // a real attribute named `htmlfor`. Nothing reads it.",
        '```',
        '',
        'The second one is the interesting failure, and it is also why the `colSpan` line in the',
        'starter works: **`setAttribute` ASCII-lowercases the name** for an HTML element, so',
        '`"colSpan"` becomes `colspan` and lands on target by accident. `"htmlFor"` becomes `htmlfor`',
        'and does not, because there was never a `for`-shaped name to lowercase into.',
        '',
        '**The types differ.** An attribute value is always a string; a reflected property is the',
        'parsed value. `colSpan` is a `number`, `readOnly` is a `boolean`, `tabIndex` is a `number`.',
        'And when the attribute is absent the property gives the **default the specification names**,',
        'which is why `plain-cell.colSpan` is `1` where `getAttribute("colspan")` is `null`.',
        '',
        'Not every property is reflected, and the exceptions are worth knowing: `input.value` follows',
        'the attribute only until something writes it, `a.href` gives the URL **resolved** against the',
        'document rather than the string in the markup, and `input.type` reports `"text"` for any value',
        'it does not recognise. The property is a *parse* of the attribute, not a copy of it.',
      ].join('\n'),
      tradeoffs: [
        'Use the property when the attribute name is a literal in your source. It is shorter, the',
        'compiler checks it, and it hands you the right type with the right default already applied —',
        'three lines above versus the parsing and the fallback below.',
        '',
        'Where it runs out:',
        '',
        '- **The name has to be known when you write the code.** No property lookup can be built from a',
        '  string, so anything driven by a config, a `data-*` map or a loop over attribute names has to',
        '  use `setAttribute`.',
        '- **Not every attribute has one.** `aria-*` state has properties in modern browsers',
        '  (`ariaExpanded` and friends) with real gaps in support; a custom attribute you invented has',
        '  none at all; and assigning a property that does not exist is silent.',
        '- **You cannot express absence.** `cell.colSpan = 1` writes `colspan="1"`; only',
        '  `removeAttribute` gets back to a cell that says nothing.',
      ].join('\n'),
    },
    {
      label: 'Go through the attributes and parse it yourself',
      code: [
        'export function linkLabel(label: HTMLLabelElement, field: HTMLElement): void {',
        "  label.setAttribute('for', field.id);",
        '}',
        '',
        'export function spanColumns(cell: HTMLTableCellElement, count: number): void {',
        "  cell.setAttribute('colspan', String(count));",
        '}',
        '',
        'export function columnCount(cell: HTMLTableCellElement): number {',
        "  const written = cell.getAttribute('colspan');",
        '  if (written === null) return 1;',
        '',
        '  const parsed = Number.parseInt(written, 10);',
        '  return Number.isNaN(parsed) || parsed < 1 ? 1 : parsed;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The same three jobs, written against the attributes directly — which means writing out',
        'everything reflection was doing for you.',
        '',
        '`columnCount` is where that shows. Four cases have to be handled by hand:',
        '',
        '- **absent** — `getAttribute` gives `null`, and the answer is the spec default, `1`. Note',
        '  `Number(null)` is `0` and `parseInt(null)` is `NaN`: neither is a column count.',
        '- **a number in a string** — `parseInt` with an explicit radix.',
        '- **not a number** — `colspan="wide"` parses to `NaN`, and the browser reading the same',
        '  attribute for layout falls back to `1`.',
        '- **out of range** — `colspan="0"` is a value the parsing rules clamp; the property does that',
        '  clamping for you and this does not, unless you write it.',
        '',
        'The writes are shorter than the read because the direction is easier: `String(count)` is the',
        'whole conversion, and `setAttribute` would have coerced a number for you anyway. What you',
        'still have to get right is the **name**, in its HTML spelling — `for`, not `htmlFor`;',
        '`colspan`, not `colSpan` (though that one is forgiven, since the name is lowercased on the way',
        'in).',
      ].join('\n'),
      tradeoffs: [
        'This is the version to reach for when the name is data rather than source — a table renderer',
        'told which attributes to set by a config, an editor writing whatever the user typed, a helper',
        'copying attributes between elements. `setAttribute` takes a string, so it is the only route',
        'that can.',
        '',
        'It is also the only way to *read* what the markup actually says. `cell.colSpan` cannot tell',
        '`colspan="1"` from no attribute at all, and cannot show you `colspan="wide"`. If you are',
        'validating markup, diffing it, or serialising it, the attribute is the truth.',
        '',
        'What it costs is the parsing, and the parsing is where the bugs are. Every reflected property',
        'you replace with `getAttribute` is a default you now own, and defaults that are almost right',
        '— `0` instead of `1`, `NaN` instead of `1` — are the kind that survive review.',
      ].join('\n'),
    },
  ],
};
