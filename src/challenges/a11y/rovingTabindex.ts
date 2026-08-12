import type { ChallengeContent } from '@/types/challenge';

/**
 * Local rather than in a `support.ts` because this category has one challenge -- a helper shared
 * between two of them earns its own file, one used by a single challenge belongs beside it.
 */
function requireElement(doc: Document, id: string): HTMLElement {
  const element = doc.getElementById(id);
  if (!element) throw new Error(`#${id} is missing from the challenge markup`);
  return element;
}

function tabs(doc: Document): HTMLElement[] {
  return [...requireElement(doc, 'tabs').querySelectorAll<HTMLElement>('[role="tab"]')];
}

function panels(doc: Document): HTMLElement[] {
  return [...doc.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
}

/** The ids of the tabs whose `aria-selected` is `"true"`, so "exactly one" is assertable. */
function selectedIds(doc: Document): string[] {
  return tabs(doc)
    .filter((tab) => tab.getAttribute('aria-selected') === 'true')
    .map((tab) => tab.id);
}

/** The ids of the tabs a Tab keypress would stop on. */
function tabbableIds(doc: Document): string[] {
  return tabs(doc)
    .filter((tab) => tab.tabIndex === 0)
    .map((tab) => tab.id);
}

function visiblePanelIds(doc: Document): string[] {
  return panels(doc)
    .filter((panel) => !panel.hidden)
    .map((panel) => panel.id);
}

type WireTabs = (tablist: HTMLElement) => void;

interface KeyContext {
  doc: Document;
  fire: { keydown(target: Element, key: string, init?: KeyboardEventInit): void };
}

/**
 * Presses a key on whatever currently has focus, and reports whether the widget claimed it.
 *
 * The watcher is on the **document**, so it runs after any listener the submitted code put on the
 * tablist or on a tab whichever of those it chose, and it throws when the key never arrived --
 * so `prevented: false` can only mean "the widget ignored this key" and never "the keypress went
 * nowhere". AGENTS.md §5: a negative needs a live channel proved at the same moment.
 */
function pressKey(ctx: KeyContext, key: string): boolean {
  const focused = ctx.doc.activeElement;
  if (!focused) throw new Error('nothing has focus, so there is nothing to press a key on');

  let called = false;
  let prevented = false;
  const listener = (event: Event): void => {
    called = true;
    prevented = event.defaultPrevented;
  };

  ctx.doc.addEventListener('keydown', listener);
  ctx.fire.keydown(focused, key);
  ctx.doc.removeEventListener('keydown', listener);

  if (!called) throw new Error(`the "${key}" keydown never reached the document`);
  return prevented;
}

export const rovingTabindex: ChallengeContent = {
  prompt: [
    'A tablist, wired up in markup but dead to the keyboard. Export `wireTabs(tablist)`, which adds a',
    '`keydown` listener **to the tablist** and makes the arrow keys work:',
    '',
    '- `ArrowRight` selects the next tab, `ArrowLeft` the previous, and both **wrap** around the ends.',
    '- `Home` selects the first tab, `End` the last.',
    '- Any other key is left alone, defaults and all.',
    '',
    'Selecting a tab means four things at once:',
    '',
    '1. it gets `aria-selected="true"` and every other tab gets `"false"`;',
    '2. it becomes the **only** tab with `tabindex="0"` — the others get `-1`;',
    '3. it takes focus;',
    '4. the panel named by its `aria-controls` is shown and the other panels are hidden.',
    '',
    'Point 2 is the one that gets forgotten, and nothing on screen looks wrong when it is: the arrows',
    'work, the right panel shows, and the widget has quietly grown one extra Tab stop for every tab',
    'the user has ever visited.',
  ].join('\n'),
  html: [
    '<div id="tabs" role="tablist" aria-label="Report sections">',
    '  <button id="tab-overview" type="button" role="tab" aria-selected="true" aria-controls="panel-overview" tabindex="0">Overview</button>',
    '  <button id="tab-detail" type="button" role="tab" aria-selected="false" aria-controls="panel-detail" tabindex="-1">Detail</button>',
    '  <button id="tab-history" type="button" role="tab" aria-selected="false" aria-controls="panel-history" tabindex="-1">History</button>',
    '</div>',
    '<div id="panel-overview" role="tabpanel">Overview content</div>',
    '<div id="panel-detail" role="tabpanel" hidden>Detail content</div>',
    '<div id="panel-history" role="tabpanel" hidden>History content</div>',
  ].join('\n'),
  starterCode: [
    'export function wireTabs(tablist: HTMLElement): void {',
    "  tablist.addEventListener('keydown', (event) => {",
    '    // ArrowRight, ArrowLeft, Home and End move the selection.',
    '  });',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'ArrowRight moves the selection, the focus and the visible panel together',
      run: ({ doc, fire, fn, expect }) => {
        fn<WireTabs>('wireTabs')(requireElement(doc, 'tabs'));
        requireElement(doc, 'tab-overview').focus();

        expect(pressKey({ doc, fire }, 'ArrowRight')).toBe(true);

        expect(doc.activeElement).toBe(requireElement(doc, 'tab-detail'));
        expect(selectedIds(doc)).toEqual(['tab-detail']);
        expect(visiblePanelIds(doc)).toEqual(['panel-detail']);
      },
    },
    {
      name: 'exactly one tab stays in the tab order, however many have been visited',
      run: ({ doc, fire, fn, expect }) => {
        fn<WireTabs>('wireTabs')(requireElement(doc, 'tabs'));
        requireElement(doc, 'tab-overview').focus();

        pressKey({ doc, fire }, 'ArrowRight');
        pressKey({ doc, fire }, 'ArrowRight');

        // The whole point of a roving tabindex: a composite widget is **one** stop in the page's Tab
        // order, and the arrows move within it. Setting `0` on the new tab without setting `-1` on
        // the old one is invisible on screen and adds a stop per visit.
        expect(tabbableIds(doc)).toEqual(['tab-history']);
      },
    },
    {
      name: 'the arrows wrap around both ends',
      run: ({ doc, fire, fn, expect }) => {
        fn<WireTabs>('wireTabs')(requireElement(doc, 'tabs'));
        requireElement(doc, 'tab-history').focus();

        // Clamping instead of wrapping passes every other test in this file.
        pressKey({ doc, fire }, 'ArrowRight');
        expect(selectedIds(doc)).toEqual(['tab-overview']);

        pressKey({ doc, fire }, 'ArrowLeft');
        expect(selectedIds(doc)).toEqual(['tab-history']);
        expect(doc.activeElement).toBe(requireElement(doc, 'tab-history'));
      },
    },
    {
      name: 'Home and End jump to the ends',
      run: ({ doc, fire, fn, expect }) => {
        fn<WireTabs>('wireTabs')(requireElement(doc, 'tabs'));
        requireElement(doc, 'tab-detail').focus();

        expect(pressKey({ doc, fire }, 'End')).toBe(true);
        expect(selectedIds(doc)).toEqual(['tab-history']);
        expect(tabbableIds(doc)).toEqual(['tab-history']);

        expect(pressKey({ doc, fire }, 'Home')).toBe(true);
        expect(selectedIds(doc)).toEqual(['tab-overview']);
        expect(visiblePanelIds(doc)).toEqual(['panel-overview']);
      },
    },
    {
      name: 'a key the widget does not handle is left alone, defaults and all',
      run: ({ doc, fire, fn, expect }) => {
        fn<WireTabs>('wireTabs')(requireElement(doc, 'tabs'));
        requireElement(doc, 'tab-overview').focus();

        // The negative, and then the control for it: `ArrowDown` in a horizontal tablist belongs to
        // the page, and `preventDefault`-ing every key is how a widget eats the user's scrolling. The
        // ArrowRight below proves the listener was live across the same moment, so "not prevented"
        // means "declined" rather than "never ran".
        expect(pressKey({ doc, fire }, 'ArrowDown')).toBe(false);
        expect(selectedIds(doc)).toEqual(['tab-overview']);
        expect(doc.activeElement).toBe(requireElement(doc, 'tab-overview'));

        expect(pressKey({ doc, fire }, 'ArrowRight')).toBe(true);
        expect(selectedIds(doc)).toEqual(['tab-detail']);
      },
    },
  ],
  solutions: [
    {
      label: 'Rove the tabindex across an indexed list',
      code: [
        'export function wireTabs(tablist: HTMLElement): void {',
        '  const tabs = [...tablist.querySelectorAll<HTMLElement>(\'[role="tab"]\')];',
        '',
        '  function select(index: number): void {',
        '    tabs.forEach((tab, position) => {',
        '      const chosen = position === index;',
        "      tab.setAttribute('aria-selected', String(chosen));",
        '      tab.tabIndex = chosen ? 0 : -1;',
        '',
        "      const panelId = tab.getAttribute('aria-controls');",
        '      const panel = panelId ? document.getElementById(panelId) : null;',
        '      if (panel) panel.hidden = !chosen;',
        '    });',
        '',
        '    tabs[index]?.focus();',
        '  }',
        '',
        "  tablist.addEventListener('keydown', (event) => {",
        '    const current = tabs.findIndex((tab) => tab === event.target);',
        '    if (current === -1) return;',
        '',
        '    const last = tabs.length - 1;',
        '    const next =',
        "      event.key === 'ArrowRight' ? (current + 1) % tabs.length",
        "      : event.key === 'ArrowLeft' ? (current - 1 + tabs.length) % tabs.length",
        "      : event.key === 'Home' ? 0",
        "      : event.key === 'End' ? last",
        '      : -1;',
        '',
        '    if (next === -1) return;',
        '',
        '    event.preventDefault();',
        '    select(next);',
        '  });',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'A composite widget — tabs, a menu, a toolbar, a grid — is **one** stop in the page’s Tab order,',
        'and the arrow keys move inside it. That is the roving tabindex: exactly one descendant has',
        '`tabindex="0"` at any moment, every other has `-1`, and selecting moves the `0` along with the',
        'focus. Tab therefore enters the widget once and leaves it once, however many tabs there are.',
        '',
        '`tabindex="-1"` does not mean "not focusable". It means "not in the sequential order, but',
        '`.focus()` still works" — which is exactly the pair of properties this pattern needs.',
        '',
        'Rewriting every tab on every move, rather than patching the two that changed, is the reason',
        'the widget cannot drift. The forgotten `-1` is not a possible bug here because there is no',
        'branch that could forget it: each tab is told what it is, every time. The state on screen is a',
        'function of `index`, and that is worth more than the three assignments it saves.',
        '',
        '`aria-selected` is the state a screen reader announces — "Detail, tab, 2 of 3, selected" — and',
        'it is not implied by focus. A tablist where focus moves and `aria-selected` does not is a',
        'widget that looks right and reads wrong.',
        '',
        '`aria-controls` points at the panel, so the DOM already knows which panel belongs to which tab',
        'and nothing has to be hardcoded. `panel.hidden` is the plain way to show one: it is a real',
        'attribute with real semantics, and unlike a `.visually-hidden` class it takes the panel out of',
        'the accessibility tree and out of the focus order along with it.',
        '',
        '`preventDefault()` only on the keys the widget claims. Arrow keys scroll the page, `Home` and',
        '`End` jump to its ends, and a widget that cancels every keydown takes all of that away from',
        'the user — including keys assistive technology is using for something else.',
        '',
        'The modulo arithmetic is where the wrap lives. `(current - 1 + length) % length` rather than',
        '`(current - 1) % length` because JavaScript’s `%` keeps the sign of the left operand, so the',
        'shorter version gives `-1` at the first tab and the wrap silently becomes a crash.',
      ].join('\n'),
      tradeoffs: [
        'Indexing a snapshot of `[role="tab"]` is robust to the tablist containing other things —',
        'separators, a wrapper element, a stray whitespace node — because it selects the tabs rather',
        'than assuming everything in there is one.',
        '',
        'The snapshot is the cost: `querySelectorAll` is static, so a tab added later is invisible to',
        'this listener. Re-querying inside the handler fixes it at the price of a query per keypress,',
        'which is nothing at this size and worth measuring at a thousand.',
        '',
        'Two design decisions this code makes that the ARIA Authoring Practices treat as a real fork:',
        '',
        '- **Selection follows focus.** Moving the arrow key selects, which is right when switching is',
        '  free. When a panel is expensive — a fetch, a chart — decouple them: the arrows move focus and',
        '  `tabindex` only, and `Enter`/`Space` selects. Otherwise arrowing from the first tab to the',
        '  fourth fires three panels nobody asked for.',
        '- **A roving tabindex, not `aria-activedescendant`.** The other pattern keeps DOM focus on the',
        '  container and points at the active item with `aria-activedescendant`. It suits very long',
        '  lists (a combobox’s options) because nothing moves focus per keystroke, and it costs you',
        '  `:focus` styling on the item, since the item never actually has focus.',
      ].join('\n'),
    },
    {
      label: 'Walk the siblings instead',
      code: [
        'export function wireTabs(tablist: HTMLElement): void {',
        '  function select(tab: Element | null): void {',
        '    if (!(tab instanceof HTMLElement)) return;',
        '',
        '    for (const other of tablist.children) {',
        '      if (!(other instanceof HTMLElement)) continue;',
        '',
        '      const chosen = other === tab;',
        "      other.setAttribute('aria-selected', String(chosen));",
        '      other.tabIndex = chosen ? 0 : -1;',
        '',
        "      const panelId = other.getAttribute('aria-controls');",
        '      const panel = panelId ? document.getElementById(panelId) : null;',
        '      if (panel) panel.hidden = !chosen;',
        '    }',
        '',
        '    tab.focus();',
        '  }',
        '',
        "  tablist.addEventListener('keydown', (event) => {",
        '    const current = event.target;',
        '    if (!(current instanceof HTMLElement) || current.parentElement !== tablist) return;',
        '',
        '    switch (event.key) {',
        "      case 'ArrowRight':",
        '        event.preventDefault();',
        '        select(current.nextElementSibling ?? tablist.firstElementChild);',
        '        break;',
        "      case 'ArrowLeft':",
        '        event.preventDefault();',
        '        select(current.previousElementSibling ?? tablist.lastElementChild);',
        '        break;',
        "      case 'Home':",
        '        event.preventDefault();',
        '        select(tablist.firstElementChild);',
        '        break;',
        "      case 'End':",
        '        event.preventDefault();',
        '        select(tablist.lastElementChild);',
        '        break;',
        '      default:',
        '        break;',
        '    }',
        '  });',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The same widget, navigated by the DOM rather than by an index. `nextElementSibling` is the',
        'next tab, and `?? firstElementChild` is the wrap — the nullish coalescing reads as "or round',
        'to the start", which is closer to the sentence in the spec than modulo arithmetic is.',
        '',
        '`nextElementSibling` rather than `nextSibling`: the whitespace between two buttons in the',
        'markup is a text node, and `nextSibling` finds it. Every `*ElementSibling` and',
        '`*ElementChild` accessor exists precisely to skip that.',
        '',
        'The `switch` on `event.key` is worth preferring to a chain of conditionals once there are more',
        'than two or three keys, and `event.key` is the property to use: it is the character or named',
        'key the user produced, so it works on any layout. `event.keyCode` is deprecated, and',
        '`event.code` is the physical key position, which is what a game wants and not what a text',
        'widget does.',
        '',
        'The guard is different too. Rather than looking the target up in a list, it asks whether the',
        'event came from a direct child of the tablist — which is what makes the sibling walk valid in',
        'the first place.',
      ].join('\n'),
      tradeoffs: [
        'Read this next to the first version and the difference is one assumption: **every element',
        'child of the tablist is a tab.** Where that holds, this is the simpler code — nothing is',
        'snapshotted, so a tab added at run time just works, and there is no index to keep in step.',
        '',
        'Where it stops holding, it fails quietly. Put a separator, a "+" button or a wrapper `<div>` in',
        'the tablist and `ArrowRight` selects the separator: it gets `aria-selected="true"` and',
        '`tabindex="0"`, focus lands on something that is not a tab, and no error is raised anywhere.',
        'The first version selects `[role="tab"]`, so the same markup change does nothing to it.',
        '',
        'That is the general shape of the tradeoff, and it is worth naming beyond this widget:',
        'structural navigation (`nextElementSibling`, `children`) is shorter and couples you to the',
        'markup’s shape; semantic selection (`[role="tab"]`) is more code and couples you to the',
        'markup’s meaning. Meaning changes less often.',
        '',
        'A note on writing ARIA state: `setAttribute("aria-selected", ...)` is what you will find in',
        'every existing codebase and works everywhere. Modern browsers also reflect these as IDL',
        'properties — `tab.ariaSelected = "true"` is the same attribute — which is tidier to read and',
        'which some non-browser DOM implementations (jsdom, happy-dom) do not implement, so a test',
        'suite can disagree with a browser about it.',
      ].join('\n'),
    },
  ],
};
