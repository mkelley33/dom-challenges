import type { ChallengeEntry } from '@/types/challenge';

/**
 * The Events category, as metadata plus one dynamic import each.
 *
 * Reconnoitred before anything was authored, and **the spine is full fidelity**: the three-pass
 * dispatch model matches real Chrome through the production host on every point the eleven
 * challenges here rest on. Measured in both, same code, and re-measured when the category was
 * filled out -- the capture/target/bubble order, `currentTarget` versus `target` under delegation,
 * the capture pass reaching ancestors for a `bubbles: false` event, `stopPropagation` versus
 * `stopImmediatePropagation` (including from a capture listener), `preventDefault` with
 * `cancelable`, `defaultPrevented`, `dispatchEvent`'s return value and `passive`, a checkbox's
 * activation behaviour being cancelled, `once` and its re-arming, listener de-duplication by
 * `(type, callback, capture)` and the fact that a duplicate add neither reorders nor updates the
 * options, registration order within one target, capture-registered listeners running before
 * bubble-registered ones *at* the target, `this` being `currentTarget` in a function listener,
 * `handleEvent` object listeners, `CustomEvent.detail` by reference and `bubbles` defaulting to
 * false, synchronous and re-entrant dispatch, the path out to the window, `currentTarget` being
 * null after dispatch, and `AbortController` removing many listeners across many targets.
 *
 * **The one that shapes the challenges most** is also portable, and it is worth naming: a listener
 * added to an object the event **has not visited yet** is invoked when the event gets there, and
 * one added to the object being dispatched at, or registered for a pass that is already over, is
 * not. That is `outside-click`'s whole subject, and both directions were confirmed in Chrome.
 *
 * **Re-measured in real Chrome when the category was filled out**, through the production
 * `createIframeHost` on a Vite-served page, in a foregrounded tab (`visibilityState: 'visible'`,
 * `hasFocus(): true`) with a positive control asserted first -- the frame services a
 * `requestAnimationFrame` within 500 ms -- and repeated. Both runs identical: **111 runs, 0 run
 * errors; 20 solution runs, 0 failures; 10 starters, all running cleanly and all failing a named
 * assertion; 79 hand-written wrong solutions; `localStorage` 0 keys -> 0 keys.** Every failure
 * message matched the memory host's except the six below, which is the whole list of differences
 * across all 111 runs.
 *
 * **Nine divergences.** The first five were the reconnaissance's; the last four were found by
 * running this category's wrong answers in both hosts. Every one is pinned with a positive control
 * in `src/test/happyDomGaps.test.ts`.
 *
 * | # | read                                                | Chrome                    | happy-dom              | direction |
 * | - | --------------------------------------------------- | ------------------------- | ---------------------- | --------- |
 * | 1 | `event.target` outside an open shadow root           | the **host**              | the inner node         | dangerous |
 * | 2 | `composedPath().length` for a **closed** root        | 5 (truncated at the host) | 7                      | dangerous |
 * | 3 | `composedPath()` read after dispatch ends            | `[]`                      | the stale path         | dangerous |
 * | 4 | `addEventListener` with an already-aborted signal    | never attaches            | attaches and fires     | dangerous |
 * | 5 | a `ShadowRoot`'s `nodeName`                          | `#document-fragment`      | `''`                   | either    |
 * | 6 | `removeEventListener` with the wrong capture flag    | **removes nothing**       | removes it             | dangerous |
 * | 7 | `eventPhase` at the target, capture-registered       | `2` (AT_TARGET)           | `1` (CAPTURING_PHASE)  | either    |
 * | 8 | a same-target listener removed mid-dispatch          | skipped                   | still runs             | safe      |
 * | 9 | `cancelBubble = true` / `returnValue = false`        | honoured                  | ignored                | safe      |
 * |10 | where an `onclick` handler sits in the listener list | at first assignment       | always last            | safe      |
 *
 * (Ten rows, nine divergences: 9 is one behaviour with two spellings.)
 *
 * **6 is the dangerous one and it cost a test.** `listener-identity` was going to assert that a
 * capture-registered listener survives `removeEventListener(type, fn)`, which is the sharpest
 * version of that challenge's thesis -- and the buggy answer passes all four tests here while
 * failing all four in Chrome. Nothing in this category asserts on the capture flag at removal; it
 * is taught in that challenge's tradeoffs and in `capture-phase`'s, as prose.
 *
 * **7 forbids asserting `eventPhase` anywhere.** Only the target's capture-registered listener
 * diverges -- an ancestor reports 1 and 3 in both -- which is exactly the reading a challenge about
 * the three passes would want. No challenge here reads `eventPhase`; the passes are taught with an
 * ordered log instead.
 *
 * **8 rules out asserting a mid-dispatch teardown.** `abort-many` ends a drag from inside a
 * listener, and it never asserts that a *sibling* listener on the same target was skipped, because
 * happy-dom runs the copy of the list it took when the event arrived. The same applies to
 * `removeEventListener` called from a preceding listener on that target.
 *
 * **9 and 10 are safe and were still worth measuring**, because both mean a learner writing legacy
 * code is graded differently by the two hosts. `event.returnValue = false` is a complete, correct
 * answer to `prevent-default` in Chrome and fails three of its five tests here. `onclick` answers
 * are rejected by both `once-listener` and `duplicate-listeners` in both engines, by different
 * counts. Nothing here uses either spelling.
 *
 * **Never assert `event.target` across a shadow boundary** (1). `composed-path` is built the other
 * way round instead: the markup carries a `data-action` both inside the root and on the host, so
 * `event.target.closest(...)` fails a *different* named test in each engine and is rejected by both.
 * Any new shadow-boundary challenge has to do the same.
 *
 * **Why the category stops at eleven.** Ten to twelve was the target and eleven is where the ground
 * runs out. Propagation is covered from four angles -- the three passes (`capture-phase`), the two
 * stops (`stop-propagation`), delegation (`delegate-one-listener`) and the composed path across a
 * shadow boundary (`composed-path`). The registration model has four: identity and removal
 * (`listener-identity`), de-duplication and order (`duplicate-listeners`), auto-removal
 * (`once-listener`) and signal-based teardown across many targets (`abort-many`). Cancellation has
 * one (`prevent-default`, which is also where `passive` lives, since "a passive listener cannot
 * cancel" is a fact about cancelling). Authoring events has one (`custom-event-detail`). And the
 * interaction between adding a listener and a dispatch already in flight has one (`outside-click`),
 * which is the only place the *timing* of registration is the subject.
 *
 * What is deliberately absent: **`eventPhase` as a challenge**, unauthorable per divergence 7;
 * **anything that asserts a mid-dispatch removal**, per 8; **the capture flag at removal time**, per
 * 6; **a throwing listener not stopping the ones after it**, which both engines agree on but which
 * has no wrong answer attached -- a learner does nothing differently knowing it; **`this` binding
 * and `bind`**, which is one lesson about function identity that `listener-identity` already
 * rejects answers over, with `handleEvent` taught as `capture-phase`'s alternative solution;
 * **keyboard events** (`key` versus `code`, Enter/Space activation), which belong to Accessibility;
 * **`input` versus `change`**, which belongs to Forms; and **ordering between two schedulers**,
 * which AGENTS.md §3 forbids outright.
 *
 * See AGENTS.md §3 and §10.
 */
