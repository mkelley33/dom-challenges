import type { ChallengeContent } from '@/types/challenge';

import { requireForm, requireInput, requireSelect } from './support';

type Payload = (form: HTMLFormElement) => Record<string, string>;

export const formdataNotAWalk: ChallengeContent = {
  prompt: [
    'A profile form about to be sent as JSON. Export `payload(form)`, which returns a plain object of',
    'exactly what a real submission would carry — the same names, the same values, the same omissions.',
    '',
    'The omissions are the whole exercise. A submission does **not** include every control the form',
    'contains:',
    '',
    '- a **disabled** field is skipped, even though it still holds a value on screen;',
    '- an **unchecked** checkbox contributes nothing — and a checked one without a `value` contributes',
    '  the string `"on"`, not `true`;',
    '- a `<select>` contributes the selected option’s value.',
    '',
    'Code that walks the inputs collecting `.value` gets every one of those wrong. The browser already',
    'knows the rules — the trick is asking it.',
  ].join('\n'),
  html: [
    '<form id="profile">',
    '  <label>Name <input id="name" name="name" value="Ada"></label>',
    '  <label>Email <input id="email" name="email" value="ada@example.com"></label>',
    '  <label>Plan <input id="plan" name="plan" value="pro" disabled></label>',
    '  <label>Newsletter <input id="news" name="news" type="checkbox"></label>',
    '  <label>Terms <input id="terms" name="terms" type="checkbox" checked></label>',
    '  <label>Role',
    '    <select id="role" name="role">',
    '      <option value="viewer" selected>Viewer</option>',
    '      <option value="editor">Editor</option>',
    '    </select>',
    '  </label>',
    '</form>',
  ].join('\n'),
  starterCode: [
    'export function payload(form: HTMLFormElement): Record<string, string> {',
    '  const result: Record<string, string> = {};',
    "  for (const field of form.querySelectorAll<HTMLInputElement>('input, select')) {",
    '    result[field.name] = field.value;',
    '  }',
    '  return result;',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'the payload carries what the fields hold right now',
      run: ({ doc, fire, fn, expect }) => {
        fire.input(requireInput(doc, 'name'), 'Grace Hopper');
        // The whole shape at once: the typed value, the markup values, the checked box as "on" --
        // and neither the disabled plan nor the unchecked newsletter anywhere in it.
        expect(fn<Payload>('payload')(requireForm(doc, 'profile'))).toEqual({
          name: 'Grace Hopper',
          email: 'ada@example.com',
          terms: 'on',
          role: 'viewer',
        });
      },
    },
    {
      name: 'a disabled field still holds its value — the submission just never sees it',
      run: ({ doc, fn, expect }) => {
        const result = fn<Payload>('payload')(requireForm(doc, 'profile'));
        expect(Object.hasOwn(result, 'plan')).toBe(false);
        // The two claims are different, and both matter: the field is not empty, it is excluded.
        expect(requireInput(doc, 'plan').value).toBe('pro');
        // Positive control for the absence above: the same object does carry its neighbours.
        expect(Object.hasOwn(result, 'name')).toBe(true);
      },
    },
    {
      name: 'a checkbox is present exactly when checked, and reads "on"',
      run: ({ doc, fn, expect }) => {
        requireInput(doc, 'news').checked = true;
        requireInput(doc, 'terms').checked = false;
        const result = fn<Payload>('payload')(requireForm(doc, 'profile'));
        expect(result.news).toBe('on');
        expect(Object.hasOwn(result, 'terms')).toBe(false);
      },
    },
    {
      name: 'the select contributes whichever option is selected now',
      run: ({ doc, fn, expect }) => {
        requireSelect(doc, 'role').value = 'editor';
        expect(fn<Payload>('payload')(requireForm(doc, 'profile')).role).toBe('editor');
      },
    },
  ],
  solutions: [
    {
      label: 'Ask FormData',
      code: [
        'export function payload(form: HTMLFormElement): Record<string, string> {',
        '  const result: Record<string, string> = {};',
        '  for (const [name, value] of new FormData(form)) {',
        '    result[name] = String(value);',
        '  }',
        '  return result;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        '`new FormData(form)` builds the exact entry list a real submission would send. That is its',
        'definition, not a convenience: the spec’s "construct the entry list" algorithm -- the one',
        'form submission itself runs -- is what the constructor calls. So every exclusion rule comes',
        'for free, because it is not reimplemented, it is *the same code path*.',
        '',
        'The rules the tests check are the ones hand-walks get wrong:',
        '',
        '- **Disabled fields are skipped.** Disabled means "not part of this interaction" -- the',
        '  field keeps its value (the second test reads it), but the submission has no entry for it.',
        '  The same rule is why disabled fields never block validation.',
        '- **An unchecked checkbox is absent, not false.** A checkbox only submits when checked, and',
        '  with no `value` attribute it submits the default `"on"`. Server-side code that expects',
        '  `"false"` has been bitten by this for as long as forms have existed -- absence *is* the',
        '  unchecked signal.',
        '- **A `<select>` submits its selected option’s value**, which is a property of the options,',
        '  not of the select’s own markup.',
        '',
        'The `String(value)` is honest typing rather than ceremony: a FormData entry is',
        '`string | File` (a file input contributes `File` objects), and this form has no file',
        'inputs, so the coercion is a no-op that keeps the return type truthful.',
      ].join('\n'),
      tradeoffs: [
        'For "what would this form send", FormData is the answer and the walk below is the exhibit.',
        'Its honest limits:',
        '',
        '- **A plain object is lossier than the entry list.** Two fields sharing a name collapse to',
        '  one key -- the last write wins. FormData itself keeps every entry; `getAll` is the reading',
        '  the getall-or-lose-them challenge is about. Flatten only when you know the names are',
        '  unique.',
        '- **It reads the form’s controls, wherever they live.** A field outside the `<form>` tag',
        '  linked by `form="profile"` is included -- a hand-walk scoped to the form element misses',
        '  it.',
        '- **You cannot ask it for a control the rules exclude.** If you genuinely want the disabled',
        '  plan in your JSON, that is not a submission any more -- read the field directly and own',
        '  the decision, rather than fighting the API whose job is to say no.',
      ].join('\n'),
    },
    {
      label: 'Walk form.elements, applying the rules yourself',
      code: [
        'export function payload(form: HTMLFormElement): Record<string, string> {',
        '  const result: Record<string, string> = {};',
        '  for (const element of form.elements) {',
        '    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement)) continue;',
        '    if (element.disabled || element.name === \'\') continue;',
        "    if (element instanceof HTMLInputElement && (element.type === 'checkbox' || element.type === 'radio')) {",
        '      if (!element.checked) continue;',
        '    }',
        '    result[element.name] = element.value;',
        '  }',
        '  return result;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The same answer built by hand, and worth writing once to see what FormData was doing for',
        'you. Every `continue` is one of the submission rules, now your code’s responsibility:',
        'disabled fields out, nameless fields out, unchecked checkboxes and radios out. The checkbox',
        '`"on"` default is the one rule that costs nothing here -- `element.value` on a checkbox',
        'with no `value` attribute already reads `"on"`, which is exactly the kind of detail that',
        'makes hand-rolling *look* easy: most of the rules are invisible until the one form that',
        'needs them.',
        '',
        '`form.elements` rather than `querySelectorAll`: it is the form’s own list of its controls,',
        'including ones outside the tag linked by the `form` attribute, and excluding controls that',
        'belong to a nested... there are no nested forms, but there are `<fieldset>`s, `<output>`s',
        'and buttons, which is what the `instanceof` filter is for.',
      ].join('\n'),
      tradeoffs: [
        'Choose this shape only when the reading genuinely is not a submission -- when you need',
        'disabled fields included, or values transformed per control on the way out. Then the',
        'explicitness is the point: every rule you apply is one you chose.',
        '',
        'As a stand-in for FormData it is strictly worse, and the ways it is worse are instructive:',
        '',
        '- This version already misses `<textarea>`, file inputs, and multi-selects (only the',
        '  *first* selected option’s value survives `.value`). Each is another branch, and the spec',
        '  has more rules than any hand-walk ships with.',
        '- It reimplements rules the platform will keep evolving -- form-associated custom elements',
        '  submit through the same entry-list algorithm, and this loop has never heard of them.',
        '- The rules live in two places now. When the real submission and your JSON disagree, that',
        '  disagreement is a bug report.',
      ].join('\n'),
    },
  ],
};
