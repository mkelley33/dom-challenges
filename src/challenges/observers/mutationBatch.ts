import type { ChallengeContent } from '@/types/challenge';

/**
 * What `trackAdditions` hands back.
 *
 * `callbacks` counts invocations of the observer's callback rather than records, because the two
 * numbers differing is the entire lesson: three appends in one turn produce three records and one
 * callback. A challenge that only counted records could be passed by code that never batched.
 */
interface Tracker {
  callbacks: number;
  added: string[];
  stop: () => void;
}

function requireList(doc: Document, id: string): HTMLElement {
  const list = doc.getElementById(id);
  if (!list) throw new Error(`#${id} is missing from the challenge markup`);
  return list;
}

/**
 * The mutations belong to the test, not to the learner.
 *
 * `trackAdditions` is handed a list that already holds two rows and returns before any of these run,
 * so nothing it could compute from the DOM at call time is an answer -- and the assertions that read
 * `tracker` *before* the first `tick()` close the other half: a `Tracker` whose `added` is a getter
 * over `list.children` would already report the new rows synchronously, and would report the two
 * pre-existing rows as well. Between them, the only way to satisfy both is to have been told by an
 * observer.
 */
function appendRow(doc: Document, list: Element, id: string): void {
  const row = doc.createElement('li');
  row.className = 'row';
  row.setAttribute('data-id', id);
  row.textContent = id.toUpperCase();
  list.append(row);
}

