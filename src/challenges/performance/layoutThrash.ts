import type { ChallengeContent } from '@/types/challenge';

/**
 * The cards, and the width each one's `getBoundingClientRect()` is made to report.
 *
 * Fabricated rather than measured, because neither host can supply real geometry to this suite:
 * happy-dom has no layout engine and returns zeros from `getBoundingClientRect()` and `offsetWidth`
 * alike. Asserting on real pixels is therefore not available at any price -- but the property this
 * challenge is about is not a pixel value, it is the *order* of the reads and the writes, and that
 * survives instrumentation intact.
 *
 * `64.5` is deliberate: it is the subpixel width `offsetWidth` would round away.
 */
const CARDS: readonly (readonly [id: string, width: number])[] = [
  ['card-1', 120],
  ['card-2', 64.5],
  ['card-3', 220],
];

/**
 * A `DOMRect`-shaped value for the instrumented `getBoundingClientRect()` to return.
 *
 * An object literal rather than `new DOMRect(...)`: `DOMRect` is a structural interface here, and
 * building the value in the app's realm avoids reaching for a constructor across the realm boundary
 * for something the caller only reads `width` off.
 */
function fakeRect(width: number): DOMRect {
  return {
    x: 0,
    y: 0,
    width,
    height: 0,
    top: 0,
    right: width,
    bottom: 0,
    left: 0,
    toJSON: () => ({ width }),
  };
}

interface Probe {
  /** `'read'` and `'write'`, in the order the submitted code caused them. */
  calls: string[];
  /** The three cards, in document order — what `stampWidths` is handed. */
  cards: HTMLElement[];
  card: (id: string) => HTMLElement;
  /** Changes what a card's `getBoundingClientRect()` will report from now on. */
  setWidth: (id: string, width: number) => void;
  /** The string a correct pass must leave in that card's `data-width`. */
  expectedWidth: (id: string) => string;
}

/**
 * Replaces `getBoundingClientRect` and `setAttribute` on each card with recording versions.
 *
 * Own properties on the three elements, never a patch of `Element.prototype`. That matters twice
 * over: happy-dom shares one class table across every window it creates, so a prototype patch here
 * would leak out of the challenge and into the rest of the Vitest process, and an own property dies
 * with the element when the host rebuilds the document. Nothing has to be restored, and nothing that
 * is not one of these three cards is affected.
 *
 * The instrumentation is also what makes the mutation the test's rather than the learner's: the
 * submitted function is handed the cards, so it never queries the document and cannot reach an
 * uninstrumented reference to one.
 */
function instrument(doc: Document): Probe {
  const widths = new Map<string, number>(CARDS.map(([id, width]) => [id, width]));
  const elements = new Map<string, HTMLElement>();
  const calls: string[] = [];

  for (const [id] of CARDS) {
    const element = doc.getElementById(id);
    if (!element) throw new Error(`#${id} is missing from the challenge markup`);
    elements.set(id, element);

    element.getBoundingClientRect = (): DOMRect => {
      calls.push('read');
      return fakeRect(widths.get(id) ?? 0);
    };

    const nativeSetAttribute = element.setAttribute.bind(element);
    element.setAttribute = (name: string, value: string): void => {
      calls.push('write');
      nativeSetAttribute(name, value);
    };
  }

  const card = (id: string): HTMLElement => {
    const element = elements.get(id);
    if (!element) throw new Error(`#${id} was never instrumented`);
    return element;
  };

  return {
    calls,
    cards: CARDS.map(([id]) => card(id)),
    card,
    setWidth: (id, width) => {
      widths.set(id, width);
    },
    expectedWidth: (id) => String(widths.get(id) ?? 0),
  };
}

const BATCHED = 'read read read write write write';

