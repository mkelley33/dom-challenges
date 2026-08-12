import type { ProtectAppStorageOptions } from './appStorage';
import { protectAppStorage } from './appStorage';
import type { HostContext, HostHandle } from './harness';

const BASE_STYLES = `
  *, *::before, *::after { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 12px;
    font: 14px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif;
    color: #18181b;
    background: #ffffff;
  }
`;

function documentFor(html: string): string {
  return [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="utf-8">',
    `<style>${BASE_STYLES}</style>`,
    `</head><body>${html}</body></html>`,
  ].join('');
}

/**
 * Rejects a `reset` whose frame was torn down before it ever loaded.
 *
 * Its own class rather than a bare `Error` so a caller can tell "the run was cancelled" from
 * "the frame failed", and report the first as nothing at all.
 */
export class HostDisposedError extends Error {
  constructor() {
    super('The preview frame was torn down before it finished loading.');
    this.name = 'HostDisposedError';
  }
}

/**
 * A HostHandle backed by a same-origin srcdoc iframe.
 *
 * No `sandbox` attribute: the harness needs to pass live function references and read
 * `contentDocument` directly. Isolation here means DOM isolation — a broken solution
 * cannot corrupt the app shell — not a security boundary against untrusted code, **and not storage
 * isolation**: same-origin means the frame and the app share one `localStorage` area, so submitted
 * code can empty the app's persisted drafts. `protectAppStorage` below is what puts them back; see
 * its docblock for why no frame arrangement avoids the sharing in the first place.
 */
export function createIframeHost(container: HTMLElement, storage: ProtectAppStorageOptions = {}): HostHandle {
  let frame: HTMLIFrameElement | null = null;
  // The `reject` of a `reset` that has not settled yet, if there is one.
  let cancelPending: ((error: Error) => void) | null = null;

  /**
   * Removing a frame means its `load` will never fire, so tearing one down while its `reset` is
   * still waiting would strand that promise forever -- and `runChallenge` awaits `reset`
   * unguarded, so a caller that set a "running" flag before the call would never clear it.
   * Whoever removes the frame therefore owns settling the promise that was waiting on it.
   */
  const destroy = (): void => {
    frame?.remove();
    frame = null;
    const cancel = cancelPending;
    cancelPending = null;
    cancel?.(new HostDisposedError());
  };

  // Wrapped here rather than at the call site so a second caller cannot forget it: the sharing this
  // repairs is created by the frame, so the repair belongs to whoever creates the frame. `storage`
  // is how the app hands down the one thing the runner may not reach for itself -- a way to ask the
  // store to re-persist. Without it the guard still works, but only against an outright deletion.
  return protectAppStorage(
    {
      reset(html: string): Promise<HostContext> {
        // Rebuilding rather than rewriting is the whole point: window listeners, timers and
        // observers registered by the previous attempt die with the frame that owned them.
        destroy();

        return new Promise<HostContext>((resolve, reject) => {
          cancelPending = reject;

          const next = document.createElement('iframe');
          next.title = 'Challenge preview';
          next.className = 'h-full w-full border-0 bg-white';

          next.addEventListener(
            'load',
            () => {
              cancelPending = null;
              const { contentWindow, contentDocument } = next;
              if (!contentWindow || !contentDocument) {
                reject(new Error('The preview frame did not initialise.'));
                return;
              }
              resolve({ window: contentWindow as Window & typeof globalThis, document: contentDocument });
            },
            { once: true },
          );

          // Order matters. `srcdoc` is assigned *before* insertion so that the frame's very first
          // navigation is the seeded document: an iframe inserted with no source navigates to
          // `about:blank` and fires `load` for it, which a listener attached here would mistake for
          // the seeded document being ready. Setting the attribute first means one navigation, and
          // therefore one `load`, carrying the markup this call asked for. Resolving on that event
          // rather than on the next tick is what keeps the wait a guarantee instead of a guess.
          next.srcdoc = documentFor(html);
          container.append(next);
          frame = next;
        });
      },
      dispose: destroy,
    },
    storage,
  );
}
