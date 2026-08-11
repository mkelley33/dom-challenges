import type { ChallengeContent } from '@/types/challenge';

/** The text `#snippet-1` carries, after the HTML parser has decoded its attribute. */
const FIRST_CODE = 'a && b < c';

/** What that text has to look like once it is inside an HTML document rather than beside one. */
const FIRST_HTML = '<code>a &amp;&amp; b &lt; c</code>';

const SECOND_CODE = 'rows.filter(fresh)';

function requireElement(doc: Document, id: string): HTMLElement {
  const element = doc.getElementById(id);
  if (!element) throw new Error(`#${id} is missing from the challenge markup`);
  return element;
}

/**
 * A `copy` event carrying its own `DataTransfer`, dispatched from wherever the test says the copy
 * began.
 *
 * The event is the test's, not the learner's, and that is what makes the challenge unskippable: the
 * submitted code never chooses the target, never constructs the event, and cannot tell a copy that
 * started on a snippet from one that started outside without asking the event.
 *
 * `win.ClipboardEvent` and `win.DataTransfer` rather than the bare globals -- these are built for
 * code running in the host's realm, and the app's constructors are different class objects. See
 * AGENTS.md §3.
 */
function dispatchCopy(
  win: Window & typeof globalThis,
  from: Element,
): { data: DataTransfer; defaultPrevented: boolean } {
  const data = new win.DataTransfer();
  const event = new win.ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true });
  from.dispatchEvent(event);

  return { data, defaultPrevented: event.defaultPrevented };
}

