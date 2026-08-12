import type { ChallengeContent } from '@/types/challenge';

/**
 * Local rather than in a `support.ts` because this category has one challenge -- a helper shared
 * between two of them earns its own file, one used by a single challenge belongs beside it.
 */
function requireElement(doc: Document, id: string): HTMLElement {
  const element = doc.getElementById(id);
  if (!element) throw new Error(`#${id} is missing from the challenge markup`);
  return element;
}

function requireInput(doc: Document, id: string): HTMLInputElement {
  const input = doc.querySelector<HTMLInputElement>(`input#${id}`);
  if (!input) throw new Error(`#${id} is missing from the challenge markup, or is not an <input>`);
  return input;
}

function requireForm(doc: Document, id: string): HTMLFormElement {
  const form = doc.querySelector<HTMLFormElement>(`form#${id}`);
  if (!form) throw new Error(`#${id} is missing from the challenge markup, or is not a <form>`);
  return form;
}

type WireSignup = (form: HTMLFormElement) => void;

/** Just the parts of the harness context the submit helper needs. */
interface SubmitContext {
  doc: Document;
  fire: { submit(form: HTMLFormElement, submitter?: HTMLElement, init?: EventInit): void };
}

/**
 * Submits the form and reports whether the submitted code cancelled it.
 *
 * The listener is attached **after** `wireSignup` has run, so it sees the event once the submitted
 * handler is finished with it -- listeners on one target run in registration order. And it throws
 * when it never ran at all, so `prevented: false` can only mean "the handler let it through" and
 * never "the event was never dispatched": a test that asserts on the absence of a cancellation needs
 * the channel it is asserting through proven live at the same moment (AGENTS.md §5).
 */
function submitAndWatch(ctx: SubmitContext, form: HTMLFormElement, submitter?: HTMLElement): boolean {
  let called = false;
  let prevented = false;

  const listener = (event: Event): void => {
    called = true;
    prevented = event.defaultPrevented;
  };

  form.addEventListener('submit', listener);
  ctx.fire.submit(form, submitter);
  form.removeEventListener('submit', listener);

  if (!called) throw new Error('the submit event was never dispatched');
  return prevented;
}