export const eventsEntries: ChallengeEntry[] = [
  {
    id: 'events-delegate-one-listener',
    slug: 'delegate-one-listener',
    title: 'One listener for a list that keeps growing',
    category: 'events',
    difficulty: 'novice',
    concepts: ['event delegation', 'target versus currentTarget', 'closest', 'bubbling', 'dataset'],
    relatedIds: ['events-composed-path'],
    load: () => import('./delegateOneListener').then((module) => module.delegateOneListener),
  },
  {
    id: 'events-custom-event-detail',
    slug: 'custom-event-detail',
    title: 'The event your component fires',
    category: 'events',
    difficulty: 'novice',
    concepts: ['CustomEvent', 'detail', 'bubbles', 'dispatchEvent', 'synchronous dispatch'],
    relatedIds: ['events-delegate-one-listener'],
    load: () => import('./customEventDetail').then((module) => module.customEventDetail),
  },
  {
    id: 'events-capture-phase',
    slug: 'capture-phase',
    title: 'The click the widget swallows',
    category: 'events',
    difficulty: 'intermediate',
    concepts: ['capture phase', 'propagation', 'stopPropagation', 'non-bubbling events', 'handleEvent'],
    relatedIds: ['events-delegate-one-listener'],
    load: () => import('./capturePhase').then((module) => module.capturePhase),
  },
  {
    id: 'events-stop-propagation',
    slug: 'stop-propagation',
    title: 'Two ways to stop, and what each one stops',
    category: 'events',
    difficulty: 'intermediate',
    concepts: ['stopPropagation', 'stopImmediatePropagation', 'listener order', 'capture phase', 'default action'],
    relatedIds: ['events-capture-phase'],
    load: () => import('./stopPropagation').then((module) => module.stopPropagation),
  },
  {
    id: 'events-prevent-default',
    slug: 'prevent-default',
    title: 'The cancel that does nothing',
    category: 'events',
    difficulty: 'intermediate',
    concepts: ['preventDefault', 'cancelable', 'defaultPrevented', 'passive listeners', 'dispatchEvent'],
    relatedIds: ['events-stop-propagation'],
    load: () => import('./preventDefault').then((module) => module.preventDefault),
  },
  {
    id: 'events-listener-identity',
    slug: 'listener-identity',
    title: 'The listener you cannot remove',
    category: 'events',
    difficulty: 'intermediate',
    concepts: ['removeEventListener', 'function identity', 'AbortController', 'signal', 'teardown'],
    relatedIds: ['events-delegate-one-listener'],
    load: () => import('./listenerIdentity').then((module) => module.listenerIdentity),
  },
  {
    id: 'events-once-listener',
    slug: 'once-listener',
    title: 'The handler that must not run twice',
    category: 'events',
    difficulty: 'intermediate',
    concepts: ['once', 'listener options', 'removeEventListener', 'one-shot handlers', 'double submit'],
    relatedIds: ['events-listener-identity'],
    load: () => import('./onceListener').then((module) => module.onceListener),
  },
  {
    id: 'events-duplicate-listeners',
    slug: 'duplicate-listeners',
    title: 'Register it three times, run it once',
    category: 'events',
    difficulty: 'advanced',
    concepts: ['addEventListener', 'listener de-duplication', 'listener order', 'function identity', 'WeakMap'],
    relatedIds: ['events-listener-identity', 'events-once-listener'],
    load: () => import('./duplicateListeners').then((module) => module.duplicateListeners),
  },
  {
    id: 'events-abort-many',
    slug: 'abort-many',
    title: 'One signal, every listener',
    category: 'events',
    difficulty: 'advanced',
    concepts: ['AbortController', 'signal', 'teardown', 'pointer events', 'document listeners'],
    relatedIds: ['events-listener-identity', 'events-once-listener'],
    load: () => import('./abortMany').then((module) => module.abortMany),
  },
  {
    id: 'events-outside-click',
    slug: 'outside-click',
    title: 'The menu that closes the moment it opens',
    category: 'events',
    difficulty: 'expert',
    concepts: ['propagation', 'listeners added during dispatch', 'capture phase', 'contains', 'teardown'],
    relatedIds: ['events-capture-phase', 'events-stop-propagation', 'events-listener-identity'],
    load: () => import('./outsideClick').then((module) => module.outsideClick),
  },
  {
    id: 'events-composed-path',
    slug: 'composed-path',
    title: 'The click the page is not allowed to see',
    category: 'events',
    difficulty: 'expert',
    concepts: ['composedPath', 'retargeting', 'shadow DOM', 'event delegation', 'dataset'],
    relatedIds: ['selection-shadow-boundary'],
    load: () => import('./composedPath').then((module) => module.composedPath),
  },
];