export const mutationBatch: ChallengeContent = {
  prompt: [
    'A `MutationObserver` does not call you once per change. It collects every change made in one',
    'turn of the event loop and delivers them together, as a list of records, *after* that turn ends.',
    'Code written as though the callback fires immediately — or once per mutation — is wrong in a way',
    'that only shows up under load.',
    '',
    'Export `trackAdditions(list)`, which starts watching `list` for rows being added to it and',
    'returns a `Tracker`:',
    '',
    '- `callbacks` — how many times **your observer callback has run**. Not how many records you have',
    '  seen; three rows appended in one turn is three records and one callback.',
    '- `added` — the `data-id` of every element added to `list` since tracking began, in record order.',
    '  `addedNodes` holds every inserted *node*, so a bare text node can turn up in it: record only',
    '  elements that carry a `data-id`.',
    '- `stop()` — stop watching. Nothing appended afterwards may reach either field.',
    '',
    'Two rows are already in the list when you are called. They were not *added*, so they never appear',
    'in `added`. The page also holds a second list, `#archive`, which is none of your business — rows',
    'appended there must not be recorded.',
    '',
    'The test does all the appending, and reads `tracker` both before and after letting the observer',
    'run.',
  ].join('\n'),
  html: [
    '<ul id="feed"><li class="row" data-id="a">A</li><li class="row" data-id="b">B</li></ul>',
    '<ul id="archive"></ul>',
  ].join('\n'),
  starterCode: [
    'export interface Tracker {',
    '  callbacks: number;',
    '  added: string[];',
    '  stop: () => void;',
    '}',
    '',
    'export function trackAdditions(list: Element): Tracker {',
    '  const tracker: Tracker = {',
    '    callbacks: 0,',
    '    added: [],',
    '    stop: () => undefined,',
    '  };',
    '',
    '  return tracker;',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'three appends in one turn are one callback carrying three records',
      run: async ({ doc, fn, expect, tick }) => {
        const feed = requireList(doc, 'feed');
        const tracker = fn<(list: Element) => Tracker>('trackAdditions')(feed);

        appendRow(doc, feed, 'c');
        // A bare text node between two rows: `addedNodes` is a list of nodes, not of elements, and
        // a solution that reads `data-id` off whatever it finds there throws on this line.
        feed.append(doc.createTextNode(' '));
        appendRow(doc, feed, 'd');
        appendRow(doc, feed, 'e');

        // Delivery is asynchronous, so at this point the observer has provably not run yet. This is
        // an assertion about a specific earlier instant, not about an event never happening.
        expect(tracker.callbacks).toBe(0);
        expect(tracker.added).toHaveLength(0);

        await tick();

        expect(tracker.callbacks).toBe(1);
        expect(tracker.added).toEqual(['c', 'd', 'e']);
      },
    },
    {
      name: 'a second turn of appends is a second callback, and the log keeps growing',
      run: async ({ doc, fn, expect, tick }) => {
        const feed = requireList(doc, 'feed');
        const tracker = fn<(list: Element) => Tracker>('trackAdditions')(feed);

        appendRow(doc, feed, 'c');
        await tick();
        appendRow(doc, feed, 'd');
        appendRow(doc, feed, 'e');
        await tick();

        expect(tracker.callbacks).toBe(2);
        expect(tracker.added).toEqual(['c', 'd', 'e']);
      },
    },
    {
      name: 'rows appended to a different list are not recorded',
      run: async ({ doc, fn, expect, tick }) => {
        const feed = requireList(doc, 'feed');
        const tracker = fn<(list: Element) => Tracker>('trackAdditions')(feed);

        appendRow(doc, requireList(doc, 'archive'), 'z');
        appendRow(doc, feed, 'c');
        await tick();

        expect(tracker.added).toEqual(['c']);
        expect(tracker.callbacks).toBe(1);
      },
    },
    {
      name: 'stop() ends the watch',
      run: async ({ doc, fn, expect, tick }) => {
        const feed = requireList(doc, 'feed');
        const tracker = fn<(list: Element) => Tracker>('trackAdditions')(feed);

        appendRow(doc, feed, 'c');
        await tick();
        // This pair is the wait that makes the assertion after `stop()` mean something: one `tick()`
        // has just been shown, on this very tracker, to be enough for an append to be delivered. The
        // second append therefore had its chance, rather than merely not having had time.
        expect(tracker.callbacks).toBe(1);

        tracker.stop();
        appendRow(doc, feed, 'd');
        await tick();

        expect(tracker.callbacks).toBe(1);
        expect(tracker.added).toEqual(['c']);
      },
    },
  ],
  solutions: [
    {
      label: 'One observer, childList only',
      code: [
        'export interface Tracker {',
        '  callbacks: number;',
        '  added: string[];',
        '  stop: () => void;',
        '}',
        '',
        'export function trackAdditions(list: Element): Tracker {',
        '  const tracker: Tracker = {',
        '    callbacks: 0,',
        '    added: [],',
        '    stop: () => observer.disconnect(),',
        '  };',
        '',
        '  const observer = new MutationObserver((records) => {',
        '    tracker.callbacks += 1;',
        '',
        '    for (const record of records) {',
        '      for (const node of record.addedNodes) {',
        '        if (!(node instanceof Element)) continue;',
        '',
        "        const id = node.getAttribute('data-id');",
        '        if (id !== null) tracker.added.push(id);',
        '      }',
        '    }',
        '  });',
        '',
        '  observer.observe(list, { childList: true });',
        '',
        '  return tracker;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        'Three appends, one callback. That is not an optimisation the browser might skip — it is the',
        'defined behaviour. Each mutation queues a `MutationRecord`, and the callback is scheduled as a',
        '**microtask**, so it runs once the current synchronous work has finished and receives every',
        'record queued in the meantime. The two assertions before `await tick()` are what pin it down:',
        'at that instant the rows are already in the DOM and the tracker has still heard nothing.',
        '',
        '`{ childList: true }` is the narrowest option that answers the question, and narrow is the',
        'point. Without `subtree`, only changes to `list`’s *direct* children are reported, which is',
        'exactly why appending to `#archive` produces nothing — and why `observe(document.body,',
        '{ childList: true, subtree: true })`, the shape people reach for first, fails that test.',
        '',
        '`record.addedNodes` is a `NodeList` of **nodes**. The text node the test slips in between two',
        'rows is in there, and it has no `getAttribute` at all, so the `instanceof Element` guard is',
        'load-bearing rather than defensive typing. (`instanceof` is safe here: this code is compiled',
        'and run inside the same realm as the nodes it is handed. A test, which runs in the app’s realm',
        'and receives nodes built in the page’s, would have to compare against that window’s `Element`',
        'instead.)',
        '',
        '`data-id` is read with `getAttribute` rather than `dataset.id` so a missing attribute is `null`',
        'and not `undefined` — one comparison, and no chance of pushing `undefined` into `added`.',
        '',
        '`disconnect()` stops delivery. Note the mutual reference: `stop` closes over `observer`, which',
        'is declared below it. That works because `stop` is not *called* until long after both exist.',
      ].join('\n'),
      tradeoffs: [
        'This is the right default, and the two things to watch are both about what you ask for.',
        '',
        'Ask for as little as possible. Every option widens the record stream: `subtree: true` on a',
        'large container makes your callback the busiest function in the application, and',
        '`characterData` on a subtree fires for every keystroke in every text node under it. An',
        'observer is cheap to register and expensive to over-scope.',
        '',
        'Never mutate the observed tree from inside the callback without thinking. Your own writes are',
        'recorded, your callback is scheduled again, and the loop is a microtask loop — it starves the',
        'event loop rather than merely running often. If you must, `disconnect()` before writing and',
        '`observe()` again afterwards, and accept that anything else that changed in between is lost.',
        '',
        '`MutationObserver` is also the wrong tool for anything you own. If your code is what appends',
        'the row, do the work at the append. Observers are for reacting to changes made by code you do',
        'not control — a third-party widget, a CMS, another framework rendering into your page.',
      ].join('\n'),
    },
    {
      label: 'Drain the queue before disconnecting',
      code: [
        'export interface Tracker {',
        '  callbacks: number;',
        '  added: string[];',
        '  stop: () => void;',
        '}',
        '',
        'export function trackAdditions(list: Element): Tracker {',
        '  const tracker: Tracker = {',
        '    callbacks: 0,',
        '    added: [],',
        '    stop: () => {',
        '      record(observer.takeRecords());',
        '      observer.disconnect();',
        '    },',
        '  };',
        '',
        '  function record(records: MutationRecord[]): void {',
        '    for (const mutation of records) {',
        '      for (const node of mutation.addedNodes) {',
        '        if (!(node instanceof Element)) continue;',
        '',
        "        const id = node.getAttribute('data-id');",
        '        if (id !== null) tracker.added.push(id);',
        '      }',
        '    }',
        '  }',
        '',
        '  const observer = new MutationObserver((records) => {',
        '    tracker.callbacks += 1;',
        '    record(records);',
        '  });',
        '',
        '  observer.observe(list, { childList: true });',
        '',
        '  return tracker;',
        '}',
        '',
      ].join('\n'),
      explanation: [
        '`disconnect()` does two things, and the second one is easy to miss: it stops the observation,',
        '**and it throws away every record that was queued but not yet delivered**. Mutate the tree and',
        'disconnect in the same turn and the callback never runs at all — the changes happened, and',
        'nothing was told about them.',
        '',
        '`takeRecords()` is the way out. It returns the pending queue *synchronously* and empties it, so',
        'calling it immediately before `disconnect()` is how you shut down without losing the last',
        'batch. This is the shape a component’s teardown wants: whatever happened between the final',
        'render and the unmount is still accounted for.',
        '',
        'Note what does **not** change: `callbacks` is still incremented only by the observer callback.',
        '`takeRecords()` is your code reading a queue, not the browser calling you, and reporting it as',
        'a callback would misrepresent the thing this challenge is about.',
        '',
        'Hoisting the shared work into `record` is what makes that distinction expressible at all — the',
        'first solution can only reuse its loop by calling the callback, which would count wrongly.',
      ].join('\n'),
      tradeoffs: [
        'The two solutions pass identical tests and genuinely differ on a path the tests do not pin,',
        'which is the honest reason to know both.',
        '',
        'Append a row and call `stop()` in the same turn: the first solution records nothing, the second',
        'records the row. Neither is a bug. "Stop means stop, discard whatever is in flight" is the',
        'right answer for an observer being torn down because the data it feeds is gone; "flush first"',
        'is the right answer when the log is the deliverable — an audit trail, an analytics batch, a',
        'diff you are about to send. Pick deliberately and the choice is a design decision; pick by',
        'reaching for `disconnect()` because it is the obvious method and it is a dropped-data bug that',
        'appears only under a race.',
        '',
        '`takeRecords()` has a second use worth remembering: calling it at the *top* of a callback that',
        'is about to mutate the tree lets you claim your own upcoming records before they are queued',
        'against you.',
        '',
        'The cost of this version is a function that has to stay in step with the callback. Two places',
        'that must interpret a record the same way is a smaller problem than dropped records, but it is',
        'not nothing.',
      ].join('\n'),
    },
  ],
};