export const copyHandler: ChallengeContent = {
  prompt: [
    'Copy a line of code out of a documentation page and you often get the line numbers, the prompt',
    'character, and none of the formatting. A `copy` listener fixes that: the page decides what lands',
    'on the clipboard instead of the browser copying the raw selection.',
    '',
    'Export `installCopyHandler(root)`, which listens for `copy` on `root`. When a copy begins **inside**',
    'a `.snippet`, put that snippet’s `data-code` on the clipboard in two flavours:',
    '',
    '- `text/plain` — the code exactly as the attribute holds it;',
    '- `text/html` — the same code wrapped in a `<code>` element, so pasting into a rich-text editor',
    '  keeps it monospaced. It is HTML, so the code has to be **escaped**: `a && b < c` is not valid',
    '  markup, and pasting it raw is an injection into somebody else’s document.',
    '',
    'Then call `preventDefault()`. Without it the browser writes the selection over everything you just',
    'set, and the handler that looks like it works does nothing at all.',
    '',
    'A copy that did **not** begin inside a `.snippet` must be left completely alone — nothing written,',
    'nothing prevented. The copy can begin on any node inside a snippet, not just the snippet itself,',
    'and the `.snippet` outside `#article` is not yours to handle.',
    '',
    'The test builds the `copy` event and its `DataTransfer`, dispatches it from a node of its choosing,',
    'and then reads what you wrote.',
  ].join('\n'),
  html: [
    '<article id="article">',
    '  <p id="intro">Copy a snippet and it should arrive as code.</p>',
    '  <pre class="snippet" id="snippet-1" data-code="a &amp;&amp; b &lt; c"><code>a &amp;&amp; b &lt; c</code></pre>',
    '  <pre class="snippet" id="snippet-2" data-code="rows.filter(fresh)"><code><span id="token">rows</span>.filter(fresh)</code></pre>',
    '</article>',
    '<pre class="snippet" id="stray" data-code="not part of the article"><code>not part of the article</code></pre>',
  ].join('\n'),
  starterCode: [
    'export function installCopyHandler(root: HTMLElement): void {',
    "  root.addEventListener('copy', (event) => {",
    '    // Fires for every copy, writes the wrong thing, and never prevents the default.',
    "    event.clipboardData?.setData('text/plain', 'TODO');",
    '  });',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'copying a snippet writes both flavours and prevents the default',
      run: ({ doc, expect, fn, win }) => {
        fn<(root: HTMLElement) => void>('installCopyHandler')(requireElement(doc, 'article'));

        const { data, defaultPrevented } = dispatchCopy(win, requireElement(doc, 'snippet-1'));

        expect(data.getData('text/plain')).toBe(FIRST_CODE);
        // A template string built without escaping produces `<code>a && b < c</code>`, which is both
        // wrong markup and the injection this flavour is a sink for.
        expect(data.getData('text/html')).toBe(FIRST_HTML);
        // The assertion a handler that "obviously works" fails: everything above can be correct and
        // the browser still overwrites all of it with the raw selection.
        expect(defaultPrevented).toBe(true);
      },
    },
    {
      name: 'a copy that begins deeper inside a snippet uses that snippet',
      run: ({ doc, expect, fn, win }) => {
        fn<(root: HTMLElement) => void>('installCopyHandler')(requireElement(doc, 'article'));

        // `#token` is a span inside the *second* snippet. A handler comparing `event.target` against
        // the snippet finds nothing here, and one that hard-codes the first snippet answers with the
        // wrong code.
        const { data, defaultPrevented } = dispatchCopy(win, requireElement(doc, 'token'));

        expect(data.getData('text/plain')).toBe(SECOND_CODE);
        expect(data.getData('text/html')).toBe(`<code>${SECOND_CODE}</code>`);
        expect(defaultPrevented).toBe(true);
      },
    },
    {
      name: 'a copy outside any snippet is left alone',
      run: ({ doc, expect, fn, win }) => {
        fn<(root: HTMLElement) => void>('installCopyHandler')(requireElement(doc, 'article'));

        const { data, defaultPrevented } = dispatchCopy(win, requireElement(doc, 'intro'));

        // An empty `DataTransfer` reports `''` for a flavour nothing wrote, in both hosts.
        expect(data.getData('text/plain')).toBe('');
        expect(data.getData('text/html')).toBe('');
        expect(defaultPrevented).toBe(false);
      },
    },
    {
      name: 'a snippet outside the given root is not handled',
      run: ({ doc, expect, fn, win }) => {
        fn<(root: HTMLElement) => void>('installCopyHandler')(requireElement(doc, 'article'));

        // `#stray` is a real `.snippet` with a real `data-code`, sitting outside `#article`. A
        // listener on `document` rather than on `root` handles it and fails here; a listener on
        // `root` never sees the event at all.
        const { data, defaultPrevented } = dispatchCopy(win, requireElement(doc, 'stray'));

        expect(data.getData('text/plain')).toBe('');
        expect(defaultPrevented).toBe(false);
      },
    },
  ],
  solutions: [
    {
      label: 'Delegate on root, escape by hand',
      code: [
        'function escapeHtml(text: string): string {',
        '  return text',
        "    .replaceAll('&', '&amp;')",
        "    .replaceAll('<', '&lt;')",
        "    .replaceAll('>', '&gt;');",
        '}',
        '',
        'export function installCopyHandler(root: HTMLElement): void {',
        "  root.addEventListener('copy', (event) => {",
        '    const { target } = event;',
        '    if (!(target instanceof Element)) return;',
        '',
        "    const snippet = target.closest('.snippet');",
        '    if (!snippet) return;',
        '',
        "    const code = snippet.getAttribute('data-code');",
        '    const data = event.clipboardData;',
        '    if (code === null || data === null) return;',
        '',
        "    data.setData('text/plain', code);",
        "    data.setData('text/html', `<code>${escapeHtml(code)}</code>`);",
        '    event.preventDefault();',
        '  });',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'Three things have to line up, and each one is a way for this to look right and be wrong.',
        '',
        '**`closest`, not `event.target`.** The copy begins wherever the selection did — a `<span>`',
        'inside the `<code>` inside the `<pre>`. `target === snippet` is true only for a copy that',
        'started on the snippet element itself, which is the case you will test by hand and not the one',
        'users produce. `closest` walks up from the target and answers "which snippet is this inside",',
        'which is the actual question. Returning early when it finds nothing is what leaves an ordinary',
        'copy alone.',
        '',
        '**`preventDefault()`.** Writing to `clipboardData` does not replace the copy; it *proposes* a',
        'replacement. The default action still runs and still puts the selection on the clipboard,',
        'overwriting everything you set. This is the bug that survives review, because the handler is',
        'plainly doing the right work and the clipboard plainly contains the wrong thing.',
        '',
        '**Escaping.** `text/html` is pasted into another document — an email, a doc, a rich-text',
        'field — and whatever you put there is parsed as markup by the application receiving it. The',
        'code here contains `&` and `<`, so unescaped it is malformed at best and an injection into',
        'somebody else’s page at worst.',
        '',
        'The order inside `escapeHtml` is load-bearing: `&` must be replaced first. Do `<` first and the',
        '`&` in the `&lt;` you just produced gets escaped again, giving `&amp;lt;` — the classic',
        'double-escaping bug, and it shows up as visible entity text rather than as a crash.',
        '',
        '`clipboardData` is typed `DataTransfer | null` because it genuinely is `null` for some events,',
        'and `instanceof Element` on `event.target` narrows an `EventTarget` that could be anything.',
        'Both checks are for real cases rather than for the compiler.',
      ].join('\n'),
      tradeoffs: [
        'The `copy` event is the right tool for "change what copying produces", and it is worth knowing',
        'why it has not been replaced by something newer.',
        '',
        '`navigator.clipboard.writeText()` is the modern clipboard API and it solves a different',
        'problem: "put this on the clipboard because a button was pressed". It cannot help here, and it',
        'is much more constrained than it looks — it requires the document to be **focused** and',
        'rejects with `NotAllowedError` if it is not, writing needs transient activation from a real',
        'user gesture, *reading* needs a permission prompt, and inside a cross-origin iframe it needs a',
        '`clipboard-write` permission policy. A `copy` handler needs none of that, because the user',
        'already asked to copy — which is exactly why the event still exists.',
        '',
        'The hand-rolled escaper is the weak point. It covers the three characters that matter **in',
        'element content** and nothing else: put the same string inside an attribute and you also need',
        '`"` and `\'`, and the function gives you no warning. It is fine when the output shape is fixed',
        'and visible, as it is here, and it is the wrong habit to carry to a general-purpose template.',
        '',
        'Two more flavours worth remembering. Setting `text/plain` alone is a perfectly good handler —',
        'most targets prefer it, and adding `text/html` only matters where formatting survives. And a',
        'custom MIME type (`web application/x-my-app`) lets your own app round-trip real structure',
        'through a paste while other applications still get readable text.',
      ].join('\n'),
    },
    {
      label: 'Let the DOM do the escaping',
      code: [
        'export function installCopyHandler(root: HTMLElement): void {',
        "  root.addEventListener('copy', (event) => {",
        '    const { target } = event;',
        '    if (!(target instanceof Element)) return;',
        '',
        "    const snippet = target.closest('.snippet');",
        '    if (!snippet) return;',
        '',
        "    const code = snippet.getAttribute('data-code');",
        '    const data = event.clipboardData;',
        '    if (code === null || data === null) return;',
        '',
        "    const wrapper = document.createElement('code');",
        '    wrapper.textContent = code;',
        '',
        "    data.setData('text/plain', code);",
        "    data.setData('text/html', wrapper.outerHTML);",
        '    event.preventDefault();',
        '  });',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The same handler with the escaping delegated to the thing that already knows how to do it.',
        '',
        '`textContent` takes a string and produces a text node — it never parses markup, so `<` is just',
        'a character. `outerHTML` then serialises that element back to HTML, and serialising a text node',
        'is where the escaping happens: `&` becomes `&amp;`, `<` becomes `&lt;`, `>` becomes `&gt;`.',
        'Set the text, read the markup, and you get correctly escaped HTML without having written an',
        'escaper.',
        '',
        'It is correct by construction rather than by review. There is no ordering to get right, no',
        'character to forget, and no way for it to drift as the content changes — the serialiser',
        'escapes whatever needs escaping because that is its job.',
        '',
        'The wrapper element is never inserted into the document. `createElement` gives you a real',
        'element that simply has no parent; nothing renders, nothing is measured, and it is garbage',
        'immediately after `outerHTML` reads it.',
      ].join('\n'),
      tradeoffs: [
        'Prefer this one. The general principle is worth more than the handler: **when you need escaped',
        'HTML, build the node and serialise it, rather than concatenating a string and escaping it.**',
        'One direction is safe by default and the other is safe by remembering.',
        '',
        'The cost is an element allocation per copy, which is nothing at this rate and would be worth',
        'measuring if you were serialising thousands of rows in a loop — at which point the answer is a',
        '`DocumentFragment` built once, not a hand-written escaper.',
        '',
        'Two real limits. It needs a `document`, so it does not work unchanged in a worker or on a',
        'server; the string version does. And it escapes for **element content**, which is what',
        '`outerHTML` on a text node means — it is not an all-purpose sanitiser, and it does not make',
        'untrusted markup safe. If the code you are wrapping came from a user and you want it *rendered*',
        'rather than shown as text, escaping is not the tool at all.',
        '',
        'If the snippet already exists in the page as markup you want to keep — highlighted spans and',
        'all — skip both versions and use `snippet.querySelector("code")?.outerHTML` directly. The',
        'escaping question disappears because you never left the DOM.',
      ].join('\n'),
    },
  ],
};
