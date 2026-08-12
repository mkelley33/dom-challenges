import type { ChallengeEntry } from '@/types/challenge';

/**
 * The Forms & Validation category, as metadata plus one dynamic import each.
 *
 * **The riskiest question here was whether the Constraint Validation API is faithful, and most of
 * it is.** Measured in happy-dom and in real Chrome through the production host, agreeing exactly:
 * `valueMissing`, `typeMismatch`, `patternMismatch`, `rangeOverflow` and `stepMismatch` all raise
 * on the same inputs; `checkValidity()` returns the same booleans and fires an `invalid` event per
 * failing field; `form.checkValidity()` walks the controls and fires those events in document order,
 * reachable from one capture-phase listener on the form; `setCustomValidity` sets `customError`,
 * makes the field and the form invalid, round-trips its message through `validationMessage`, and is
 * cleared by `''`; `willValidate` is false for a disabled or readonly field while `checkValidity()`
 * on it still returns true; `noValidate` suppresses interactive validation only. `FormData` is full
 * fidelity including `getAll`, multi-selects, excluded disabled fields and the two-argument
 * `FormData(form, submitter)` form; `requestSubmit(submitter)` runs constraint validation first and
 * declines to fire on an invalid form in both; `form.reset()` restores defaults including radios;
 * radio-group exclusivity works; and a constructed `SubmitEvent` carries its `submitter`.
 *
 * **Four divergences, and each one removes something a Forms challenge would obviously want.**
 *
 * | read                                            | Chrome                        | happy-dom  |
 * | ----------------------------------------------- | ----------------------------- | ---------- |
 * | `minlength` with a value set from markup        | `valid`                       | `tooShort` |
 * | `maxlength` with a value set from markup        | `valid`                       | `tooLong`  |
 * | `validationMessage` for `valueMissing`          | `Please fill out this field.` | `''`       |
 * | `matches(':invalid')` / `':valid'` / `':required'`| `true`                      | `false`    |
 * | `button.willValidate` for a submit button       | `true`                        | `undefined`|
 *
 * The first two are the same bug: `tooShort`/`tooLong` apply only once the value has been **edited
 * by the user** (the dirty value flag again), and happy-dom ignores that condition. So no challenge
 * may use `minlength` or `maxlength` -- they would look like they worked here and do nothing in a
 * browser. `validationMessage` is only assertable for a message the challenge set itself with
 * `setCustomValidity`, which is what this one asserts. And **the validity pseudo-classes do not
 * match at all**, so "style the invalid fields" cannot be validated: any styling challenge in this
 * category has to key off an attribute the code sets rather than off `:invalid`.
 *
 * See AGENTS.md §3 and §10.
 */
export const formsEntries: ChallengeEntry[] = [
  {
    id: 'forms-explain-the-failure',
    slug: 'explain-the-failure',
    title: 'Ask the field why it failed',
    category: 'forms',
    difficulty: 'novice',
    concepts: ['validity', 'valueMissing', 'typeMismatch', 'patternMismatch', 'stepMismatch'],
    relatedIds: ['forms-signup-validation'],
    load: () => import('./explainTheFailure').then((module) => module.explainTheFailure),
  },
  {
    id: 'forms-signup-validation',
    slug: 'signup-validation',
    title: 'Validate on submit, and say which field',
    category: 'forms',
    difficulty: 'advanced',
    concepts: ['checkValidity', 'setCustomValidity', 'validity', 'SubmitEvent.submitter', 'novalidate'],
    relatedIds: ['attributes-dirty-value'],
    load: () => import('./signupValidation').then((module) => module.signupValidation),
  },
];
