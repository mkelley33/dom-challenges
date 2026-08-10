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
 * A HostHandle backed by a same-origin srcdoc iframe.
 *
 * No `sandbox` attribute: the harness needs to pass live function references and read
 * `contentDocument` directly. Isolation here means DOM isolation — a broken solution
 * cannot corrupt the app shell — not a security boundary against untrusted code.
 */
export function createIframeHost(container: HTMLElement): HostHandle {
  let frame: HTMLIFrameElement | null = null;

  const destroy = (): void => {
    frame?.remove();
    frame = null;
  };

  return {
    reset(html: string): Promise<HostContext> {
      // Rebuilding rather than rewriting is the whole point: window listeners, timers and
      // observers registered by the previous attempt die with the frame that owned them.
      destroy();

      return new Promise<HostContext>((resolve, reject) => {
        const next = document.createElement('iframe');
        next.title = 'Challenge preview';
        next.className = 'h-full w-full border-0 bg-white';

        next.addEventListener(
          'load',
          () => {
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
  };
}
