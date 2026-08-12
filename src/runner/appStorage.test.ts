import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createMemoryHost } from '@/test/createMemoryHost';
import type { Challenge, ChallengeTest } from '@/types/challenge';

import { protectAppStorage } from './appStorage';
import type { HostContext, HostHandle } from './harness';
import { runChallenge } from './harness';

const EDITOR_KEY = 'dom-challenges-editor';
const DRAFTS = JSON.stringify({ state: { drafts: { 'selection-query-basics': 'const mine = 1;' } }, version: 0 });
const TYPED = JSON.stringify({ state: { drafts: { 'selection-query-basics': 'const typed = 2;' } }, version: 0 });

/**
 * The app's authoritative copy, which lives in memory and which the frame cannot reach.
 *
 * Stands in for the zustand store. `repersist` is what the real `useChallengeRun` hands down: a
 * request for the store to write its own state back through `persist`, rather than a value the
 * runner reconstructed.
 */
let memory = DRAFTS;

function repersistAppState(): void {
  localStorage.setItem(EDITOR_KEY, memory);
}

/** Models the app persisting -- memory first, then storage, which is the order zustand uses. */
function appWrites(value: string): void {
  memory = value;
  repersistAppState();
}

/**
 * A host whose frame shares one storage area with the app, which is what a same-origin iframe is.
 *
 * happy-dom gives every `Window` it creates its own store -- verified: a key written through one
 * window reads back `null` through another -- so the defect this guards against is *unreproducible*
 * under Vitest unless the browser's actual arrangement is rebuilt here. Two `Storage` handles over
 * one backing store, which is what was measured through the production host: the two objects are
 * not identical, and a `clear()` through either empties both.
 */
function sharedStorageHost(): HostHandle {
  const inner = createMemoryHost();

  return {
    async reset(html: string): Promise<HostContext> {
      const context = await inner.reset(html);
      Object.defineProperty(context.window, 'localStorage', {
        configurable: true,
        get: () => globalThis.localStorage,
      });
      return context;
    },
    dispose: () => {
      inner.dispose();
    },
  };
}

const openHosts: HostHandle[] = [];

function guardedHost(): HostHandle {
  const host = protectAppStorage(sharedStorageHost(), { repersistAppState });
  openHosts.push(host);
  return host;
}

/** The same guard with no seam supplied -- the weaker fallback a caller that forgot would get. */
function unseamedHost(): HostHandle {
  const host = protectAppStorage(sharedStorageHost());
  openHosts.push(host);
  return host;
}

function makeChallenge(tests?: ChallengeTest[]): Challenge {
  return {
    id: 'storage-guard',
    slug: 'storage-guard',
    title: 'Storage guard',
    category: 'storage',
    difficulty: 'novice',
    prompt: '',
    html: '<div id="target"></div>',
    starterCode: '',
    concepts: [],
    relatedIds: [],
    tests: tests ?? [{ name: 'runs the submitted code', run: () => undefined }],
    solutions: [{ label: 'Canonical', code: '', explanation: '', tradeoffs: '' }],
  };
}

beforeEach(() => {
  localStorage.clear();
  memory = DRAFTS;
  localStorage.setItem(EDITOR_KEY, DRAFTS);
});

afterEach(() => {
  for (const host of openHosts) host.dispose();
  openHosts.length = 0;
  localStorage.clear();
});

describe('repairing damage the frame did', () => {
  it('puts back a key the submitted code cleared, at the next reset', async () => {
    const host = guardedHost();
    const context = await host.reset('<p></p>');

    context.window.localStorage.clear();
    expect(localStorage.getItem(EDITOR_KEY)).toBeNull();

    await host.reset('<p></p>');

    expect(localStorage.getItem(EDITOR_KEY)).toBe(DRAFTS);
  });

  it('puts back a key the submitted code overwrote by name', async () => {
    const host = guardedHost();
    const context = await host.reset('<p></p>');

    // `clear()` is not the only way to lose the drafts. Writing the key directly corrupts it, and
    // `normaliseLayout` repairs only `layout` on rehydration -- never `drafts`.
    context.window.localStorage.setItem(EDITOR_KEY, 'not json');
    await host.reset('<p></p>');

    expect(localStorage.getItem(EDITOR_KEY)).toBe(DRAFTS);
  });

  it('repairs across a whole run, not only at its edges', async () => {
    const host = guardedHost();

    await runChallenge(makeChallenge(), `localStorage.setItem(${JSON.stringify(EDITOR_KEY)}, 'clobbered');`, host);
    host.dispose();

    expect(localStorage.getItem(EDITOR_KEY)).toBe(DRAFTS);
  });

  it('repairs at dispose, which is what covers code the frame deferred past its run', async () => {
    const host = guardedHost();
    const context = await host.reset('<p></p>');

    // A `setTimeout` registered at module scope outlives the run that started it: the preview frame
    // stays alive showing the learner's output, so this fires when no further reset is coming.
    context.window.localStorage.clear();
    host.dispose();

    expect(localStorage.getItem(EDITOR_KEY)).toBe(DRAFTS);
  });

  it('repairs on pagehide, because closing the tab never runs dispose', async () => {
    const host = guardedHost();
    const context = await host.reset('<p></p>');

    context.window.localStorage.clear();
    window.dispatchEvent(new Event('pagehide'));

    expect(localStorage.getItem(EDITOR_KEY)).toBe(DRAFTS);
  });

  it('repairs a key the frame invented when the app had never persisted one', async () => {
    // A learner who has never had a draft saved: the baseline is empty, so there is nothing to
    // compare the key against -- and code that writes it by name would otherwise be read back as
    // real state on the next load.
    localStorage.clear();
    memory = DRAFTS;

    const host = guardedHost();
    const context = await host.reset('<p></p>');
    context.window.localStorage.setItem(EDITOR_KEY, 'invented by the frame');
    await host.reset('<p></p>');

    expect(localStorage.getItem(EDITOR_KEY)).toBe(DRAFTS);
  });

  it('stops listening for pagehide once disposed', async () => {
    const host = guardedHost();
    await host.reset('<p></p>');
    host.dispose();

    // A host is disposed on every challenge navigation and every StrictMode remount. A listener
    // left behind would keep repairing from a store its frame no longer has anything to do with.
    localStorage.clear();
    window.dispatchEvent(new Event('pagehide'));

    expect(localStorage.getItem(EDITOR_KEY)).toBeNull();
  });
});