export const signupValidation: ChallengeContent = {
  prompt: [
    'A signup form with two submit buttons. **Create account** must validate; **Save draft** must not,',
    'because a draft is allowed to be half-finished.',
    '',
    'Export `wireSignup(form)`, which attaches a `submit` listener that:',
    '',
    '- lets a **draft** submission straight through, whatever state the fields are in, and sets',
    '  `form.dataset.state = "draft"`;',
    '- for any other submission, marks `#confirm` invalid with the message `Passwords do not match`',
    '  when it differs from `#password`, and valid again when it matches;',
    '- cancels the submission if any field is invalid, and writes the invalid fields’ **`name`s** into',
    '  `#errors`, comma-separated, in document order — `"email, password, confirm"` for an empty form;',
    '- otherwise lets it through, clears `#errors`, and sets `form.dataset.state = "saved"`.',
    '',
    'The form carries `novalidate`, which stops the browser doing its own thing on submit. It does',
    '**not** stop `checkValidity()` working — that is the whole reason the attribute is useful: you',
    'keep the validity engine and take over the reporting.',
  ].join('\n'),
  html: [
    '<form id="signup" novalidate>',
    '  <label>Email <input id="email" name="email" type="email" required></label>',
    '  <label>Password <input id="password" name="password" type="password" required></label>',
    '  <label>Confirm <input id="confirm" name="confirm" type="password" required></label>',
    '  <output id="errors"></output>',
    '  <button id="save" type="submit" name="intent" value="save">Create account</button>',
    '  <button id="draft" type="submit" name="intent" value="draft">Save draft</button>',
    '</form>',
  ].join('\n'),
  starterCode: [
    'export function wireSignup(form: HTMLFormElement): void {',
    "  form.addEventListener('submit', (event) => {",
    '    event.preventDefault();',
    '  });',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'an empty form is cancelled, and every empty field is named',
      run: ({ doc, fire, fn, expect }) => {
        const form = requireForm(doc, 'signup');
        fn<WireSignup>('wireSignup')(form);

        expect(submitAndWatch({ doc, fire }, form, requireElement(doc, 'save'))).toBe(true);
        expect(requireElement(doc, 'errors')).toHaveTextContent('email, password, confirm');
      },
    },
    {
      name: 'a full but malformed email is still cancelled',
      run: ({ doc, fire, fn, expect }) => {
        const form = requireForm(doc, 'signup');
        fn<WireSignup>('wireSignup')(form);

        // Not empty, and not an email. Anything that checks for emptiness by hand lets this through
        // -- which is the whole argument for using the validity engine rather than reimplementing it.
        fire.input(requireInput(doc, 'email'), 'nope');
        fire.input(requireInput(doc, 'password'), 'hunter2');
        fire.input(requireInput(doc, 'confirm'), 'hunter2');

        expect(submitAndWatch({ doc, fire }, form, requireElement(doc, 'save'))).toBe(true);
        expect(requireElement(doc, 'errors')).toHaveTextContent('email');
      },
    },
    {
      name: 'a mismatched confirmation is reported as a custom error on that field',
      run: ({ doc, fire, fn, expect }) => {
        const form = requireForm(doc, 'signup');
        fn<WireSignup>('wireSignup')(form);

        fire.input(requireInput(doc, 'email'), 'ada@example.com');
        fire.input(requireInput(doc, 'password'), 'hunter2');
        fire.input(requireInput(doc, 'confirm'), 'hunter3');

        expect(submitAndWatch({ doc, fire }, form, requireElement(doc, 'save'))).toBe(true);
        expect(requireElement(doc, 'errors')).toHaveTextContent('confirm');
        // The cross-field rule has to be expressed *through* the validity engine, not beside it, or
        // nothing else that asks the form whether it is valid will agree with you.
        const confirmField = requireInput(doc, 'confirm');
        expect(confirmField.validity.customError).toBe(true);
        expect(confirmField.validationMessage).toBe('Passwords do not match');
      },
    },
    {
      name: 'fixing the confirmation lets the next submission through',
      run: ({ doc, fire, fn, expect }) => {
        const form = requireForm(doc, 'signup');
        fn<WireSignup>('wireSignup')(form);
        const save = requireElement(doc, 'save');

        fire.input(requireInput(doc, 'email'), 'ada@example.com');
        fire.input(requireInput(doc, 'password'), 'hunter2');
        fire.input(requireInput(doc, 'confirm'), 'hunter3');
        submitAndWatch({ doc, fire }, form, save);

        fire.input(requireInput(doc, 'confirm'), 'hunter2');

        // A custom validity message is sticky: it stays until it is explicitly cleared with the
        // empty string. A handler that only ever *sets* it leaves the field permanently invalid, and
        // the form can never be submitted again however correct it is.
        expect(submitAndWatch({ doc, fire }, form, save)).toBe(false);
        expect(requireInput(doc, 'confirm').validity.valid).toBe(true);
        expect(requireElement(doc, 'errors')).toHaveTextContent('');
        expect(form.dataset.state).toBe('saved');
      },
    },
    {
      name: 'Save draft skips validation entirely',
      run: ({ doc, fire, fn, expect }) => {
        const form = requireForm(doc, 'signup');
        fn<WireSignup>('wireSignup')(form);

        // Every field empty, and it still has to go through -- so the handler has to look at which
        // button submitted the form rather than at the form alone.
        expect(submitAndWatch({ doc, fire }, form, requireElement(doc, 'draft'))).toBe(false);
        expect(form.dataset.state).toBe('draft');
        expect(requireElement(doc, 'errors')).toHaveTextContent('');
      },
    },
  ],
  solutions: [
    {
      label: 'Ask each field, then ask the form',
      code: [
        'export function wireSignup(form: HTMLFormElement): void {',
        "  const errors = form.querySelector('#errors');",
        "  const password = form.querySelector<HTMLInputElement>('#password');",
        "  const confirm = form.querySelector<HTMLInputElement>('#confirm');",
        '',
        "  form.addEventListener('submit', (event) => {",
        '    const submitter = event instanceof SubmitEvent ? event.submitter : null;',
        '',
        "    if (submitter instanceof HTMLButtonElement && submitter.value === 'draft') {",
        "      form.dataset.state = 'draft';",
        '      return;',
        '    }',
        '',
        '    if (password && confirm) {',
        "      confirm.setCustomValidity(confirm.value === password.value ? '' : 'Passwords do not match');",
        '    }',
        '',
        "    const invalid = [...form.querySelectorAll<HTMLInputElement>('input')]",
        '      .filter((field) => !field.checkValidity())',
        '      .map((field) => field.name);',
        '',
        '    if (invalid.length > 0) {',
        '      event.preventDefault();',
        "      if (errors) errors.textContent = invalid.join(', ');",
        '      return;',
        '    }',
        '',
        "    if (errors) errors.textContent = '';",
        "    form.dataset.state = 'saved';",
        '  });',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'Every form control carries a `validity` object the browser keeps up to date for you:',
        '`valueMissing` for `required`, `typeMismatch` for `type="email"`, `patternMismatch`,',
        '`rangeUnderflow`, `stepMismatch`, and so on, plus a `valid` flag that is true when none of the',
        'others are. `checkValidity()` returns that flag **and** fires an `invalid` event at the field',
        'when it is false, which is the hook the alternative below uses.',
        '',
        'Using it beats reimplementing it, and the malformed-email test is the cheap demonstration:',
        '`"nope"` is not empty, so an emptiness check passes it, and `type="email"` catches it without',
        'you writing a pattern. Every rule you express in markup is a rule the browser enforces',
        'identically for keyboard users, autofill, and anything else that touches the field.',
        '',
        '**`setCustomValidity` is how a rule the markup cannot express joins the same system.** "These',
        'two fields must match" is not a property of either field on its own, so no attribute can say',
        'it — but a custom message makes `confirm.validity.customError` true, makes',
        '`confirm.checkValidity()` false, and makes `form.checkValidity()` false along with it. The',
        'alternative — a boolean beside the form — leaves the form saying it is valid while your code',
        'says it is not, and every later reader has to know which one to believe.',
        '',
        '**The message is sticky, and clearing it is the bug everyone ships once.** Setting a custom',
        'message pins the field invalid until someone sets it back to `""`. That is why the call above',
        'is written as a single expression covering both branches rather than an `if` that only sets:',
        'once the two fields match, there is nothing to remind you to clear.',
        '',
        '`event.submitter` is the button that submitted the form. It is the only way to tell "Create',
        'account" from "Save draft" — the form is the same form, the fields are the same fields, and',
        'the only difference is which control the user pressed. Two submit buttons with the same `name`',
        'and different `value`s is also how the server finds out, since the submitter’s name/value pair',
        'is included in the submission.',
        '',
        '`novalidate` on the form turns off *interactive* validation — the browser’s own bubbles and its',
        'refusal to submit — and turns off nothing else. `checkValidity()`, `validity`, `:invalid` and',
        '`setCustomValidity` all keep working. It is the standard way to keep the engine and replace the',
        'user interface.',
      ].join('\n'),
      tradeoffs: [
        'Reporting by looping over the fields gives you document order for free, which is the order the',
        'error summary should be in — a list that jumps around confuses anyone using it to navigate.',
        '',
        'What to know about the shape:',
        '',
        '- `querySelectorAll("input")` misses `<select>` and `<textarea>`. `form.elements` is the',
        '  complete list of the form’s controls, including ones outside the form connected by the',
        '  `form` attribute; it also includes buttons and `<output>`, so filter on `willValidate` —',
        '  which is false for anything disabled, readonly, or barred from validation.',
        '- Calling `checkValidity()` per field fires an `invalid` event per invalid field. That is',
        '  usually a feature (see below) and it is a surprise if you expected a pure read. `validity',
        '  .valid` is the silent version.',
        '- `reportValidity()` is the same check plus the browser’s own message bubble and focus. It is',
        '  the right call when you are *not* building your own error surface, and it is the reason a',
        '  `novalidate` form still gets native messages if you ask for them.',
        '- The `validationMessage` strings are localised by the browser and vary between them. Show',
        '  them if you want the platform’s wording; write your own if the copy matters.',
      ].join('\n'),
    },
    {
      label: 'Let the invalid events report themselves',
      code: [
        'export function wireSignup(form: HTMLFormElement): void {',
        "  const errors = form.querySelector('#errors');",
        "  const password = form.querySelector<HTMLInputElement>('#password');",
        "  const confirm = form.querySelector<HTMLInputElement>('#confirm');",
        '  const failed: string[] = [];',
        '',
        '  // `invalid` does not bubble, so this listens in the capture phase.',
        '  form.addEventListener(',
        "    'invalid',",
        '    (event) => {',
        '      if (event.target instanceof HTMLInputElement) failed.push(event.target.name);',
        '    },',
        '    true,',
        '  );',
        '',
        "  form.addEventListener('submit', (event) => {",
        '    const submitter = event instanceof SubmitEvent ? event.submitter : null;',
        '',
        "    if (submitter instanceof HTMLButtonElement && submitter.value === 'draft') {",
        "      form.dataset.state = 'draft';",
        '      return;',
        '    }',
        '',
        '    if (password && confirm) {',
        "      confirm.setCustomValidity(confirm.value === password.value ? '' : 'Passwords do not match');",
        '    }',
        '',
        '    failed.length = 0;',
        '',
        '    if (!form.checkValidity()) {',
        '      event.preventDefault();',
        "      if (errors) errors.textContent = failed.join(', ');",
        '      return;',
        '    }',
        '',
        "    if (errors) errors.textContent = '';",
        "    form.dataset.state = 'saved';",
        '  });',
        '}',
        '',
      ].join('\n'),
      explanation: [
        '`form.checkValidity()` does not only return a boolean: it walks every control the form owns,',
        'in document order, and fires an `invalid` event at each one that fails. So the list of broken',
        'fields is something the platform is already producing — this version just listens to it',
        'instead of asking each field again afterwards.',
        '',
        'The `true` third argument is load-bearing. `invalid` is one of the DOM events that does **not**',
        'bubble, so a listener on the form never sees it in the bubble phase. Capture still visits every',
        'ancestor on the way *down* to the target, whatever the event’s `bubbles` flag says, which is',
        'what makes one listener on the form enough. The alternative is a listener on every field.',
        '',
        '`failed.length = 0` before the check, not after: the array is a buffer that one dispatch fills,',
        'and clearing it at the start means the next submission cannot inherit the last one’s errors.',
        '',
        'The draft branch returns before `checkValidity()` is ever called, so no `invalid` events fire',
        'and nothing is collected — which is what "skips validation entirely" has to mean.',
      ].join('\n'),
      tradeoffs: [
        'This is the shape to reach for when the reporting is per field rather than a summary: the same',
        'listener that collects a name can add the error class, set `aria-invalid`, and put the message',
        'next to the input — all at the moment the browser decided that field was bad, with no second',
        'pass and no list to keep in step.',
        '',
        'It also composes with the browser: because `invalid` fires for *any* validation the browser',
        'runs, a form **without** `novalidate` still calls your listener during the browser’s own',
        'submit check, and `event.preventDefault()` inside an `invalid` handler suppresses the native',
        'bubble for that field alone.',
        '',
        'The costs are the ones any listener-and-buffer arrangement has:',
        '',
        '- The order of `failed` is the order the events arrived, which is document order today and is',
        '  not something the code states. The first version’s order is visible in the code that made it.',
        '- It is stateful. A second, concurrent call to `checkValidity()` from anywhere else in the page',
        '  would fill the same buffer, and the bug would look like duplicated error names.',
        '- The listener outlives the submission. That is fine here and worth an `AbortController` if the',
        '  form is ever torn down, so the listener goes with it.',
      ].join('\n'),
    },
  ],
};
