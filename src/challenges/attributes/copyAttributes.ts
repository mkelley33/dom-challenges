import type { ChallengeContent } from '@/types/challenge';

import { requireElement } from './support';

type ApplyPreset = (button: HTMLElement, preset: HTMLElement) => void;

export const copyAttributes: ChallengeContent = {
  prompt: [
    'A design system ships presets as invisible `<template>`-ish stand-ins: elements that carry only',
    'attributes, no content. Applying one means giving a real button every attribute the preset',
    'carries.',
    '',
    'Export `applyPreset(button, preset)`:',
    '',
    '- Copy **every** attribute the preset has, whatever it is called — not the ones you can think of.',
    '- Except `id`, which belongs to the button.',
    '- Leave the button’s other attributes alone. A preset that says nothing about `lang` is not',
    '  saying to remove it.',
    '- Change the button in place. The element the caller is holding has to be the element on screen.',
    '',
    'The starter copies through properties, which is how everyone writes this the first time, and it',
    'quietly loses every attribute that has no property.',
  ].join('\n'),
  html: [
    '<div id="library" hidden>',
    '  <span id="preset-danger" class="btn btn-danger" title="Deletes for everyone"',
    '        aria-label="Delete permanently" data-variant="danger" data-size="lg"></span>',
    '  <span id="preset-quiet" class="btn btn-quiet" data-variant="quiet"></span>',
    '</div>',
    '<div id="toolbar">',
    '  <button id="target" class="btn" lang="en" data-tracked="yes">Delete</button>',
    '</div>',
  ].join('\n'),
  starterCode: [
    'export function applyPreset(button: HTMLElement, preset: HTMLElement): void {',
    '  button.className = preset.className;',
    '  button.title = preset.title;',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'every attribute the preset carries lands on the button, including one added at run time',
      run: ({ doc, fn, expect }) => {
        // Inverted control, and this challenge needs it more than any other here: its whole thesis
        // is "you cannot write the list of attributes down". Every attribute in the markup *can* be
        // written down, so an allow-list naming the five of them passes everything else in this
        // file. This one is added after the markup was parsed, so no list written against the
        // fixture can contain it.
        const preset = requireElement(doc, 'preset-danger');
        preset.setAttribute('data-analytics-id', 'delete-danger');

        const button = requireElement(doc, 'target');
        fn<ApplyPreset>('applyPreset')(button, preset);

        expect(button.getAttribute('class')).toBe('btn btn-danger');
        expect(button.getAttribute('title')).toBe('Deletes for everyone');
        // `aria-label` and the `data-*` attributes are the ones a property-by-property copy never
        // reaches, because the author has to have thought of each of them by name.
        expect(button.getAttribute('aria-label')).toBe('Delete permanently');
        expect(button.getAttribute('data-variant')).toBe('danger');
        expect(button.getAttribute('data-size')).toBe('lg');
        expect(button.getAttribute('data-analytics-id')).toBe('delete-danger');
      },
    },
    {
      name: 'the button keeps its own id and the attributes the preset says nothing about',
      run: ({ doc, fn, expect }) => {
        const button = requireElement(doc, 'target');
        fn<ApplyPreset>('applyPreset')(button, requireElement(doc, 'preset-danger'));

        expect(button.getAttribute('id')).toBe('target');
        expect(button.getAttribute('lang')).toBe('en');
        expect(button.getAttribute('data-tracked')).toBe('yes');
      },
    },
    {
      name: 'the button on screen is the button that was handed in',
      run: ({ doc, fn, expect }) => {
        const toolbar = requireElement(doc, 'toolbar');
        const button = requireElement(doc, 'target');
        fn<ApplyPreset>('applyPreset')(button, requireElement(doc, 'preset-danger'));

        // Asked as "where is the node I am holding", because that is the question with a legible
        // failure: `outerHTML = …` and `replaceWith(clone)` both leave this reference detached, so
        // this reads `Expected null to be <div id="toolbar">` rather than telling a learner that a
        // button is not itself. The text is asserted for the same reason -- a rebuilt-from-attributes
        // copy has no children.
        expect(button.parentElement).toBe(toolbar);
        expect(toolbar.children).toHaveLength(1);
        expect(button).toHaveTextContent('Delete');
      },
    },
    {
      name: 'the preset is left exactly as it was',
      run: ({ doc, fn, expect }) => {
        const library = requireElement(doc, 'library');
        const preset = requireElement(doc, 'preset-danger');
        fn<ApplyPreset>('applyPreset')(requireElement(doc, 'target'), preset);

        expect(preset.parentElement).toBe(library);
        expect(preset.getAttributeNames()).toEqual(['id', 'class', 'title', 'aria-label', 'data-variant', 'data-size']);
      },
    },
    {
      name: 'a second preset overwrites what it names and nothing else',
      run: ({ doc, fn, expect }) => {
        const button = requireElement(doc, 'target');
        const applyPreset = fn<ApplyPreset>('applyPreset');
        applyPreset(button, requireElement(doc, 'preset-danger'));
        applyPreset(button, requireElement(doc, 'preset-quiet'));

        expect(button.getAttribute('class')).toBe('btn btn-quiet');
        expect(button.getAttribute('data-variant')).toBe('quiet');
        // `preset-quiet` says nothing about these, so they survive -- which is what "apply a preset"
        // means and is also why this is not the same job as "make the button look like the preset".
        expect(button.getAttribute('title')).toBe('Deletes for everyone');
        expect(button.getAttribute('data-size')).toBe('lg');
        expect(button.getAttribute('lang')).toBe('en');
      },
    },
  ],
  solutions: [
    {
      label: 'Enumerate the names with getAttributeNames',
      code: [
        'export function applyPreset(button: HTMLElement, preset: HTMLElement): void {',
        '  for (const name of preset.getAttributeNames()) {',
        "    if (name === 'id') continue;",
        "    button.setAttribute(name, preset.getAttribute(name) ?? '');",
        '  }',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The starter is the version everybody writes: copy `className`, copy `title`, ship it. It is',
        'wrong not because those two lines are wrong but because the list can never be finished. Every',
        '`data-*` attribute, every `aria-*` attribute, and every attribute a designer adds next month',
        'is one the author would have had to think of by name.',
        '',
        '`getAttributeNames()` is the answer: an array of the element’s attribute names, in document',
        'order, as plain strings. It has no opinion about what the attributes mean, which is exactly',
        'the property you want when the answer is "all of them".',
        '',
        'Two details that make the loop correct rather than nearly correct:',
        '',
        '- **`?? ""`, not `|| ""`.** `getAttribute` returns `null` only when the attribute is absent,',
        '  which cannot happen for a name it just gave us — but an attribute with an *empty* value can,',
        '  and `hidden=""` is exactly that. The nullish check keeps the empty attribute an empty',
        '  attribute.',
        '- **Skipping `id` in the loop, not afterwards.** Copying it and putting it back would work,',
        '  and would briefly make two elements share an id, which `getElementById` resolves by document',
        '  order — a real source of "why did my query return the wrong node" during the gap.',
        '',
        'It is worth noticing what this does *not* do. It never removes anything, so the button keeps',
        'attributes the preset is silent about. That is a deliberate reading of "apply a preset", and',
        'it is the reason the function is not simply `button.outerHTML = preset.outerHTML` with the id',
        'patched: that would replace the node, throw away the text inside it, and leave the caller',
        'holding a detached element that is no longer on screen.',
      ].join('\n'),
      tradeoffs: [
        'This is the general shape for "do something with all of an element’s attributes" — copying,',
        'auditing, diffing, serialising. `getAttributeNames()` returns a **snapshot**, so it is also',
        'the safe one: the array does not change under you while the loop runs.',
        '',
        'Two limits worth stating:',
        '',
        '- **Attributes are not everything.** Children, listeners, the dirty value of an `<input>`, a',
        '  shadow root: none of it is an attribute, and none of it comes along. `cloneNode(true)` copies',
        '  the attributes *and* the children, and still copies no listeners — it is a different tool for',
        '  a different job, and it makes a new node rather than editing yours.',
        '- **`class` is copied wholesale here.** The button’s own `btn` survives only because the preset',
        '  also has it. If presets should *add* classes rather than replace them, `class` needs a case',
        '  of its own — which is the moment to ask whether a preset should be one `data-variant`',
        '  attribute and a stylesheet, rather than six attributes copied at run time.',
      ].join('\n'),
    },
    {
      label: 'Walk the attributes collection',
      code: [
        'export function applyPreset(button: HTMLElement, preset: HTMLElement): void {',
        '  for (const attribute of preset.attributes) {',
        "    if (attribute.name === 'id') continue;",
        '    button.setAttribute(attribute.name, attribute.value);',
        '  }',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'One layer down. `element.attributes` is a `NamedNodeMap` of `Attr` **nodes** — the objects the',
        'DOM actually stores, each with a `name`, a `value` and an `ownerElement`. `getAttribute` and',
        '`setAttribute` are a convenience layer over these.',
        '',
        'Reading name and value together is what this buys: no second lookup per attribute, and no',
        '`null` to handle, since an `Attr` that exists has a value by construction.',
        '',
        'Three things about `NamedNodeMap` that surprise people:',
        '',
        '- **It is not an array.** `attributes.map(...)` is a `TypeError`. It is iterable and',
        '  indexable, so `[...element.attributes]` and `Array.from(element.attributes, (a) => a.name)`',
        '  both work, and `Object.keys` on it gives you `"0"`, `"1"`, `"2"`.',
        '- **It is live.** Adding or removing an attribute changes its `length` immediately, and the',
        '  entry at index 1 may not be the same attribute it was a moment ago.',
        '- **An `Attr` belongs to one element.** `button.setAttributeNode(preset.getAttributeNode("title"))`',
        '  throws `InUseAttributeError`; you would have to clone the node first. That is why the code',
        '  above reads `name` and `value` off it and calls `setAttribute` rather than moving the node.',
        '',
        '`Attr` is the reason `getAttributeNode`, `setAttributeNode` and `removeAttributeNode` exist at',
        'all. They are DOM Level 1 API, kept alive because attributes really are nodes in the',
        'specification, and there is almost never a reason to use them.',
      ].join('\n'),
      tradeoffs: [
        'Prefer `getAttributeNames()` for anything that **modifies** the element it is iterating, and',
        'treat that as a rule rather than a preference. The live map is a trap in exactly the shape of',
        'the classic array-splice bug:',
        '',
        '```js',
        '// Removes every other attribute, and looks like it removes them all.',
        'for (const attribute of element.attributes) element.removeAttribute(attribute.name);',
        '```',
        '',
        'The iterator walks by index while the map shrinks underneath it, so index 1 is read after the',
        'attribute at index 0 has gone and everything has shifted down. `getAttributeNames()` is a',
        'snapshot and has no such problem — and it is the reason it was added.',
        '',
        'Copying *into* a different element, as above, is safe: the collection being walked is not the',
        'one being changed. Even then the array of names is easier to read, easier to filter, and one',
        'fewer concept for whoever maintains it. Reach for `attributes` when you genuinely want the',
        '`Attr` nodes — a serialiser, a devtools panel, a diff — and for `getAttributeNames()` the rest',
        'of the time.',
      ].join('\n'),
    },
  ],
};