export const layoutThrash: ChallengeContent = {
  prompt: [
    'The code below is **correct**. Every card ends up with the right `data-width`. It is also the',
    'single most common performance bug in DOM code.',
    '',
    'Reading a geometric property — `getBoundingClientRect()`, `offsetWidth`, `scrollTop` — forces the',
    'browser to make layout up to date *before* it can answer. Writing to the DOM invalidates layout.',
    'Alternate the two in a loop and every read pays for the write before it: layout is recomputed',
    'once per card instead of once for the whole batch. With three cards you will never notice. With',
    'three hundred rows it is a visible stall, and the profiler blames a line that looks innocent.',
    '',
    'Rewrite `stampWidths(cards)` so that **every measurement happens before the first write**, with',
    'the same result: each card gets `data-width` set to `String(rect.width)` for its own rect.',
    '',
    'The test replaces `getBoundingClientRect` and `setAttribute` on the three cards it hands you and',
    'records the calls in order, so what it checks is literally the sequence `read read read write',
    'write write`. Measure with `getBoundingClientRect()` and record with `setAttribute()` — those are',
    'the two calls it can see. Read each card exactly once.',
  ].join('\n'),
  html: [
    '<ul id="board">',
    '  <li class="card" id="card-1">Alpha</li>',
    '  <li class="card" id="card-2">Beta</li>',
    '  <li class="card" id="card-3">Gamma</li>',
    '</ul>',
  ].join('\n'),
  starterCode: [
    '// Correct, and it thrashes: read, write, read, write, read, write.',
    'export function stampWidths(cards: HTMLElement[]): void {',
    '  for (const card of cards) {',
    "    card.setAttribute('data-width', String(card.getBoundingClientRect().width));",
    '  }',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'every card records the width of its own rect',
      run: ({ doc, expect, fn }) => {
        const probe = instrument(doc);
        fn<(cards: HTMLElement[]) => void>('stampWidths')(probe.cards);

        for (const [id] of CARDS) {
          expect(probe.card(id)).toHaveAttribute('data-width', probe.expectedWidth(id));
        }
      },
    },
    {
      name: 'every read happens before the first write, and each card is read once',
      run: ({ doc, expect, fn }) => {
        const probe = instrument(doc);
        fn<(cards: HTMLElement[]) => void>('stampWidths')(probe.cards);

        // The whole challenge, in one assertion. A correct-but-thrashing pass produces
        // `read write read write read write`; re-reading a card inside the write pass produces six
        // reads. Both are visible here and nowhere else.
        expect(probe.calls.join(' ')).toBe(BATCHED);
      },
    },
    {
      name: 'a second pass measures again rather than reusing the first pass',
      run: ({ doc, expect, fn }) => {
        const probe = instrument(doc);
        const stampWidths = fn<(cards: HTMLElement[]) => void>('stampWidths');

        stampWidths(probe.cards);
        probe.setWidth('card-2', 300);
        probe.calls.length = 0;
        stampWidths(probe.cards);

        expect(probe.card('card-2')).toHaveAttribute('data-width', '300');
        expect(probe.card('card-1')).toHaveAttribute('data-width', probe.expectedWidth('card-1'));
        // Batched on the second pass too: a solution that measures once into module scope and
        // replays it would leave no reads here at all.
        expect(probe.calls.join(' ')).toBe(BATCHED);
      },
    },
  ],
  solutions: [
    {
      label: 'Measure into an array, then write',
      code: [
        'export function stampWidths(cards: HTMLElement[]): void {',
        '  const widths = cards.map((card) => card.getBoundingClientRect().width);',
        '',
        '  cards.forEach((card, index) => {',
        "    card.setAttribute('data-width', String(widths[index]));",
        '  });',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'Two passes, and the whole fix is that the first one finishes before the second starts.',
        '',
        'The browser keeps layout in a dirty/clean state rather than recomputing it eagerly. A write',
        'marks it dirty and returns immediately — that is why writes feel free. A geometric read cannot',
        'be answered from a dirty layout, so it *flushes* first: the reflow you did not ask for happens',
        'inside `getBoundingClientRect()`. The term for it is **forced synchronous layout**, and it is',
        'the thing the interleaved loop triggers once per iteration.',
        '',
        'Batched, the sequence is one flush at most. Every read in the first pass sees the same clean',
        'layout — the first one may flush, the rest are free — and every write in the second pass leaves',
        'layout dirty for the browser to recompute once, at its own convenience, before the next paint.',
        'Three cards become one reflow instead of three; three hundred rows become one instead of three',
        'hundred, which is the difference between imperceptible and a dropped frame.',
        '',
        '`getBoundingClientRect()` rather than `offsetWidth` is not incidental. Both force layout, so',
        'neither is the cheap one — but `offsetWidth` is rounded to an integer, and `card-2` is 64.5',
        'wide. `offsetWidth` would report 64 and lose half a pixel per card, which is how a row of',
        '"exactly" sized elements drifts.',
        '',
        'The index coupling is the one thing to keep an eye on: `widths[index]` is only the right width',
        'while the two passes iterate the same array in the same order.',
      ].join('\n'),
      tradeoffs: [
        'This is the shape to reach for, and the reason to know it is that it stops being optional at',
        'exactly the moment it stops being obvious.',
        '',
        'The cost is a temporary array and a second traversal — genuinely nothing next to one avoided',
        'reflow. Do not micro-optimise it away.',
        '',
        'What to watch for in real code:',
        '',
        '- The interleaving is usually not in one function. It is a `for` loop calling a helper that',
        '  measures, and another that writes, three files away. Reads and writes that batch cleanly are',
        '  a property of a whole call tree, which is why frameworks take ownership of it centrally',
        '  rather than asking each component to behave.',
        '- The list of layout-forcing reads is longer than it looks: `offsetTop`/`offsetWidth`,',
        '  `scrollTop`/`scrollHeight`, `clientWidth`, `getComputedStyle()` for a computed length, and',
        '  `getBoundingClientRect()`. Any of them mid-loop costs the same.',
        '- Classes and inline styles are both writes. Toggling a class is not cheaper than setting',
        '  `style.width` as far as invalidation is concerned.',
        '',
        'The next step up is to move the write pass into `requestAnimationFrame`, so measurement happens',
        'now and mutation happens immediately before the next paint. That is what `fastdom` and every',
        'virtualised-list library do. It is a bigger change than it looks — the writes become',
        'asynchronous, so anything reading them synchronously afterwards has to move too, and this',
        "challenge's tests would not accept it.",
      ].join('\n'),
    },
    {
      label: 'Pair each card with its width',
      code: [
        'export function stampWidths(cards: HTMLElement[]): void {',
        '  const measured = cards.map((card) => [card, card.getBoundingClientRect().width] as const);',
        '',
        '  for (const [card, width] of measured) {',
        "    card.setAttribute('data-width', String(width));",
        '  }',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'The same two passes, with the element carried alongside its measurement instead of matched back',
        'up by position.',
        '',
        'That removes the assumption the first version rests on. `widths[index]` is correct only while',
        'both passes walk the same array in the same order — so filtering the write pass, sorting it,',
        'reversing it, or splitting it across two functions silently pairs a card with somebody else’s',
        'width. Here the pairing is the data, and none of those edits can break it.',
        '',
        '`as const` on the tuple is what makes the destructuring in the loop type correctly: without it',
        'the array widens to `(HTMLElement | number)[]` and `card` and `width` are both that union.',
        '',
        'A `Map<HTMLElement, number>` says the same thing and is worth preferring when the write pass is',
        'somewhere else entirely and needs to look a width up by element rather than iterate.',
      ].join('\n'),
      tradeoffs: [
        'Prefer this the moment the write pass stops being a mirror image of the read pass — which is',
        'the same moment the batching stops being obvious, so the two tend to arrive together.',
        '',
        'It is also the version that survives being made asynchronous. Hand `measured` to a',
        '`requestAnimationFrame` callback and the pairing goes with it; hand a bare `widths` array to one',
        'and it is correct only if nothing re-ordered `cards` in the meantime — and something eventually',
        'will, because the whole point of deferring the writes is that other code runs in between.',
        '',
        'The cost is one small allocation per element rather than one per list, and a shape that reads',
        'as more machinery than the problem seems to need. For a three-line function against a fixed',
        'array, the first version is the more honest code; the moment either pass moves, this one is.',
      ].join('\n'),
    },
  ],
};
