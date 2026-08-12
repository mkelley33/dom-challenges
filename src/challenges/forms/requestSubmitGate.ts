import type { ChallengeContent } from '@/types/challenge';

import { requireButton, requireForm, requireInput } from './support';

type Send = (form: HTMLFormElement, via: HTMLButtonElement) => void;

interface RecordedSubmit {
  submitter: HTMLElement | null;
  cancelable: boolean;
}

/**
 * Records every submit event the form produces, cancelling each so nothing tries to navigate.
 * The count is the assertion surface: "refused" must be a zero read off a listener that provably
 * fires when submission succeeds, in the same document (AGENTS.md §5's positive-control rule).
 */
function watchSubmits(form: HTMLFormElement): RecordedSubmit[] {
  const seen: RecordedSubmit[] = [];
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    seen.push({
      submitter: event instanceof SubmitEvent ? event.submitter : null,
      cancelable: event.cancelable,
    });
  });
  return seen;
}

export const requestSubmitGate: ChallengeContent = {
  prompt: [
    'A comment box whose **Send** is driven from code — a keyboard shortcut handler will call the',
    'function you write. Export `send(form, via)`, which submits the form *through the front door*,',
    'exactly as if the user had pressed the `via` button.',
    '',
    '"Through the front door" is the whole specification, and it rules out both shortcuts:',
    '',
    '- `form.submit()` is the back door: it skips constraint validation **and** skips the `submit`',
    '  event, so nothing can validate, veto, or even observe the submission — the page just',
    '  navigates.',
    '- Dispatching a hand-built `SubmitEvent` is a *forged* front door: listeners fire, but no',
    '  validation ran and no real submission is behind it.',
    '',
    '`form.requestSubmit(via)` is the real one: it validates first (an invalid form refuses,',
    'exactly like a click on the button), fires a cancelable `submit` event naming `via` as its',
    '`submitter`, and only then actually submits. And because the gate is the *form’s* gate, its',
    'own escape hatch applies: a form with `novalidate` skips the check — your function must not',
    'have an opinion about that.',
  ].join('\n'),
  html: [
    '<form id="comment">',
    '  <label>Email <input id="email" name="email" type="email" required></label>',
    '  <label>Comment <input id="body" name="body" required></label>',
    '  <button id="go" type="submit">Send</button>',
    '</form>',
  ].join('\n'),
  starterCode: [
    'export function send(form: HTMLFormElement, via: HTMLButtonElement): void {',
    "  form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true, submitter: via }));",
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'an invalid form is refused; the same call succeeds once it is valid',
      run: ({ doc, fire, fn, expect }) => {
        const form = requireForm(doc, 'comment');
        const send = fn<Send>('send');
        const seen = watchSubmits(form);

        send(form, requireButton(doc, 'go'));
        // Zero -- from a listener the second half of this test proves is live. A submission that
        // fires here is one that never consulted validation at all.
        expect(seen).toHaveLength(0);

        fire.input(requireInput(doc, 'email'), 'ada@example.com');
        fire.input(requireInput(doc, 'body'), 'The DOM is fine, actually.');
        send(form, requireButton(doc, 'go'));
        expect(seen).toHaveLength(1);
      },
    },
    {
      name: 'the submission names the button it went through',
      run: ({ doc, fire, fn, expect }) => {
        const form = requireForm(doc, 'comment');
        const go = requireButton(doc, 'go');
        const seen = watchSubmits(form);

        fire.input(requireInput(doc, 'email'), 'ada@example.com');
        fire.input(requireInput(doc, 'body'), 'Shipping it.');
        fn<Send>('send')(form, go);

        expect(seen).toHaveLength(1);
        // The submitter is how every listener downstream tells this apart from other ways the
        // form can submit -- the signup challenge builds a whole draft flow on it.
        expect(seen[0]?.submitter).toBe(go);
        // Cancelable, because a real submission is a request, not an announcement: submit
        // listeners are entitled to veto it, which is what progressive enhancement does.
        expect(seen[0]?.cancelable).toBe(true);
      },
    },
    {
      name: 'novalidate is the form’s decision, and your function respects it',
      run: ({ doc, fn, expect }) => {
        const form = requireForm(doc, 'comment');
        const send = fn<Send>('send');
        const seen = watchSubmits(form);

        // Both fields empty. Refused while the form validates...
        send(form, requireButton(doc, 'go'));
        expect(seen).toHaveLength(0);

        // ...and through the moment the *form* opts out. The gate belongs to the form -- a send()
        // that runs its own checkValidity() has taken custody of a decision that was never its.
        form.noValidate = true;
        send(form, requireButton(doc, 'go'));
        expect(seen).toHaveLength(1);

        form.noValidate = false;
        send(form, requireButton(doc, 'go'));
        expect(seen).toHaveLength(1);
      },
    },
  ],
  solutions: [
    {
      label: 'requestSubmit, with the button named',
      code: [
        'export function send(form: HTMLFormElement, via: HTMLButtonElement): void {',
        '  form.requestSubmit(via);',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'One call, because the platform already has the exact verb: `requestSubmit(submitter)` is',
        '"submit this form as if that button were used". Everything the tests demand is inside it,',
        'in order:',
        '',
        '1. **Constraint validation runs first** -- unless the form says `novalidate`. An invalid',
        '   form refuses: no `submit` event, no submission, and (in a real page) the browser',
        '   reports the problem to the user, exactly as a click would have.',
        '2. **The `submit` event fires, cancelable, with `submitter: via`.** This is the event other',
        '   code trusts: interceptors read `event.submitter` (the submitter-in-the-payload',
        '   challenge), and any listener may `preventDefault()` to take over.',
        '3. **Only then does the real submission happen** -- the part none of the imitations have.',
        '',
        'Contrast the two shortcuts the prompt bans. `form.submit()` is not a stricter version of',
        'the same thing; it is a different operation that answers a different need ("navigate now,',
        'ask nothing") and its skipping of the event is why no test can ever see it fire.',
        'Dispatching a synthetic `SubmitEvent` is the opposite failure: all announcement, no',
        'substance -- listeners run, but nothing validated and nothing will submit.',
        '',
        'The third test is the subtle contract. `novalidate` belongs to the *form*; `requestSubmit`',
        'reads it and skips the check. A `send()` that pre-checks with `checkValidity()` has quietly',
        'moved that decision into itself -- and breaks the one form that opted out.',
      ].join('\n'),
      tradeoffs: [
        'When the requirement is "as if the user submitted", this is not one option among several --',
        'it is the only call with that meaning. What to know around it:',
        '',
        '- `requestSubmit()` with **no** argument is also real, but different: no submitter, so no',
        '  button pair in the payload and `event.submitter` is null. Name the button when the',
        '  scenario has one.',
        '- It is strict about its argument: a `via` that is not a submit button owned by this form',
        '  throws a `TypeError`/`NotFoundError` rather than guessing.',
        '- In a real page, letting the event go uncancelled navigates. That is the point -- but a',
        '  code path that *never* wants navigation (this app’s preview included) pairs it with a',
        '  listener that calls `preventDefault()` and does the work itself.',
        '- `form.submit()` keeps one honest use: after your own code has already validated and',
        '  decided, when firing listeners again would double-handle the submission. If you reach',
        '  for it, you are claiming both of those things.',
      ].join('\n'),
    },
    {
      label: 'Click the button',
      code: [
        'export function send(form: HTMLFormElement, via: HTMLButtonElement): void {',
        '  via.click();',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The other genuine front door: activate the button itself. A click on a submit button *is*',
        'the user’s submission path -- its activation behaviour submits the form -- so everything',
        'downstream is identical by construction: validation gates it, `novalidate` exempts it, the',
        '`submit` event names the button, cancellation works. Nothing here imitates the pipeline,',
        'because nothing here is the pipeline -- the button is, and it was all along.',
        '',
        'Which is also why `requestSubmit(via)` exists at all: it is defined as "submit as if this',
        'button were used", the same destination *without* simulating the input that usually leads',
        'there. The difference between the two is everything that hangs off the input: `click()`',
        'first fires a real `click` event that bubbles through the form, runs any click listeners,',
        'and can itself be `preventDefault()`ed -- in which case the submission never starts.',
        '',
        'So the choice is precise: `click()` means "as if the user clicked", side effects and all;',
        '`requestSubmit(via)` means "as if the user submitted via this button", and only that.',
      ].join('\n'),
      tradeoffs: [
        'Reach for this when the click side effects are wanted -- analytics on the button, a',
        'delegated click handler that must stay in the loop, a component whose contract is "clicks',
        'on this button" rather than "submissions of this form". The keyboard-shortcut scenario in',
        'the prompt could defensibly want exactly that.',
        '',
        'Its sharp edges are the same side effects pointing the other way:',
        '',
        '- **A disabled button swallows the call.** `click()` on a disabled button does nothing --',
        '  no event, no submission, no error. `requestSubmit(via)` does not care whether the button',
        '  is disabled; it cares whether the *form* validates. Forms that disable Send while',
        '  invalid make the two paths behave differently on purpose.',
        '- **Any click listener can now veto the submission** by cancelling the click, one layer',
        '  before the submit listeners get their say. More vetoes is not more safety; it is more',
        '  places to look when submission mysteriously stops.',
        '- It couples the code to there *being* a button. A form submitted only from code has no',
        '  button to click; `requestSubmit()` still works there, at the price of a null submitter.',
      ].join('\n'),
    },
  ],
};
