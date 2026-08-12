import type { ChallengeContent } from '@/types/challenge';

import { requireInput } from './support';

type Explain = (field: HTMLInputElement) => string;

export const explainTheFailure: ChallengeContent = {
  prompt: [
    'An RSVP form wants inline help instead of the browser’s bubbles: one short word per field naming',
    'what is wrong, so the copy around it can do the explaining.',
    '',
    'Export `explain(field)`, which answers for any one field:',
    '',
    '- `"missing"` — required, and empty;',
    '- `"type"` — the value does not fit the input’s `type` (a malformed email);',
    '- `"pattern"` — the value does not match the input’s `pattern`;',
    '- `"range"` — a number outside `min`/`max`;',
    '- `"step"` — a number that misses the `step` grid;',
    '- `"ok"` — nothing wrong.',
    '',
    'Every field already carries a `validity` object the browser keeps up to date — one boolean per',
    'rule. The trap is reimplementing those rules by hand: an empty required field with a `pattern`,',
    'for instance, is **missing**, never pattern-mismatched — constraints other than `required` do',
    'not apply to an empty value, and code that tests the pattern first gets that wrong.',
  ].join('\n'),
  html: [
    '<form id="rsvp">',
    '  <label>Username <input id="username" name="username" required pattern="[a-z]+"></label>',
    '  <label>Email <input id="email" name="email" type="email"></label>',
    '  <label>Guests <input id="guests" name="guests" type="number" min="1" max="10" step="1"></label>',
    '</form>',
  ].join('\n'),
  starterCode: [
    'export function explain(field: HTMLInputElement): string {',
    "  if (field.value === '') return 'missing';",
    "  return 'ok';",
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'an empty required field is missing, not pattern-mismatched',
      run: ({ doc, fn, expect }) => {
        // The username is required *and* carries a pattern. Empty, only `required` speaks: the
        // pattern does not apply to an empty value, so an answer that tests the pattern first --
        // the natural order for hand-rolled checks -- reports the wrong problem.
        expect(fn<Explain>('explain')(requireInput(doc, 'username'))).toBe('missing');
      },
    },
    {
      name: 'a malformed email is a type problem',
      run: ({ doc, fire, fn, expect }) => {
        const email = requireInput(doc, 'email');
        fire.input(email, 'nope');
        expect(fn<Explain>('explain')(email)).toBe('type');
      },
    },
    {
      name: 'a value the pattern rejects is a pattern problem',
      run: ({ doc, fire, fn, expect }) => {
        const username = requireInput(doc, 'username');
        fire.input(username, 'Ada99');
        expect(fn<Explain>('explain')(username)).toBe('pattern');
      },
    },
    {
      name: 'a number past max is a range problem',
      run: ({ doc, fire, fn, expect }) => {
        const guests = requireInput(doc, 'guests');
        fire.input(guests, '42');
        expect(fn<Explain>('explain')(guests)).toBe('range');
      },
    },
    {
      name: 'a number off the step grid is a step problem',
      run: ({ doc, fire, fn, expect }) => {
        const guests = requireInput(doc, 'guests');
        fire.input(guests, '2.5');
        expect(fn<Explain>('explain')(guests)).toBe('step');
      },
    },
    {
      name: 'a field with nothing wrong answers ok — including an empty optional one',
      run: ({ doc, fire, fn, expect }) => {
        const explain = fn<Explain>('explain');
        const username = requireInput(doc, 'username');
        fire.input(username, 'ada');
        expect(explain(username)).toBe('ok');
        // The email is not required, so empty is a perfectly valid answer. A hand-rolled emptiness
        // check has no way to know that without also reimplementing `required`.
        expect(explain(requireInput(doc, 'email'))).toBe('ok');
      },
    },
  ],
  solutions: [
    {
      label: 'Read the flags in the order they matter',
      code: [
        'export function explain(field: HTMLInputElement): string {',
        '  const validity = field.validity;',
        "  if (validity.valueMissing) return 'missing';",
        "  if (validity.typeMismatch) return 'type';",
        "  if (validity.patternMismatch) return 'pattern';",
        "  if (validity.rangeOverflow || validity.rangeUnderflow) return 'range';",
        "  if (validity.stepMismatch) return 'step';",
        '  return \'ok\';',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The browser already ran every one of these checks. `field.validity` is a `ValidityState` --',
        'one boolean per rule, kept current as the value changes: `valueMissing` for `required`,',
        '`typeMismatch` for `type="email"` and friends, `patternMismatch` for `pattern`,',
        '`rangeOverflow`/`rangeUnderflow` for `max`/`min`, `stepMismatch` for `step`, plus a `valid`',
        'flag that is true exactly when none of the others are. So the function is a lookup, not a',
        'validator.',
        '',
        'The first test is the one that separates reading from reimplementing. An empty required',
        'field with a pattern raises **only** `valueMissing`: apart from `required` itself, a',
        'constraint does not apply to an empty value -- an optional field is allowed to be empty, so',
        'an empty value cannot mismatch a type or a pattern. Hand-rolled code that runs the regex',
        'first reports `"pattern"` for a field the platform says is simply missing, and the two',
        'answers send the user to two different fixes.',
        '',
        'The `if`-chain order encodes which problem to *mention first* when several could apply. For',
        'this markup at most one fires at a time, but that is a property of these fields, not of the',
        'API -- a `required` email can be empty (missing) or malformed (type), and the chain decides',
        'which one the user hears about.',
      ].join('\n'),
      tradeoffs: [
        'Reading the flags means the markup is the single source of truth: add `maxlength` or change',
        'the `pattern`, and this function keeps agreeing with the browser without an edit. Any',
        'hand-rolled version has two copies of every rule -- one in the markup, one in the code --',
        'and they drift.',
        '',
        'Worth knowing at the edges:',
        '',
        '- `badInput` is the flag this function does not map: text the control could not even parse',
        '  into a value (letters in a number field mid-edit). Decide what to say for it before it',
        '  happens, because `value` reads `""` then and an emptiness check misreads it as missing.',
        '- `customError` is the one flag *you* control, via `setCustomValidity` -- the sticky-custom-',
        '  error challenge is about exactly that.',
        '- The one place reading beats the platform’s own message: `validationMessage` is localised',
        '  by the browser and worded by the browser. Mapping flags to your own copy is how you keep',
        '  the wording -- the flags are the stable API, the strings are not.',
      ].join('\n'),
    },
    {
      label: 'Make the priority order a table',
      code: [
        "const kinds: Array<[keyof ValidityState, string]> = [",
        "  ['valueMissing', 'missing'],",
        "  ['typeMismatch', 'type'],",
        "  ['patternMismatch', 'pattern'],",
        "  ['rangeOverflow', 'range'],",
        "  ['rangeUnderflow', 'range'],",
        "  ['stepMismatch', 'step'],",
        '];',
        '',
        'export function explain(field: HTMLInputElement): string {',
        '  const found = kinds.find(([flag]) => field.validity[flag]);',
        "  return found ? found[1] : 'ok';",
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The same lookup with the priority order lifted into data. `ValidityState` is a bag of',
        'booleans, so "which problem do we name first" is really a ranked list -- and a ranked list',
        'is clearer as a list than as the implicit order of an `if`-chain.',
        '',
        '`find` walks the table top to bottom and stops at the first flag that is true, which is',
        'precisely what the chain did; the two solutions are the same algorithm. The difference is',
        'where the next person edits: adding `tooShort` to the chain means choosing a line to insert',
        'an `if` at, adding it to the table means adding a row where it belongs and the code not',
        'changing at all.',
      ].join('\n'),
      tradeoffs: [
        'A table earns its indirection as soon as it feeds more than one consumer -- the same rows',
        'can drive the short codes here, the full user-facing messages, and an analytics event name,',
        'without three copies of the priority order. For exactly six flags and one consumer it is',
        'arguably ceremony, and the chain is easier to step through in a debugger.',
        '',
        'One honest caveat: `keyof ValidityState` keeps the flag names spell-checked against the',
        'platform type, but nothing checks the table is *complete*. The chain has the same gap. If a',
        'flag is missing from both, that failure reads as `"ok"` -- which is why the fallback answer',
        'deserves a thought: this version answers `"ok"` for any problem it has no row for, and a',
        'stricter one would return `field.validity.valid ? \'ok\' : \'other\'` so an unmapped failure',
        'at least does not read as success.',
      ].join('\n'),
    },
  ],
};
