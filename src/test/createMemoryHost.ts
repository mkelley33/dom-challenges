import { Window as HappyDomWindow } from 'happy-dom';

import type { HostContext, HostHandle } from '@/runner/harness';

/**
 * A HostHandle backed by happy-dom, for running the harness under Vitest.
 *
 * Lives under `src/test/` rather than `src/runner/` because it imports happy-dom, a
 * devDependency: nothing reachable from `main.tsx` may import this file.
 *
 * happy-dom's Window is structurally close to but not identical with lib.dom's Window,
 * so the returned context is cast through `unknown`. The casts are confined to this file.
 * The import is aliased so those casts can name lib.dom's `Window` rather than happy-dom's.
 */
export function createMemoryHost(): HostHandle {
  let current: HappyDomWindow | null = null;

  return {
    reset(html: string): Promise<HostContext> {
      current?.close();
      const win = new HappyDomWindow({ url: 'https://challenges.local/' });
      win.document.body.innerHTML = html;
      current = win;
      return Promise.resolve({
        window: win as unknown as Window & typeof globalThis,
        document: win.document as unknown as Document,
      });
    },
    dispose(): void {
      current?.close();
      current = null;
    },
  };
}
