import type { ChallengeContent } from '@/types/challenge';

import { requireElement } from './support';

type SetExpanded = (button: HTMLElement, panel: HTMLElement, expanded: boolean) => void;

export const enumeratedState: ChallengeContent = {
  prompt: [
    'A disclosure: a button that opens a panel. Two attributes carry the state, and they are two',
    'different **kinds** of attribute.',
    '',
    'Export `setExpanded(button, panel, expanded)`:',
    '',
    '- The button’s `aria-expanded` must read `"true"` or `"false"`. It is **never absent** — a',
    '  disclosure that says nothing about being expanded is not a disclosure.',
    '- The panel’s `hidden` attribute must be there when collapsed and gone when expanded.',
    '',
    'The starter uses `toggleAttribute` for both, which is the right tool for exactly one of them.',
    'Run it: expanding leaves the button announcing `aria-expanded="false"`.',
  ].join('\n'),
  html: [
    '<section id="faq">',
    '  <h3>',
    '    <button id="toggle" type="button" aria-expanded="false" aria-controls="answer">',
    '      What is a boolean attribute?',
    '    </button>',
    '  </h3>',
    '  <div id="answer" hidden>An attribute whose presence is its value.</div>',
    '</section>',
  ].join('\n'),
  starterCode: [
    'export function setExpanded(button: HTMLElement, panel: HTMLElement, expanded: boolean): void {',
    "  button.toggleAttribute('aria-expanded', expanded);",
    "  panel.toggleAttribute('hidden', expanded);",
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'expanding says true and shows the panel',
      run: ({ doc, fn, expect }) => {
        const panel = requireElement(doc, 'answer');
        fn<SetExpanded>('setExpanded')(requireElement(doc, 'toggle'), panel, true);

        // `toggleAttribute(name, true)` means "make sure this attribute is present". The attribute
        // was already present, holding "false", so the call succeeds and changes nothing.
        expect(requireElement(doc, 'toggle').getAttribute('aria-expanded')).toBe('true');
        expect(panel.hasAttribute('hidden')).toBe(false);
      },
    },
    {
      name: 'collapsing says false out loud, rather than falling silent',
      run: ({ doc, fn, expect }) => {
        const button = requireElement(doc, 'toggle');
        const panel = requireElement(doc, 'answer');
        const setExpanded = fn<SetExpanded>('setExpanded');
        setExpanded(button, panel, true);
        setExpanded(button, panel, false);

        // Removing `aria-expanded` is not "collapsed": it is "this control does not disclose
        // anything", which is a different thing to say about a button that plainly does.
        expect(button.getAttribute('aria-expanded')).toBe('false');
        expect(button.hasAttribute('aria-expanded')).toBe(true);
        expect(panel.hasAttribute('hidden')).toBe(true);
      },
    },
    {
      name: 'it restores state it never set',
      run: ({ doc, fn, expect }) => {
        // Inverted control: the test takes the attribute away and un-hides the panel, so a solution
        // that only ever undoes its own writes has nothing to undo and cannot get back.
        const button = requireElement(doc, 'toggle');
        const panel = requireElement(doc, 'answer');
        button.removeAttribute('aria-expanded');
        panel.removeAttribute('hidden');

        fn<SetExpanded>('setExpanded')(button, panel, false);

        expect(button.getAttribute('aria-expanded')).toBe('false');
        expect(panel.hasAttribute('hidden')).toBe(true);
      },
    },
    {
      name: 'calling it twice with the same answer says the same thing twice',
      run: ({ doc, fn, expect }) => {
        const button = requireElement(doc, 'toggle');
        const panel = requireElement(doc, 'answer');
        const setExpanded = fn<SetExpanded>('setExpanded');

        setExpanded(button, panel, true);
        setExpanded(button, panel, true);
        expect(button.getAttribute('aria-expanded')).toBe('true');
        expect(panel.hasAttribute('hidden')).toBe(false);

        setExpanded(button, panel, false);
        setExpanded(button, panel, false);
        expect(button.getAttribute('aria-expanded')).toBe('false');
        expect(panel.hasAttribute('hidden')).toBe(true);
      },
    },
    {
      name: 'the state is where a selector can find it',
      run: ({ doc, fn, expect }) => {
        fn<SetExpanded>('setExpanded')(requireElement(doc, 'toggle'), requireElement(doc, 'answer'), false);

        // Three separate questions, and a stylesheet or a test can ask any of them. `[aria-expanded]`
        // is "does this control disclose something", and it stays true in both states -- which is
        // precisely what an attribute that is sometimes absent cannot express.
        expect(doc.querySelectorAll('[aria-expanded]')).toHaveLength(1);
        expect(doc.querySelectorAll('[aria-expanded="false"]')).toHaveLength(1);
        expect(doc.querySelectorAll('[aria-expanded="true"]')).toHaveLength(0);
        expect(doc.querySelectorAll('#faq [hidden]')).toHaveLength(1);
      },
    },
  ],
  solutions: [
    {
      label: 'The value for the enumerated one, presence for the boolean one',
      code: [
        'export function setExpanded(button: HTMLElement, panel: HTMLElement, expanded: boolean): void {',
        "  button.setAttribute('aria-expanded', String(expanded));",
        '  panel.hidden = !expanded;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'HTML has (at least) two kinds of attribute, and telling them apart is the whole job here.',
        '',
        '**Boolean attributes** carry no value. `hidden`, `disabled`, `checked`, `required`, `open`,',
        '`inert`: the browser asks only whether the attribute is *there*. `hidden="false"` is hidden.',
        'The two tools that speak this language are the IDL property (`panel.hidden = false` removes',
        'the attribute) and `toggleAttribute(name, force)`.',
        '',
        '**Enumerated attributes** carry a value out of a fixed set, and `"false"` is one of the',
        'values. Nearly every `aria-*` state attribute is one — `aria-expanded`, `aria-pressed`,',
        '`aria-checked`, `aria-selected`, `aria-hidden`, `aria-current` — and so are `contenteditable`,',
        '`draggable`, `spellcheck` and `translate`. For these there are **three** states, not two:',
        '',
        '```',
        'aria-expanded="true"    this control is open',
        'aria-expanded="false"   this control is closed',
        '(absent)                this control does not disclose anything',
        '```',
        '',
        'The third one is a real, different claim, and it is the one the starter accidentally makes.',
        '`toggleAttribute("aria-expanded", true)` means "ensure the attribute is present" — it was',
        'present, holding `"false"`, so the call did its job and the button still announces itself as',
        'collapsed. `toggleAttribute` **cannot** write a value, so it can never be the right tool for',
        'an attribute that has one.',
        '',
        'So: `setAttribute("aria-expanded", String(expanded))` for the enumerated one, and the `hidden`',
        'property for the boolean one. `String(true)` is exactly the keyword the specification names,',
        'which is not a coincidence — the ARIA keywords were chosen to be the strings booleans',
        'stringify to.',
        '',
        'One thing not to do here: `button.ariaExpanded = "true"`. The `aria-*` IDL properties are real',
        'and do reflect in current browsers, but support is recent enough — and polyfilled inconsistently',
        'enough — that `setAttribute` remains the portable spelling for ARIA state.',
      ].join('\n'),
      tradeoffs: [
        '`panel.hidden = !expanded` is the shortest correct thing for a boolean attribute, and it is',
        'type-checked. Its limits are the ones every reflected property has: the name must be a literal',
        'in your source, and the element must be one that has the property.',
        '',
        '`hidden` has a subtlety worth knowing before you rely on the boolean reading. Browsers now',
        'accept `hidden="until-found"` — an element that is hidden but findable by in-page search, and',
        'that reveals itself when found. That makes `hidden` an *enumerated* attribute whose empty',
        'value happens to mean "hidden", so `panel.hidden = true` writing `hidden=""` is still right,',
        'while `panel.hidden` reading `true` no longer tells you *which* kind of hidden it is.',
        '',
        'And `hidden` is only as strong as the stylesheet: it works by a UA rule of `display: none`,',
        'which any author rule with `display: block` on that element silently overrides. If a panel',
        'with `hidden` is still on screen, that is the reason, and `[hidden] { display: none !important }`',
        'is the usual patch.',
      ].join('\n'),
    },
    {
      label: 'One helper that can also say nothing',
      code: [
        'function setEnumerated(element: HTMLElement, name: string, value: string | null): void {',
        '  if (value === null) {',
        '    element.removeAttribute(name);',
        '    return;',
        '  }',
        '',
        '  element.setAttribute(name, value);',
        '}',
        '',
        'export function setExpanded(button: HTMLElement, panel: HTMLElement, expanded: boolean): void {',
        "  setEnumerated(button, 'aria-expanded', expanded ? 'true' : 'false');",
        "  panel.toggleAttribute('hidden', !expanded);",
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The same behaviour, with the three states made explicit in a helper: a string writes the',
        'attribute, `null` removes it. That is the shape an enumerated attribute actually has, and',
        'writing it once means the calling code reads as three choices rather than two.',
        '',
        'It matters as soon as a second attribute joins in, because "absent" is genuinely the right',
        'answer for some of them:',
        '',
        '```js',
        "setEnumerated(header, 'aria-sort', sorted ? direction : null);  // unsorted columns say nothing",
        "setEnumerated(field, 'aria-invalid', submitted ? String(!valid) : null);",
        '```',
        '',
        '`aria-sort` is the clearest case: exactly one column in a table may claim a sort direction, and',
        'the others must not say `aria-sort="none"` — they must be silent. Written with',
        '`toggleAttribute` that is unexpressible; written with `setAttribute` alone it is easy to',
        'forget; written like this it is one argument.',
        '',
        'The panel here uses `toggleAttribute("hidden", !expanded)` rather than the property, which is',
        'the same instruction said the other way round. Note the `!`: `toggleAttribute` takes "should',
        'this attribute be present", and the attribute means *hidden*, so the force argument is the',
        'negation of the state you are in. That inversion is a reliable source of off-by-one-`!` bugs,',
        'and it is the main argument for the property version above.',
      ].join('\n'),
      tradeoffs: [
        'Reach for the helper when a component sets several ARIA attributes, which is most components',
        'that set any. One place decides how `null` behaves, and the call sites stop mixing',
        '`setAttribute` with `removeAttribute` and `toggleAttribute` for things that are all the same',
        'kind of state.',
        '',
        'What it costs is a layer. For a single attribute in a single function it is longer than the',
        'line it replaces, and it hides the distinction this challenge is about behind a name — a',
        'reader who has not met `setEnumerated` cannot tell from the call site whether `aria-expanded`',
        'is a boolean attribute or not.',
        '',
        'The deeper point stands either way: **`toggleAttribute` is a tool for attributes with no',
        'value, and nothing in the DOM API can tell you which those are.** `toggleAttribute("aria-hidden",',
        'false)` removes an attribute where you meant to write the string `"false"`, and',
        '`toggleAttribute("data-state", true)` writes an empty `data-state` that your own code will read',
        'as meaningless. The distinction lives in the HTML and ARIA specifications, one attribute at a',
        'time, and it has to live in your head as well.',
      ].join('\n'),
    },
  ],
};
