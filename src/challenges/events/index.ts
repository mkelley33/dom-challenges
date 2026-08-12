import type { ChallengeEntry } from '@/types/challenge';

/**
 * The Events category, as metadata plus one dynamic import each.
 *
 * Reconnoitred before anything was authored. **Ordinary event mechanics are full fidelity** and
 * match real Chrome through the production host on every point measured: the capture/target/bubble
 * order with correct `eventPhase` values, `currentTarget` versus `target` under delegation,
 * `stopPropagation`, `stopImmediatePropagation`, `once`, listener de-duplication, `preventDefault`
 * and `dispatchEvent`'s return value for cancelable and non-cancelable events, `CustomEvent.detail`,
 * `handleEvent` object listeners, `AbortController` removing many listeners across many targets,
 * and `signal.reason` being an `AbortError`.
 *
 * **Three divergences, all of them about the shadow boundary or about an aborted signal.**
 * Measured, same code both hosts:
 *
 * | read                                            | Chrome                | happy-dom             |
 * | ----------------------------------------------- | --------------------- | --------------------- |
 * | `event.target` at a listener outside an open root| the **host**          | the inner node        |
 * | `composedPath().length` for a **closed** root    | 5 (truncated at host) | 7 (not truncated)     |
 * | `event.target` for a closed root                | the host              | the inner node        |
 * | `composedPath()` read after dispatch ends       | `[]`                  | the stale path        |
 * | `addEventListener` with an already-aborted signal| never attaches        | attaches and fires    |
 *
 * The first is the sharpest, because it fails in the safe direction *for the suite* and the unsafe
 * direction for a learner: `event.target.closest(...)` is the natural wrong answer, and happy-dom
 * lets it find the inner node. **So a challenge about retargeting cannot be validated by asserting
 * on `event.target`.** This one is built the other way round instead -- the markup puts a
 * `data-action` both inside the root and on the host, so the same wrong solution fails a *different*
 * named test in each engine (the inside-the-root case in Chrome, the on-the-host case here), and is
 * therefore rejected by the content suite and by the browser for two different reasons. Verified by
 * running it in both.
 *
 * What is portable and was used: `composedPath()` itself, whose contents are identical in both --
 * seven entries for an open root, `[0]` is the real innermost target, and filtering it to
 * `nodeType === 1` gives the same element list. `parentNode` of a shadow root's top-level child is
 * the root in both, and its `parentElement` is `null` in both, which is what makes the by-hand walk
 * portable too. Never assert a `ShadowRoot`'s `nodeName`: Chrome says `#document-fragment`,
 * happy-dom says `''`. See AGENTS.md §3 and §10.
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
