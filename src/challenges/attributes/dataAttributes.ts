import type { ChallengeContent } from '@/types/challenge';

import { requireElement } from './support';

type Settings = (panel: HTMLElement) => Record<string, string>;
type ReadSetting = (panel: HTMLElement, key: string) => string | null;
type WriteSetting = (panel: HTMLElement, key: string, value: string | number) => void;
type ClearSetting = (panel: HTMLElement, key: string) => void;

/** The element's `data-*` attribute names, in document order, for asserting what really landed. */
function dataNames(element: Element): string[] {
  return element.getAttributeNames().filter((name) => name.startsWith('data-'));
}

export const dataAttributes: ChallengeContent = {
  prompt: [
    'A results panel configured entirely from its markup. Every setting is a `data-*` attribute, and',
    'the keys your code is given are the **camelCase** ones — `maxRows`, `sortOrder`.',
    '',
    'Export four functions:',
    '',
    '- `settings(panel)` — every `data-*` attribute as a plain object, keyed the camelCase way. A',
    '  **snapshot**: changing the element afterwards must not change an object you already handed out.',
    '- `readSetting(panel, key)` — the value, or `null` when there is no such setting.',
    '- `writeSetting(panel, key, value)` — write it, so the markup carries it.',
    '- `clearSetting(panel, key)` — remove it entirely.',
    '',
    'The trap is the name. `data-max-rows` and `maxRows` are the same setting, and gluing `data-` onto',
    'the key you were handed does not produce the attribute — it produces a second, different one.',
  ].join('\n'),
  html: [
    '<section id="panel" data-max-rows="10" data-show-avatars="false" data-refreshInterval="30" data-2fa="on">',
    '  <p>Results</p>',
    '</section>',
  ].join('\n'),
  starterCode: [
    'export function settings(panel: HTMLElement): Record<string, string> {',
    '  return panel.dataset as Record<string, string>;',
    '}',
    '',
    'export function readSetting(panel: HTMLElement, key: string): string | null {',
    '  return panel.getAttribute(`data-${key}`);',
    '}',
    '',
    'export function writeSetting(panel: HTMLElement, key: string, value: string | number): void {',
    '  panel.setAttribute(`data-${key}`, String(value));',
    '}',
    '',
    'export function clearSetting(panel: HTMLElement, key: string): void {',
    "  panel.setAttribute(`data-${key}`, '');",
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'settings reads every data attribute the markup declared',
      run: ({ doc, fn, expect }) => {
        // `refreshinterval` is not a typo. The HTML parser lowercases attribute names, so the
        // markup's `data-refreshInterval` is stored as `data-refreshinterval` and there is no
        // capital left for the dash rule to have come from.
        expect(fn<Settings>('settings')(requireElement(doc, 'panel'))).toEqual({
          maxRows: '10',
          showAvatars: 'false',
          refreshinterval: '30',
          '2fa': 'on',
        });
      },
    },
    {
      name: 'the object it returns is a snapshot, not a live view',
      run: ({ doc, fn, expect }) => {
        const panel = requireElement(doc, 'panel');
        const before = fn<Settings>('settings')(panel);
        panel.setAttribute('data-page-size', '50');

        // `dataset` is a live view over the attributes, so handing it back means handing back
        // something that keeps changing under the caller. Everything else in this challenge is about
        // names; this one is about what you are giving away.
        expect(Object.keys(before)).toHaveLength(4);
        expect(before.pageSize).toBe(undefined);
        expect(fn<Settings>('settings')(panel).pageSize).toBe('50');
      },
    },
    {
      name: 'readSetting finds a setting the test wrote, and reports a missing one as null',
      run: ({ doc, fn, expect }) => {
        // Inverted control: the attribute is written by the test in its real, dashed spelling, so a
        // solution that only reads back what its own `writeSetting` produced cannot pass.
        const panel = requireElement(doc, 'panel');
        panel.setAttribute('data-sort-order', 'ascending');

        const readSetting = fn<ReadSetting>('readSetting');
        expect(readSetting(panel, 'sortOrder')).toBe('ascending');
        expect(readSetting(panel, 'maxRows')).toBe('10');
        // Every attribute value is text. `data-show-avatars="false"` is the five-character string
        // "false", which is perfectly truthy -- so `if (readSetting(panel, 'showAvatars'))` shows the
        // avatars, and the bug is invisible in devtools because the markup reads correctly.
        expect(readSetting(panel, 'showAvatars')).toBe('false');
        expect(readSetting(panel, 'missingSetting')).toBe(null);
      },
    },
    {
      name: 'writeSetting produces the dashed attribute name, and only that one',
      run: ({ doc, fn, expect }) => {
        const panel = requireElement(doc, 'panel');
        fn<WriteSetting>('writeSetting')(panel, 'sortOrder', 'descending');

        expect(panel.getAttribute('data-sort-order')).toBe('descending');
        // `setAttribute('data-sortOrder', …)` is not an error and not a no-op: the name is lowercased
        // on the way in, so it writes `data-sortorder` -- a fifth setting nothing will ever read.
        expect(dataNames(panel)).toEqual([
          'data-max-rows',
          'data-show-avatars',
          'data-refreshinterval',
          'data-2fa',
          'data-sort-order',
        ]);
      },
    },
    {
      name: 'a number is stored as text and read back as text',
      run: ({ doc, fn, expect }) => {
        const panel = requireElement(doc, 'panel');
        fn<WriteSetting>('writeSetting')(panel, 'maxRows', 25);

        expect(panel.getAttribute('data-max-rows')).toBe('25');
        expect(fn<ReadSetting>('readSetting')(panel, 'maxRows')).toBe('25');
      },
    },
    {
      name: 'clearSetting removes the attribute rather than emptying it',
      run: ({ doc, fn, expect }) => {
        const panel = requireElement(doc, 'panel');
        fn<ClearSetting>('clearSetting')(panel, 'showAvatars');

        expect(panel.hasAttribute('data-show-avatars')).toBe(false);
        expect(doc.querySelectorAll('[data-show-avatars]')).toHaveLength(0);
        expect(dataNames(panel)).toEqual(['data-max-rows', 'data-refreshinterval', 'data-2fa']);
      },
    },
  ],
  solutions: [
    {
      label: 'dataset, which already knows the naming rule',
      code: [
        'export function settings(panel: HTMLElement): Record<string, string> {',
        '  return { ...panel.dataset };',
        '}',
        '',
        'export function readSetting(panel: HTMLElement, key: string): string | null {',
        '  return panel.dataset[key] ?? null;',
        '}',
        '',
        'export function writeSetting(panel: HTMLElement, key: string, value: string | number): void {',
        '  panel.dataset[key] = String(value);',
        '}',
        '',
        'export function clearSetting(panel: HTMLElement, key: string): void {',
        '  delete panel.dataset[key];',
        '}',
        '',
      ].join('\n'),
      explanation: [
        '`element.dataset` is a **view over the `data-*` attributes** — not a store of its own, not a',
        'copy. Every read goes to an attribute and every write sets one. What it adds is the name',
        'transform, in both directions:',
        '',
        '```',
        'data-max-rows      <->  dataset.maxRows',
        'data-2fa           <->  dataset["2fa"]',
        'data-refreshinterval <->  dataset.refreshinterval',
        '```',
        '',
        'The rule is small and worth knowing exactly. Reading, the `data-` prefix is dropped and each',
        '`-` **followed by a lowercase letter** disappears, uppercasing that letter. Writing, each',
        'uppercase letter gets a `-` in front of it and is lowercased. Nothing else changes — which is',
        'why `data-2fa` keeps its digits and stays `"2fa"`, a perfectly good property name that you',
        'happen to have to write in brackets.',
        '',
        '**The attribute name in your markup is already lowercase, whatever you typed.** The HTML',
        'parser ASCII-lowercases attribute names, so `data-refreshInterval` in a template is stored as',
        '`data-refreshinterval`, and the transform reading it back finds no capitals to restore. The',
        'dash is the only thing that carries case, which is why the convention is dashes.',
        '',
        'Three smaller facts:',
        '',
        '- **Values are strings, always.** `dataset.maxRows = 25` stores `"25"`; `= false` stores',
        '  `"false"`, and `"false"` is truthy. Parse on the way out — `Number(...)`, `=== "true"`,',
        '  `JSON.parse(...)` — and never trust the shape of what you get.',
        '- **`delete` removes the attribute.** Assigning `""` leaves it present and empty, which still',
        '  matches `[data-show-avatars]` in a stylesheet.',
        '- **A missing key reads `undefined`**, where `getAttribute` gives `null`. Both are falsy, and',
        '  only one of them survives `?? null` unchanged — hence the `??` above.',
        '',
        'And `{ ...panel.dataset }` rather than `panel.dataset`: the view is live, so returning it',
        'hands the caller something that keeps changing.',
      ].join('\n'),
      tradeoffs: [
        'Use `dataset` when the key is **written in your source**. It reads better than a template',
        'string, it cannot produce a malformed attribute name, and with a typed interface over it a',
        'misspelled key is a compile error rather than `undefined`.',
        '',
        'Use `getAttribute`/`setAttribute` when the name is **data** — when it arrives dashed from a',
        'config file, a server response, or a loop over a list of attribute names. `dataset` will not',
        'take a dashed key: reading `dataset["max-rows"]` is `undefined`, and *writing* it throws',
        '`SyntaxError`, because a `-` followed by a lowercase letter is not a legal `dataset` key.',
        '',
        'Two limits of the whole `data-*` idea, worth saying out loud since this is where people reach',
        'for it:',
        '',
        '- **It is public.** Anything on the page can read it, the user can edit it in devtools, and a',
        '  library that also invents `data-*` names can collide with you. Prefix yours.',
        '- **It is text, and text is a serialisation.** A `data-config` holding JSON is re-parsed on',
        '  every read, has no type, and is quietly truncated by nothing at all until it breaks. For',
        '  real objects keyed by element, a `WeakMap<Element, T>` costs no DOM writes and dies with the',
        '  elements. Use `data-*` for what CSS, selectors and other scripts need to see.',
      ].join('\n'),
    },
    {
      label: 'Do the name transform yourself',
      code: [
        'function attributeName(key: string): string {',
        '  return `data-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;',
        '}',
        '',
        'function settingKey(name: string): string {',
        "  return name.slice('data-'.length).replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());",
        '}',
        '',
        'export function settings(panel: HTMLElement): Record<string, string> {',
        '  const found: Record<string, string> = {};',
        '',
        '  for (const name of panel.getAttributeNames()) {',
        "    if (!name.startsWith('data-')) continue;",
        "    found[settingKey(name)] = panel.getAttribute(name) ?? '';",
        '  }',
        '',
        '  return found;',
        '}',
        '',
        'export function readSetting(panel: HTMLElement, key: string): string | null {',
        '  return panel.getAttribute(attributeName(key));',
        '}',
        '',
        'export function writeSetting(panel: HTMLElement, key: string, value: string | number): void {',
        '  panel.setAttribute(attributeName(key), String(value));',
        '}',
        '',
        'export function clearSetting(panel: HTMLElement, key: string): void {',
        '  panel.removeAttribute(attributeName(key));',
        '}',
        '',
      ].join('\n'),
      explanation: [
        '`dataset` written out, which is the way to see that it really is only a naming convention on',
        'top of the ordinary attribute calls.',
        '',
        '`getAttributeNames()` is the piece worth taking away from this version. It returns the',
        "element's attribute names as a plain array of strings, in document order — a snapshot you can",
        'filter, sort and iterate freely. It is the readable answer to "what is on this element?", and',
        'it is the only enumeration in this file that has nothing to do with `data-*`.',
        '',
        'Note the two things this spelling can do that `dataset` cannot:',
        '',
        '- The key may arrive **already dashed**. `readSetting(panel, "max-rows")` is a `null` here and',
        '  a `SyntaxError` from `dataset["max-rows"] = …`.',
        '- The prefix is a variable. The same two helpers work for `aria-`, for a `x-` convention, or',
        '  for whatever a design system invented.',
        '',
        'And the thing it does worse: the transform above is a *simplification*. The real rule only',
        'uppercases after a dash when the next character is an ASCII lowercase letter, and only inserts',
        'a dash before ASCII uppercase — so `data--x` is `dataset.X` and a key like `Foo` becomes',
        '`data--foo`. Corners you will never hit deliberately, and will hit by accident.',
      ].join('\n'),
      tradeoffs: [
        'Choose this when the attribute name is genuinely dynamic, or when the setting is not `data-*`',
        'at all. `getAttributeNames()` plus `getAttribute` is the general form, and it is what you want',
        'for auditing an element, copying attributes between elements, or serialising them.',
        '',
        'Choose `dataset` for everything else, and choose it firmly. Two transforms written by hand are',
        'two places for the rule to be almost right, and "almost right" here means an attribute nobody',
        'reads sitting in the DOM next to the one they do — a bug with no error, no warning, and no',
        'visible difference in devtools unless you look closely at the name.',
        '',
        'If you take one habit from this challenge, make it this: **decide once whether a name is',
        'source or data**, and use the matching API. Mixing them is what produces `data-sortOrder` and',
        '`data-sort-order` on the same element.',
      ].join('\n'),
    },
  ],
};
