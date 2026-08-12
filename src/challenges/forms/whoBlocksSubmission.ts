import type { ChallengeContent } from '@/types/challenge';

import { requireForm, requireInput } from './support';

type Blockers = (form: HTMLFormElement) => string[];

/**
 * No submit button in this markup, deliberately: `button.willValidate` is `undefined` under
 * happy-dom and `true` in Chrome (the category's fourth exclusion), so any solution that walks the
 * controls filtering on `willValidate` would be graded differently by the two hosts the moment a
 * button is in the walk. With inputs only, the whole walk is on measured ground. The fiction --
 * this panel's submission is driven from elsewhere -- costs the scenario nothing.
 */
export const whoBlocksSubmission: ChallengeContent = {
  prompt: [
    'A legacy profile panel, submitted by code elsewhere in the page. Before it submits, the page',
    'wants an audit: **which fields would stop this form right now?**',
    '',
    'Export `blockers(form)` — the `name`s of the fields that would block submission, in document',
    'order, `[]` when nothing would.',
    '',
    'Read the markup before you write anything, because two of these fields are bait:',
    '',
    '- `#ref` is `required` **and `readonly`** — filled in by the system, eventually;',
    '- `#legacy` is `required` **and `disabled`** — kept for the old backend.',
    '',
    'Neither can block a submission, ever. A field that is disabled or readonly is **barred from',
    'constraint validation**: `required` simply does not apply to a field the user cannot edit, and',
    'submission sails past it (just as `FormData` skips the disabled one). Hand-rolled audits that',
    'pattern-match on `required` + empty flag both — and then the page refuses to submit a form the',
    'browser would have accepted.',
  ].join('\n'),
  html: [
    '<form id="profile">',
    '  <label>Name <input id="name" name="name" required></label>',
    '  <label>Email <input id="email" name="email" type="email" required></label>',
    '  <label>Reference <input id="ref" name="ref" required readonly></label>',
    '  <label>Legacy id <input id="legacy" name="legacy" required disabled></label>',
    '  <label>Notes <input id="notes" name="notes"></label>',
    '</form>',
  ].join('\n'),
  starterCode: [
    'export function blockers(form: HTMLFormElement): string[] {',
    '  const names: string[] = [];',
    "  for (const field of form.querySelectorAll<HTMLInputElement>('input')) {",
    "    if (field.required && field.value === '') names.push(field.name);",
    '  }',
    '  return names;',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'required-and-empty is not enough: barred fields never block',
      run: ({ doc, fn, expect }) => {
        // All four required fields are empty. Only the two the user could actually fix are
        // blockers -- ref (readonly) and legacy (disabled) are barred from validation entirely.
        expect(fn<Blockers>('blockers')(requireForm(doc, 'profile'))).toEqual(['name', 'email']);
      },
    },
    {
      name: 'an empty audit means the form really would submit',
      run: ({ doc, fire, fn, expect }) => {
        const form = requireForm(doc, 'profile');
        const blockers = fn<Blockers>('blockers');

        // The channel proven live first: the same function, same document, reports the two real
        // blockers before the fix...
        expect(blockers(form)).toEqual(['name', 'email']);

        fire.input(requireInput(doc, 'name'), 'Ada Lovelace');
        fire.input(requireInput(doc, 'email'), 'ada@example.com');

        // ...and empty after it -- with the platform's own verdict alongside, so "no blockers"
        // and "the form validates" are the same claim, not two claims that happen to agree today.
        expect(blockers(form)).toEqual([]);
        expect(form.checkValidity()).toBe(true);
      },
    },
    {
      name: 'a malformed value blocks even though something was typed',
      run: ({ doc, fire, fn, expect }) => {
        fire.input(requireInput(doc, 'name'), 'Ada Lovelace');
        fire.input(requireInput(doc, 'email'), 'nope');
        // Emptiness checks pass "nope"; the validity engine does not. An audit that reimplements
        // `required` by hand has no idea `type="email"` exists.
        expect(fn<Blockers>('blockers')(requireForm(doc, 'profile'))).toEqual(['email']);
      },
    },
    {
      name: 're-enabling a field puts it back in the audit',
      run: ({ doc, fn, expect }) => {
        requireInput(doc, 'legacy').disabled = false;
        // Barred is a state, not an identity: the moment the bar lifts, the same required+empty
        // field is a real blocker again. An audit that hard-codes which fields "count" fails the
        // day the form changes under it.
        expect(fn<Blockers>('blockers')(requireForm(doc, 'profile'))).toEqual(['name', 'email', 'legacy']);
      },
    },
  ],
  solutions: [
    {
      label: 'Ask each field for its verdict',
      code: [
        'export function blockers(form: HTMLFormElement): string[] {',
        "  return [...form.querySelectorAll<HTMLInputElement>('input')]",
        '    .filter((field) => !field.checkValidity())',
        '    .map((field) => field.name);',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'One question per field: `checkValidity()`. Its answer already folds in everything the',
        'audit needs -- and the surprising half is what it answers for the bait fields.',
        '',
        '`checkValidity()` on the readonly `#ref` and the disabled `#legacy` returns **true**. Not',
        '"true, the value is fine" -- the value is empty and the field says `required` -- but',
        '"true, this field cannot fail": a disabled or readonly field is *barred from constraint',
        'validation*, so there is no constraint for it to be failing. That is the platform’s',
        'considered answer to a question the hand-rolled audit never thought to ask. Required means',
        '"the **user** must supply this before **they** submit"; a field the user cannot edit has',
        'nobody to make the demand of.',
        '',
        'Everything else follows from delegating: `type="email"` catches `"nope"` without this code',
        'knowing emails exist, document order falls out of `querySelectorAll`, and the re-enabling',
        'test passes because the verdict is asked fresh each call -- barred is a state the field is',
        'in, not a list this function keeps.',
        '',
        'One behaviour to know before shipping this exact shape: `checkValidity()` is not a pure',
        'read. Each false answer also fires an `invalid` event at that field. Harmless here; a page',
        'with `invalid` listeners doing UI work would see the audit trigger it.',
      ].join('\n'),
      tradeoffs: [
        'The right default: shortest path from question to the platform’s own answer.',
        '',
        '- The `invalid` events are the real cost. Run this audit on a form whose `invalid`',
        '  handlers paint error states, and auditing becomes redecorating. The silent variant below',
        '  exists for exactly that.',
        '- `querySelectorAll("input")` is honest for this markup and lazy in general: `<select>`,',
        '  `<textarea>` and form-associated custom elements validate too. `form.elements` is the',
        '  complete list -- but it includes buttons, whose `willValidate` this suite’s engine',
        '  reports differently from a browser, which is why this challenge keeps the walk to',
        '  inputs.',
        '- The function returns names; a UI usually wants the fields. Returning the elements and',
        '  mapping to names at the edge is the more reusable cut.',
      ].join('\n'),
    },
    {
      label: 'Filter on participation first, silently',
      code: [
        'export function blockers(form: HTMLFormElement): string[] {',
        "  return [...form.querySelectorAll<HTMLInputElement>('input')]",
        '    .filter((field) => field.willValidate && !field.validity.valid)',
        '    .map((field) => field.name);',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The same audit split into its two real questions. `willValidate` asks "does this field',
        'participate in constraint validation at all?" -- false for the readonly and disabled',
        'fields, false for anything barred. Only for the participants does `validity.valid` then',
        'ask "and is it currently failing?". Reading the `validity` object instead of calling',
        '`checkValidity()` makes the whole audit silent: no `invalid` events, no side effects, just',
        'state.',
        '',
        'The order of the two reads is load-bearing, and not only for meaning. This engine keeps a',
        'barred field’s `validity` flags raised (`#ref` reports `valueMissing: true` even though it',
        'cannot block), and a real browser computes them barred-aware -- so `validity.valid` **on a',
        'barred field** is the one read the two hosts disagree about. Guarded behind `willValidate`',
        'it is never read, and both hosts agree on every read that remains. An unguarded',
        '`!field.validity.valid` audit would flag `#ref` here and pass it in Chrome: the same code,',
        'two verdicts, which is the kind of bug that only surfaces in production.',
      ].join('\n'),
      tradeoffs: [
        'Choose this shape when the audit must be a pure read -- forms with `invalid`-driven UI, or',
        'audits that run on every keystroke where firing events per keypress is noise at best.',
        '',
        '- It reads two properties instead of calling one method, and the guard order is a rule the',
        '  next editor has to keep: `willValidate` first, `validity` only behind it. The',
        '  `checkValidity()` version has no such rule to break.',
        '- `willValidate` earns its keep beyond guarding: it is the only clean answer to "does this',
        '  field count?" as a question of its own -- a progress meter ("3 of 4 requirements met")',
        '  needs the participant list, not the failure list.',
        '- Same scoping caveats as the first solution: inputs only, names only.',
      ].join('\n'),
    },
  ],
};
