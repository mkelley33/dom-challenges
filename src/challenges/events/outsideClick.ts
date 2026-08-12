import type { ChallengeContent } from '@/types/challenge';

import { createRecorder, requireElement } from './support';

type WireMenu = (toggle: HTMLElement, panel: HTMLElement) => void;

/** Reads the menu's state the way the markup expresses it, so a test can say `open` and mean it. */
function isOpen(doc: Document): boolean {
  return !requireElement(doc, 'panel').hasAttribute('hidden');
}

export const outsideClick: ChallengeContent = {
  prompt: [
    'A dropdown menu. Clicking the toggle opens it, clicking the toggle again closes it, and clicking',
    'anywhere else on the page closes it — except inside the menu itself, where the buttons have to',
    'be clickable.',
    '',
    'Export `wireMenu(toggle, panel)`. Open means the panel has no `hidden` attribute; closed means',
    'it has one. The panel starts closed.',
    '',
    'The obvious implementation — open the panel, then start listening on the document for a click',
    'that closes it — produces a menu that opens and shuts in the same instant, and looks from the',
    'outside like the toggle does nothing at all. Working out **why** is the challenge; the starter',
    'is that implementation, with the guard most people add first.',
  ].join('\n'),
  html: [
    '<div id="page">',
    '  <div id="menu">',
    '    <button id="toggle" type="button">Options</button>',
    '    <ul id="panel" hidden>',
    '      <li><button id="rename" type="button">Rename</button></li>',
    '      <li><button id="remove" type="button">Delete</button></li>',
    '    </ul>',
    '  </div>',
    '  <p id="elsewhere">The rest of the page</p>',
    '</div>',
  ].join('\n'),
  starterCode: [
    'export function wireMenu(toggle: HTMLElement, panel: HTMLElement): void {',
    "  toggle.addEventListener('click', () => {",
    "    if (panel.hasAttribute('hidden')) {",
    "      panel.removeAttribute('hidden');",
    "      document.addEventListener('click', (event) => {",
    '        const target = event.target;',
    '        if (target instanceof Node && panel.contains(target)) return;',
    "        panel.setAttribute('hidden', '');",
    '      });',
    '      return;',
    '    }',
    '',
    "    panel.setAttribute('hidden', '');",
    '  });',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'clicking the toggle opens the menu, and it stays open',
      run: ({ doc, fire, fn, expect }) => {
        fn<WireMenu>('wireMenu')(requireElement(doc, 'toggle'), requireElement(doc, 'panel'));

        expect(isOpen(doc)).toBe(false);
        fire.click(requireElement(doc, 'toggle'));

        // Nothing else has happened. If this is false, the menu closed itself during the very click
        // that opened it -- and every listener involved belongs to the submitted code.
        expect(isOpen(doc)).toBe(true);
      },
    },
    {
      name: 'clicking inside the panel leaves it open',
      run: ({ doc, fire, fn, expect }) => {
        fn<WireMenu>('wireMenu')(requireElement(doc, 'toggle'), requireElement(doc, 'panel'));

        fire.click(requireElement(doc, 'toggle'));
        fire.click(requireElement(doc, 'rename'));
        fire.click(requireElement(doc, 'remove'));

        expect(isOpen(doc)).toBe(true);
      },
    },
    {
      name: 'clicking anywhere else closes it',
      run: ({ doc, fire, fn, expect }) => {
        fn<WireMenu>('wireMenu')(requireElement(doc, 'toggle'), requireElement(doc, 'panel'));

        fire.click(requireElement(doc, 'toggle'));
        expect(isOpen(doc)).toBe(true);

        fire.click(requireElement(doc, 'elsewhere'));
        expect(isOpen(doc)).toBe(false);
      },
    },
    {
      name: 'clicking the toggle again closes it, and does not reopen it',
      run: ({ doc, fire, fn, expect }) => {
        fn<WireMenu>('wireMenu')(requireElement(doc, 'toggle'), requireElement(doc, 'panel'));
        const toggle = requireElement(doc, 'toggle');

        fire.click(toggle);
        fire.click(toggle);

        // The closing click reaches the outside-click handler too. Two handlers acting on one
        // click is the other half of this problem, and "closed then reopened" is what it looks
        // like when they disagree about whose job it is.
        expect(isOpen(doc)).toBe(false);
      },
    },
    {
      name: 'the rest of the page still hears every click',
      run: ({ doc, fire, fn, expect }) => {
        const heard = createRecorder<EventTarget | null>();
        // Installed before the wiring, on an ancestor of the whole menu. It stands in for
        // everything else a page does with clicks: analytics, closing other menus, a focus manager.
        //
        // The targets are recorded as themselves and compared with `toBe` one at a time: reading an
        // `id` off them would need an `instanceof Element` written in this realm, which is false for
        // every element the frame built (AGENTS.md §3), and `toEqual` cannot tell two nodes apart.
        requireElement(doc, 'page').addEventListener('click', (event) => heard.record(event.target));

        const toggle = requireElement(doc, 'toggle');
        const rename = requireElement(doc, 'rename');
        const elsewhere = requireElement(doc, 'elsewhere');
        fn<WireMenu>('wireMenu')(toggle, requireElement(doc, 'panel'));

        fire.click(toggle);
        fire.click(rename);
        fire.click(elsewhere);

        // `stopPropagation()` in the toggle's handler is a real fix for the ordering problem, and it
        // buys the fix by making the component hostile to its neighbours. Nothing else on the page
        // ever hears the click that opened the menu.
        expect(heard.entries).toHaveLength(3);
        expect(heard.entries[0]).toBe(toggle);
        expect(heard.entries[1]).toBe(rename);
        expect(heard.entries[2]).toBe(elsewhere);
      },
    },
    {
      name: 'it can be opened again after an outside click closed it',
      run: ({ doc, fire, fn, expect }) => {
        fn<WireMenu>('wireMenu')(requireElement(doc, 'toggle'), requireElement(doc, 'panel'));
        const toggle = requireElement(doc, 'toggle');
        const elsewhere = requireElement(doc, 'elsewhere');

        fire.click(toggle);
        fire.click(elsewhere);
        expect(isOpen(doc)).toBe(false);

        // Second time round, and the third. Anything that got the first open right by remembering
        // that this was the first open -- a "just opened" flag that is never cleared, a listener
        // installed once and never replaced -- comes apart here.
        fire.click(toggle);
        expect(isOpen(doc)).toBe(true);

        fire.click(elsewhere);
        fire.click(toggle);
        fire.click(requireElement(doc, 'rename'));
        expect(isOpen(doc)).toBe(true);
      },
    },
  ],
  solutions: [
    {
      label: 'Listen once, at wiring time, and ask where the click was',
      code: [
        'export function wireMenu(toggle: HTMLElement, panel: HTMLElement): void {',
        '  const close = (): void => {',
        "    panel.setAttribute('hidden', '');",
        '  };',
        '',
        "  toggle.addEventListener('click', () => {",
        "    if (panel.hasAttribute('hidden')) panel.removeAttribute('hidden');",
        '    else close();',
        '  });',
        '',
        "  document.addEventListener('click', (event) => {",
        '    const target = event.target;',
        '    if (!(target instanceof Node)) return;',
        '    if (panel.contains(target) || toggle.contains(target)) return;',
        '',
        '    close();',
        '  });',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The bug in the starter is not the guard. It is **when the listener was added.**',
        '',
        'A click on the toggle is one dispatch that visits a whole path of objects: the window, the',
        'document, and every element down to the toggle, then all the way back up. When the toggle’s own',
        'handler runs, the event **has not reached the document yet** — the bubbling pass still has to',
        'climb back out. And a listener added to an object the event has not visited yet *is* called',
        'when it gets there, because each object’s listener list is read at the moment the event',
        'arrives, not when dispatch began.',
        '',
        'So the starter opens the menu, registers a closer on the document, and then the same click',
        'carries on upward and runs it. The menu is open for about a microsecond. Nothing errors,',
        'nothing logs, and the toggle appears to be broken.',
        '',
        'The starter’s guard does not save it because it asks the wrong question: the click was on the',
        '**toggle**, which is not inside the panel. Adding `toggle.contains(target)` fixes that one case',
        'and leaves the ordering trap in place for every other way of opening the menu — a keyboard',
        'shortcut, a hover, another button.',
        '',
        'This version sidesteps all of it. One document listener, registered once, before any click',
        'exists. It runs for every click in the page and answers a single question — "was this click',
        'inside the menu?" — and the answer for the opening click is yes, because the toggle is part of',
        'the menu. `Node.contains` returns `true` for the node itself, which is what makes',
        '`toggle.contains(target)` cover both the toggle and the text inside it.',
      ].join('\n'),
      tradeoffs: [
        'A permanent listener is the right default for a component that is wired once and lives for the',
        'life of the page: nothing to add, nothing to remove, no ordering to reason about, and one',
        'cheap containment check per click.',
        '',
        'The cost is that it runs whether the menu is open or not, and it is a **document** listener,',
        'so it holds `panel` and `toggle` alive for as long as it is registered. Ten menus is ten',
        'listeners running on every click in the page. Where that matters — a long list of row menus, a',
        'canvas app where clicks are hot — register on open and remove on close, and then the ordering',
        'problem is back and has to be solved deliberately:',
        '',
        '- **add the listener in the capture phase.** By the time the toggle’s handler runs, the',
        '  document’s capture pass is already over, so a capture listener added now will not see this',
        '  click. It sees the next one.',
        '- **defer past the current dispatch** with `setTimeout(..., 0)` or `queueMicrotask`. Dispatch',
        '  is synchronous, so anything scheduled from a handler runs after the whole event is done.',
        '  Cheap, and it makes the wiring asynchronous, which is a real cost in tests.',
        '- **ignore the event that opened you.** Keep the opening event object and compare',
        '  (`if (event === openedBy) return;`). Precise, and it needs the opening code to hand the',
        '  event over.',
        '',
        'One more that is worth ruling out explicitly: calling `stopPropagation()` in the toggle’s',
        'handler so the click never reaches the document. It works, and it breaks everything else on',
        'the page that legitimately listens for clicks — analytics, "close other menus", a focus',
        'manager. It fixes your component by making it hostile to its neighbours.',
      ].join('\n'),
    },
    {
      label: 'Attach on open, remove on close, in the capture phase',
      code: [
        'export function wireMenu(toggle: HTMLElement, panel: HTMLElement): void {',
        '  const onDocumentClick = (event: Event): void => {',
        '    const target = event.target;',
        '    if (target instanceof Node && (panel.contains(target) || toggle.contains(target))) return;',
        '',
        '    close();',
        '  };',
        '',
        '  function close(): void {',
        "    panel.setAttribute('hidden', '');",
        "    document.removeEventListener('click', onDocumentClick, true);",
        '  }',
        '',
        "  toggle.addEventListener('click', () => {",
        "    if (!panel.hasAttribute('hidden')) {",
        '      close();',
        '      return;',
        '    }',
        '',
        "    panel.removeAttribute('hidden');",
        '    // Capture: the document’s downward pass for *this* click is already over, so this',
        '    // listener starts working from the next click onward.',
        "    document.addEventListener('click', onDocumentClick, true);",
        '  });',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The listener now exists only while the menu is open, and the ordering problem is solved by',
        '**which pass it registers for** rather than by a guard.',
        '',
        'A dispatch visits the document twice: once on the way down, running only capture listeners,',
        'and once on the way up, running only the rest. The toggle’s handler runs at the target, in',
        'between. So at that moment the document’s capture pass has already happened and its bubbling',
        'pass has not — which means a **capture** listener added here is added to a pass that is over,',
        'and a **bubbling** listener is added to one that is still coming.',
        '',
        'That is the whole fix, and it is worth knowing because it generalises: "will a listener I add',
        'right now see the event I am handling?" is answered by where that listener sits on the path',
        'relative to where you are.',
        '',
        'The containment guard is still here, and still needed — it is what keeps clicks *inside* the',
        'menu from closing it. Solving the ordering did not make it redundant; the starter’s mistake was',
        'thinking the guard would solve the ordering.',
        '',
        '`close()` is a function declaration rather than a `const`, so `onDocumentClick` can call it',
        'from above where it is defined. The removal has to name the same capture flag it was added',
        'with — the flag is part of a registration’s identity, so `removeEventListener` without it',
        'removes nothing at all.',
      ].join('\n'),
      tradeoffs: [
        'Prefer this when the menu is one of many, or when it is genuinely transient: no listener runs',
        'while the menu is closed, and the document holds no reference to a closed menu at all.',
        '',
        'What you take on:',
        '',
        '- **Every close path must go through `close()`.** Escape, a menu item being chosen, the',
        '  component unmounting, the route changing. Miss one and the listener outlives the menu; a',
        '  signal (`AbortController`) is the usual way to make that hard to get wrong.',
        '- **The capture trick is invisible.** `true` at the end of an `addEventListener` call is a very',
        '  small thing for the correctness of the component to depend on. It needs the comment.',
        '- **Capture means you run before everything below you**, including handlers inside the panel.',
        '  Harmless here because the guard returns early, and something to know if the handler ever does',
        '  more than close.',
        '',
        'And it is worth being honest about what this challenge cannot check. No test here can tell a',
        'listener that was removed from one that was left registered and returns early — from outside,',
        'they are identical. That is exactly why the leak is worth thinking about rather than testing',
        'for: the only evidence is a profiler, or a page that gets slower the longer it is open.',
      ].join('\n'),
    },
  ],
};
