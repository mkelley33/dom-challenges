import type { ChallengeContent } from '@/types/challenge';

import { requireForm, requireInput, requireSelect } from './support';

type WirePacks = (form: HTMLFormElement) => void;

/**
 * The pack `<select>` has no `fire` helper, so the tests change it the way a browser would report
 * it: set the value, then dispatch a bubbling `change`. (`fire.input` covers the quantity field.)
 */
function choosePack(win: Window & typeof globalThis, pack: HTMLSelectElement, value: string): void {
  pack.value = value;
  pack.dispatchEvent(new win.Event('change', { bubbles: true }));
}

export const stickyCustomError: ChallengeContent = {
  prompt: [
    'A wholesale order form: goods come in packs, and the quantity must be a whole number of',
    'whichever pack size is selected. No markup attribute can say that — the rule spans two fields —',
    'so it has to join the validity system through `setCustomValidity`.',
    '',
    'Export `wirePacks(form)`, which listens for changes to **either** field (`input` from the',
    'quantity, `change` from the pack select) and keeps `#quantity` judged:',
    '',
    '- when the quantity is not a multiple of the pack size, mark it invalid with **exactly** the',
    '  message `Order a whole number of packs`;',
    '- when it is — including when the field is empty — make the field valid again.',
    '',
    'That second half is the trap this challenge exists for. A custom message is **sticky**: the',
    'field stays invalid until someone sets the message back to the empty string. Code that only',
    'ever sets the message leaves the form permanently unsubmittable, however carefully the user',
    'fixes their order.',
  ].join('\n'),
  html: [
    '<form id="order">',
    '  <label>Pack size',
    '    <select id="pack" name="pack">',
    '      <option value="6" selected>6 per pack</option>',
    '      <option value="8">8 per pack</option>',
    '      <option value="12">12 per pack</option>',
    '    </select>',
    '  </label>',
    '  <label>Quantity <input id="quantity" name="quantity" type="number"></label>',
    '</form>',
  ].join('\n'),
  starterCode: [
    'export function wirePacks(form: HTMLFormElement): void {',
    "  const quantity = form.querySelector<HTMLInputElement>('#quantity');",
    "  const pack = form.querySelector<HTMLSelectElement>('#pack');",
    '  if (!quantity || !pack) return;',
    '',
    "  quantity.addEventListener('input', () => {",
    '    if (Number(quantity.value) % Number(pack.value) !== 0) {',
    "      quantity.setCustomValidity('Order a whole number of packs');",
    '    }',
    '  });',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'a quantity that is not a whole number of packs is refused, with your message',
      run: ({ doc, fire, fn, expect }) => {
        const form = requireForm(doc, 'order');
        fn<WirePacks>('wirePacks')(form);
        const quantity = requireInput(doc, 'quantity');

        fire.input(quantity, '13');
        expect(quantity.checkValidity()).toBe(false);
        expect(quantity.validity.customError).toBe(true);
        // The message round-trips through validationMessage -- this is your copy, word for word.
        expect(quantity.validationMessage).toBe('Order a whole number of packs');
        // And the field's verdict is the form's verdict: the custom error joined the same system
        // everything else asks.
        expect(form.checkValidity()).toBe(false);
      },
    },
    {
      name: 'fixing the quantity takes the message back',
      run: ({ doc, fire, fn, expect }) => {
        const form = requireForm(doc, 'order');
        fn<WirePacks>('wirePacks')(form);
        const quantity = requireInput(doc, 'quantity');

        fire.input(quantity, '13');
        expect(quantity.checkValidity()).toBe(false);

        fire.input(quantity, '12');
        // The sticky half. A message is not withdrawn by the value becoming right -- only by
        // setCustomValidity('') -- so a handler that only ever *sets* fails here, and the form it
        // ships in can never be submitted again.
        expect(quantity.checkValidity()).toBe(true);
        expect(quantity.validationMessage).toBe('');
        expect(form.checkValidity()).toBe(true);
      },
    },
    {
      name: 'changing the pack size re-judges the same quantity',
      run: ({ doc, fire, fn, win, expect }) => {
        const form = requireForm(doc, 'order');
        fn<WirePacks>('wirePacks')(form);
        const quantity = requireInput(doc, 'quantity');
        const pack = requireSelect(doc, 'pack');

        fire.input(quantity, '12');
        expect(quantity.checkValidity()).toBe(true);

        // The quantity field saw no event here -- the rule's other input moved. A wiring that only
        // watches the quantity leaves this stale.
        choosePack(win, pack, '8');
        expect(quantity.checkValidity()).toBe(false);
        expect(quantity.validationMessage).toBe('Order a whole number of packs');

        choosePack(win, pack, '12');
        expect(quantity.checkValidity()).toBe(true);
      },
    },
    {
      name: 'an emptied field is not an error',
      run: ({ doc, fire, fn, expect }) => {
        const form = requireForm(doc, 'order');
        fn<WirePacks>('wirePacks')(form);
        const quantity = requireInput(doc, 'quantity');

        fire.input(quantity, '13');
        expect(quantity.checkValidity()).toBe(false);

        // Deleting a wrong answer is progress, not a new offence. Emptiness is `required`'s
        // business, and this field is not required.
        fire.input(quantity, '');
        expect(quantity.checkValidity()).toBe(true);
        expect(quantity.validationMessage).toBe('');
      },
    },
  ],
  solutions: [
    {
      label: 'One judgement, run on every change, covering both branches',
      code: [
        'export function wirePacks(form: HTMLFormElement): void {',
        "  const quantity = form.querySelector<HTMLInputElement>('#quantity');",
        "  const pack = form.querySelector<HTMLSelectElement>('#pack');",
        '  if (!quantity || !pack) return;',
        '',
        '  const judge = (): void => {',
        '    const ok = Number(quantity.value) % Number(pack.value) === 0;',
        "    quantity.setCustomValidity(ok ? '' : 'Order a whole number of packs');",
        '  };',
        '',
        "  quantity.addEventListener('input', judge);",
        "  pack.addEventListener('change', judge);",
        '}',
        '',
      ].join('\n'),
      explanation: [
        '`setCustomValidity(message)` is how a rule the markup cannot express joins the validity',
        'system: it raises the `customError` flag, makes `checkValidity()` false on the field *and*',
        'on the form, and hands your exact words to `validationMessage`. `setCustomValidity("")` is',
        'the only way back. There is no timeout, no re-check, no "the value changed so the message',
        'must be stale" -- the platform cannot re-run a rule it never saw, so the message stands',
        'until the code that set it takes it back.',
        '',
        'That is why `judge` is **one expression covering both branches**. Written as a ternary, the',
        'clearing branch cannot be forgotten, because it is not a separate branch -- every judgement',
        'either sets the message or sets `""`. The starter’s shape, an `if` that only sets, is the',
        'bug this API is famous for: it works in every demo (nobody fixes a field in a demo) and',
        'ships a form that can never recover.',
        '',
        'Two smaller decisions worth noticing:',
        '',
        '- **Both fields trigger the same judgement.** The rule reads two values, so a change to',
        '  either one can flip the verdict -- the third test moves only the pack and expects the',
        '  quantity’s validity to follow. One shared `judge` makes that automatic; two hand-written',
        '  handlers drift.',
        '- **Empty is valid here.** `Number("") % n` is `0`, so the empty field clears naturally.',
        '  That is the right default: emptiness is `required`’s job, and mixing "you must fill this"',
        '  into a shape rule produces double-speak when both apply.',
      ].join('\n'),
      tradeoffs: [
        'Precise listeners on the two fields the rule reads: nothing else re-runs it, and anyone',
        'reading the wiring can see the rule’s inputs in the `addEventListener` lines.',
        '',
        'What to weigh:',
        '',
        '- The rule runs on every keystroke. Fine for a modulo; for an expensive check (a network',
        '  lookup) you would debounce -- and then the *async* answer must still land through',
        '  `setCustomValidity`, with the stale-response problem that implies.',
        '- `checkValidity()` on a field fires an `invalid` event when it answers false. These tests',
        '  call it, so the judged field gets `invalid` events a real page might surface twice.',
        '  `validity.valid` is the silent read when you only want the boolean.',
        '- The platform *does* own part of this rule: a dynamic `step` (set `quantity.step` from the',
        '  pack size, `min="0"`) would make the browser compute `stepMismatch` itself. What you lose',
        '  is the message -- a built-in failure carries the browser’s wording, not yours, and this',
        '  challenge’s contract is an exact message. Choosing between "the platform judges, the',
        '  platform words it" and "I judge, I word it" is the real decision; half-measures leave the',
        '  wording to chance.',
      ].join('\n'),
    },
    {
      label: 'Delegate one listener to the form',
      code: [
        'export function wirePacks(form: HTMLFormElement): void {',
        "  const quantity = form.querySelector<HTMLInputElement>('#quantity');",
        "  const pack = form.querySelector<HTMLSelectElement>('#pack');",
        '  if (!quantity || !pack) return;',
        '',
        '  const judge = (): void => {',
        '    const ok = Number(quantity.value) % Number(pack.value) === 0;',
        "    quantity.setCustomValidity(ok ? '' : 'Order a whole number of packs');",
        '  };',
        '',
        "  form.addEventListener('input', judge);",
        "  form.addEventListener('change', judge);",
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The same judgement, subscribed differently: both `input` and `change` bubble, so one',
        'listener pair on the form hears every field in it -- the quantity’s keystrokes and the',
        'select’s changes arrive at the same two handlers without naming either field in the',
        'wiring.',
        '',
        'The clearing discipline is identical, and it has to be: delegation changes *when* the',
        'judgement runs, never what it says. However the events arrive, every run still writes one',
        'of the two answers, message or `""`.',
        '',
        'Listening for both event names matters more here than it did above. A text field fires',
        '`input` per keystroke and `change` on commit; a select fires `change` (and, in browsers,',
        'usually `input` too -- but relying on that couples the wiring to per-control event',
        'behaviour, which is exactly what delegation was supposed to abstract away).',
      ].join('\n'),
      tradeoffs: [
        'Delegation wins as the form grows: a rule that tomorrow also reads a "cases per pallet"',
        'field needs no new subscription, because the form already hears everything. It is also the',
        'shape that survives fields being replaced wholesale (a re-rendered fieldset keeps working,',
        'since the listener sits above the churn).',
        '',
        'Its costs are the mirror image:',
        '',
        '- The judgement runs for events the rule does not read -- every keystroke in every other',
        '  field of a bigger form. A modulo does not care; a rule that does would filter on',
        '  `event.target` first, and the filter is more wiring than the two precise listeners were.',
        '- The rule’s inputs are no longer visible in the subscription. Reading `judge` tells you,',
        '  but the wiring itself has gone anonymous -- on a form with a dozen rules, "who re-runs',
        '  what" stops being answerable from the listener list.',
      ].join('\n'),
    },
  ],
};
