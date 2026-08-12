import type { ChallengeContent } from '@/types/challenge';

import { computedValue, requireElement } from './support';

type SetCompact = (app: HTMLElement, on: boolean) => void;

/** Every sheet the document holds, plus every parsed rule in them -- the audit the fourth test runs. */
function styleFootprint(doc: Document): { sheets: number; rules: number } {
  let rules = 0;
  for (const sheet of doc.styleSheets) {
    rules += sheet.cssRules.length;
  }
  return { sheets: doc.styleSheets.length, rules };
}

export const toggleNotGenerate: ChallengeContent = {
  prompt: [
    'A task list with a compact mode, and the stylesheet already describes both states — `.row` and',
    '`.row-title` for the comfortable layout, `.compact .row` and `.compact .row-title` for the',
    'dense one. They were designed together and they live together.',
    '',
    'Export one function:',
    '',
    '- `setCompact(app, on)` — put the `#app` container into, or out of, compact mode.',
    '',
    'The starter takes a different road: on every call it **generates CSS** — a fresh `<style>`',
    'element with rules describing the requested state — and appends it. Run it and the values are',
    'all correct. One of the tests measures something else: it counts the document’s stylesheets',
    'and rules after the first call, toggles six more times, and counts again. State code runs for',
    'the lifetime of a page, and “correct values, growing document” is a slow leak wearing a green',
    'checkmark.',
  ].join('\n'),
  html: [
    '<style>',
    '  .row { padding-left: 16px; }',
    '  .row-title { margin-top: 12px; }',
    '  .compact .row { padding-left: 6px; }',
    '  .compact .row-title { margin-top: 4px; }',
    '</style>',
    '<div id="app">',
    '  <h2 class="row-title" id="inbox-title">Inbox</h2>',
    '  <p class="row" id="reply-row">Ship the reply</p>',
    '  <p class="row" id="report-row">File the report</p>',
    '</div>',
  ].join('\n'),
  starterCode: [
    'export function setCompact(app: HTMLElement, on: boolean): void {',
    "  const sheet = document.createElement('style');",
    '  sheet.textContent = on',
    "    ? '#app .row { padding-left: 6px; } #app .row-title { margin-top: 4px; }'",
    "    : '#app .row { padding-left: 16px; } #app .row-title { margin-top: 12px; }';",
    '  document.body.append(sheet);',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'compact mode tightens rows and titles',
      run: ({ doc, win, fn, expect }) => {
        const app = requireElement(doc, 'app');
        fn<SetCompact>('setCompact')(app, true);

        expect(computedValue(win, requireElement(doc, 'reply-row'), 'padding-left')).toBe('6px');
        expect(computedValue(win, requireElement(doc, 'inbox-title'), 'margin-top')).toBe('4px');
        // The elements themselves are not the medium: state lives on the container, not as inline
        // paint on every row.
        expect(requireElement(doc, 'reply-row').getAttribute('style')).toBe(null);
      },
    },
    {
      name: 'leaving compact mode restores the comfortable layout',
      run: ({ doc, win, fn, expect }) => {
        const app = requireElement(doc, 'app');
        const setCompact = fn<SetCompact>('setCompact');
        setCompact(app, true);
        setCompact(app, false);

        expect(computedValue(win, requireElement(doc, 'reply-row'), 'padding-left')).toBe('16px');
        expect(computedValue(win, requireElement(doc, 'inbox-title'), 'margin-top')).toBe('12px');
      },
    },
    {
      name: 'a row added while compact is compact',
      run: ({ doc, win, fn, expect }) => {
        const app = requireElement(doc, 'app');
        fn<SetCompact>('setCompact')(app, true);

        const late = doc.createElement('p');
        late.className = 'row';
        late.textContent = 'Triage the inbox';
        app.append(late);

        expect(computedValue(win, late, 'padding-left')).toBe('6px');
      },
    },
    {
      name: 'six months of toggling adds nothing to the document',
      run: ({ doc, win, fn, expect }) => {
        const app = requireElement(doc, 'app');
        const setCompact = fn<SetCompact>('setCompact');

        // The baseline is taken after the first call, so an answer that sets up one owned sheet on
        // first use has settled. From here on, toggling must be footprint-neutral.
        setCompact(app, true);
        const baseline = styleFootprint(doc);

        setCompact(app, false);
        setCompact(app, true);
        setCompact(app, false);
        setCompact(app, true);
        setCompact(app, false);
        setCompact(app, true);

        const after = styleFootprint(doc);
        expect(after.sheets).toBe(baseline.sheets);
        expect(after.rules).toBe(baseline.rules);
        // And it still works -- footprint discipline is not allowed to cost correctness.
        expect(computedValue(win, requireElement(doc, 'reply-row'), 'padding-left')).toBe('6px');
      },
    },
  ],
  solutions: [
    {
      label: 'Toggle the class the stylesheet is waiting for',
      code: [
        'export function setCompact(app: HTMLElement, on: boolean): void {',
        "  app.classList.toggle('compact', on);",
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The stylesheet was written with both states side by side: `.row` says what comfortable',
        'means, `.compact .row` says what compact means, and the `.compact` ancestor class is the',
        'switch between them. All the JavaScript has to contribute is the position of the switch.',
        '',
        'Every test falls out of that division of labour:',
        '',
        '- **The values are right** because the designers wrote them, once, next to each other,',
        '  where the next designer will find both.',
        '- **Off is genuinely off** -- not a third state that happens to look like the first. Remove',
        '  the class and the descendant rules stop matching; there is nothing to clean up because',
        '  nothing was created.',
        '- **The late row is covered** because `.compact .row` is a *description*, not an action: it',
        '  applies to whatever matches it whenever it matches, elements from the future included.',
        '- **The footprint is flat** because toggling a class does not manufacture anything. One',
        '  bit moves back and forth on one element.',
        '',
        'The deeper point is about where state lives. A UI state that the CSS already understands',
        'needs exactly one bit of DOM to represent it -- a class on a container. The starter instead',
        'represents state as *an ever-growing log of instructions*, where the current state is',
        'whichever instruction happens to be last. It reads correctly and it is structurally a leak:',
        'the document accumulates one dead stylesheet per interaction, forever.',
      ].join('\n'),
      tradeoffs: [
        'When the states are known at design time, this is simply the right answer, and the',
        'interesting engineering question is upstream: keeping the `.compact` contract documented',
        'so the stylesheet and the script do not drift apart.',
        '',
        'Its boundary is the same one this category keeps finding: **a state that is data** -- a',
        'user-chosen density of 13px, say -- has no pre-written rule to switch on. That is when the',
        'value itself must travel, and the disciplined vehicles are a custom property (the',
        'density-token challenge) or one owned, replaced stylesheet (the other solution here).',
        'Reaching for generated CSS while the states are still enumerable is the mistake.',
      ].join('\n'),
    },
    {
      label: 'One owned layer, replaced instead of accumulated',
      code: [
        "const layer = document.createElement('style');",
        'document.body.append(layer);',
        '',
        'export function setCompact(app: HTMLElement, on: boolean): void {',
        '  if (!app.id) return;',
        '',
        '  layer.textContent = on',
        '    ? `#${app.id} .row { padding-left: 6px; } #${app.id} .row-title { margin-top: 4px; }`',
        "    : '';",
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The starter, disciplined. Two changes turn the leak into a tool, and each is a rule worth',
        'carrying:',
        '',
        '- **One element, owned by this module, created once.** Every call *replaces* its',
        '  `textContent` instead of appending a sibling. The document holds at most one layer',
        "  regardless of how many times the mode flips -- the fourth test's baseline-then-toggle",
        '  audit is exactly a test of this property.',
        "- **Off is emptiness, not a second ruleset.** The starter's off-branch writes rules that",
        '  restate the comfortable values -- a second copy of truth the real stylesheet already',
        '  owns, wrong the day design changes 16px to 14px. Here, off means the layer says nothing',
        '  and the base rules speak for themselves.',
        '',
        'The compact values still live in this string rather than beside their siblings in the',
        'stylesheet, which is why this is the second solution and not the first. `#app .row`',
        '(1-1-0) outranks `.row` (0-1-0) on specificity, so the layer wins while it has content --',
        'this version does not even depend on where the layer sits in the document.',
      ].join('\n'),
      tradeoffs: [
        'As written -- for a state the stylesheet already knows -- this is strictly worse than the',
        'class toggle: more moving parts, a duplicated 6px, an id requirement (the guard is that',
        'requirement wearing a return).',
        '',
        'Keep the *shape* for the situations the class toggle cannot reach:',
        '',
        "- **Values that are data.** `layer.textContent` can interpolate a user's 13px; no",
        '  pre-written rule can.',
        '- **Documents you do not own.** Injecting behaviour into a page whose stylesheet you',
        '  cannot edit (an extension, an embed) has no `.compact` rule to toggle; an owned layer is',
        '  the least invasive way in.',
        '',
        'And its own discipline transfers: whatever generates CSS at runtime must be able to point',
        'at the *one* node it owns. The moment generation and cleanup are in different hands, you',
        'are back to the starter.',
      ].join('\n'),
    },
  ],
};
