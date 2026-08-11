import type { ChallengeContent } from '@/types/challenge';

interface Batcher {
  schedule: () => void;
  cancel: () => void;
}

function requireCount(doc: Document, id: string): HTMLElement {
  const output = doc.getElementById(id);
  if (!output) throw new Error(`#${id} is missing from the challenge markup`);
  return output;
}

/**
 * The work a batcher is given: one increment of an on-screen counter.
 *
 * A DOM write rather than a closure counter, because "how many times did this run" is exactly the
 * question, and the counter makes the answer something both the test and the learner's own preview
 * can see. Nothing about the batching depends on what the callback does.
 */
function bumpCount(doc: Document, id: string): () => void {
  return () => {
    const output = requireCount(doc, id);
    output.textContent = String(Number(output.textContent ?? '0') + 1);
  };
}

export const frameBatch: ChallengeContent = {
  prompt: [
    'A scroll handler, a resize handler and a `MutationObserver` can each fire dozens of times between',
    'two paints. Doing the work every time is wasted: the screen only updates once, so all but the last',
    'result is thrown away — after you paid for it.',
    '',
    'Export `createBatcher(run)`, which returns a `Batcher` that collapses any number of requests into',
    'one call to `run`, on the next animation frame:',
    '',
    '- `schedule()` — asks for `run` to happen. Calling it ten times before the next frame must produce',
    '  exactly **one** call, and `run` must not have happened yet when `schedule()` returns.',
    '- After a flush the batcher re-arms: a `schedule()` in a later frame runs `run` again.',
    '- `cancel()` — drops a pending request. A `schedule()` after a `cancel()` still works.',
    '',
    'Each batcher is independent. Two of them scheduled in the same turn both run, and cancelling one',
    'leaves the other armed — so whatever state you keep belongs to the batcher, not to the module.',
    '',
    'The `run` the test gives you increments one of the counters below, so a batcher that fires twice',
    'is visible rather than merely reported.',
  ].join('\n'),
  html: [
    '<p>Batcher A ran: <output id="count">0</output> time(s)</p>',
    '<p>Batcher B ran: <output id="other">0</output> time(s)</p>',
  ].join('\n'),
  starterCode: [
    'export interface Batcher {',
    '  schedule: () => void;',
    '  cancel: () => void;',
    '}',
    '',
    '// Runs immediately, every time — no batching at all.',
    'export function createBatcher(run: () => void): Batcher {',
    '  return {',
    '    schedule: () => run(),',
    '    cancel: () => undefined,',
    '  };',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'ten requests in one turn become one call, and none of them happens synchronously',
      run: async ({ doc, expect, fn, tick }) => {
        const batcher = fn<(run: () => void) => Batcher>('createBatcher')(bumpCount(doc, 'count'));

        for (let index = 0; index < 10; index += 1) batcher.schedule();

        // Not "it has not run"; "it has not run *yet*". The frame has provably not arrived at this
        // point in the same turn, so this is an assertion about a known instant rather than about
        // the absence of an event.
        expect(requireCount(doc, 'count')).toHaveTextContent('0');

        await tick();

        expect(requireCount(doc, 'count')).toHaveTextContent('1');
      },
    },
    {
      name: 'the batcher re-arms after it flushes',
      run: async ({ doc, expect, fn, tick }) => {
        const batcher = fn<(run: () => void) => Batcher>('createBatcher')(bumpCount(doc, 'count'));

        batcher.schedule();
        await tick();
        expect(requireCount(doc, 'count')).toHaveTextContent('1');

        batcher.schedule();
        batcher.schedule();
        await tick();

        expect(requireCount(doc, 'count')).toHaveTextContent('2');
      },
    },
    {
      name: 'cancel() drops the pending request without breaking the batcher',
      run: async ({ doc, expect, fn, tick }) => {
        const batcher = fn<(run: () => void) => Batcher>('createBatcher')(bumpCount(doc, 'count'));

        batcher.schedule();
        batcher.cancel();
        await tick();

        expect(requireCount(doc, 'count')).toHaveTextContent('0');

        // This half is what makes the assertion above mean something. If `tick()` had not really
        // crossed a frame, the cancelled request would look dropped for the same reason this one
        // would fail to arrive -- and it does arrive, so the wait was real.
        batcher.schedule();
        await tick();

        expect(requireCount(doc, 'count')).toHaveTextContent('1');
      },
    },
    {
      name: 'two batchers scheduled in the same turn each run once',
      run: async ({ doc, expect, fn, tick }) => {
        const createBatcher = fn<(run: () => void) => Batcher>('createBatcher');
        const first = createBatcher(bumpCount(doc, 'count'));
        const second = createBatcher(bumpCount(doc, 'other'));

        first.schedule();
        second.schedule();
        await tick();

        // A `let pending` at module scope passes every test above and fails here: the second
        // batcher sees the first one's flag and skips its own frame.
        expect(requireCount(doc, 'count')).toHaveTextContent('1');
        expect(requireCount(doc, 'other')).toHaveTextContent('1');
      },
    },
    {
      name: 'cancelling one batcher leaves the other armed',
      run: async ({ doc, expect, fn, tick }) => {
        const createBatcher = fn<(run: () => void) => Batcher>('createBatcher');
        const first = createBatcher(bumpCount(doc, 'count'));
        const second = createBatcher(bumpCount(doc, 'other'));

        first.schedule();
        second.schedule();
        first.cancel();
        await tick();

        expect(requireCount(doc, 'count')).toHaveTextContent('0');
        expect(requireCount(doc, 'other')).toHaveTextContent('1');
      },
    },
  ],
  solutions: [
    {
      label: 'One animation frame, guarded by its own id',
      code: [
        'export interface Batcher {',
        '  schedule: () => void;',
        '  cancel: () => void;',
        '}',
        '',
        'export function createBatcher(run: () => void): Batcher {',
        '  let frame: number | null = null;',
        '',
        '  return {',
        '    schedule: () => {',
        '      if (frame !== null) return;',
        '',
        '      frame = requestAnimationFrame(() => {',
        '        frame = null;',
        '        run();',
        '      });',
        '    },',
        '    cancel: () => {',
        '      if (frame === null) return;',
        '',
        '      cancelAnimationFrame(frame);',
        '      frame = null;',
        '    },',
        '  };',
        '}',
        '',
      ].join('\n'),
      explanation: [
        '`frame` is doing two jobs, and both are needed. It is the "already armed" flag — that is what',
        'turns ten `schedule()` calls into one `requestAnimationFrame` — and it is the handle `cancel()`',
        'needs, because `cancelAnimationFrame` takes the id the request returned.',
        '',
        'Clearing it *inside* the callback, before calling `run`, is the part that is easy to get wrong.',
        'Clear it after and a `schedule()` made from within `run` is silently swallowed; never clear it',
        'and the batcher fires exactly once in its life. Before `run` is the order that leaves the',
        'batcher armed again the moment the flush begins.',
        '',
        'The frame is the right unit for anything whose result is a pixel. The callback runs after the',
        'event handlers and just before the browser lays out and paints, so a batch of writes lands in',
        'the same frame it will be shown in — never half in one frame and half in the next. It also',
        'means the work is naturally throttled to the display: on a 60Hz screen, at most 60 times a',
        'second no matter how fast the events arrive.',
        '',
        'Each call to `createBatcher` gets its own `frame` because it is a closure variable, which is',
        'the whole reason two batchers do not interfere. Hoist that `let` to module scope — the edit',
        'that looks like tidying — and the second batcher in a turn silently never runs.',
      ].join('\n'),
      tradeoffs: [
        'This is the default for anything that ends in a DOM write, and there are three things about it',
        'worth knowing before you rely on it.',
        '',
        '**Frames stop.** A document the browser is not rendering — a background tab, a `display: none`',
        'container — services no animation frames at all. Work batched this way simply does not happen',
        'until the document is visible again. That is usually correct (nobody is looking), and it is a',
        'bug when the work is not visual: a save, a heartbeat, a metric. Those belong on a timer.',
        '',
        '**One frame is not a debounce.** This runs on the *next* frame, always. It is coalescing, not',
        'waiting for quiet: a continuous scroll produces one call every frame, forever. If what you want',
        'is "once the user stops", that is a debounce, and it is a timer that gets restarted.',
        '',
        '**Only the last request survives.** By design — but if each `schedule()` carried information',
        '(which row changed), collapsing them loses all but the last. Batch the *work*, and accumulate',
        'the *data* separately in a set or a map that `run` drains.',
        '',
        'For work that is not urgent at all, `requestIdleCallback` is the better fit: it runs when the',
        'browser has spare time rather than on a schedule, and it hands the callback a deadline. It is',
        'not available everywhere, so it is usually reached for behind a feature check with a timer',
        'fallback.',
      ].join('\n'),
    },
    {
      label: 'Coalesce onto a microtask',
      code: [
        'export interface Batcher {',
        '  schedule: () => void;',
        '  cancel: () => void;',
        '}',
        '',
        'export function createBatcher(run: () => void): Batcher {',
        '  let armed = false;',
        '',
        '  return {',
        '    schedule: () => {',
        '      if (armed) return;',
        '      armed = true;',
        '',
        '      queueMicrotask(() => {',
        '        if (!armed) return;',
        '',
        '        armed = false;',
        '        run();',
        '      });',
        '    },',
        '    cancel: () => {',
        '      armed = false;',
        '    },',
        '  };',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'A microtask runs at the end of the current task, once the call stack empties — sooner than an',
        'animation frame, and without waiting for the browser to be ready to paint. It is the same',
        'queue `Promise.then` and `MutationObserver` callbacks use.',
        '',
        'There is no id to cancel, so `armed` has to carry the cancellation as well as the arming. The',
        'microtask re-checks the flag when it runs, and a `cancel()` that arrives in between makes it a',
        'no-op. That also handles the awkward sequence — schedule, cancel, schedule, all in one turn —',
        'without extra state: the second `schedule()` re-arms and queues a *second* microtask, the first',
        'one to run does the work and disarms, and the other finds `armed` false and returns. One call,',
        'which is what was asked for.',
        '',
        '`queueMicrotask` is the direct way to reach that queue. `Promise.resolve().then(fn)` does the',
        'same thing and is what you will see in older code; the difference is that a throw inside',
        '`queueMicrotask` surfaces as an uncaught error rather than a silently rejected promise, which',
        'is what you want for a callback nobody is awaiting.',
      ].join('\n'),
      tradeoffs: [
        'The choice between these two is about *when the result is needed*, and it is not a preference.',
        '',
        'A microtask flushes before the browser gets a chance to do anything else — before rendering,',
        'before the next event, before any timer. That makes it right for keeping internal state',
        'consistent: normalising a store after a burst of updates, invalidating a cache, batching',
        'validation. Anything that must be settled before the next line of *other* code observes it.',
        '',
        'It is wrong for DOM writes, and the reason is the same fact. Microtasks are drained until the',
        'queue is empty before rendering happens, so a microtask that schedules another microtask can',
        'starve the frame indefinitely — the page stops painting and stops responding, with no infinite',
        'loop anywhere to find. An animation frame cannot do that: it is scheduled by the rendering',
        'step, not before it.',
        '',
        'The other difference is one this challenge cannot see. `cancel()` here is best-effort: the',
        'microtask is already queued and will still run, it just does nothing. The frame version',
        'genuinely withdraws the request. That matters only under memory pressure and only at volume,',
        'but "cancelled" meaning two different things is worth knowing when you read the two side by',
        'side.',
      ].join('\n'),
    },
  ],
};
