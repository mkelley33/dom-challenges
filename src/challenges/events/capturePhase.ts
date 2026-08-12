import type { ChallengeContent } from '@/types/challenge';

import type { Recorder } from './support';
import { createRecorder, requireElement } from './support';

type AuditEvents = (page: HTMLElement, onSeen: (label: string) => void) => void;

/**
 * Installs the third-party widget the challenge is written against, and reports what it saw.
 *
 * **The test owns this listener, and that is the whole design.** The premise is "somebody else's
 * code stops the event before it reaches you"; a challenge whose own code installed the stopper
 * could be passed by not installing it. It is registered in the bubbling phase on `#widget`, which
 * is what a component that wants to keep its clicks to itself really does -- and it is registered
 * *before* the submitted code runs, so no ordering trick on one element can get round it.
 */
function installWidget(doc: Document, seen: Recorder<string>): void {
  requireElement(doc, 'widget').addEventListener('click', (event) => {
    seen.record('widget');
    event.stopPropagation();
  });
}

/** A bubbling-phase listener at page level, standing in for the rest of the page's code. */
function installPageBubbleListener(doc: Document, seen: Recorder<string>): void {
  requireElement(doc, 'page').addEventListener('click', () => seen.record('page-bubble'));
}

export const capturePhase: ChallengeContent = {
  prompt: [
    'You are adding usage auditing to a dashboard. It has to see **every** interaction inside',
    '`#page` — including the ones inside `#widget`, a third-party component whose own click handler',
    'calls `event.stopPropagation()` so that the rest of the page leaves it alone.',
    '',
    'Export `auditEvents(page, onSeen)`. For every `click` and every `widget-toggle` that happens',
    'anywhere inside `page`, call `onSeen` with `` `${event.type}:${id}` ``, where `id` is the id of',
    'the element the event started at.',
    '',
    'Two facts about what you are up against:',
    '',
    '- the widget stops click propagation, and **you must not break that** — the rest of the page is',
    '  entitled to go on not hearing those clicks, and the widget’s own handler must still run;',
    '- `widget-toggle` is dispatched with `bubbles: false`, like `focus` and `mouseenter`.',
    '',
    'The starter listens on `#page`. It hears the clicks nobody is hiding, and nothing else.',
  ].join('\n'),
  html: [
    '<div id="page">',
    '  <p id="intro">Dashboard</p>',
    '  <div id="widget">',
    '    <button id="save" type="button"><span id="save-label">Save</span></button>',
    '  </div>',
    '  <button id="reset" type="button">Reset</button>',
    '</div>',
    '<footer id="footer"><button id="feedback" type="button">Feedback</button></footer>',
  ].join('\n'),
  starterCode: [
    'export function auditEvents(page: HTMLElement, onSeen: (label: string) => void): void {',
    '  const record = (event: Event): void => {',
    '    const target = event.target as HTMLElement;',
    '    onSeen(`${event.type}:${target.id}`);',
    '  };',
    '',
    "  page.addEventListener('click', record);",
    "  page.addEventListener('widget-toggle', record);",
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'a click the widget swallows is still audited',
      run: ({ doc, fire, fn, expect }) => {
        const widgetSaw = createRecorder<string>();
        installWidget(doc, widgetSaw);

        const audited = createRecorder<string>();
        fn<AuditEvents>('auditEvents')(requireElement(doc, 'page'), audited.record);

        fire.click(requireElement(doc, 'save-label'));

        // The label inside the button is where the click starts, so that is what `event.target`
        // reports at every listener on the path.
        expect(audited.entries).toEqual(['click:save-label']);
        // The widget's own handler ran: the audit is being compared against a channel proved live
        // in the same dispatch, so an empty audit cannot be a click that never happened.
        expect(widgetSaw.entries).toEqual(['widget']);
      },
    },
    {
      name: 'an event that does not bubble is audited too, wherever in the page it happens',
      run: ({ doc, win, fn, expect }) => {
        const audited = createRecorder<string>();
        fn<AuditEvents>('auditEvents')(requireElement(doc, 'page'), audited.record);

        // `bubbles: false` -- there is no bubbling phase for this event at all, so no listener
        // above the target can ever hear it on the way up. The way down is the only way.
        const toggle = new win.CustomEvent('widget-toggle', { bubbles: false });
        requireElement(doc, 'save').dispatchEvent(toggle);
        // And again from a node with no relationship to the widget. Capturing on `#widget` alone --
        // scoping the fix to the one component known to stop propagation, and letting everything
        // else bubble -- is the natural next step from the starter, and it passes every other test
        // here. It cannot see this one, because the capture pass it registered for is a pass down a
        // path that does not go through `#widget`.
        requireElement(doc, 'reset').dispatchEvent(new win.CustomEvent('widget-toggle', { bubbles: false }));

        expect(audited.entries).toEqual(['widget-toggle:save', 'widget-toggle:reset']);
      },
    },
    {
      name: 'ordinary clicks inside the page are audited; clicks outside it are not',
      run: ({ doc, fire, fn, expect }) => {
        const audited = createRecorder<string>();
        fn<AuditEvents>('auditEvents')(requireElement(doc, 'page'), audited.record);

        fire.click(requireElement(doc, 'reset'));
        fire.click(requireElement(doc, 'intro'));
        // `#footer` is a sibling of `#page`, so this click never passes through it in any phase.
        // Moving the listener up to the document to be even earlier catches this one too, and the
        // scope check that no longer comes for free has to be written by hand.
        fire.click(requireElement(doc, 'feedback'));

        expect(audited.entries).toEqual(['click:reset', 'click:intro']);
      },
    },
    {
      name: 'the audit does not break the widget’s stopPropagation for anyone else',
      run: ({ doc, fire, fn, expect }) => {
        const widgetSaw = createRecorder<string>();
        installWidget(doc, widgetSaw);

        const audited = createRecorder<string>();
        fn<AuditEvents>('auditEvents')(requireElement(doc, 'page'), audited.record);

        // Installed *after* the submitted code, so it is a listener the audit knows nothing about
        // -- exactly like the rest of the page's code. It is entitled to go on not hearing the
        // widget's clicks, so an audit that reaches for `stopImmediatePropagation`, or that tries
        // to re-dispatch the event upward, is caught here rather than in review.
        const pageSaw = createRecorder<string>();
        installPageBubbleListener(doc, pageSaw);

        fire.click(requireElement(doc, 'save'));
        fire.click(requireElement(doc, 'reset'));

        expect(audited.entries).toEqual(['click:save', 'click:reset']);
        expect(widgetSaw.entries).toEqual(['widget']);
        // One entry, from the Reset click. The widget's click never reaches page level bubbling.
        expect(pageSaw.entries).toEqual(['page-bubble']);
      },
    },
    {
      name: 'the widget re-rendering its own contents changes nothing',
      run: ({ doc, fire, fn, expect }) => {
        const widget = requireElement(doc, 'widget');
        const widgetSaw = createRecorder<string>();
        installWidget(doc, widgetSaw);

        const audited = createRecorder<string>();
        fn<AuditEvents>('auditEvents')(requireElement(doc, 'page'), audited.record);

        // The widget replaces its innards, which is what widgets do. Every element that existed
        // when `auditEvents` ran is now detached, and anything that walked the tree and attached a
        // listener per element went with them.
        widget.innerHTML = '<button id="save-again" type="button">Save</button>';
        fire.click(requireElement(doc, 'save-again'));

        expect(audited.entries).toEqual(['click:save-again']);
        expect(widgetSaw.entries).toEqual(['widget']);
      },
    },
  ],
  solutions: [
    {
      label: 'Listen in the capture phase',
      code: [
        'export function auditEvents(page: HTMLElement, onSeen: (label: string) => void): void {',
        '  const record = (event: Event): void => {',
        '    const target = event.target;',
        '    if (target instanceof HTMLElement) onSeen(`${event.type}:${target.id}`);',
        '  };',
        '',
        "  page.addEventListener('click', record, true);",
        "  page.addEventListener('widget-toggle', record, true);",
        '}',
        '',
      ].join('\n'),
      explanation: [
        'A third argument of `true` — or `{ capture: true }` — and the same listener now runs at a',
        'completely different moment.',
        '',
        'Dispatch is **three passes, not one**:',
        '',
        '1. **Capture**, from the window down to the target’s parent. Only listeners registered with',
        '   `capture` run here.',
        '2. **At the target**, where its own listeners run — capture-registered ones first, then the',
        '   rest, each group in registration order.',
        '3. **Bubble**, from the target’s parent back up to the window, if the event bubbles. Only',
        '   listeners registered without `capture` run here.',
        '',
        'Everything this challenge asks for falls out of that shape:',
        '',
        '- **You run before the widget does.** Its handler is on `#widget`, below you, in the bubbling',
        '  pass. Your capture listener on `#page` has already run by the time `stopPropagation()` is',
        '  called, and `stopPropagation` only stops what has not happened yet.',
        '- **You do not break anything.** `stopPropagation` still ends the walk at `#widget`, so the',
        '  page-level bubbling listener still hears nothing — which is what the widget asked for.',
        '- **Non-bubbling events reach you.** `bubbles: false` removes pass 3 and leaves passes 1 and 2',
        '  untouched. The capture pass happens for every event, bubbling or not. This is how a `focus`',
        '  handler can be delegated at all.',
        '- **Re-rendering does not matter.** One listener on a container that stays put, which is',
        '  delegation — capture is a *phase*, not an alternative to delegating.',
      ].join('\n'),
      tradeoffs: [
        'Capture is the minority case and should stay that way. Bubbling is the default because',
        '"innermost thing gets first refusal" is what interfaces usually want: a click on a button',
        'inside a card should be the button’s business first, and only then the card’s.',
        '',
        'Reach for capture when you need one of these three:',
        '',
        '- **To see events something below you will stop.** Auditing, analytics, "close the menu on any',
        '  click", global keyboard shortcuts. Anything that must not be silenceable by a component.',
        '- **To act before the target does** — to normalise an event, to reject an interaction while a',
        '  region is busy, to record a timestamp before any handler has had a chance to be slow.',
        '- **To delegate a non-bubbling event.** `focus`, `blur`, `mouseenter`, `mouseleave` and the',
        '  media events do not bubble. Capture reaches them all. (`focusin` and `focusout` are the',
        '  bubbling twins of the first two, and are usually the clearer answer.)',
        '',
        'The costs are real:',
        '',
        '- **It runs before anything below can be consulted.** A capture listener that calls',
        '  `stopPropagation()` prevents the target’s own handler from running at all — it can break a',
        '  page in a way a bubbling listener cannot.',
        '- **It is easy to miss when reading code.** A `true` at the end of an `addEventListener` call',
        '  is a small thing to hang the whole ordering on; `{ capture: true }` says it out loud and is',
        '  worth the extra characters.',
        '- **Removal must match.** `removeEventListener(type, fn)` does not remove a listener that was',
        '  added with `capture: true` — the flag is part of what identifies the registration, along',
        '  with the type and the function. Getting that wrong leaves a listener you believe is gone.',
      ].join('\n'),
    },
    {
      label: 'One object listener for both types',
      code: [
        'export function auditEvents(page: HTMLElement, onSeen: (label: string) => void): void {',
        '  const auditor: EventListenerObject & { count: number } = {',
        '    count: 0,',
        '    handleEvent(event: Event): void {',
        '      const target = event.target;',
        '      if (!(target instanceof HTMLElement)) return;',
        '      this.count += 1;',
        '      onSeen(`${event.type}:${target.id}`);',
        '    },',
        '  };',
        '',
        "  for (const type of ['click', 'widget-toggle']) {",
        '    page.addEventListener(type, auditor, { capture: true });',
        '  }',
        '}',
        '',
      ].join('\n'),
      explanation: [
        '`addEventListener` does not require a function. It accepts **any object with a `handleEvent`',
        'method**, and calls that method with `this` bound to the object — not to the element.',
        '',
        'That last part is the interesting bit. With a plain function listener, `this` is',
        '`event.currentTarget`, which is why a class method passed directly (`el.addEventListener(',
        '"click", this.onClick)`) loses its object and reads properties off the element instead. An',
        'object listener has no such problem: the listener *is* the state.',
        '',
        'Here it buys a shared counter across both event types without a closure variable, and one',
        'registration identity reused for every type — `{ capture: true }` written once per type',
        'rather than a separate function per type.',
        '',
        'The loop is possible for the same reason: the identity of a registration is the triple',
        '`(type, listener, capture)`, so registering the same object for two types produces two',
        'independent registrations that happen to share an implementation.',
      ].join('\n'),
      tradeoffs: [
        'Reach for an object listener when the handler **has state that belongs with it** — a widget',
        'that tracks a drag, a controller listening for several types at once, anything you would',
        'otherwise write as a closure over several `let`s.',
        '',
        'What it gives you over `fn.bind(this)`, which is the usual answer to the same problem:',
        '',
        '- **A stable identity for removal.** `this.onClick.bind(this)` returns a *new function every',
        '  time it is called*, so the reference you added and the reference you try to remove are',
        '  different objects and the removal silently does nothing. The object listener is the same',
        '  object at add and at remove.',
        '- **Introspectable.** You can read the auditor’s `count` from outside; a closure’s variables',
        '  are unreachable.',
        '',
        'What it costs:',
        '',
        '- **Almost nobody writes them**, so it reads as unfamiliar even though it is as old as',
        '  `addEventListener` itself.',
        '- **`this` is the object, not the element.** That is the point, and it will surprise anyone',
        '  who expected the usual binding. Use `event.currentTarget` for the element.',
        '- **`handleEvent` is looked up at dispatch time**, so reassigning it later changes the',
        '  behaviour of a registration that is already in place — flexible, and a place for a bug to',
        '  hide.',
        '',
        'A third shape worth naming: put the capture listener on the **document** rather than on',
        '`page`, with a `page.contains(event.target)` check. That is the earliest possible point in',
        'the whole dispatch — nothing can intercept it, because the capture pass starts at the window —',
        'and it survives `#page` itself being replaced. It costs you a handler that runs for every',
        'click on the page and a scope check you now have to get right yourself.',
      ].join('\n'),
    },
  ],
};
