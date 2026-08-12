import type { ChallengeContent } from '@/types/challenge';

import { requireElement, requireIn } from './support';

type Promote = (token: Element) => Element;

export const replaceInPlace: ChallengeContent = {
  prompt: [
    'A line of text holds one token: `<span class="token" data-value="42">42</span>`. Clicking it',
    'should turn it into an editable field, in place.',
    '',
    'Export `promote(token)` that replaces the span with an `<input class="token">` carrying the',
    'token’s `data-value` as its `value` attribute, in exactly the same position, and **returns the',
    'element that is now in the document** — the caller focuses it.',
    '',
    'The words either side of the token must be the same text nodes afterwards. Only the token',
    'changes.',
    '',
    'The starter builds the right input, puts it in the right place, and fails one test. That one test',
    'is the whole challenge.',
  ].join('\n'),
  html: '<p id="line">Before <span class="token" data-value="42">42</span> after</p>',
  starterCode: [
    'export function promote(token: HTMLElement): HTMLElement {',
    "  const input = document.createElement('input');",
    "  input.className = 'token';",
    "  input.setAttribute('value', token.dataset.value ?? '');",
    '',
    '  token.outerHTML = input.outerHTML;',
    '',
    '  return token;',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'an input stands where the span stood, between the same two pieces of text',
      run: ({ doc, fn, expect }) => {
        const line = requireElement(doc, 'line');
        const before = line.firstChild;
        const after = line.lastChild;
        if (!before || !after) throw new Error('the line should start with text either side of the token');
        fn<Promote>('promote')(requireIn(line, '.token'));

        expect(line.children).toHaveLength(1);
        expect(line.children[0]?.tagName).toBe('INPUT');
        // Rebuilding the paragraph from a string produces the same sentence out of new nodes, and
        // takes the user's selection, any Range, and any highlight with it. Asked of the node the
        // test is holding first, so the rebuild reports `null` rather than two text nodes the
        // matcher prints identically.
        expect(before.parentNode).toBe(line);
        expect(line.firstChild).toBe(before);
        expect(line.lastChild).toBe(after);
      },
    },
    {
      name: 'the span is gone from the document',
      run: ({ doc, fn, expect }) => {
        const line = requireElement(doc, 'line');
        fn<Promote>('promote')(requireIn(line, '.token'));

        expect(doc.querySelectorAll('span.token')).toHaveLength(0);
      },
    },
    {
      name: 'the returned element is the one that is in the document',
      run: ({ doc, fn, expect }) => {
        const line = requireElement(doc, 'line');
        const promoted = fn<Promote>('promote')(requireIn(line, '.token'));

        // `token.outerHTML = '<input …>'` puts the right element in the right place and leaves the
        // variable pointing at the *old* one, detached. Everything the caller does next -- focus it,
        // select its text, listen on it -- then happens to a node that is not in the document, and
        // nothing throws. This is the assertion that separates "it looks right" from "it works".
        expect(promoted.parentElement).toBe(line);
        expect(promoted).toBe(line.children[0]);
      },
    },
    {
      name: 'the input carries the token’s class and value',
      run: ({ doc, fn, expect }) => {
        const line = requireElement(doc, 'line');
        const promoted = fn<Promote>('promote')(requireIn(line, '.token'));

        expect(promoted).toHaveClass('token');
        expect(promoted).toHaveAttribute('value', '42');
      },
    },
    {
      name: 'the value comes from the data attribute as it stands now',
      run: ({ doc, fn, expect }) => {
        const line = requireElement(doc, 'line');
        const token = requireIn(line, '.token');
        // Changed before the call, and deliberately left disagreeing with the span's text: a
        // solution reading `textContent`, or one with `42` written into it, answers with the wrong
        // one.
        token.setAttribute('data-value', '7');

        expect(fn<Promote>('promote')(token)).toHaveAttribute('value', '7');
      },
    },
  ],
  solutions: [
    {
      label: 'replaceWith, returning the new element',
      code: [
        'export function promote(token: HTMLElement): HTMLElement {',
        "  const input = document.createElement('input');",
        "  input.className = 'token';",
        "  input.setAttribute('value', token.dataset.value ?? '');",
        '',
        '  token.replaceWith(input);',
        '',
        '  return input;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        '`token.replaceWith(input)` takes the token out of the tree and puts the input exactly where it',
        'was — same parent, same position, the text either side untouched. Like `before` and `after` it',
        'is a method on the node being replaced rather than on the parent, it accepts several arguments',
        'at once, and a string argument becomes a text node.',
        '',
        'The interesting half is what happens to `token`. It is now detached: a perfectly good element',
        'object with `parentNode === null`, which no query can reach. The variable still works. It just',
        'no longer describes anything on screen.',
        '',
        'That is exactly what goes wrong with `token.outerHTML = input.outerHTML`. Assigning `outerHTML`',
        'also puts the right element in the right place — but the element it puts there was built by',
        'the **parser**, from a string, and it is not the input you made and not the token you had.',
        'Both of your references are now stale, and there is no way to get from either of them to the',
        'element that is actually in the document short of querying for it again. Focus it, listen on',
        'it, select its text: it all works, silently, on a node nobody will ever see.',
        '',
        'So the rule this challenge is really about: **after any replacement, the reference you keep has',
        'to be the node that ended up in the tree.** With `replaceWith` you have it, because you built',
        'it. That is the reason to prefer it over the string form even when both draw the same picture.',
        '',
        '(`setAttribute("value", …)` rather than `input.value = …` because the two are different things',
        'on an input: the attribute is the default the element resets to, the property is what is',
        'currently in the box. Setting the attribute before insertion gets both, since the property',
        'follows the attribute until a user types.)',
      ].join('\n'),
      tradeoffs: [
        'This is the default replacement, and there is little to weigh against it. Three things to know',
        'before you rely on it:',
        '',
        '- **`replaceWith()` with no arguments removes the node.** "Replace it with nothing" is a',
        '  legitimate reading, but it is a surprising way to delete something.',
        '- **It is silent on a node with no parent** — nothing to replace, so nothing happens. The',
        '  `outerHTML` form throws in the same situation, which is the one respect in which it is the',
        '  safer of the two.',
        '- **`replaceChildren` is a different method**, and the names are close enough to reach for by',
        '  accident: `replaceWith` swaps the element *itself*, `replaceChildren` swaps everything inside',
        '  it. One of them removes the element you called it on and the other keeps it.',
        '',
        'The string form has one genuine use: replacing an element with a **chunk of markup** you wrote,',
        'where building the nodes would be several lines and you do not need a reference afterwards.',
        'The moment you need the result, it is the wrong tool.',
      ].join('\n'),
    },
    {
      label: 'replaceChild, which hands back the element it removed',
      code: [
        'export function promote(token: HTMLElement): HTMLElement {',
        '  const parent = token.parentElement;',
        "  if (!parent) throw new Error('the token is not in the document');",
        '',
        "  const input = document.createElement('input');",
        "  input.className = 'token';",
        "  input.setAttribute('value', token.dataset.value ?? '');",
        '',
        '  // Hands back the node it removed: the token, detached and intact.',
        '  const removed = parent.replaceChild(input, token);',
        "  input.dataset.previous = removed.textContent ?? '';",
        '',
        '  return input;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The older API, and worth knowing for two reasons.',
        '',
        'First, **the argument order is (new, old)** — the opposite of the way the sentence reads out',
        'loud, and the opposite of `insertBefore(newNode, referenceNode)`\'s "new first, then where".',
        'Getting it backwards throws `NotFoundError`, because the second argument has to be a child of',
        'the parent, so at least it fails loudly.',
        '',
        'Second, **it returns the node it removed.** That is the token, detached and complete, and it is',
        'the thing an inline editor actually wants: keep it, and cancelling the edit is one',
        '`replaceWith` back rather than a rebuild. Here it is used more modestly, to stash the text the',
        'token had.',
        '',
        'Returning `removed` instead of `input` is precisely the mistake this challenge tests for, and',
        'it is an easy one to make with this API — the value that lands in your hand is the wrong one of',
        'the two.',
      ].join('\n'),
      tradeoffs: [
        'Reach for `replaceChild` when you want the old node back: an editable field that can be',
        'cancelled, an undo stack, a placeholder swapped in while something loads and swapped out',
        'again. `replaceWith` returns nothing, so with it you have to hold the old node yourself before',
        'the swap.',
        '',
        'Everything else about it is worse. It needs the parent, which is a lookup and a null check that',
        '`replaceWith` does not need; the argument order is a coin flip every time you write it; and it',
        'takes exactly one node, where `replaceWith` takes several and accepts strings.',
        '',
        'The null check is not ceremony, either: `parentNode` is genuinely `null` for a node you have',
        'built and not yet inserted, and this function is exactly the kind that gets called one day',
        'with a token that was removed a moment earlier.',
      ].join('\n'),
    },
  ],
};
