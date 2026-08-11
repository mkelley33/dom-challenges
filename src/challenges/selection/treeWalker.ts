import type { ChallengeContent } from '@/types/challenge';

import { requireElement } from './support';

/** The distinctive string inside the `<script>`, so the assertion names what it is looking for. */
const SCRIPT_TEXT = 'SCRIPT-TEXT-SHOULD-NOT-APPEAR';

export const treeWalker: ChallengeContent = {
  prompt: [
    'Export a function `visibleText(root)` that collects the readable text under `root`.',
    '',
    'The rule, exactly:',
    '',
    '1. visit every text node under `root`, in document order;',
    '2. **skip anything inside a `<script>` or a `<style>`** — that is source code, not prose;',
    '3. trim each piece of text and drop the ones that are empty once trimmed;',
    '4. join what is left with a single space.',
    '',
    'So the article below reads as `"Reading the page Hello world Goodbye Aside text"`.',
    '',
    '`root.textContent` gathers every text node under an element in one property access — including',
    'the ones this function must not return, which is why it is the starting point rather than the',
    'answer.',
  ].join('\n'),
  html: [
    '<article id="post">',
    '  <h1>Reading the page</h1>',
    '  <style>.note { display: none; }</style>',
    '  <p>Hello <em>world</em></p>',
    `  <script>var trackingId = '${SCRIPT_TEXT}';</script>`,
    '  <p>Goodbye</p>',
    '  <section id="aside">',
    '    <style>.aside { color: rebeccapurple; }</style>',
    '    <p>Aside text</p>',
    '  </section>',
    '</article>',
  ].join('\n'),
  starterCode: [
    'export function visibleText(root: Element): string {',
    "  return root.textContent ?? '';",
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'collects the readable text, in document order, joined by single spaces',
      run: ({ doc, fn, expect }) => {
        const visibleText = fn<(root: Element) => string>('visibleText');
        expect(visibleText(requireElement(doc, 'post'))).toBe('Reading the page Hello world Goodbye Aside text');
      },
    },
    {
      name: 'leaves out the source inside a <script>',
      run: ({ doc, fn, expect }) => {
        const visibleText = fn<(root: Element) => string>('visibleText');
        // The failing case this exists for: `FILTER_SKIP` on the `<script>` element skips the
        // element itself and walks into it anyway, so its text node is accepted and the script's
        // source lands in the middle of the prose. Only `FILTER_REJECT` skips the subtree.
        expect(visibleText(requireElement(doc, 'post'))).not.toContain(SCRIPT_TEXT);
      },
    },
    {
      name: 'leaves out the rules inside a <style>',
      run: ({ doc, fn, expect }) => {
        const visibleText = fn<(root: Element) => string>('visibleText');
        const text = visibleText(requireElement(doc, 'post'));
        expect(text).not.toContain('display: none');
        expect(text).not.toContain('rebeccapurple');
      },
    },
    {
      name: 'walks the root it is handed, filter and all',
      run: ({ doc, fn, expect }) => {
        const visibleText = fn<(root: Element) => string>('visibleText');
        // A nested root with a `<style>` of its own: a filter written to fire only for the top-level
        // children of the article, or a function that ignores its argument and starts at `#post`,
        // answers this one wrongly.
        expect(visibleText(requireElement(doc, 'aside'))).toBe('Aside text');
      },
    },
  ],
  solutions: [
    {
      label: 'TreeWalker with FILTER_REJECT',
      code: [
        'export function visibleText(root: Element): string {',
        '  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {',
        '    acceptNode(node: Node): number {',
        '      if (node.nodeType === Node.ELEMENT_NODE) {',
        '        const tag = (node as Element).tagName.toLowerCase();',
        "        if (tag === 'script' || tag === 'style') return NodeFilter.FILTER_REJECT;",
        '        return NodeFilter.FILTER_SKIP;',
        '      }',
        '      return NodeFilter.FILTER_ACCEPT;',
        '    },',
        '  });',
        '',
        '  const parts: string[] = [];',
        '  let node = walker.nextNode();',
        '  while (node !== null) {',
        "    const text = (node.textContent ?? '').trim();",
        "    if (text !== '') parts.push(text);",
        '    node = walker.nextNode();',
        '  }',
        '',
        "  return parts.join(' ');",
        '}',
        '',
      ].join('\n'),
      explanation: [
        'A `TreeWalker` is a cursor over the tree: `nextNode()` steps through it in document order,',
        'and the filter decides what the cursor is allowed to stop on.',
        '',
        'The whole challenge is in the difference between the two ways of saying no:',
        '',
        '- `FILTER_SKIP` — do not stop on this node, **but do walk into its children**.',
        '- `FILTER_REJECT` — do not stop on this node **and do not walk its subtree at all**.',
        '',
        'A `<script>` is an element whose only child is a text node holding its source. Returning',
        '`FILTER_SKIP` for it declines to stop on the `<script>` element — which the walker was never',
        'going to hand you as text anyway — and then descends into it and accepts the text node',
        'inside. Nothing errors; the source code simply appears in the middle of the prose. Only',
        '`FILTER_REJECT` prunes the branch.',
        '',
        'That is also why `whatToShow` is `SHOW_ELEMENT | SHOW_TEXT` rather than `SHOW_TEXT`. The',
        'filter is only consulted for node types the walker is showing, so with `SHOW_TEXT` alone the',
        '`<script>` element is never offered to it and there is nothing to reject — and for a node the',
        'walker *is* showing, `REJECT` and `SKIP` become indistinguishable on a text node, which has',
        'no subtree to prune. Elements are shown here purely so they can be turned away.',
        '',
        'The `as Element` narrows what `nodeType === 1` has already established; `instanceof Element`',
        'would work in this realm too, but the numeric check is what stays true for a node that came',
        'from another document.',
      ].join('\n'),
      tradeoffs: [
        'This is what `TreeWalker` is for, and it is the version to reach for on a large document:',
        'the walk is native, the rejected subtrees are never visited at all, and nothing is allocated',
        'per node. Extracting text for a reading-mode view, a word count, or a find-in-page all have',
        'exactly this shape.',
        '',
        'The costs are its ergonomics. The `while` loop with a reassigned cursor is the shape every',
        'use has — there is no iterator protocol on a `TreeWalker`, so `for...of` is not available',
        "without wrapping it in a generator. The filter's return values are magic numbers behind",
        'constants, and returning the wrong one fails silently rather than loudly, as the `SKIP` case',
        'here shows. It also does not descend into shadow roots or `<iframe>` documents, and',
        '`NodeIterator` is the flat cousin worth knowing about when you never need to prune.',
      ].join('\n'),
    },
    {
      label: 'TreeWalker over text nodes, filtered by ancestor',
      code: [
        'export function visibleText(root: Element): string {',
        '  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);',
        '  const parts: string[] = [];',
        '',
        '  let node = walker.nextNode();',
        '  while (node !== null) {',
        "    const text = (node.textContent ?? '').trim();",
        "    const inCode = node.parentElement?.closest('script, style') !== null;",
        "    if (text !== '' && !inCode) parts.push(text);",
        '    node = walker.nextNode();',
        '  }',
        '',
        "  return parts.join(' ');",
        '}',
        '',
      ].join('\n'),
      explanation: [
        'Show only text nodes, then ask each one where it came from. `closest` climbs from the text',
        "node's parent through its ancestors, so a text node anywhere inside a `<script>` or `<style>`",
        '— however deeply nested — is recognised and dropped.',
        '',
        'With `SHOW_TEXT` alone the filter argument becomes unnecessary: elements are never offered,',
        'so there is nothing for `FILTER_REJECT` to prune and the two rejection modes stop differing.',
        'The decision moves out of the filter and into the loop body, where it is an ordinary',
        '`if` — which is a good deal easier to read correctly than a function returning `2` or `3`.',
        '',
        'Note `?? null` is not needed on the `closest` result: it already returns `Element | null`, so',
        'comparing against `null` is the whole check.',
      ].join('\n'),
      tradeoffs: [
        'Clearer, and slower in a way that matters only at scale: the walker still descends into every',
        '`<script>` and `<style>` in the document, and each text node inside them costs an ancestor',
        'walk before being discarded. `FILTER_REJECT` never enters those subtrees in the first place.',
        '',
        'For a page-sized document with a handful of scripts, this is the version to write — the',
        'condition is a selector, so extending it to `script, style, template, [hidden]` is a one-word',
        'edit rather than another branch inside a filter callback.',
      ].join('\n'),
    },
    {
      label: 'Recursive walk over childNodes',
      code: [
        "const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE']);",
        '',
        'export function visibleText(root: Element): string {',
        '  const parts: string[] = [];',
        '',
        '  function visit(node: Node): void {',
        '    for (const child of Array.from(node.childNodes)) {',
        '      if (child.nodeType === Node.TEXT_NODE) {',
        "        const text = (child.textContent ?? '').trim();",
        "        if (text !== '') parts.push(text);",
        '      } else if (child.nodeType === Node.ELEMENT_NODE) {',
        '        if (SKIPPED_TAGS.has((child as Element).tagName)) continue;',
        '        visit(child);',
        '      }',
        '    }',
        '  }',
        '',
        '  visit(root);',
        "  return parts.join(' ');",
        '}',
        '',
      ].join('\n'),
      explanation: [
        'No walker at all: recurse over `childNodes`, collect the text nodes, and simply do not',
        'recurse into a `<script>` or a `<style>`.',
        '',
        'Put side by side with the first solution, this is what makes `FILTER_REJECT` click. The',
        '`continue` here is `FILTER_REJECT` — the subtree is never entered. Replacing it with a bare',
        '`visit(child)` that merely declines to collect the element itself is `FILTER_SKIP`, and it',
        'would pick up the script source for exactly the same reason.',
        '',
        '`childNodes` rather than `children`, because text nodes are the point and `children` cannot',
        'see them. `tagName` is upper case in an HTML document, which is why the set holds `SCRIPT`',
        'and `STYLE`.',
      ].join('\n'),
      tradeoffs: [
        'The version with no API to remember, and the one to write when the traversal has to do',
        'something structural on the way — track depth, insert separators between block elements,',
        'stop after N characters. A `TreeWalker` flattens the tree into a sequence and hides exactly',
        'that structure.',
        '',
        'What it costs is a JavaScript stack frame per element and an array per node from the',
        '`Array.from`; iterating `childNodes` directly avoids the copy, at the risk every live',
        'collection carries if the loop body mutates the tree. Depth is the real limit: a pathological',
        'document nested thousands of levels deep overflows the stack, where the walker is an',
        'iterative cursor and cannot.',
      ].join('\n'),
    },
  ],
};
