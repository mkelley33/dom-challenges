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
 * Whether storage still agrees with the baseline: every captured key present and unchanged, and no
 * prefixed key that was not there before.
 *
 * The second half matters for a learner who is new: with nothing persisted yet the baseline is
 * empty, so submitted code writing `dom-challenges-editor` by name would otherwise be invisible
 * here and would be read back as real state on the next load.
 */
function differsFromBaseline(storage: Storage, captured: Map<string, string>): boolean {
  for (const [key, value] of captured) {
    if (storage.getItem(key) !== value) return true;
  }

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key !== null && key.startsWith(APP_STORAGE_PREFIX) && !captured.has(key)) return true;
  }

  return false;
}

/**
 * The fallback repair, used only when no `repersistAppState` seam was supplied.
 *
 * **Missing-only, and that asymmetry is forced.** Writing back a *changed* value means guessing who
 * changed it, and the app writes these keys constantly -- every keystroke persists `drafts`, every
 * pane drag persists `layout` -- while the frame writes them approximately never. Guess wrong and
 * the guard rolls back real work. A missing key is unambiguous: **nothing in this app removes one**
 * (AGENTS.md §4), so an absence is always the frame.
 */
function restoreMissing(storage: Storage, captured: Map<string, string>): void {
  for (const [key, value] of captured) {
    if (storage.getItem(key) === null) storage.setItem(key, value);
  }
}

export interface ProtectAppStorageOptions {
  /**
   * Asks the app to write its own in-memory state back over whatever is in storage.
   *
   * **This is what makes the repair exact instead of a guess**, and it works because of an asymmetry
   * the frame cannot cross: the app's authoritative copy lives in memory, and a same-origin iframe
   * shares the *storage area* but has no reference to the app's module graph. So any disagreement
   * between storage and memory is the frame's, at any moment, with no run window to bound and no
   * missing-versus-changed split to get right.
   *
   * It also makes detection free to be imprecise. Repairing when the app itself wrote simply
   * rewrites the value the app already holds, so a false positive costs one redundant write --
   * measured at 0.004ms, and it does not change the `drafts` reference, so selector subscribers do
   * not re-render.
   *
   * Implement it by asking the persistence layer to re-run its own write (for zustand,
   * `setState` with the same slice), **never** by reconstructing the stored envelope by hand: a
   * hand-built envelope that drifted from the library's would be judged "different" on every check
   * and would overwrite the real value with a malformed one on every reset.
   */
  repersistAppState?: () => void;
}

/**
 * Wraps a host so code running inside its frame cannot destroy the app's persisted state.
 *
 * **The preview frame is same-origin with the app, so it shares one storage area with it.** Two
 * `Storage` objects, one backing store: a key written in the frame is readable by the app, and one
 * line of learner code -- `localStorage.clear()` -- empties the app's alongside its own. Measured
 * through the production host, end to end, with `dom-challenges-editor` present before the call and
 * absent after it. That key holds `drafts`, every challenge's in-progress code, and drafts are
 * local-only with no other copy.
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
 * Checked at every boundary the frame's life has: each `reset`, `dispose`, and `pagehide`. Nothing
 * reads this storage in between -- the app reads it once, when it rehydrates on load -- so a repair
 * at the next boundary is as good as an immediate one, and `pagehide` is what covers a tab closed
 * while a deferred `setTimeout` has just emptied the store.
 */
export function protectAppStorage(host: HostHandle, options: ProtectAppStorageOptions = {}): HostHandle {
  const { repersistAppState } = options;
  let captured: Map<string, string> | null = null;

  const rescue = (): void => {
    const storage = appStorage();
    if (storage === null) return;

    if (captured !== null) {
      if (repersistAppState === undefined) restoreMissing(storage, captured);
      else if (differsFromBaseline(storage, captured)) repersistAppState();
    }
    // Re-captured every time rather than held from the first reset, so the baseline tracks the
    // app's own writes rather than accusing them.
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
