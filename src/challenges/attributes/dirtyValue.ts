import type { ChallengeContent } from '@/types/challenge';

/**
 * The `<input>` a test needs, typed by the selector that found it.
 *
 * `querySelector<HTMLInputElement>` with the tag name in the selector rather than `getElementById`
 * plus a cast: the generic tells the compiler which element the selector names, and the `input` in
 * the selector is what makes that claim true at run time too.
 *
 * Local rather than in a `support.ts` because this category has one challenge -- a helper shared
 * between two of them earns its own file, one used by a single challenge belongs beside it.
 */
function requireInput(doc: Document, id: string): HTMLInputElement {
  const input = doc.querySelector<HTMLInputElement>(`input#${id}`);
  if (!input) throw new Error(`#${id} is missing from the challenge markup, or is not an <input>`);
  return input;
}

function requireElement(doc: Document, id: string): HTMLElement {
  const element = doc.getElementById(id);
  if (!element) throw new Error(`#${id} is missing from the challenge markup`);
  return element;
}

type IsChanged = (field: HTMLInputElement) => boolean;
type Revert = (field: HTMLInputElement) => void;
/** Declared over `HTMLElement`, which is all the tests need, and avoids a narrowing assertion. */
type SyncChangedFlags = (form: HTMLElement) => void;

