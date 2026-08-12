import type { ChallengeContent } from '@/types/challenge';

import { requireForm, requireInput } from './support';

type Audit = (form: HTMLFormElement) => void;

/** One computed longhand off the host's own window -- the styles category's reading, borrowed. */
function borderWidth(win: Window & typeof globalThis, element: Element): string {
  return win.getComputedStyle(element).getPropertyValue('border-left-width');
}

export const oneInvalidSignal: ChallengeContent = {
  prompt: [
    'A checkout form whose stylesheet is already written: fields carrying `aria-invalid="true"` get',
    'the thick error border. Export `audit(form)`, which brings the markers up to date — run it after',
    'a failed submit, run it again as things get fixed.',
    '',
    'For every field: failing constraint validation ⇒ `aria-invalid="true"`; passing ⇒ no',
    '`aria-invalid="true"` (remove the attribute or set it `"false"` — absent is the cleaner',
    'signal). Set it with **`setAttribute`**, and mark **only** the failing fields, not the form',
    'wholesale.',
    '',
    'Why an attribute you set, when CSS has `:invalid`? Because `:invalid` is live and',
    'indiscriminate: it paints every `required` field red **before the user has typed anything** —',
    'the untouched form loads pre-scolded. An attribute your audit writes moves only when you say',
    'so, *and* it is the same signal a screen reader announces. One write, two audiences:',
    'the stylesheet selects `[aria-invalid="true"]`, assistive tech reads `aria-invalid`. Two',
    'channels that can never disagree, because they are one channel.',
  ].join('\n'),
  html: [
    '<style>',
    '  input { border-left-style: solid; border-left-width: 1px; padding-left: 6px; }',
    '  [aria-invalid="true"] { border-left-width: 4px; }',
    '</style>',
    '<form id="checkout" novalidate>',
    '  <label>Name <input id="name" name="name" required></label>',
    '  <label>Email <input id="email" name="email" type="email" required></label>',
    '  <label>Company <input id="company" name="company"></label>',
    '</form>',
  ].join('\n'),
  starterCode: [
    'export function audit(form: HTMLFormElement): void {',
    "  for (const field of form.querySelectorAll<HTMLInputElement>('input')) {",
    "    field.classList.toggle('invalid', !field.checkValidity());",
    '  }',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'failing fields are marked, passing ones are not',
      run: ({ doc, fn, expect }) => {
        fn<Audit>('audit')(requireForm(doc, 'checkout'));

        // Two required fields are empty; the optional one is fine. `toHaveAttribute` is the
        // point of the exercise: an ARIA IDL write (`field.ariaInvalid = 'true'`) leaves no
        // attribute here, and no attribute means no styling and no announcement.
        expect(requireInput(doc, 'name')).toHaveAttribute('aria-invalid', 'true');
        expect(requireInput(doc, 'email')).toHaveAttribute('aria-invalid', 'true');
        expect(requireInput(doc, 'company').matches('[aria-invalid="true"]')).toBe(false);
      },
    },
    {
      name: 'the stylesheet reads the marker, with no extra CSS from you',
      run: ({ doc, fn, win, expect }) => {
        fn<Audit>('audit')(requireForm(doc, 'checkout'));

        // The challenge's own CSS keys off [aria-invalid="true"] -- so the computed border is the
        // proof that the accessibility marker and the visual state are one signal.
        expect(borderWidth(win, requireInput(doc, 'email'))).toBe('4px');
        expect(borderWidth(win, requireInput(doc, 'company'))).toBe('1px');
      },
    },
    {
      name: 'fixing one field unmarks that field and only that field',
      run: ({ doc, fire, fn, win, expect }) => {
        const form = requireForm(doc, 'checkout');
        const audit = fn<Audit>('audit');
        const email = requireInput(doc, 'email');
        const name = requireInput(doc, 'name');

        audit(form);
        expect(email).toHaveAttribute('aria-invalid', 'true');

        fire.input(email, 'ada@example.com');
        audit(form);

        // Per field, both directions at once: the fixed field recovered, the still-broken one
        // kept its marker. An audit that flips every field on the *form's* validity gets exactly
        // this wrong -- one verdict painted across fields that earned different ones.
        expect(email.matches('[aria-invalid="true"]')).toBe(false);
        expect(borderWidth(win, email)).toBe('1px');
        expect(name).toHaveAttribute('aria-invalid', 'true');
        expect(borderWidth(win, name)).toBe('4px');
      },
    },
    {
      name: 'a fully repaired form ends with no markers at all',
      run: ({ doc, fire, fn, expect }) => {
        const form = requireForm(doc, 'checkout');
        const audit = fn<Audit>('audit');

        audit(form);
        expect(requireInput(doc, 'name')).toHaveAttribute('aria-invalid', 'true');

        fire.input(requireInput(doc, 'name'), 'Ada Lovelace');
        fire.input(requireInput(doc, 'email'), 'ada@example.com');
        audit(form);

        for (const id of ['name', 'email', 'company']) {
          expect(requireInput(doc, id).matches('[aria-invalid="true"]')).toBe(false);
        }
        expect(form.checkValidity()).toBe(true);
      },
    },
  ],
  solutions: [
    {
      label: 'One verdict per field, one attribute write',
      code: [
        'export function audit(form: HTMLFormElement): void {',
        "  for (const field of form.querySelectorAll<HTMLInputElement>('input')) {",
        '    if (field.checkValidity()) {',
        "      field.removeAttribute('aria-invalid');",
        '    } else {',
        "      field.setAttribute('aria-invalid', 'true');",
        '    }',
        '  }',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'Walk the fields; for each one, ask the validity engine and write the answer where both',
        'audiences read it. The pattern’s whole value is in what it refuses to duplicate:',
        '',
        '- **The rules are not duplicated** -- `checkValidity()` is the same engine the browser',
        '  submits by, so `type="email"` catches `"nope"` without this code knowing emails exist.',
        '- **The audiences are not duplicated.** The stylesheet’s `[aria-invalid="true"]` selector',
        '  and a screen reader’s "invalid data" announcement hang off the same attribute. There is',
        '  no way to update the look and forget the semantics, because there is only one write.',
        '',
        'Both branches are written out, and the removal branch is load-bearing: the attribute is',
        'as sticky as any attribute -- nothing but your code takes it back. An audit with only the',
        '`setAttribute` arm passes a first run and fails the whole life of the form after it,',
        'which is the same lifecycle bug `setCustomValidity` has with its empty string.',
        '',
        'Why `setAttribute` and not the tidier-looking `field.ariaInvalid = "true"`? The IDL',
        'reflection is real in current browsers -- but the attribute is the interoperable surface:',
        'it is what CSS attribute selectors match, what `matches()` sees, what serialises, and',
        'what this suite’s engine implements. When one write has two consumers, write the form',
        'both consumers are defined over.',
        '',
        'And why not `:invalid`, which needs no JavaScript at all? Timing. `:invalid` matches the',
        'moment constraints do -- an untouched required field is born matching, so the pristine',
        'form renders pre-scolded. The attribute decouples *is invalid* from *should be flagged',
        'invalid right now*, and that second question is UX, which is exactly what your audit',
        'gets to decide.',
      ].join('\n'),
      tradeoffs: [
        'The default shape: smallest possible diff between "what is wrong" and "what is shown".',
        '',
        '- `checkValidity()` fires an `invalid` event per failing field on every audit. With',
        '  `invalid`-driven UI elsewhere, switch the read to `field.willValidate &&',
        '  !field.validity.valid` -- same verdicts, silent (the who-blocks-submission challenge is',
        '  that exact trade).',
        '- Removal versus `aria-invalid="false"`: both are honest, and `[aria-invalid="true"]` CSS',
        '  treats them identically. Removal keeps serialised markup clean; an explicit `"false"`',
        '  can be the kinder diff when something else watches the attribute. Pick one per',
        '  codebase.',
        '- The walk marks fields the user never touched, which on a *first* submit is right -- but',
        '  wiring this to every keystroke re-scolds too eagerly. The usual composition: audit on',
        '  submit, then re-audit per field on its own `input` until it recovers.',
      ].join('\n'),
    },
    {
      label: 'Clear everything, let the invalid events re-mark',
      code: [
        'export function audit(form: HTMLFormElement): void {',
        "  for (const field of form.querySelectorAll<HTMLInputElement>('input')) {",
        "    field.removeAttribute('aria-invalid');",
        '  }',
        '',
        '  const controller = new AbortController();',
        '  form.addEventListener(',
        "    'invalid',",
        '    (event) => {',
        '      if (event.target instanceof HTMLInputElement) {',
        "        event.target.setAttribute('aria-invalid', 'true');",
        '      }',
        '    },',
        '    { capture: true, signal: controller.signal },',
        '  );',
        '',
        '  form.checkValidity();',
        '  controller.abort();',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The same markers produced from the other end: wipe the slate, then let the platform tell',
        'you which fields to re-mark. `form.checkValidity()` walks every control in document order',
        'and fires an `invalid` event at each failure -- the signup challenge collects names from',
        'that stream; this one writes attributes from it. The clear-first pass is what makes the',
        'stream sufficient: `invalid` only fires for failures, so recovery has to be the default',
        'state, applied before the check.',
        '',
        'Three details are load-bearing:',
        '',
        '- **`capture: true`**, because `invalid` does not bubble. Capture visits the form on the',
        '  way down to each field regardless, which is what makes one listener enough.',
        '- **The `AbortController`**, because the listener is scaffolding for *this* audit run.',
        '  Without the abort, every audit stacks another listener onto the form -- harmless-looking',
        '  (they write the same attribute) right up until one audit runs during another’s',
        '  `checkValidity` walk. Subscriptions you create for a job should end with the job.',
        '- **`event.target`, not a captured field variable** -- the stream tells you *which* field',
        '  failed; the listener stays one line because it never has to know the form’s shape.',
      ].join('\n'),
      tradeoffs: [
        'As written it is more machinery for the same output, and the first solution wins on',
        'clarity. The stream shape starts paying when the marking grows:',
        '',
        '- The `invalid` event is where you would also focus the first failing field, scroll to',
        '  it, or build the error summary -- one handler, every concern, at the moment the platform',
        '  decided. The per-field loop grows a second pass for each of those.',
        '- It generalises past this walk: the same listener (attached durably, not per-audit)',
        '  also catches `invalid` events from a real submit attempt on a form *without*',
        '  `novalidate` -- marking then works for free on the native path too.',
        '- The clear-then-refill has one visible seam: between the wipe and the check, the form',
        '  momentarily carries no markers. Synchronous here, so nothing can observe it -- but the',
        '  moment this pattern meets `await`, the blank frame is real and users see the errors',
        '  blink.',
      ].join('\n'),
    },
  ],
};