describe('never rolling back a write the app made', () => {
  it('leaves a value the app persisted between two runs', async () => {
    const host = guardedHost();
    await runChallenge(makeChallenge(), '// nothing', host);

    appWrites(TYPED);
    await runChallenge(makeChallenge(), '// nothing', host);

    expect(localStorage.getItem(EDITOR_KEY)).toBe(TYPED);
  });

  it('leaves a value the app persisted *during* a run', async () => {
    // The measured case. The editor has no debounce and stays editable while a run is in flight,
    // and a run through the real host takes 305-410ms on the tick-heavy challenges -- so a keystroke
    // landing mid-run is ordinary, not a race. Measured before this seam existed: reverted in 5 of 5
    // challenges, and permanently lost when the learner stopped typing and left.
    //
    // The test's own body is the app write: it runs in the app realm, between two resets, which is
    // exactly where a keystroke lands.
    const host = guardedHost();
    const challenge = makeChallenge([
      { name: 'the learner types while the run is in flight', run: () => appWrites(TYPED) },
      { name: 'a later test forces another reset', run: () => undefined },
    ]);

    await runChallenge(challenge, '// nothing', host);
    host.dispose();

    expect(localStorage.getItem(EDITOR_KEY)).toBe(TYPED);
  });

  it('leaves keys outside the app prefix alone', async () => {
    localStorage.setItem('filters:a', 'seeded before the run');

    // The Storage category's whole subject is writing to `localStorage`. A guard that reverted
    // everything would make its challenges unsolvable, so the prefix is the boundary.
    await runChallenge(makeChallenge(), "localStorage.setItem('filters:a', 'written by a challenge');", guardedHost());

    expect(localStorage.getItem('filters:a')).toBe('written by a challenge');
  });

  it('does not resurrect a pre-existing key outside the app prefix that the code cleared', async () => {
    localStorage.setItem('filters:a', 'seeded before the run');
    const host = guardedHost();

    await runChallenge(makeChallenge(), 'localStorage.clear();', host);
    host.dispose();

    // Paired so "the guard did nothing at all" cannot pass as "the prefix is respected": the app's
    // own key is back, and this one is not.
    expect(localStorage.getItem(EDITOR_KEY)).toBe(DRAFTS);
    expect(localStorage.getItem('filters:a')).toBeNull();
  });
});

describe('the fallback when no repersist seam is supplied', () => {
  it('still puts back a key that vanished', async () => {
    const host = unseamedHost();
    const context = await host.reset('<p></p>');

    context.window.localStorage.clear();
    host.dispose();

    expect(localStorage.getItem(EDITOR_KEY)).toBe(DRAFTS);
  });

  it('does not roll back a changed value, because without the seam it cannot tell who changed it', async () => {
    const host = unseamedHost();
    await host.reset('<p></p>');

    appWrites(TYPED);
    host.dispose();

    expect(localStorage.getItem(EDITOR_KEY)).toBe(TYPED);
  });

  it('does not resurrect a non-app key, because the fallback writes the snapshot back verbatim', async () => {
    // The prefix filter matters more here than on the seam path. `repersistAppState` only ever
    // touches the app's own key however wide the snapshot is, but this branch writes back whatever
    // it captured — so an unfiltered snapshot would undo a challenge's own `clear()`.
    localStorage.setItem('filters:a', 'seeded before the run');
    const host = unseamedHost();
    const context = await host.reset('<p></p>');

    context.window.localStorage.clear();
    host.dispose();

    expect(localStorage.getItem(EDITOR_KEY)).toBe(DRAFTS);
    expect(localStorage.getItem('filters:a')).toBeNull();
  });

  it('protects an app key that first appeared after the host was created', async () => {
    const host = unseamedHost();
    await host.reset('<p></p>');

    // A baseline frozen at the first capture would never learn about this key, so the frame could
    // delete it unopposed. Re-capturing at every boundary is what keeps the fallback current.
    localStorage.setItem('dom-challenges-later', 'added after the first capture');
    const context = await host.reset('<p></p>');
    context.window.localStorage.clear();
    host.dispose();

    expect(localStorage.getItem('dom-challenges-later')).toBe('added after the first capture');
  });
});
