import type { ChallengeContent } from '@/types/challenge';

import { requireButton, requireForm, requireInput } from './support';

type Deliver = (payload: Record<string, string>) => void;
type WireEditor = (form: HTMLFormElement, deliver: Deliver) => void;

/**
 * Captures what the submitted code delivers. The array keeps every call, so a test can tell "one
 * delivery carrying the right payload" from "several deliveries, one of which happened to be
 * right" -- a handler wired twice is a real bug this surface would otherwise hide.
 */
function collectDeliveries(): { deliveries: Array<Record<string, string>>; deliver: Deliver } {
  const deliveries: Array<Record<string, string>> = [];
  return {
    deliveries,
    deliver: (payload) => {
      deliveries.push(payload);
    },
  };
}

export const submitterInThePayload: ChallengeContent = {
  prompt: [
    'An article editor with two submit buttons — **Publish** and **Archive** — sharing the name',
    '`action`. When a real form submits, the pair the server uses to tell them apart is in the body:',
    '`action=publish` or `action=archive`, contributed by **the button that was used**. A button that',
    'was not used contributes nothing.',
    '',
    'This editor intercepts the submission and delivers the payload to JavaScript instead. Export',
    '`wireEditor(form, deliver)`: attach a `submit` listener that cancels the default and calls',
    '`deliver` **once** with a plain object of exactly what a real submission would have sent —',
    'fields *and* the submitter’s pair.',
    '',
    'The event tells you which button: `event.submitter`. It is `null` for a submission no button',
    'made (`form.requestSubmit()` from code), and then the payload carries no `action` at all —',
    '`new FormData(form)` on its own never includes any button, which is precisely the bug this',
    'challenge is about.',
  ].join('\n'),
  html: [
    '<form id="editor">',
    '  <label>Title <input id="title" name="title" value="Draft one"></label>',
    '  <label>Tags <input id="tags" name="tags" value="dom"></label>',
    '  <button id="publish" type="submit" name="action" value="publish">Publish</button>',
    '  <button id="archive" type="submit" name="action" value="archive">Archive</button>',
    '</form>',
  ].join('\n'),
  starterCode: [
    'export function wireEditor(',
    '  form: HTMLFormElement,',
    '  deliver: (payload: Record<string, string>) => void,',
    '): void {',
    "  form.addEventListener('submit', (event) => {",
    '    event.preventDefault();',
    '    const payload: Record<string, string> = {};',
    '    for (const [name, value] of new FormData(form)) {',
    '      payload[name] = String(value);',
    '    }',
    '    deliver(payload);',
    '  });',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'publishing delivers the fields plus action=publish',
      run: ({ doc, fire, fn, expect }) => {
        const form = requireForm(doc, 'editor');
        const { deliveries, deliver } = collectDeliveries();
        fn<WireEditor>('wireEditor')(form, deliver);

        fire.input(requireInput(doc, 'title'), 'The dirty value flag');
        fire.submit(form, requireButton(doc, 'publish'));

        expect(deliveries).toHaveLength(1);
        expect(deliveries[0]).toEqual({ title: 'The dirty value flag', tags: 'dom', action: 'publish' });
      },
    },
    {
      name: 'archiving delivers action=archive from the very same form',
      run: ({ doc, fire, fn, expect }) => {
        const form = requireForm(doc, 'editor');
        const { deliveries, deliver } = collectDeliveries();
        fn<WireEditor>('wireEditor')(form, deliver);

        // Same fields, same markup, same listener -- the only thing that changed is which button
        // the user pressed, so the only place the answer can come from is the event.
        fire.submit(form, requireButton(doc, 'archive'));

        expect(deliveries).toHaveLength(1);
        expect(deliveries[0]).toEqual({ title: 'Draft one', tags: 'dom', action: 'archive' });
      },
    },
    {
      name: 'a submission no button made carries no action at all',
      run: ({ doc, fire, fn, expect }) => {
        const form = requireForm(doc, 'editor');
        const { deliveries, deliver } = collectDeliveries();
        fn<WireEditor>('wireEditor')(form, deliver);

        // `form.requestSubmit()` from code: submitter is null. Absent means absent -- not
        // `action: "undefined"`, not a crash in the handler.
        fire.submit(form);

        expect(deliveries).toHaveLength(1);
        expect(Object.hasOwn(deliveries[0], 'action')).toBe(false);
        expect(deliveries[0]).toEqual({ title: 'Draft one', tags: 'dom' });
      },
    },
    {
      name: 'the unused button never leaks into the payload',
      run: ({ doc, fire, fn, expect }) => {
        const form = requireForm(doc, 'editor');
        const { deliveries, deliver } = collectDeliveries();
        fn<WireEditor>('wireEditor')(form, deliver);

        fire.submit(form, requireButton(doc, 'publish'));

        // One name, one pair: an implementation that appends *every* button's value -- or both --
        // reports "archive" here, because a later entry wins the flattening.
        expect(deliveries).toHaveLength(1);
        expect(deliveries[0].action).toBe('publish');
      },
    },
  ],
  solutions: [
    {
      label: 'Hand the submitter to FormData',
      code: [
        'export function wireEditor(',
        '  form: HTMLFormElement,',
        '  deliver: (payload: Record<string, string>) => void,',
        '): void {',
        "  form.addEventListener('submit', (event) => {",
        '    event.preventDefault();',
        '    const submitter = event instanceof SubmitEvent ? event.submitter : null;',
        '    const data = submitter ? new FormData(form, submitter) : new FormData(form);',
        '',
        '    const payload: Record<string, string> = {};',
        '    for (const [name, value] of data) {',
        '      payload[name] = String(value);',
        '    }',
        '    deliver(payload);',
        '  });',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'Two platform pieces, joined where they were designed to join.',
        '',
        '`event.submitter` is the `SubmitEvent`’s answer to "which control asked for this?". It is',
        'the button that was clicked, the button `requestSubmit(button)` named, or `null` when the',
        'submission had no submitter at all. There is no other reliable source: the buttons cannot',
        'tell you (neither changes state when pressed), and `document.activeElement` is a guess',
        'about focus, not an answer about submission.',
        '',
        'The two-argument `new FormData(form, submitter)` builds the entry list **as that',
        'submission would have**: all the fields, plus the submitter’s own name/value pair. That',
        'last pair is the part the one-argument form never includes -- buttons are submission',
        '*triggers*, and a trigger only contributes when it fired. Passing the submitter through is',
        'what keeps this handler byte-for-byte faithful to the request a real submission would have',
        'made, which is the entire contract of "intercept and send it yourself".',
        '',
        'The `null` branch is not defensive filler; it is the third test’s case. A programmatic',
        '`requestSubmit()` has no submitter, a real body would have no `action` pair, and the',
        'payload faithfully has none. Code that assumes a button always exists turns that case into',
        '`action: "undefined"` on the server.',
      ].join('\n'),
      tradeoffs: [
        'This is the faithful shape, and the one to reach for whenever the payload must match what',
        'a native submission would have sent -- fetch-based progressive enhancement being the',
        'canonical case.',
        '',
        '- The flattening into a plain object is this form’s luxury, not the pattern’s: names here',
        '  are unique. A form with repeated names needs the entry list kept whole (`getAll` -- the',
        '  getall-or-lose-them challenge), and `fetch(url, { body: data })` would rather have the',
        '  FormData itself.',
        '- `submitter ? ... : ...` spells out the branch. Passing `event.submitter` straight into',
        '  the two-argument constructor leans on `null` being accepted there -- the spec allows it,',
        '  but the conditional reads as intent rather than trivia.',
        '- One more thing the submitter pair does: on the server, its presence *is* the "a user',
        '  pressed this" signal. Synthesising it by hand (below) forgets edge cases like image',
        '  buttons, which contribute `x`/`y` coordinates instead of a value.',
      ].join('\n'),
    },
    {
      label: 'Append the pair yourself',
      code: [
        'export function wireEditor(',
        '  form: HTMLFormElement,',
        '  deliver: (payload: Record<string, string>) => void,',
        '): void {',
        "  form.addEventListener('submit', (event) => {",
        '    event.preventDefault();',
        '    const data = new FormData(form);',
        '    const submitter = event instanceof SubmitEvent ? event.submitter : null;',
        '    if (submitter instanceof HTMLButtonElement && submitter.name !== \'\') {',
        '      data.append(submitter.name, submitter.value);',
        '    }',
        '',
        '    const payload: Record<string, string> = {};',
        '    for (const [name, value] of data) {',
        '      payload[name] = String(value);',
        '    }',
        '    deliver(payload);',
        '  });',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The same payload assembled manually: build the field entries, then append the submitter’s',
        'pair if there is one. This is roughly what the two-argument constructor does for you, and',
        'writing it once shows what the convenience was hiding.',
        '',
        'The guards earn their lines. `instanceof HTMLButtonElement` narrows from the event’s',
        '`HTMLElement | null` to something with `name` and `value` (a submitter can also be an',
        '`<input type="submit">` -- a fuller version checks both). The `name !== ""` check mirrors a',
        'real submission: a nameless button submits the form but contributes no pair, and',
        '`append("", ...)` would invent an entry no browser sends.',
        '',
        'Placement is the one visible difference from the constructor: `append` puts the pair at',
        'the **end** of the entry list, while a real submission -- and the two-argument constructor',
        '-- put it where the button sits in tree order. Flattened into an object, nobody can tell;',
        'a multipart body or an entry-order-sensitive consumer could.',
      ].join('\n'),
      tradeoffs: [
        'Legitimate when you are stuck with a FormData someone else built, or when the "submitter"',
        'is not a real control (a delegated click on something button-like) and there is nothing to',
        'hand the constructor.',
        '',
        'As a habit it is the weaker shape:',
        '',
        '- Every guard here is a submission rule reimplemented, and the set is incomplete by',
        '  silent default -- image buttons’ coordinates, the `<input type="submit">` case, entry',
        '  placement. The constructor ships all of them.',
        '- The `if` invites its own bug: append *unconditionally* (or loop over every button',
        '  "to be safe") and the payload says `archive` about a publish -- the fourth test exists',
        '  because that wrong answer reads so plausibly.',
      ].join('\n'),
    },
  ],
};
