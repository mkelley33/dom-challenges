import type { ChallengeContent } from '@/types/challenge';

import { idsOf, requireElement, requireInput } from './support';

type SetSaving = (form: HTMLElement, saving: boolean) => void;

export const booleanAttributes: ChallengeContent = {
  prompt: [
    'While the editor is saving, nothing in the form may be touched and a status line says so.',
    '',
    'Export `setSaving(form, saving)`:',
    '',
    '- **saving** — every `<input>`, `<textarea>` and `<button>` inside `form` is disabled, and the',
    '  `.status` line is shown.',
    '- **not saving** — none of them is disabled, and the `.status` line is hidden again.',
    '',
    'Only the controls inside the form it was handed. The Cancel button outside it is never disabled.',
    '',
    'The starter writes the state it was given into the attribute, which is what the code reads like',
    'it should do. Run it: `setSaving(form, false)` leaves the whole form disabled.',
  ].join('\n'),
  html: [
    '<form id="editor">',
    '  <input id="title" name="title" value="Notes">',
    '  <textarea id="body" name="body">Draft</textarea>',
    '  <button id="save" type="submit">Save</button>',
    '  <p id="status" class="status" hidden>Saving…</p>',
    '</form>',
    '<button id="cancel" type="button">Cancel</button>',
  ].join('\n'),
  starterCode: [
    'export function setSaving(form: HTMLFormElement, saving: boolean): void {',
    "  for (const control of form.querySelectorAll('input, textarea, button')) {",
    "    control.setAttribute('disabled', String(saving));",
    '  }',
    '',
    "  form.querySelector('.status')?.setAttribute('hidden', String(!saving));",
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'saving disables every control in the form and shows the status line',
      run: ({ doc, fn, expect }) => {
        const form = requireElement(doc, 'editor');
        fn<SetSaving>('setSaving')(form, true);

        expect(idsOf(form.querySelectorAll('[disabled]'))).toEqual(['title', 'body', 'save']);
        expect(requireInput(doc, 'title').disabled).toBe(true);
        expect(requireElement(doc, 'status').hidden).toBe(false);
      },
    },
    {
      name: 'not saving leaves nothing disabled, however the attribute was written',
      run: ({ doc, fn, expect }) => {
        const form = requireElement(doc, 'editor');
        const setSaving = fn<SetSaving>('setSaving');
        setSaving(form, true);
        setSaving(form, false);

        // `disabled="false"` is still disabled. A boolean attribute carries no value: the browser
        // reads whether it is *there*, and every string -- "false", "no", "" -- means the same thing.
        // Removing it is the only way to turn it off.
        expect(form.querySelectorAll('[disabled]')).toHaveLength(0);
        expect(requireInput(doc, 'title').disabled).toBe(false);
        expect(requireElement(doc, 'save').hasAttribute('disabled')).toBe(false);
        expect(requireElement(doc, 'status').hidden).toBe(true);
      },
    },
    {
      name: 'it clears state it did not set',
      run: ({ doc, fn, expect }) => {
        // Inverted control: the disabling and the un-hiding are done by the test, so the only way to
        // pass is to make the form match the state you were given rather than to undo your own work.
        const title = requireInput(doc, 'title');
        const status = requireElement(doc, 'status');
        title.disabled = true;
        status.removeAttribute('hidden');

        fn<SetSaving>('setSaving')(requireElement(doc, 'editor'), false);

        expect(title.disabled).toBe(false);
        expect(status.hidden).toBe(true);
      },
    },
    {
      name: 'calling it twice with the same answer says the same thing twice',
      run: ({ doc, fn, expect }) => {
        const form = requireElement(doc, 'editor');
        const setSaving = fn<SetSaving>('setSaving');

        // `toggleAttribute(name)` with no second argument *flips*, so a solution that reaches for it
        // on both branches turns the form back on here while reporting that it is saving.
        setSaving(form, true);
        setSaving(form, true);
        expect(idsOf(form.querySelectorAll('[disabled]'))).toEqual(['title', 'body', 'save']);
        expect(requireElement(doc, 'status').hidden).toBe(false);

        setSaving(form, false);
        setSaving(form, false);
        expect(form.querySelectorAll('[disabled]')).toHaveLength(0);
        expect(requireElement(doc, 'status').hidden).toBe(true);
      },
    },
    {
      name: 'the Cancel button outside the form is left alone',
      run: ({ doc, fn, expect }) => {
        const cancel = requireElement(doc, 'cancel');
        fn<SetSaving>('setSaving')(requireElement(doc, 'editor'), true);

        expect(cancel.hasAttribute('disabled')).toBe(false);
        expect(doc.querySelectorAll('[disabled]')).toHaveLength(3);
      },
    },
  ],
  solutions: [
    {
      label: 'Assign the boolean IDL properties',
      code: [
        'type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement;',
        '',
        'export function setSaving(form: HTMLFormElement, saving: boolean): void {',
        "  for (const control of form.querySelectorAll<FormControl>('input, textarea, button')) {",
        '    control.disabled = saving;',
        '  }',
        '',
        "  const status = form.querySelector<HTMLElement>('.status');",
        '  if (status) status.hidden = !saving;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'A **boolean attribute** has no value. `disabled`, `hidden`, `checked`, `required`, `readonly`,',
        '`multiple`, `open`, `inert`, `async`, `defer` — for every one of them the browser asks a single',
        'question: **is the attribute there?** If it is, the answer is true, whatever string it holds.',
        '',
        '```html',
        '<button disabled>          <!-- disabled -->',
        '<button disabled="">       <!-- disabled -->',
        '<button disabled="false">  <!-- disabled -->',
        '<button>                   <!-- not disabled -->',
        '```',
        '',
        'So `setAttribute("disabled", String(saving))` cannot ever turn the button back on. It writes',
        '`"false"`, the attribute is present, and the button stays dead — with the string `false` sitting',
        'in devtools next to it, which is why this one survives review so often.',
        '',
        'The IDL property is the fix and it reads exactly as you want it to. `control.disabled = false`',
        '**removes** the attribute; `= true` adds it with an empty value. The property is a boolean, the',
        'attribute is presence, and the reflection between them handles the translation.',
        '',
        '`hidden` works the same way on any `HTMLElement`, which is why the status line does not need a',
        'class toggle: `status.hidden = false` removes the attribute and the element comes back.',
        '',
        'Two neighbours that look like boolean attributes and are not:',
        '',
        '- **`aria-*` state.** `aria-hidden="false"` is a real, meaningful value that is different from',
        '  the attribute being absent, and so are `aria-expanded`, `aria-checked` and the rest. Those are',
        '  *enumerated* attributes: write the string, and remove it only when you mean "this element',
        '  makes no such claim".',
        '- **`data-*`.** `data-saving="false"` is a value, because the platform never interprets your',
        '  data attributes at all — only your own code does, and `[data-saving]` in a stylesheet will',
        '  match it.',
      ].join('\n'),
      tradeoffs: [
        'Use the property when the element has one. It is the shortest spelling, it is type-checked, and',
        'it reads as the boolean it is.',
        '',
        'What it cannot do is generalise. `disabled` is a property of form controls only — `div.disabled',
        '= true` is not an error and not a warning, it is a new JavaScript property on an object, and the',
        '`<div>` is exactly as interactive as it was. The same silence catches `label.for = "email"`',
        '(the property is `htmlFor`) and `el.class = "chip"` (the property is `className`). A "disable',
        'everything in here" helper written against the property therefore has a blind spot shaped like',
        'whichever elements were not form controls.',
        '',
        'The other limit is that the name has to be a literal in your source. If the attribute to flip',
        'arrives as a string — from a config, a `data-*` attribute, a design-token map — no property',
        'lookup will help you, and the alternative below is what you want.',
      ].join('\n'),
    },
    {
      label: 'toggleAttribute with the force argument',
      code: [
        'export function setSaving(form: HTMLFormElement, saving: boolean): void {',
        "  for (const control of form.querySelectorAll('input, textarea, button')) {",
        "    control.toggleAttribute('disabled', saving);",
        '  }',
        '',
        "  form.querySelector('.status')?.toggleAttribute('hidden', !saving);",
        '}',
        '',
      ].join('\n'),
      explanation: [
        '`toggleAttribute(name, force)` is the boolean-attribute API, and the second argument is what',
        'makes it usable:',
        '',
        '- `toggleAttribute("disabled")` — **flips** it, and returns whether it is now present.',
        '- `toggleAttribute("disabled", true)` — adds it if missing, leaves it if present.',
        '- `toggleAttribute("disabled", false)` — removes it if present, leaves it absent.',
        '',
        'With `force`, the call is *idempotent*: it puts the attribute into the state you asked for,',
        'however many times you call it and whatever it was before. Without it, calling the same line',
        'twice undoes itself — which is the bug the fourth test is about, and it only shows up when',
        'something calls your function twice in a row.',
        '',
        'The value it writes is the empty string, which is all a boolean attribute needs.',
        '`setAttribute("disabled", "disabled")` — the old XHTML idiom — is exactly as correct, and so is',
        'any other string; the value is never read.',
        '',
        'The name is an ordinary argument here, so this same line disables anything: `open` on a',
        '`<details>`, `inert` on a dialog backdrop, `multiple` on a `<select>`, or an attribute your own',
        'stylesheet invented.',
      ].join('\n'),
      tradeoffs: [
        'Reach for this when the attribute has no IDL property, when the element might not be the kind',
        'that has one, or when the name is data rather than source. It is also the honest spelling when',
        'what you mean really is "this attribute should be present" rather than "this control is off".',
        '',
        'Two costs:',
        '',
        '- **The force argument is easy to leave off**, and the version without it type-checks, reads',
        '  fine, and is wrong in a way that only appears on the second call. If you find yourself writing',
        '  `if (on) el.toggleAttribute(name) else el.toggleAttribute(name)`, that is the bug.',
        '- **It is not the tool for attributes that carry values.** `toggleAttribute("aria-hidden",',
        '  false)` removes the attribute, where accessibility semantics wanted the string `"false"`. It',
        '  cannot tell a boolean attribute from any other kind, because nothing about the DOM API can —',
        '  the distinction lives in the HTML spec, per attribute.',
        '',
        'A related read: `hasAttribute(name)` is the matching question. `getAttribute(name)` returns',
        "`''` for a present, empty boolean attribute, and `''` is falsy — so `if (el.getAttribute(",
        '"disabled"))` reports a disabled button as enabled.',
      ].join('\n'),
    },
  ],
};