export const dirtyValue: ChallengeContent = {
  prompt: [
    'A settings form with two fields. Each one sits inside a `<label class="field">`, and the markup',
    'declares what the saved settings are: the title is `"Quarterly report"`, and Public is checked.',
    '',
    'Export three functions:',
    '',
    '- `isChanged(field)` — `true` when what is on screen differs from what the markup declared.',
    '  It has to work for the text box **and** for the checkbox.',
    '- `revert(field)` — put the field back to what the markup declared.',
    '- `syncChangedFlags(form)` — put `data-changed="true"` on the `.field` label of every changed',
    '  field, and **remove** the attribute from the labels of the ones that are not. A field that has',
    '  not changed carries no `data-changed` attribute at all.',
    '',
    'The trap this challenge exists for: once a value has been typed, writing the `value` **attribute**',
    'no longer changes what the box shows. Reverting has to go through the property.',
  ].join('\n'),
  html: [
    '<form id="settings">',
    '  <label class="field" id="field-title">Title <input id="title" name="title" value="Quarterly report"></label>',
    '  <label class="field" id="field-public">Public <input id="public" name="public" type="checkbox" checked></label>',
    '</form>',
  ].join('\n'),
  starterCode: [
    'export function isChanged(field: HTMLInputElement): boolean {',
    "  return field.value !== field.getAttribute('value');",
    '}',
    '',
    'export function revert(field: HTMLInputElement): void {',
    "  field.setAttribute('value', field.defaultValue);",
    '}',
    '',
    'export function syncChangedFlags(form: HTMLFormElement): void {',
    '  // Every field sits inside a <label class="field">.',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'typing into the text box changes it, and leaves the checkbox alone',
      run: ({ doc, fn, fire, expect }) => {
        // The test does the typing, not the submitted code: a function that both makes the change
        // and reports it can agree with itself and still be wrong about the DOM.
        const title = requireInput(doc, 'title');
        fire.input(title, 'Draft');

        const isChanged = fn<IsChanged>('isChanged');
        expect(isChanged(title)).toBe(true);
        // A checkbox's `value` is "on" whatever its checkedness, and it has no `value` attribute at
        // all, so anything that compares those two reports this untouched checkbox as changed.
        expect(isChanged(requireInput(doc, 'public'))).toBe(false);
      },
    },
    {
      name: 'unticking the checkbox changes it, and leaves the text box alone',
      run: ({ doc, fn, expect }) => {
        const publicField = requireInput(doc, 'public');
        publicField.checked = false;

        const isChanged = fn<IsChanged>('isChanged');
        expect(isChanged(publicField)).toBe(true);
        expect(isChanged(requireInput(doc, 'title'))).toBe(false);
      },
    },
    {
      name: 'reverting the text box puts the typed value back, and never touches the markup',
      run: ({ doc, fn, fire, expect }) => {
        const title = requireInput(doc, 'title');
        fire.input(title, 'Draft');
        fn<Revert>('revert')(title);

        // The property is what the field shows, and it is the one that has to move. `setAttribute`
        // alone leaves this reading "Draft": once a value has been typed the attribute no longer
        // drives the property, and the field silently refuses to revert.
        expect(title.value).toBe('Quarterly report');
        expect(title).toHaveAttribute('value', 'Quarterly report');
        expect(fn<IsChanged>('isChanged')(title)).toBe(false);
      },
    },
    {
      name: 'reverting the checkbox reticks it',
      run: ({ doc, fn, expect }) => {
        const publicField = requireInput(doc, 'public');
        publicField.checked = false;
        fn<Revert>('revert')(publicField);

        // Same rule, second spelling: `setAttribute('checked', '')` does not retick a box whose
        // checkedness has already been set from script or by a click.
        expect(publicField.checked).toBe(true);
        expect(fn<IsChanged>('isChanged')(publicField)).toBe(false);
      },
    },
    {
      name: 'the changed flag is removed from unchanged fields, not set to "false"',
      run: ({ doc, fn, fire, expect }) => {
        const form = requireElement(doc, 'settings');
        fire.input(requireInput(doc, 'title'), 'Draft');
        fn<SyncChangedFlags>('syncChangedFlags')(form);

        expect(requireElement(doc, 'field-title').dataset.changed).toBe('true');
        // `dataset.changed = false` writes the string "false", and a present attribute is what
        // `[data-changed]` matches -- so the CSS lights up every field and nothing fails.
        expect(doc.querySelectorAll('[data-changed]')).toHaveLength(1);
        expect(requireElement(doc, 'field-public').hasAttribute('data-changed')).toBe(false);
      },
    },
    {
      name: 'reverting and syncing again clears the flag',
      run: ({ doc, fn, fire, expect }) => {
        const form = requireElement(doc, 'settings');
        const title = requireInput(doc, 'title');

        fire.input(title, 'Draft');
        fn<SyncChangedFlags>('syncChangedFlags')(form);
        fn<Revert>('revert')(title);
        fn<SyncChangedFlags>('syncChangedFlags')(form);

        expect(doc.querySelectorAll('[data-changed]')).toHaveLength(0);
      },
    },
  ],
  solutions: [
    {
      label: 'Compare against the defaults the platform already keeps',
      code: [
        'export function isChanged(field: HTMLInputElement): boolean {',
        "  if (field.type === 'checkbox' || field.type === 'radio') {",
        '    return field.checked !== field.defaultChecked;',
        '  }',
        '',
        '  return field.value !== field.defaultValue;',
        '}',
        '',
        'export function revert(field: HTMLInputElement): void {',
        "  if (field.type === 'checkbox' || field.type === 'radio') {",
        '    field.checked = field.defaultChecked;',
        '    return;',
        '  }',
        '',
        '  field.value = field.defaultValue;',
        '}',
        '',
        'export function syncChangedFlags(form: HTMLFormElement): void {',
        "  for (const field of form.querySelectorAll('input')) {",
        "    const label = field.closest<HTMLElement>('.field');",
        '    if (!label) continue;',
        '',
        '    if (isChanged(field)) {',
        "      label.dataset.changed = 'true';",
        '    } else {',
        '      delete label.dataset.changed;',
        '    }',
        '  }',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'An attribute and a property with the same name are two different things, and `<input>` is',
        'where the difference bites hardest.',
        '',
        'The `value` **attribute** is what the markup says. The `value` **property** is what the field',
        'currently shows. They start out equal, and the moment anything sets the property — a keystroke,',
        'or `field.value = "..."` — the input\'s *dirty value flag* is set and the two come apart for',
        'good. From then on the attribute is only a record of the original, and writing it changes',
        "nothing on screen. That is why the starter's `revert` appears to do nothing: it updates the",
        'record, and the record stopped driving the field the first time someone typed.',
        '',
        '`defaultValue` is the readable name for that attribute — `field.defaultValue` and',
        "`field.getAttribute('value')` are the same string, with `defaultValue` giving `''` where the",
        'attribute gives `null`. So "has this changed?" is `value !== defaultValue`, and "put it back"',
        'is `value = defaultValue`, going through the property in both directions.',
        '',
        'Checkboxes have the identical split under different names: `checked` is the live state,',
        '`defaultChecked` is the `checked` attribute, and there is a *dirty checkedness* flag that comes',
        'up the first time either is set. The branch is needed because a checkbox\'s `value` is `"on"`',
        'no matter what — it is the string that gets submitted when the box is ticked, not a record of',
        'whether it is.',
        '',
        '`dataset.changed` is the `data-changed` attribute, with the dashes turned into camelCase. The',
        '`delete` is the part worth noticing: `delete label.dataset.changed` **removes** the attribute,',
        'while `label.dataset.changed = false` stringifies to `"false"` and leaves it present. CSS and',
        '`querySelectorAll` both ask whether the attribute is there, not what it says, so the second',
        'form marks every field as changed and nothing anywhere reports an error.',
      ].join('\n'),
      tradeoffs: [
        'This version keeps no state of its own. The pristine value is the one the platform already',
        'stores, so nothing can drift, nothing has to be initialised, and a field added to the form',
        'later works with no extra bookkeeping. That is almost always the right answer.',
        '',
        'Where it runs out:',
        '',
        '- `<select>` has no `defaultValue`. The default is spread across the options, as',
        '  `option.defaultSelected`, so a general "is this form dirty?" helper needs a third branch.',
        "- `<textarea>`'s default is its *text content*, not an attribute, and `defaultValue` reads it.",
        '- The default is what the markup declared. If the server re-renders the form after a save, or',
        '  the app patches values in on load with `field.value = ...`, that write sets the dirty flag',
        '  and the default is now the wrong baseline. Assigning `field.defaultValue` instead of',
        '  `field.value` moves the baseline with it — which is exactly what "save" should do.',
        '- `form.reset()` reverts every field in one call and fires a `reset` event. Prefer it when the',
        '  granularity you want really is the whole form; this per-field version exists because most',
        '  "undo this row" buttons do not want the rest of the form moving.',
      ].join('\n'),
    },
    {
      label: 'Snapshot the pristine values into data attributes',
      code: [
        'function state(field: HTMLInputElement): string {',
        "  return field.type === 'checkbox' || field.type === 'radio' ? String(field.checked) : field.value;",
        '}',
        '',
        "for (const field of document.querySelectorAll('input')) {",
        '  field.dataset.pristine = state(field);',
        '}',
        '',
        'export function isChanged(field: HTMLInputElement): boolean {',
        '  return state(field) !== field.dataset.pristine;',
        '}',
        '',
        'export function revert(field: HTMLInputElement): void {',
        "  const saved = field.dataset.pristine ?? '';",
        '',
        "  if (field.type === 'checkbox' || field.type === 'radio') {",
        "    field.checked = saved === 'true';",
        '    return;',
        '  }',
        '',
        '  field.value = saved;',
        '}',
        '',
        'export function syncChangedFlags(form: HTMLFormElement): void {',
        "  for (const field of form.querySelectorAll('input')) {",
        "    const label = field.closest<HTMLElement>('.field');",
        '    if (!label) continue;',
        '',
        '    if (isChanged(field)) {',
        "      label.setAttribute('data-changed', 'true');",
        '    } else {',
        "      label.removeAttribute('data-changed');",
        '    }',
        '  }',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'Rather than asking the platform what the field started as, this records it — once, at load,',
        'into `data-pristine` — and compares against that afterwards.',
        '',
        'The two branches collapse into one comparison because both states are turned into a string.',
        'A checkbox stores `"true"` or `"false"`; a text box stores its text. `dataset` values are',
        'always strings, which is why `revert` has to turn `"true"` back into a boolean rather than',
        'reading it as one.',
        '',
        '`setAttribute`/`removeAttribute` say the same thing as the `dataset` assign and `delete` above',
        '— `dataset` is a view over the `data-*` attributes, not a separate store. When the value does',
        'not matter and only presence does, `label.toggleAttribute("data-changed", isChanged(field))` is',
        'the one-liner for the whole branch; it writes the empty string, which is what boolean-ish',
        'attributes carry anyway.',
        '',
        'The snapshot runs at module scope, over `document.querySelectorAll` rather than over one form.',
        'That is the shape most "unsaved changes?" implementations end up with, and it is also where',
        'their bugs live — see below.',
      ].join('\n'),
      tradeoffs: [
        'The reason to reach for this: it generalises. One string per field covers `<select>`,',
        '`<textarea>`, contenteditable, a custom element with a `value` property, and anything else you',
        'can serialise — where `defaultValue`/`defaultChecked` need a branch per element type and do',
        'not exist at all for the last two.',
        '',
        'The reason to be careful with it: it is a second source of truth, and every second source of',
        'truth goes stale.',
        '',
        '- A field added to the form after load has no `data-pristine`, so `isChanged` compares against',
        '  `undefined` and reports it changed forever.',
        '- A successful save has to re-snapshot, or the form claims to be dirty against a value nobody',
        '  is holding any more. The platform version gets this by assigning `defaultValue`.',
        '- The baseline is now in the DOM, where anything can read or overwrite it — including the user',
        '  with devtools, and including a `data-*` collision with a framework or an analytics library.',
        '  Keeping it in a `WeakMap` keyed by the element avoids that and dies with the elements.',
        '',
        'The rule of thumb: use the platform default when the platform has one, and snapshot only for',
        'the controls it does not cover.',
      ].join('\n'),
    },
  ],
};
