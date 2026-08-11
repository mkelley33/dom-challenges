import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createMemoryHost } from '@/test/createMemoryHost';
import type { Challenge } from '@/types/challenge';

import { protectAppStorage } from './appStorage';
import type { HostContext, HostHandle } from './harness';
import { renderPreview, runChallenge } from './harness';

const EDITOR_KEY = 'dom-challenges-editor';
const DRAFTS = JSON.stringify({ state: { drafts: { 'selection-query-basics': 'const mine = 1;' } }, version: 0 });
const TYPED = JSON.stringify({ state: { drafts: { 'selection-query-basics': 'const typed = 2;' } }, version: 0 });

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
  const host = protectAppStorage(sharedStorageHost());
  openHosts.push(host);
  return host;
}

function makeChallenge(): Challenge {
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
    // The assertion is irrelevant here; what matters is that the submitted code ran in the frame.
    tests: [{ name: 'runs the submitted code', run: () => undefined }],
    solutions: [{ label: 'Canonical', code: '', explanation: '', tradeoffs: '' }],
  };
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem(EDITOR_KEY, DRAFTS);
});

afterEach(() => {
  for (const host of openHosts) host.dispose();
  openHosts.length = 0;
  localStorage.clear();
});

describe('a run guards the app’s persisted keys', () => {
  it('puts back a key the submitted code cleared, by the time the run returns', async () => {
    await runChallenge(makeChallenge(), 'localStorage.clear();', guardedHost());

    // No `dispose()` first: the repair has to have happened by the time the learner is looking at
    // their result, not at some later teardown that may never come.
    expect(localStorage.getItem(EDITOR_KEY)).toBe(DRAFTS);
  });

  it('puts back a key the submitted code overwrote by name', async () => {
    const code = `localStorage.setItem(${JSON.stringify(EDITOR_KEY)}, 'clobbered');`;
    await runChallenge(makeChallenge(), code, guardedHost());

    expect(localStorage.getItem(EDITOR_KEY)).toBe(DRAFTS);
  });

  it('guards the preview render as well as the run', async () => {
    await renderPreview(makeChallenge(), 'localStorage.clear();', guardedHost());

    expect(localStorage.getItem(EDITOR_KEY)).toBe(DRAFTS);
  });

  it('still repairs when the submitted code throws at module scope', async () => {
    // The execute-error path returns from inside the loop, so the repair has to be in a `finally`
    // rather than after it.
    const result = await runChallenge(makeChallenge(), 'localStorage.clear(); throw new Error("boom");', guardedHost());

    expect(result.error?.phase).toBe('execute');
    expect(localStorage.getItem(EDITOR_KEY)).toBe(DRAFTS);
  });

  it('leaves a pre-existing key outside the app prefix alone when the code overwrites it', async () => {
    // Seeded *before* the run on purpose. The guard only ever puts back keys it captured, so a key
    // the submitted code merely creates is out of its reach whatever the prefix says -- and a
    // version of this test that wrote a fresh key survived having the prefix check deleted.
    localStorage.setItem('filters:a', 'seeded before the run');

    // The Storage category's whole subject is writing to `localStorage`. A guard that reverted
    // everything would make its challenges unsolvable, so the prefix is the boundary.
    await runChallenge(makeChallenge(), "localStorage.setItem('filters:a', 'written by a challenge');", guardedHost());

    expect(localStorage.getItem('filters:a')).toBe('written by a challenge');
  });

  it('does not resurrect a pre-existing key outside the app prefix that the code cleared', async () => {
    localStorage.setItem('filters:a', 'seeded before the run');

    await runChallenge(makeChallenge(), 'localStorage.clear();', guardedHost());

    // Paired with the assertion above so "the guard did nothing at all" cannot pass as "the prefix
    // is respected": the app's own key is back, and this one is not.
    expect(localStorage.getItem(EDITOR_KEY)).toBe(DRAFTS);
    expect(localStorage.getItem('filters:a')).toBeNull();
  });

  it('does not revert a value the app persisted between two runs', async () => {
    const host = guardedHost();
    await runChallenge(makeChallenge(), '// nothing', host);

    // The learner typed. This is the common case, not a race: it is the entire gap between clicking
    // Run and clicking it again. A guard that held its snapshot across that gap would roll every
    // keystroke back, which is what the first version of this module did.
    localStorage.setItem(EDITOR_KEY, TYPED);

    await runChallenge(makeChallenge(), '// nothing', host);

    expect(localStorage.getItem(EDITOR_KEY)).toBe(TYPED);
  });
});

describe('protectAppStorage covers what the frame defers past its run', () => {
  it('puts back a key cleared after the run settled, at the next reset', async () => {
    const host = guardedHost();
    const context = await host.reset('<p></p>');

    // Stands in for a `setTimeout` registered at module scope: the preview frame stays alive after
    // the run finishes, so this fires with no run armed.
    context.window.localStorage.clear();
    await host.reset('<p></p>');

    expect(localStorage.getItem(EDITOR_KEY)).toBe(DRAFTS);
  });

  it('puts back a key cleared after the run settled, at dispose', async () => {
    const host = guardedHost();
    const context = await host.reset('<p></p>');

    context.window.localStorage.clear();
    host.dispose();

    expect(localStorage.getItem(EDITOR_KEY)).toBe(DRAFTS);
  });

  it('puts back a key cleared after the run settled, on pagehide', async () => {
    const host = guardedHost();
    const context = await host.reset('<p></p>');

    // Closing the tab runs no React effect cleanup, so `dispose()` may never happen. Measured
    // through the production host: after a deferred `clear()` the key reads as lost right up until
    // teardown, and a tab closed in that window takes the drafts with it.
    context.window.localStorage.clear();
    window.dispatchEvent(new Event('pagehide'));

    expect(localStorage.getItem(EDITOR_KEY)).toBe(DRAFTS);
  });

  it('stops listening for pagehide once disposed', async () => {
    const host = guardedHost();
    await host.reset('<p></p>');
    host.dispose();

    // A host is disposed on every challenge navigation and every StrictMode remount. A listener
    // left behind would still be holding a stale baseline and would resurrect keys long after its
    // frame was gone -- so the absence of that is what this asserts.
    localStorage.clear();
    window.dispatchEvent(new Event('pagehide'));

    expect(localStorage.getItem(EDITOR_KEY)).toBeNull();
  });

  it('never reverts a changed value, because outside a run that is the app’s own write', async () => {
    const host = guardedHost();
    await host.reset('<p></p>');

    localStorage.setItem(EDITOR_KEY, TYPED);
    host.dispose();

    // The asymmetry between this and the two tests above is the design: missing is only ever the
    // frame, changed is overwhelmingly the app.
    expect(localStorage.getItem(EDITOR_KEY)).toBe(TYPED);
  });

  it('re-captures per reset, so a key added by the app later is protected too', async () => {
    const host = guardedHost();
    await host.reset('<p></p>');

    localStorage.setItem('dom-challenges-later', 'added after the first capture');
    const context = await host.reset('<p></p>');
    context.window.localStorage.clear();
    host.dispose();

    expect(localStorage.getItem('dom-challenges-later')).toBe('added after the first capture');
  });
});
