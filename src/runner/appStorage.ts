import type { HostContext, HostHandle } from './harness';

/**
 * The prefix every key this app persists under shares.
 *
 * One key wears it today -- `dom-challenges-editor`, the zustand `persist` name in
 * `src/store/editorStore.ts` -- and it holds `drafts`, every challenge's in-progress code. Progress
 * lives on json-server and can be refetched; **drafts are local-only and have no other copy.**
 *
 * A prefix rather than that one literal, so a second persisted key is protected by being named
 * consistently rather than by someone remembering to come back here.
 */
const APP_STORAGE_PREFIX = 'dom-challenges-';

/**
 * The app's own storage area, or `null` when there is not one to protect.
 *
 * Reading `localStorage` can throw outright rather than return null -- a cookie-blocking privacy
 * mode, a document with an opaque origin -- and a guard that threw while setting itself up would
 * take down the run it exists to protect.
 */
function appStorage(): Storage | null {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function snapshot(storage: Storage): Map<string, string> {
  const captured = new Map<string, string>();

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key === null || !key.startsWith(APP_STORAGE_PREFIX)) continue;

    const value = storage.getItem(key);
    if (value !== null) captured.set(key, value);
  }

  return captured;
}

/**
 * Why the two repairs below are not one repair.
 *
 * The app writes these keys constantly -- every keystroke in the editor persists `drafts`, every
 * drag of a pane persists `layout` -- and the frame writes them approximately never. So "the value
 * changed" is overwhelmingly the app, and "the key is gone" is *only ever* the frame: nothing in
 * this app removes a persisted key, and zustand rewrites the whole blob rather than deleting it
 * even when the last draft is cleared.
 *
 * Putting back a *changed* value is therefore only safe inside a window in which the app provably
 * did not write, and putting back a *missing* value is safe at any time at all. A single repair
 * that did both whenever it was convenient would revert every keystroke a learner typed between two
 * runs -- which is when learners actually type. That version was written first and a test caught it.
 */
function restoreChanged(storage: Storage, captured: Map<string, string>): void {
  for (const [key, value] of captured) {
    if (storage.getItem(key) !== value) storage.setItem(key, value);
  }
}

function restoreMissing(storage: Storage, captured: Map<string, string>): void {
  for (const [key, value] of captured) {
    if (storage.getItem(key) === null) storage.setItem(key, value);
  }
}

export interface AppStorageGuard {
  /**
   * Puts back every captured key that is now missing or altered.
   *
   * Call once the submitted code's turn is over. See `captureAppStorage` for why the window this
   * closes has to be short.
   */
  restore: () => void;
}

/**
 * Captures the app's persisted keys so a run can put back whatever submitted code did to them.
 *
 * **The preview frame is same-origin with the app, so it shares one storage area with it.** Two
 * `Storage` objects, one backing store: a key written in the frame is readable by the app, and one
 * line of learner code -- `localStorage.clear()` -- empties the app's alongside its own. Measured
 * through the production host, end to end, with `dom-challenges-editor` present before the call and
 * absent after it.
 *
 * The trigger is ordinary in three independent ways. `localStorage` is the Storage category's
 * legitimate subject and "clear everything" is natural content; the editor runs arbitrary code by
 * design, so any curious learner in any challenge can type it today; and it does not need `clear()`
 * at all, because writing to a key named `dom-challenges-editor` corrupts it just as thoroughly --
 * `onRehydrateStorage` runs `normaliseLayout` over `layout` and nothing whatsoever over `drafts`.
 *
 * **No reachable frame arrangement fixes this, which is why the repair lives here.**
 * `sandbox="allow-scripts"` would give the frame an opaque origin and isolate storage, but it drops
 * `allow-same-origin`, which nulls `contentDocument` and breaks the live function references the
 * harness is built on -- see AGENTS.md §2. Moving the app to `sessionStorage` or IndexedDB buys
 * nothing either: both are shared with a same-origin frame, as are `blob:` and same-origin `src`
 * frames. So the origin stays and the damage is undone instead.
 *
 * **The window is one run, and that bound is the whole design.** Armed when a run starts, restored
 * when it settles, and holding nothing in between -- so a learner typing *between* two runs is
 * never touched. A write the app makes *during* a run can be rolled back, and that is the accepted
 * cost: zustand still holds the newer state in memory and re-persists it on the very next write, so
 * the loss is transient, where losing every draft is not.
 */
export function captureAppStorage(): AppStorageGuard {
  const storage = appStorage();
  const captured = storage === null ? null : snapshot(storage);

  return {
    restore: () => {
      if (storage !== null && captured !== null) restoreChanged(storage, captured);
    },
  };
}

/**
 * Wraps a host so a key that *vanishes* while no run is in flight is put back at the next reset and
 * at teardown.
 *
 * This is the half `captureAppStorage` cannot reach. The preview frame stays alive after the last
 * run finishes -- it is showing the learner their own output -- so a `setTimeout` registered at
 * module scope fires when no run is armed and no further `reset` may ever come. Teardown is the
 * only moment left.
 *
 * Deliberately **missing-only**: this repair can fire long after any run, at a moment when a
 * changed value is far more likely to be the app's own than the frame's. A deferred overwrite of
 * the exact key `dom-challenges-editor`, arriving after its run settled, is therefore the one case
 * neither half covers -- an exotic shape, and the alternative is reverting real work on every
 * teardown.
 */
export function protectAppStorage(host: HostHandle): HostHandle {
  let captured: Map<string, string> | null = null;

  const rescue = (): void => {
    const storage = appStorage();
    if (storage === null) return;

    if (captured !== null) restoreMissing(storage, captured);
    // Re-captured every time rather than held from the first reset, so the baseline tracks the
    // app's own writes. Safe precisely because this repair only ever fills an absence.
    captured = snapshot(storage);
  };

  // `dispose()` is not guaranteed to happen. Closing the tab does not run React effect cleanup, so
  // a deferred `clear()` that fired while the preview frame sat idle would be repaired by nothing
  // at all -- measured through the production host, where the key reads as lost right up until
  // teardown. `pagehide` is the last moment a document reliably gets, and it also covers bfcache.
  const onPageHide = (): void => {
    rescue();
  };
  globalThis.addEventListener('pagehide', onPageHide);

  return {
    reset(html: string): Promise<HostContext> {
      rescue();
      return host.reset(html);
    },
    dispose(): void {
      // Removed first: a host is disposed on every challenge navigation and on every StrictMode
      // remount, so a listener left behind here accumulates one per visit for the life of the tab.
      globalThis.removeEventListener('pagehide', onPageHide);
      rescue();
      host.dispose();
    },
  };
}
