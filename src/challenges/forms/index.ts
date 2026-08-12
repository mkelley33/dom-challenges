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
 * on it still returns true; `noValidate` suppresses interactive validation only. `FormData` keeps
 * repeated names as repeated entries (`getAll`), excludes disabled fields, and takes the
 * two-argument `FormData(form, submitter)` form -- but see the fill-out findings below for the
 * multi-select hole in what the reconnaissance called "full fidelity". `requestSubmit(submitter)`
 * runs constraint validation first and declines to fire on an invalid form in both; `form.reset()`
 * restores defaults including radios (single-default groups only -- below); radio-group exclusivity
 * works; and a constructed `SubmitEvent` carries its `submitter`.
 *
 * **Four divergences from the reconnaissance, and each one removes something a Forms challenge
 * would obviously want.**
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
 * `setCustomValidity` (`sticky-custom-error` and `signup-validation` keep their custom-message
 * fields free of platform constraints for exactly this reason). **The validity pseudo-classes do
 * not match at all**, so "style the invalid fields" cannot key off `:invalid` -- which is why
 * `one-invalid-signal` styles through `[aria-invalid="true"]`, taught as the better pattern rather
 * than the workaround. And `button.willValidate` is why `who-blocks-submission`'s markup has no
 * button: any walk that filters controls on `willValidate` is graded differently by the two hosts
 * the moment a button is in it.
 *
 * **Re-measured when the category was filled out** (happy-dom 20.11.2 through `createMemoryHost`;
 * scratch probes, then the wrong-answer runs), **and then re-run in real Chrome** through the
 * production `createIframeHost` on a Vite-served scratch page: 45 runs -- all 20 solutions passing,
 * all 10 starters running cleanly and failing at least one named assertion, and 15 wrong answers of
 * which 13 were rejected (failure messages matching the memory host's wherever compared) and two
 * were accepted exactly as predicted, being the two Chrome-correct spellings this suite rejects
 * (`who-blocks-submission`'s unguarded `validity.valid` walk and `one-invalid-signal`'s ARIA IDL
 * write); `request-submit-gate`'s full-imitation gap passed in both, as documented there.
 * `localStorage` 0 keys -> 0 keys. That run's tab was **backgrounded** throughout, which was
 * argued admissible for this category alone and has since been superseded: `pnpm test:browser`
 * (AGENTS.md §1) re-runs all ten challenges through the same production host in an environment
 * that proves it renders before any result is read, and every reading held. The pass also caught a
 * real defect the content suite structurally cannot see: `request-submit-gate`'s recorder read the
 * event with a bare-global `instanceof`, green under happy-dom's shared class table and failing the
 * challenge's own solutions in Chrome -- fixed to `win.SubmitEvent`, the realm rule's spelling, and
 * the fix confirmed by re-running the bug through the browser pass, where it fails with
 * `Expected null to be <button id="go">` while `pnpm test` stays entirely green.
 *
 * **Focus is the one thing neither run could measure** -- `document.hasFocus()` is false in the top
 * document and the frame alike under a headless browser, as it was under the backgrounded tab. No
 * challenge here reads focus and none may start to without a headed run to back it.
 *
 * Four new divergences are pinned with positive controls in `src/test/happyDomGaps.test.ts`, each
 * confirmed by that Chrome run and re-confirmed by the browser pass:
 *
 * - **A `<select multiple>` contributes one entry to FormData, not one per selected option.**
 *   happy-dom reads the select's `.value` -- the first selected option -- in both the
 *   markup-`selected` and property-write spellings; the spec appends one entry per selected
 *   option. This narrows the recon's "FormData in full": a `getAll` over a multi-select is
 *   correct in a browser and wrong here, so **no challenge may read a multi-select through
 *   FormData** -- `getall-or-lose-them` uses two checkbox groups instead (checkbox groups arrive
 *   whole, measured) and teaches the select's options-walk in prose.
 * - **`requestSubmit()` with no argument reports the form element as `event.submitter`**, where
 *   the spec says null. The dangerous direction: a non-null assertion passes here and lies about
 *   every browser. No challenge asserts anything about a no-argument `requestSubmit`'s submitter;
 *   solutions always name the button.
 * - **A barred field's `validity` flags stay raised** (`required`+`readonly` reports
 *   `valueMissing: true`, `valid: false`), where the spec conditions them on mutability.
 *   `willValidate` and per-field/form `checkValidity()` are barred-aware and agree with Chrome --
 *   so audits read those, and **never `validity` off a barred field**. An unguarded
 *   `!field.validity.valid` walk is rejected by this suite and accepted by Chrome: same code, two
 *   verdicts (`who-blocks-submission` runs that exact wrong answer).
 * - **`form.reset()` over a radio group carrying two `defaultChecked` leaves both checked** -- a
 *   state a browser cannot represent. Single-default groups reset faithfully. So
 *   `commit-the-draft` catches the leave-the-old-default bug by asserting `defaultChecked` as a
 *   value *before* any reset, and no test resets a two-default group.
 *
 * **Two further divergences were found in the review's fix wave, after that Chrome run. Their
 * browser column was the spec's answer and nothing more; the browser pass has since measured both,
 * and the spec's answer is what a browser does.**
 *
 * - **`requestSubmit(x)` accepts any element as its submitter.** A browser throws a `TypeError` for
 *   an element that is not a submit button and a `NotFoundError` `DOMException` for one another
 *   form owns (measured in Chromium through the production host: `TypeError` for a `type="button"`
 *   button and for a bare `<span>`, `NotFoundError` for a second form's submit button, and the form
 *   submitted exactly once -- by the control that named its own button). happy-dom runs neither
 *   check, and all of those, plus an `<input type="reset">`, submit the form and arrive as
 *   `event.submitter`. **No test may assert that a bad submitter was refused** -- and that refusal
 *   is precisely what would separate a real `requestSubmit(via)` from a forged `dispatchEvent`,
 *   which is why `request-submit-gate`'s residual gap stays open (its docblock says so out loud).
 *   `click()` does refuse those inputs here, so the category's two front doors disagree on them in
 *   this engine and no test may use them either way.
 * - **`isTrusted` is `undefined` on every submit event**, whether `requestSubmit` produced it or
 *   `dispatchEvent` did -- where a browser answers `true` and `false` respectively (measured, same
 *   fixture, same order). That pair is the UA/script separator, the other channel that would close
 *   the same gap, so it is not assertable here at all.
 *
 * **Neither measurement closes the gap, and the browser pass proved that too**: `request-submit-gate`'s
 * full imitation was run through the production host in Chromium and **passed there as well**. The
 * discriminators exist in a browser; the challenge's tests cannot use them, because a test that did
 * would fail the reference solution under the engine `pnpm test` runs. The gap is a property of the
 * shared-engine constraint, not of the browser.
 *
 * Also measured here, in the safe-to-build-on direction (happy-dom side measured; browser side
 * spec'd or recon-covered, as noted):
 *
 * - **`form.submit()` fires no `submit` event and is otherwise a silent no-op here** (no throw, no
 *   navigation, document intact). The spec also fires no event -- it navigates, which this engine
 *   simply omits -- so "the listener never ran" rejects the back-door wrong answer identically in
 *   both, and `request-submit-gate` says out loud that in a real page the same call navigates.
 * - **`requestSubmit(button)` on a valid form fires one cancelable `submit` event whose
 *   `submitter` is that button**, and under `form.noValidate = true` fires despite invalid fields
 *   (recon: "noValidate suppresses interactive validation only"; spec agrees). The `noValidate`
 *   half is what makes the checkValidity-gated hand-dispatch rejectable at all.
 * - **`button.click()` drives the full submission pipeline** -- refuses when invalid, fires with
 *   the button as submitter when valid, honours `noValidate`. In a browser a click on a submit
 *   button is the definitional user path, which is what makes it `request-submit-gate`'s honest
 *   second solution.
 * - **`FormData(form, null)` is accepted and simply omits the pair** (spec: nullable). Solutions
 *   still branch (`submitter ? new FormData(form, submitter) : new FormData(form)`) so every
 *   exercised path is one the recon measured in both hosts.
 * - **Validity-flag edges**: empty `required`+`pattern` raises `valueMissing` only (constraints
 *   other than `required` skip the empty value); `'Ada99'` against `[a-z]+` is `patternMismatch`;
 *   `42` past `max="10"` is `rangeOverflow` alone; `2.5` against `step="1"` is `stepMismatch`
 *   alone. All spec-conformant; the flags themselves are recon-verified in both hosts.
 * - **`form.checkValidity()` skips barred fields in its walk** -- no `invalid` events at them, and
 *   a form whose only "invalid-looking" fields are barred answers true. Matches the spec's
 *   "candidate for constraint validation".
 *
 * **`reportValidity` is measured in both hosts now, and is still built on nowhere.** It was not in
 * the reconnaissance pass; both halves agree on the assertable surface -- it exists on form and
 * fields, returns the right booleans, fires the same `invalid` events. Re-measured in Chromium
 * through the production host: `form.reportValidity()` and `need.reportValidity()` both false with
 * a `required` field empty, true once filled, `invalid` fired at `#need` for each call and at
 * `#custom` after `setCustomValidity('nope')`, whose message round-trips. What a browser adds is
 * exactly what this suite cannot assert: a native message for built-in failures (`Please fill out
 * this field.` where this engine answers `''` -- the recon's second exclusion, reconfirmed by
 * measurement) and moving focus to the first failing field, which **no run of this project has ever
 * been able to read** -- both the backgrounded tab and the headless pass report
 * `document.hasFocus(): false`. Its value over `checkValidity` being precisely that unassertable
 * UI, it stays prose-only.
 *
 * **Why the category stops at ten.** Reading a form: `formdata-not-a-walk` (the entry list and its
 * exclusions), `getall-or-lose-them` (repeated names), `submitter-in-the-payload` (the submitter's
 * pair). The validity engine: `explain-the-failure` (reading the flags), `sticky-custom-error`
 * (joining it), `who-blocks-submission` (who participates), `signup-validation` (gating a real
 * submit flow with it). Submission itself: `request-submit-gate` (the front door versus the
 * imitations). State and defaults: `commit-the-draft` (the dirty/default split, `attributes`'
 * sequel). Reporting: `one-invalid-signal` (one attribute for CSS and assistive tech).
 * Deliberately absent: the four exclusions above; **multi-selects read through FormData** (the
 * fill-out divergence); **`tooShort`/`tooLong` in any costume**; **RadioNodeList and
 * `form.elements` named access** (unmeasured -- measure before authoring); and **file inputs**,
 * whose `File` entries no memory-host test can populate.
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
    relatedIds: ['forms-signup-validation', 'forms-sticky-custom-error', 'forms-who-blocks-submission'],
    load: () => import('./explainTheFailure').then((module) => module.explainTheFailure),
  },
  {
    id: 'forms-formdata-not-a-walk',
    slug: 'formdata-not-a-walk',
    title: 'Read the form the way a submission would',
    category: 'forms',
    difficulty: 'novice',
    concepts: ['FormData', 'form.elements', 'disabled', 'checkboxes', 'select'],
    relatedIds: ['forms-getall-or-lose-them', 'attributes-boolean-attributes'],
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
    relatedIds: ['forms-formdata-not-a-walk', 'forms-submitter-in-the-payload'],
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
    id: 'forms-one-invalid-signal',
    slug: 'one-invalid-signal',
    title: 'One signal for styles and screen readers',
    category: 'forms',
    difficulty: 'expert',
    concepts: ['aria-invalid', 'invalid event', 'capture phase', 'setAttribute', 'attribute selectors'],
    relatedIds: ['forms-signup-validation', 'attributes-enumerated-state', 'forms-who-blocks-submission'],
    load: () => import('./oneInvalidSignal').then((module) => module.oneInvalidSignal),
  },
  {
    id: 'forms-signup-validation',
    slug: 'signup-validation',
    title: 'Validate on submit, and say which field',
    category: 'forms',
    difficulty: 'advanced',
    concepts: ['checkValidity', 'setCustomValidity', 'validity', 'SubmitEvent.submitter', 'novalidate'],
    relatedIds: [
      'attributes-dirty-value',
      'forms-sticky-custom-error',
      'forms-submitter-in-the-payload',
      'forms-request-submit-gate',
      'forms-one-invalid-signal',
    ],
    load: () => import('./signupValidation').then((module) => module.signupValidation),
  },
];
