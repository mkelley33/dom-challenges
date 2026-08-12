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
    id: 'forms-formdata-not-a-walk',
    slug: 'formdata-not-a-walk',
    title: 'Read the form the way a submission would',
    category: 'forms',
    difficulty: 'novice',
    concepts: ['FormData', 'form.elements', 'disabled', 'checkboxes', 'select'],
    relatedIds: ['attributes-boolean-attributes'],
    load: () => import('./formdataNotAWalk').then((module) => module.formdataNotAWalk),
  },
  {
    id: 'forms-sticky-custom-error',
    slug: 'sticky-custom-error',
    title: 'The error you must take back',
    category: 'forms',
    difficulty: 'intermediate',
    concepts: ['setCustomValidity', 'validationMessage', 'customError', 'checkValidity', 'input event'],
    relatedIds: ['forms-explain-the-failure', 'forms-signup-validation'],
    load: () => import('./stickyCustomError').then((module) => module.stickyCustomError),
  },
  {
    id: 'forms-getall-or-lose-them',
    slug: 'getall-or-lose-them',
    title: 'One name, several answers',
    category: 'forms',
    difficulty: 'intermediate',
    concepts: ['FormData.getAll', 'entry list', 'checkbox groups', 'Object.fromEntries', 'document order'],
    relatedIds: ['forms-formdata-not-a-walk'],
    load: () => import('./getallOrLoseThem').then((module) => module.getallOrLoseThem),
  },
  {
    id: 'forms-commit-the-draft',
    slug: 'commit-the-draft',
    title: 'Make today the new default',
    category: 'forms',
    difficulty: 'intermediate',
    concepts: ['defaultValue', 'defaultChecked', 'form.reset', 'dirty value flag', 'radio groups'],
    relatedIds: ['attributes-dirty-value', 'attributes-form-state-snapshot'],
    load: () => import('./commitTheDraft').then((module) => module.commitTheDraft),
  },
  {
    id: 'forms-who-blocks-submission',
    slug: 'who-blocks-submission',
    title: 'The required field that cannot block',
    category: 'forms',
    difficulty: 'intermediate',
    concepts: ['willValidate', 'checkValidity', 'disabled', 'readonly', 'barred from validation'],
    relatedIds: ['forms-explain-the-failure', 'forms-formdata-not-a-walk', 'attributes-boolean-attributes'],
    load: () => import('./whoBlocksSubmission').then((module) => module.whoBlocksSubmission),
  },
  {
    id: 'forms-submitter-in-the-payload',
    slug: 'submitter-in-the-payload',
    title: 'The button the payload forgot',
    category: 'forms',
    difficulty: 'advanced',
    concepts: ['SubmitEvent.submitter', 'FormData(form, submitter)', 'submit buttons', 'preventDefault'],
    relatedIds: ['forms-getall-or-lose-them', 'forms-formdata-not-a-walk', 'forms-signup-validation'],
    load: () => import('./submitterInThePayload').then((module) => module.submitterInThePayload),
  },
  {
    id: 'forms-request-submit-gate',
    slug: 'request-submit-gate',
    title: 'Submit through the front door',
    category: 'forms',
    difficulty: 'advanced',
    concepts: ['requestSubmit', 'form.submit', 'constraint validation', 'SubmitEvent', 'novalidate'],
    relatedIds: ['forms-submitter-in-the-payload', 'forms-who-blocks-submission'],
    load: () => import('./requestSubmitGate').then((module) => module.requestSubmitGate),
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
