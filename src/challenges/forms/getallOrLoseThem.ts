import type { ChallengeContent } from '@/types/challenge';

import { requireForm } from './support';

type Order = (form: HTMLFormElement) => { toppings: string[]; days: string[] };

function requireBox(doc: Document, name: string, value: string): HTMLInputElement {
  const box = doc.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`);
  if (!box) throw new Error(`the "${value}" ${name} checkbox is missing from the challenge markup`);
  return box;
}

/**
 * Both groups are checkbox groups, deliberately. The other multi-valued control -- `<select
 * multiple>` -- may never be read through FormData in this category: happy-dom contributes only the
 * *first* selected option (it reads the select's `.value`), where Chrome submits one entry per
 * selected option, so a `getAll` over it is right in a browser and wrong in this suite. Measured in
 * both the markup-`selected` and property-write spellings; the category docblock has the table.
 */
export const getallOrLoseThem: ChallengeContent = {
  prompt: [
    'A meal-kit order. The toppings are a group of checkboxes **sharing one name**, and so are the',
    'delivery days — two questions whose answer is a list, submitted as several entries under the',
    'same name.',
    '',
    'Export `order(form)`, returning `{ toppings, days }` — two arrays of the chosen values, each in',
    'document order, each empty when nothing is chosen.',
    '',
    'The trap is the convenient shape. `Object.fromEntries(new FormData(form))` produces a tidy',
    'object — by keeping **one entry per name and discarding the rest**, silently. `formData.get()`',
    'does the mirror-image damage: it answers with the **first** entry and says nothing about the',
    'others. A form where one name can carry several values needs the reading that keeps them all.',
  ].join('\n'),
  html: [
    '<form id="mealkit">',
    '  <fieldset>',
    '    <legend>Extra toppings</legend>',
    '    <label><input type="checkbox" name="topping" value="mushroom" checked> Mushroom</label>',
    '    <label><input type="checkbox" name="topping" value="pepper"> Pepper</label>',
    '    <label><input type="checkbox" name="topping" value="olive" checked> Olive</label>',
    '  </fieldset>',
    '  <fieldset>',
    '    <legend>Delivery days</legend>',
    '    <label><input type="checkbox" name="day" value="mon" checked> Monday</label>',
    '    <label><input type="checkbox" name="day" value="wed"> Wednesday</label>',
    '    <label><input type="checkbox" name="day" value="fri"> Friday</label>',
    '  </fieldset>',
    '</form>',
  ].join('\n'),
  starterCode: [
    'export function order(form: HTMLFormElement): { toppings: string[]; days: string[] } {',
    '  const data = new FormData(form);',
    "  const topping = data.get('topping');",
    "  const day = data.get('day');",
    '  return {',
    '    toppings: topping === null ? [] : [String(topping)],',
    '    days: day === null ? [] : [String(day)],',
    '  };',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'every checked topping arrives, in document order',
      run: ({ doc, fn, expect }) => {
        // Two boxes are checked in the markup, one at each end of the group. `get()` keeps the
        // first and `fromEntries` keeps the last -- only a reading that keeps *all* entries can
        // produce this array.
        expect(fn<Order>('order')(requireForm(doc, 'mealkit'))).toEqual({
          toppings: ['mushroom', 'olive'],
          days: ['mon'],
        });
      },
    },
    {
      name: 'checking one more keeps the others',
      run: ({ doc, fn, expect }) => {
        requireBox(doc, 'topping', 'pepper').checked = true;
        expect(fn<Order>('order')(requireForm(doc, 'mealkit')).toppings).toEqual(['mushroom', 'pepper', 'olive']);
      },
    },
    {
      name: 'the two groups stay separate, whole name by whole name',
      run: ({ doc, fn, expect }) => {
        requireBox(doc, 'day', 'wed').checked = true;
        requireBox(doc, 'day', 'fri').checked = true;
        // Every day and every default topping, in one reading: growing one group must neither leak
        // into the other nor truncate it.
        expect(fn<Order>('order')(requireForm(doc, 'mealkit'))).toEqual({
          toppings: ['mushroom', 'olive'],
          days: ['mon', 'wed', 'fri'],
        });
      },
    },
    {
      name: 'nothing chosen is an empty list, not a missing one',
      run: ({ doc, fn, expect }) => {
        requireBox(doc, 'topping', 'mushroom').checked = false;
        requireBox(doc, 'topping', 'olive').checked = false;
        // The days keep their default in the same reading: the empty array on one side is a real
        // answer from a live function, not a function that answers [] to everything.
        expect(fn<Order>('order')(requireForm(doc, 'mealkit'))).toEqual({ toppings: [], days: ['mon'] });
      },
    },
  ],
  solutions: [
    {
      label: 'getAll, once per multi-valued name',
      code: [
        'export function order(form: HTMLFormElement): { toppings: string[]; days: string[] } {',
        '  const data = new FormData(form);',
        '  return {',
        "    toppings: data.getAll('topping').map(String),",
        "    days: data.getAll('day').map(String),",
        '  };',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'A FormData object is not a dictionary -- it is an **entry list**: ordered pairs, where one',
        'name may appear any number of times. That is the shape form submission has always had',
        '(three checked boxes named `topping` submit three `topping=...` pairs), and the API is',
        'honest about it. `get(name)` answers the first entry; `getAll(name)` answers all of them,',
        'in order, and `[]` when there are none.',
        '',
        'Document order comes free, for the same reason the entries exist at all: the list is built',
        'by walking the form’s controls in tree order, each checked box contributing one entry as it',
        'is encountered. Nothing in this solution sorts, because nothing needs to.',
        '',
        'The empty case is worth a look because the starter got it wrong by construction: `getAll`',
        'on an absent name answers `[]`, so "nothing chosen" needs no branch. Code built around',
        '`get()` has to convert `null` into emptiness by hand -- a branch per name, each one a place',
        'for the next bug.',
      ].join('\n'),
      tradeoffs: [
        'This is the right default whenever a name can legitimately repeat. What to weigh:',
        '',
        '- **You must know which names are multi-valued.** `getAll` for the single-valued ones works',
        '  too (a one-element array), so the decision is really about the shape your consumer wants.',
        '  A serialiser that does not know the form could build `Record<string, string[]>` with',
        '  `getAll` per unique name and always be lossless -- at the cost of every consumer',
        '  unwrapping arrays.',
        '- **`Object.fromEntries(new FormData(form))` is the one-liner to distrust.** It type-checks,',
        '  it demos perfectly with unique names, and it silently keeps only the last entry per name.',
        '  The lost data is exactly the data this form exists to collect.',
        '- On the wire the same shape question returns: `URLSearchParams` keeps repeated names and',
        '  its `getAll` matches this one; a JSON body needs the arrays built explicitly, which is',
        '  what this function is doing.',
      ].join('\n'),
    },
    {
      label: 'Read the checked boxes yourself',
      code: [
        'export function order(form: HTMLFormElement): { toppings: string[]; days: string[] } {',
        '  const chosen = (name: string): string[] =>',
        '    [...form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)]',
        '      .filter((box) => box.checked)',
        '      .map((box) => box.value);',
        '',
        "  return { toppings: chosen('topping'), days: chosen('day') };",
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The same two arrays assembled from the DOM: select the group by its shared name, keep the',
        'checked members, take their values. Document order again comes free, because',
        '`querySelectorAll` walks the tree in order.',
        '',
        'This is what `getAll` was doing underneath, written out. Seeing it once makes the entry',
        'list less magic: a checkbox group *is* its checked members, and form submission is a walk',
        'over exactly this state. The shared `chosen` helper is the shape earning its keep -- the',
        'rule is identical per group, so the group name is data, not code.',
        '',
        'One relative worth knowing while you are here: the other multi-valued control is `<select',
        'multiple>`, and its own `.value` property reports only the **first** selected option -- the',
        'single-value API surface predates multi-selects being read this way. Read its `options`',
        'collection (filter on `selected`) exactly as this solution reads the checkbox group.',
      ].join('\n'),
      tradeoffs: [
        'Reaching for the controls wins when you need what the submission does not carry: the',
        '*unchecked* toppings (for an "everything else" list), disabled-but-visible state, or the',
        'label text next to each value. The entry list only knows what would be sent.',
        '',
        'As a reading of "what would be sent", it is the weaker shape:',
        '',
        '- It is coupled to this form’s structure. Move the toppings out of the form tag with a',
        '  `form` attribute and the `form.querySelectorAll` scope silently misses them; FormData',
        '  reads the form’s *controls*, wherever they live.',
        '- It reimplements the submission rules piecemeal -- this version never checks `disabled`,',
        '  which is correct for this markup and silently wrong the day a topping can be',
        '  out of stock.',
        '- Per-control reads scale per control kind: the day a group becomes a `<select multiple>`,',
        '  this function grows an options-walk branch, while the `getAll` version would not change',
        '  at all.',
      ].join('\n'),
    },
  ],
};
