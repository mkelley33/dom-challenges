import type { ChallengeContent } from '@/types/challenge';

import { requireElement, requireInput } from './support';

type Snapshot = (form: HTMLElement) => string;

/**
 * Reads a control out of `root`, and never out of the document.
 *
 * Scoping is load-bearing here rather than tidy: restoring a snapshot puts a **second** `#title`
 * and `#notes` into the document, and `doc.querySelector('#title')` answers with the first in
 * document order -- the original, still holding the state the test just set. Written that way,
 * every assertion below would pass against a `snapshot` that returned an empty string.
 */
function control<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`no element matching "${selector}" was found where one was expected`);
  return element;
}

/**
 * Parses a snapshot into the spare container and hands back the container.
 *
 * Restoring through `innerHTML` rather than comparing the returned string is the point: the claim
 * is "this markup rebuilds the state", and a string comparison would instead pin one particular
 * serialisation of it -- attribute order, quoting, and `checked=""` versus `checked`.
 */
function restore(doc: Document, markup: string): HTMLElement {
  const holder = requireElement(doc, 'restored');
  holder.innerHTML = markup;
  return holder;
}

export const formStateSnapshot: ChallengeContent = {
  prompt: [
    'Autosave. The draft form below has to be turned into a string that can be stored and later',
    'parsed back into a form showing **what the user has on screen right now**.',
    '',
    'Export `snapshot(form)` returning the form’s inner HTML, with the current state baked into the',
    'markup: the text in the boxes, and which checkboxes are ticked.',
    '',
    'Two rules:',
    '',
    '- The user must not see anything change. Whatever is in the fields stays there.',
    '- `#restored.innerHTML = snapshot(form)` has to reproduce the state, field for field.',
    '',
    'The starter returns `form.innerHTML`, which is the obvious answer and hands back the markup as',
    'the *server* sent it — none of the typing is in there.',
  ].join('\n'),
  html: [
    '<form id="draft">',
    '  <input id="title" name="title" value="Quarterly report">',
    '  <textarea id="notes" name="notes">Nothing yet.</textarea>',
    '  <label><input id="public" name="public" type="checkbox" checked> Public</label>',
    '  <label><input id="pinned" name="pinned" type="checkbox"> Pinned</label>',
    '</form>',
    '<div id="restored"></div>',
  ].join('\n'),
  starterCode: ['export function snapshot(form: HTMLFormElement): string {', '  return form.innerHTML;', '}', ''].join(
    '\n',
  ),
  tests: [
    {
      name: 'typed text survives being written out and parsed back',
      run: ({ doc, fn, fire, expect }) => {
        // The typing is done by the test, through the same path a keystroke takes: it sets the
        // property, which raises the input's dirty value flag and leaves the `value` attribute --
        // the only part `innerHTML` can see -- holding what the markup said.
        fire.input(requireInput(doc, 'title'), 'Q4 report');

        const holder = restore(doc, fn<Snapshot>('snapshot')(requireElement(doc, 'draft')));

        expect(control<HTMLInputElement>(holder, 'input#title').value).toBe('Q4 report');
      },
    },
    {
      name: 'a textarea is written out too, and its default is not an attribute',
      run: ({ doc, fn, expect }) => {
        control<HTMLTextAreaElement>(doc, '#draft textarea#notes').value = 'Ship on Friday.';

        const holder = restore(doc, fn<Snapshot>('snapshot')(requireElement(doc, 'draft')));

        // A `<textarea>` has no `value` attribute at all: its default is the text between the tags.
        // `setAttribute('value', …)` on one writes an attribute nothing reads, and the restored copy
        // still shows the server's text.
        expect(control<HTMLTextAreaElement>(holder, 'textarea#notes').value).toBe('Ship on Friday.');
      },
    },
    {
      name: 'checkbox state survives in both directions',
      run: ({ doc, fn, expect }) => {
        requireInput(doc, 'public').checked = false;
        requireInput(doc, 'pinned').checked = true;

        const holder = restore(doc, fn<Snapshot>('snapshot')(requireElement(doc, 'draft')));

        // Both directions matter, and they fail differently: the markup says `checked` for one box
        // and says nothing for the other, so a snapshot that only ever *adds* the attribute gets the
        // second right and the first wrong.
        expect(control<HTMLInputElement>(holder, 'input#public').checked).toBe(false);
        expect(control<HTMLInputElement>(holder, 'input#pinned').checked).toBe(true);
      },
    },
    {
      name: 'a field nobody touched round-trips unchanged',
      run: ({ doc, fn, fire, expect }) => {
        fire.input(requireInput(doc, 'title'), 'Q4 report');

        const holder = restore(doc, fn<Snapshot>('snapshot')(requireElement(doc, 'draft')));

        expect(control<HTMLInputElement>(holder, 'input#public').checked).toBe(true);
        expect(control<HTMLTextAreaElement>(holder, 'textarea#notes').value).toBe('Nothing yet.');
      },
    },
    {
      name: 'taking the snapshot changes nothing the user can see',
      run: ({ doc, fn, fire, expect }) => {
        const title = requireInput(doc, 'title');
        const publicBox = requireInput(doc, 'public');
        fire.input(title, 'Q4 report');
        publicBox.checked = false;

        fn<Snapshot>('snapshot')(requireElement(doc, 'draft'));

        // Syncing the attributes to the properties is allowed -- it is what "save" means. Syncing the
        // properties to the attributes is not: `field.value = field.getAttribute('value')` would put
        // the server's text back under the user's cursor.
        expect(title.value).toBe('Q4 report');
        expect(publicBox.checked).toBe(false);
        expect(doc.querySelectorAll('#draft input')).toHaveLength(3);
      },
    },
  ],
  solutions: [
    {
      label: 'Move the defaults up to the current state',
      code: [
        'export function snapshot(form: HTMLFormElement): string {',
        "  for (const field of form.querySelectorAll('input')) {",
        "    if (field.type === 'checkbox' || field.type === 'radio') {",
        '      field.defaultChecked = field.checked;',
        '    } else {',
        '      field.defaultValue = field.value;',
        '    }',
        '  }',
        '',
        "  for (const area of form.querySelectorAll('textarea')) {",
        '    area.defaultValue = area.value;',
        '  }',
        '',
        '  return form.innerHTML;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        '`innerHTML` serialises the **document**, and the document is attributes. It has no way to see',
        'anything else, and for a form control almost nothing you care about is an attribute:',
        '',
        '```js',
        "title.value = 'Q4 report';",
        'title.getAttribute(\'value\');   // "Quarterly report" -- still what the server sent',
        'form.innerHTML;                // …value="Quarterly report"…',
        '```',
        '',
        'This is the *dirty value flag* seen from the other side. An `<input>` keeps two things: the',
        '**default**, which is the `value` attribute, and the **current value**, which is the `value`',
        'property. They start equal, and the first time anything sets the property — a keystroke, or',
        '`field.value = …` — the two come apart permanently. `checked` and `defaultChecked` are the',
        'same pair under different names.',
        '',
        'So serialising the current state means moving the defaults up to meet it, and',
        '`defaultValue`/`defaultChecked` are precisely the writable names for those attributes:',
        '',
        '- `field.defaultValue = field.value` writes the `value` attribute.',
        '- `field.defaultChecked = field.checked` adds or removes the `checked` attribute.',
        '- `area.defaultValue = area.value` sets the textarea’s **child text**, because that — not an',
        '  attribute — is where a textarea’s default lives.',
        '',
        'None of those touches the current value, so nothing moves under the user. And the third line',
        'is the one that makes this version better than the alternative below: `defaultValue` hides the',
        'fact that two different element types keep their default in two different places.',
      ].join('\n'),
      tradeoffs: [
        'This is the right shape when "take a snapshot" and "save" are the same act, because moving the',
        'default up is exactly what saving means: after it, the form is no longer dirty, and a',
        '`form.reset()` returns to what was saved rather than to what the server first sent. Anything',
        'watching for unsaved changes by comparing `value` with `defaultValue` gets the right answer',
        'for free.',
        '',
        'The cost is that it is not a read-only operation. If a snapshot is meant to be a passive',
        'observation — an autosave that must not disturb undo state, a debugging dump — this quietly',
        'changes the form’s idea of its own baseline. Cloning the form first and syncing the clone is',
        'the fix, and it costs a subtlety: cloning an `<input>` copies its value **and its dirty flag**,',
        'so the clone already knows what the user typed.',
        '',
        'Three things this snapshot still does not contain, and none of them will announce itself:',
        '',
        '- **`<select>`**, whose default is spread across the options as `option.defaultSelected`. The',
        '  loops above do not touch it, so a restored select shows the markup’s choice.',
        '- **Event listeners**, which are not attributes and are gone the moment the markup is reparsed.',
        '- **Anything a component kept beside the DOM** — the trap the whole category is about.',
        '',
        'And for actual autosave, HTML is a poor container. `new FormData(form)` gives you the named',
        'values directly, is a third of the size, and cannot smuggle markup back into your page.',
      ].join('\n'),
    },
    {
      label: 'Write the attributes by hand',
      code: [
        'export function snapshot(form: HTMLFormElement): string {',
        "  for (const field of form.querySelectorAll('input')) {",
        "    if (field.type === 'checkbox' || field.type === 'radio') {",
        "      field.toggleAttribute('checked', field.checked);",
        '    } else {',
        "      field.setAttribute('value', field.value);",
        '    }',
        '  }',
        '',
        "  for (const area of form.querySelectorAll('textarea')) {",
        '    area.textContent = area.value;',
        '  }',
        '',
        '  return form.innerHTML;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The same three writes, spelled as the attribute operations they are. Reading it next to the',
        'version above is the clearest way to see what `defaultValue` and `defaultChecked` really are:',
        'reflected properties over the `value` attribute, the `checked` attribute, and a textarea’s',
        'child text.',
        '',
        'Each line is a different one of this category’s ideas, which is why it is worth writing once:',
        '',
        '- `setAttribute("value", …)` — an ordinary attribute holding a string.',
        '- `toggleAttribute("checked", field.checked)` — a **boolean** attribute, where presence is the',
        '  value. `setAttribute("checked", String(field.checked))` would write `checked="false"` and',
        '  restore a *ticked* box, because the browser reads only whether the attribute is there.',
        '- `area.textContent = area.value` — a `<textarea>` has no `value` attribute in the HTML',
        '  grammar at all. Writing one is legal, silent, and read by nothing;',
        '  `<textarea value="Ship on Friday.">Nothing yet.</textarea>` restores to `Nothing yet.`',
        '',
        'The textarea line is safe against the dirty flag for the same reason `defaultValue` is: a',
        'textarea’s raw value only follows its child text while the control is clean, so writing the',
        'text of a dirty one changes the default and leaves the current value alone.',
      ].join('\n'),
      tradeoffs: [
        'Choose this when the set of controls is fixed and you want the serialisation to be obvious to',
        'a reader — every line says which attribute it writes, and there is no need to know what',
        '`defaultChecked` means.',
        '',
        'Choose `defaultValue`/`defaultChecked` for anything that has to generalise. This version has',
        'the element-type knowledge spread across three branches, so a `<select>` is a fourth branch',
        'here and would have been a fourth branch there — but a `<textarea>` only needed a branch',
        '*here*, and that asymmetry is the whole argument. The reflected properties are named after the',
        'concept ("the default"); the attributes are named after the storage, and the storage differs',
        'per element.',
        '',
        'It also gives up the type checking. `field.defaultChecked = field.checked` is two booleans and',
        'the compiler knows it; `toggleAttribute("checked", …)` is a quoted string that has to be',
        'spelled right, and `setAttribute("value", field.value)` on a `<textarea>` is a mistake nothing',
        'will report — not TypeScript, not the browser, not the restored form, which simply shows the',
        'wrong text.',
      ].join('\n'),
    },
  ],
};
