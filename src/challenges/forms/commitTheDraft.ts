import type { ChallengeContent } from '@/types/challenge';

import { requireForm, requireInput } from './support';

type Commit = (form: HTMLFormElement) => void;

export const commitTheDraft: ChallengeContent = {
  prompt: [
    'A settings panel with two buttons wired elsewhere: **Revert**, which calls `form.reset()`, and',
    '**Save**, which calls the function you are about to write. Saving must make the current state',
    'the one Revert returns to — after a save, reset means "back to what I saved", not "back to the',
    'markup".',
    '',
    'Export `commit(form)`, which makes every field’s current state its default.',
    '',
    'Every form control keeps **two** values: the one on screen (`value`, `checked`) and the default',
    'it was born with (`defaultValue`, `defaultChecked` — reflections of the `value` and `checked`',
    '**attributes**). Typing moves only the first; `form.reset()` copies the second back over the',
    'first. So committing is not saving the screen state somewhere — it is moving the *defaults* to',
    'match the screen.',
    '',
    'The radio group is where half-measures die: giving the chosen radio a default without taking',
    'the old default **away** leaves the group with two “defaults”, and reset stops meaning',
    'anything.',
  ].join('\n'),
  html: [
    '<form id="settings">',
    '  <label>Display name <input id="name" name="name" value="Ada"></label>',
    '  <label>Newsletter <input id="news" name="news" type="checkbox"></label>',
    '  <fieldset>',
    '    <legend>Theme</legend>',
    '    <label><input id="light" type="radio" name="theme" value="light"> Light</label>',
    '    <label><input id="dark" type="radio" name="theme" value="dark"> Dark</label>',
    '    <label><input id="system" type="radio" name="theme" value="system" checked> System</label>',
    '  </fieldset>',
    '</form>',
  ].join('\n'),
  starterCode: [
    'export function commit(form: HTMLFormElement): void {',
    "  for (const field of form.querySelectorAll<HTMLInputElement>('input')) {",
    '    field.defaultValue = field.value;',
    '  }',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'a committed text value is what reset restores',
      run: ({ doc, fire, fn, expect }) => {
        const form = requireForm(doc, 'settings');
        const name = requireInput(doc, 'name');

        fire.input(name, 'Grace');
        fn<Commit>('commit')(form);
        // The commit moved the *default* -- which lives in the attribute, where the markup
        // serialiser and the next reset can both see it.
        expect(name.defaultValue).toBe('Grace');
        expect(name).toHaveAttribute('value', 'Grace');

        fire.input(name, 'Katherine');
        form.reset();
        expect(name.value).toBe('Grace');
      },
    },
    {
      name: 'a committed checkbox survives an uncheck-and-revert',
      run: ({ doc, fn, expect }) => {
        const form = requireForm(doc, 'settings');
        const news = requireInput(doc, 'news');

        news.checked = true;
        fn<Commit>('commit')(form);
        expect(news.defaultChecked).toBe(true);
        expect(news).toHaveAttribute('checked');

        news.checked = false;
        form.reset();
        expect(news.checked).toBe(true);
      },
    },
    {
      name: 'committing a radio takes the default away from the old choice',
      run: ({ doc, fn, expect }) => {
        const form = requireForm(doc, 'settings');
        const light = requireInput(doc, 'light');
        const dark = requireInput(doc, 'dark');
        const system = requireInput(doc, 'system');

        // The markup's default is `system`; checking `light` moves the *screen* state only.
        light.checked = true;
        fn<Commit>('commit')(form);

        expect(light.defaultChecked).toBe(true);
        // The half-measure bug, caught as a value before any reset runs: a commit that only awards
        // the new default leaves the old one standing, and the group has two.
        expect(system.defaultChecked).toBe(false);
        expect(system).not.toHaveAttribute('checked');
        expect(dark.defaultChecked).toBe(false);

        dark.checked = true;
        form.reset();
        expect(light.checked).toBe(true);
        expect(dark.checked).toBe(false);
        expect(system.checked).toBe(false);
      },
    },
    {
      name: 'edits made after the save still revert to it',
      run: ({ doc, fire, fn, expect }) => {
        const form = requireForm(doc, 'settings');
        const name = requireInput(doc, 'name');
        const news = requireInput(doc, 'news');

        fire.input(name, 'Grace');
        news.checked = true;
        fn<Commit>('commit')(form);

        // Post-save churn across both kinds of field, then one revert: the committed snapshot is
        // the whole record, not whichever fields the commit happened to visit.
        fire.input(name, 'Edsger');
        news.checked = false;
        form.reset();
        expect(name.value).toBe('Grace');
        expect(news.checked).toBe(true);
      },
    },
  ],
  solutions: [
    {
      label: 'Assign the default properties from the live ones',
      code: [
        'export function commit(form: HTMLFormElement): void {',
        "  for (const field of form.querySelectorAll<HTMLInputElement>('input')) {",
        "    if (field.type === 'checkbox' || field.type === 'radio') {",
        '      field.defaultChecked = field.checked;',
        '    } else {',
        '      field.defaultValue = field.value;',
        '    }',
        '  }',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'One pass, one unconditional assignment per field: the default becomes whatever the screen',
        'shows. `defaultValue = value` for the text kinds, `defaultChecked = checked` for the',
        'checked kinds -- the two pairs are the same idea, because every control is two values, the',
        'dirty one the user edits and the default `reset()` copies back.',
        '',
        'The radio group is handled correctly *by not being handled*. Checking `light` already',
        'unchecked `system` -- the group enforces that on screen -- so copying `checked` into',
        '`defaultChecked` for **every** radio writes `true` to the chosen one and `false` to the',
        'rest in the same sweep. The old default is not a case to remember; it is just another',
        'field whose current state is false. Compare the natural buggy shape, `if (field.checked)',
        'field.defaultChecked = true`: it looks like an optimisation and it is a different',
        'algorithm, one that only ever adds defaults and never retires one.',
        '',
        'These assignments are attribute writes in property clothing: `defaultValue` reflects the',
        '`value` attribute and `defaultChecked` the `checked` attribute, which the tests confirm',
        'with `toHaveAttribute`. After a commit, the *markup* agrees with the screen -- serialise',
        'the form and the saved state is what you get back.',
      ].join('\n'),
      tradeoffs: [
        'This is the shape to default to: it names the concept (defaults) directly, it is',
        'unconditional so there is no state it forgets, and it is idempotent -- committing twice is',
        'once.',
        '',
        'Its edges are the form controls this form does not have:',
        '',
        '- A `<textarea>` keeps its default as its **child text**, not a `value` attribute --',
        '  `defaultValue` still works there, which is exactly why the property dialect beats',
        '  attribute writes for generality.',
        '- A `<select>` has no `defaultValue`: its default is `defaultSelected` per option, so the',
        '  loop would need an options walk. (`selectedIndex` survives reset only via those.)',
        '- File inputs have no default to move; they reset to empty regardless.',
        '',
        'And one scoping honesty: `querySelectorAll` on the form misses controls linked from',
        'outside by the `form` attribute; `form.elements` would not.',
      ].join('\n'),
    },
    {
      label: 'Move the attributes themselves',
      code: [
        'export function commit(form: HTMLFormElement): void {',
        "  for (const field of form.querySelectorAll<HTMLInputElement>('input')) {",
        "    if (field.type === 'checkbox' || field.type === 'radio') {",
        "      field.toggleAttribute('checked', field.checked);",
        '    } else {',
        "      field.setAttribute('value', field.value);",
        '    }',
        '  }',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The same commit spelled in the attribute dialect, and it works because the defaults *are*',
        'the attributes: `setAttribute("value", ...)` is `defaultValue` by another name, and',
        '`toggleAttribute("checked", force)` writes or removes the boolean attribute that',
        '`defaultChecked` reflects.',
        '',
        'Two details carry the lesson:',
        '',
        '- **`setAttribute("value", ...)` does not change what is on screen.** The field’s value',
        '  attribute moves; its dirty value -- the one the user is looking at -- stays put. That is',
        '  the attribute/property split at its sharpest, and here it is exactly what a commit wants:',
        '  the screen is already right, only the baseline is stale.',
        '- **`toggleAttribute` with a force argument covers retirement.** The radio that lost its',
        '  place gets its `checked` attribute *removed*, because `force` is false for it. An',
        '  `if (checked) setAttribute(...)` spelling has no removal branch, and that missing branch',
        '  is the two-defaults bug.',
      ].join('\n'),
      tradeoffs: [
        'Functionally interchangeable with the property version for these inputs, so the choice is',
        'about what you want to be visible:',
        '',
        '- Choose this spelling when the *markup* is the product -- a form whose `innerHTML` gets',
        '  serialised, stored, or diffed. After this commit, the saved snapshot round-trips, which',
        '  is the trick the form-state-snapshot challenge builds on.',
        '- Choose the property spelling when generality matters: `defaultValue` works on a',
        '  `<textarea>` where `setAttribute("value", ...)` does nothing at all -- the same split,',
        '  pointing the other way. Attribute writes also normalise through the parser (a checkbox’s',
        '  `checked=""`), which is correct and occasionally surprising in diffs.',
        '- Attribute writes are marginally louder in DevTools and in mutation observers watching',
        '  attributes -- sometimes that is the point, sometimes it is noise.',
      ].join('\n'),
    },
  ],
};
