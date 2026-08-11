import type { ChallengeContent } from '@/types/challenge';

import { requireElement } from './support';

type SetActive = (chip: HTMLElement, active: boolean) => void;
type SetVariant = (chip: HTMLElement, variant: string) => void;
type ClassesOf = (chip: HTMLElement) => string[];

export const classThreeWays: ChallengeContent = {
  prompt: [
    'A filter bar. Each chip carries a `chip` class, exactly one `variant-*` class, and sometimes a',
    'size or a pinned marker that other code put there.',
    '',
    'Export three functions:',
    '',
    '- `setActive(chip, active)` — add or remove the class `is-active`, **touching nothing else**.',
    '- `setVariant(chip, variant)` — give the chip `variant-${variant}` and leave it with exactly one',
    '  `variant-*` class. The three variants are `solid`, `ghost` and `outline`.',
    '- `classesOf(chip)` — the chip’s classes as an array of tokens.',
    '',
    'The starter uses `className`, which is a single string: assigning it replaces every class at',
    'once, and appending to it runs the new class straight into the old one.',
  ].join('\n'),
  html: [
    '<div id="filters">',
    '  <button id="chip-all" class="chip  variant-solid">All</button>',
    '  <button id="chip-open" class="chip size-sm variant-ghost">Open</button>',
    '  <button id="chip-done" class="chip variant-outline is-activated">Done</button>',
    '</div>',
  ].join('\n'),
  starterCode: [
    'export function setActive(chip: HTMLElement, active: boolean): void {',
    "  chip.className = active ? 'is-active' : '';",
    '}',
    '',
    'export function setVariant(chip: HTMLElement, variant: string): void {',
    '  chip.className += ` variant-${variant}`;',
    '}',
    '',
    'export function classesOf(chip: HTMLElement): string[] {',
    "  return chip.className.split(' ');",
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'activating a chip keeps the classes it already had',
      run: ({ doc, fn, expect }) => {
        const open = requireElement(doc, 'chip-open');
        fn<SetActive>('setActive')(open, true);

        expect(open).toHaveClass('is-active');
        expect(open).toHaveClass('chip');
        expect(open).toHaveClass('size-sm');
        expect(open).toHaveClass('variant-ghost');
        expect(open.classList).toHaveLength(4);
      },
    },
    {
      name: 'deactivating removes only is-active, and leaves is-activated alone',
      run: ({ doc, fn, expect }) => {
        // Inverted control: the classes being preserved are put there by the test, so "remember what
        // I added and put it back" cannot pass -- the only way through is to edit one token.
        const done = requireElement(doc, 'chip-done');
        done.classList.add('is-active', 'pinned');

        fn<SetActive>('setActive')(done, false);

        expect(done.classList.contains('is-active')).toBe(false);
        expect(done).toHaveClass('pinned');
        expect(done).toHaveClass('chip');
        expect(done).toHaveClass('variant-outline');
        // `is-activated` contains `is-active`, so a solution that reaches for
        // `className.replace('is-active', '')` eats four characters out of the middle of a class it
        // was never asked about and leaves `ated` behind. A token list cannot make that mistake.
        expect(done).toHaveClass('is-activated');
      },
    },
    {
      name: 'activating twice leaves the chip active once, in the attribute too',
      run: ({ doc, fn, expect }) => {
        // `classList.toggle(name)` with no second argument flips, so a solution written that way is
        // correct exactly as long as nothing ever calls it twice with the same answer.
        const all = requireElement(doc, 'chip-all');
        const setActive = fn<SetActive>('setActive');
        setActive(all, true);
        setActive(all, true);

        expect(all).toHaveClass('is-active');
        expect(all.classList).toHaveLength(3);
        // A `DOMTokenList` de-duplicates on read, so a class added twice is invisible through
        // `classList` and plainly there in the attribute -- which is what devtools shows, what
        // `outerHTML` serialises, and what anything diffing markup compares.
        const written = (all.getAttribute('class') ?? '').split(/\s+/).filter((token) => token === 'is-active');
        expect(written).toHaveLength(1);
      },
    },
    {
      name: 'switching variant replaces the old one and keeps everything else',
      run: ({ doc, fn, expect }) => {
        const open = requireElement(doc, 'chip-open');
        fn<SetVariant>('setVariant')(open, 'solid');

        expect(open).toHaveClass('variant-solid');
        expect(open.classList.contains('variant-ghost')).toBe(false);
        expect(open).toHaveClass('chip');
        expect(open).toHaveClass('size-sm');
        expect(doc.querySelectorAll('#filters .variant-solid')).toHaveLength(2);
      },
    },
    {
      name: 'classesOf reports tokens, not the raw attribute text',
      run: ({ doc, fn, expect }) => {
        // `#chip-all`'s class attribute has two spaces in it, exactly as a hand-edited template or a
        // conditional class helper leaves it. `className.split(' ')` yields an empty-string token
        // there; a `DOMTokenList` never does, because whitespace is a separator and not a token.
        expect(fn<ClassesOf>('classesOf')(requireElement(doc, 'chip-all'))).toEqual(['chip', 'variant-solid']);
      },
    },
    {
      name: 'classesOf sees a class list the test wrote through the attribute',
      run: ({ doc, fn, expect }) => {
        const done = requireElement(doc, 'chip-done');
        done.setAttribute('class', 'chip\n  variant-outline pinned');

        // `class`, `className` and `classList` are three views of one attribute, so a write through
        // any of them is visible through all of them -- and every ASCII whitespace character
        // separates tokens, not only the space.
        expect(fn<ClassesOf>('classesOf')(done)).toEqual(['chip', 'variant-outline', 'pinned']);
      },
    },
  ],
  solutions: [
    {
      label: 'classList, the token list the platform already keeps',
      code: [
        "const VARIANTS = ['variant-solid', 'variant-ghost', 'variant-outline'];",
        '',
        'export function setActive(chip: HTMLElement, active: boolean): void {',
        "  chip.classList.toggle('is-active', active);",
        '}',
        '',
        'export function setVariant(chip: HTMLElement, variant: string): void {',
        '  chip.classList.remove(...VARIANTS);',
        '  chip.classList.add(`variant-${variant}`);',
        '}',
        '',
        'export function classesOf(chip: HTMLElement): string[] {',
        '  return [...chip.classList];',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'There is one `class` attribute and three ways to reach it:',
        '',
        '- **`getAttribute("class")`** — the raw text, exactly as written, whitespace and all.',
        '- **`className`** — the same text as a property. Reflected, so reading and assigning it read',
        '  and write that attribute. The name is `className` and not `class` because `class` was a',
        '  reserved word when the DOM was designed.',
        '- **`classList`** — a `DOMTokenList`: a live, parsed, de-duplicated view of the same text.',
        '',
        'The first two treat the attribute as **one string**, and that is the whole bug in the starter.',
        '`chip.className = "is-active"` does not add a class, it *replaces every class the chip has*.',
        '`chip.className += " variant-solid"` avoids that and introduces two new problems: forget the',
        'leading space and you get `chipvariant-solid`, and call it twice and you get the class twice.',
        '',
        '`classList` is the one that speaks in tokens:',
        '',
        '- `add(...names)` / `remove(...names)` — take any number of names, and are no-ops when there',
        '  is nothing to do, so neither can duplicate a class or fail on a missing one.',
        '- `toggle(name, force)` — **the second argument is the important one.** With it the call is',
        '  idempotent: it puts the class into the state you asked for, whatever it was before. Without',
        '  it, the call flips, and calling it twice undoes itself.',
        '- `contains(name)` — asks about a whole token. `className.includes("btn")` is true of',
        '  `btn-danger`; `classList.contains("btn")` is not.',
        '- `replace(old, new)` — swaps one token for another and returns `false` if `old` was not there.',
        '',
        '`classList` is also **live**: the same `DOMTokenList` object keeps reporting the truth after',
        'someone else rewrites the attribute, so it is safe to hold on to.',
      ].join('\n'),
      tradeoffs: [
        'This is the default, and `toggle(name, force)` in particular is the answer to most "sync a',
        'class to a boolean" code. Reach past it in three cases:',
        '',
        '- **Replacing the whole list on purpose.** `chip.className = "chip variant-solid"` is one',
        '  write instead of several and is exactly right when you own every class on the element — a',
        '  freshly created node, or a component that renders its own class list from scratch.',
        '- **`remove(...VARIANTS)` is a small lie.** It removes three names to add one back, which',
        '  reads oddly next to `replace`. `replace(currentVariant, next)` is more precise when you know',
        '  the current value; the version above does not, and it is shorter than finding out.',
        '- **Reading the raw text.** Only `getAttribute("class")` gives you what is actually written,',
        '  which matters when you are diffing markup or debugging a duplicated class.',
        '',
        'Two edges worth knowing before they bite: `classList.add("")` throws `SyntaxError`, and',
        '`classList.add("a b")` throws `InvalidCharacterError` — a token may not be empty or contain',
        'whitespace. So `classList.add(maybeEmptyVariable)` is a crash waiting for the day the variable',
        'is empty, while `className += " " + maybeEmptyVariable` would have silently done nothing.',
      ].join('\n'),
    },
    {
      label: 'Parse and rewrite the class attribute yourself',
      code: [
        'function tokens(chip: HTMLElement): string[] {',
        "  return (chip.getAttribute('class') ?? '').split(/\\s+/).filter(Boolean);",
        '}',
        '',
        'function write(chip: HTMLElement, next: string[]): void {',
        "  chip.setAttribute('class', [...new Set(next)].join(' '));",
        '}',
        '',
        'export function setActive(chip: HTMLElement, active: boolean): void {',
        "  const rest = tokens(chip).filter((name) => name !== 'is-active');",
        "  write(chip, active ? [...rest, 'is-active'] : rest);",
        '}',
        '',
        'export function setVariant(chip: HTMLElement, variant: string): void {',
        "  const rest = tokens(chip).filter((name) => !name.startsWith('variant-'));",
        '  write(chip, [...rest, `variant-${variant}`]);',
        '}',
        '',
        'export function classesOf(chip: HTMLElement): string[] {',
        '  return tokens(chip);',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'What `DOMTokenList` does, written out: split the attribute on whitespace, drop the empty',
        'pieces, work with the array, join it back with single spaces.',
        '',
        'Three details in `tokens` are the ones that make the starter wrong, and they are worth seeing',
        'spelled out:',
        '',
        "- `split(/\\s+/)` rather than `split(' ')` — the class attribute is a *space-separated list* in",
        '  the HTML sense, which means any run of ASCII whitespace, newlines included. Templates',
        '  produce those constantly.',
        '- `.filter(Boolean)` — a leading, trailing or doubled space yields empty strings, and an empty',
        '  string is not a class.',
        '- `new Set` on the way out — the same class written twice is one class, and the platform',
        '  quietly de-duplicates it for you.',
        '',
        '`setVariant` here is more honest than the version above: it removes *whatever* `variant-*`',
        'class the chip has rather than the three it knows the names of, so a variant added later',
        'needs no edit here.',
      ].join('\n'),
      tradeoffs: [
        'This is the wrong choice for a `class` attribute — `classList` is shorter, faster, live, and',
        'already correct about every detail above. Write it out only when you are learning what the',
        'token list does, or when you genuinely have to do something it cannot: reorder the tokens,',
        'keep duplicates, or diff two class lists.',
        '',
        'It is the *right* choice for **any other space-separated attribute**, and there are more of',
        'them than people expect: `rel`, `headers`, `aria-labelledby`, `aria-describedby`,',
        '`aria-controls`, `accept`, `sandbox`, `itemprop`. None of those has a `classList`.',
        '',
        'Two of them do, in a way worth knowing: `element.relList` and `iframe.sandbox` are',
        '`DOMTokenList`s over `rel` and `sandbox`. There is also `element.part` for shadow parts. For',
        'everything else — including every `aria-*` id list — the code above is the shape you want, and',
        'it is why `DOMTokenList` is a type in its own right rather than a method on `Element`.',
      ].join('\n'),
    },
  ],
};
