import { afterEach, describe, expect, it } from 'vitest';

import type { Challenge } from '@/types/challenge';

import type { HostHandle } from './harness';
import { runChallenge } from './harness';
import { createIframeHost } from './iframeHost';

interface Mounted {
  container: HTMLDivElement;
  host: HostHandle;
}

const mounted: Mounted[] = [];

/**
 * Builds a host over a container that is actually connected to the document.
 *
 * Connection matters: a frame inside a detached subtree never navigates, so a host built over a
 * loose `div` would hang on `reset` rather than fail. Cleanup runs from `afterEach` instead of the
 * end of each test so that a failing assertion still tears the frame down.
 */
function mountHost(): Mounted {
  const container = document.createElement('div');
  document.body.append(container);
  const entry: Mounted = { container, host: createIframeHost(container) };
  mounted.push(entry);
  return entry;
}

afterEach(() => {
  for (const { container, host } of mounted.splice(0)) {
    host.dispose();
    container.remove();
  }
});

describe('createIframeHost', () => {
  it('mounts an iframe into the container and exposes its document', async () => {
    const { host, container } = mountHost();

    const context = await host.reset('<p id="hello">hi</p>');

    expect(container.querySelectorAll('iframe')).toHaveLength(1);
    expect(context.document.getElementById('hello')?.textContent).toBe('hi');
  });

  it('seeds a whole document, not just a body fragment', async () => {
    const { host } = mountHost();

    const context = await host.reset('<p id="hello">hi</p>');

    expect(context.document.documentElement.tagName.toLowerCase()).toBe('html');
    expect(context.document.head.querySelector('style')).not.toBeNull();
    expect(context.document.body.querySelector('#hello')).not.toBeNull();
  });

  it('resolves only once the frame has finished loading', async () => {
    const { host, container } = mountHost();

    const pending = host.reset('<p id="hello">hi</p>');
    const frame = container.querySelector('iframe');
    const context = await pending;

    // These assertions describe the resolved context; they do not, on their own, prove the wait.
    // happy-dom applies `srcdoc` synchronously during `append`, so the seeded markup is already
    // in the frame's document by the time `reset` returns and a `reset` that resolved eagerly --
    // without ever awaiting `load` -- would satisfy every assertion below. The test that
    // discriminates is `does not resolve while the frame never loads`, further down; this one
    // pins the *shape* of what a successful load hands back.
    expect(frame).not.toBeNull();
    expect(context.document).toBe(frame?.contentDocument);
    // Not `toBe('complete')`: a browser fires `load` once the document is complete, happy-dom
    // fires it while the state is still `interactive`. `not.toBe('loading')` is the assertion both
    // agree on, and it is the one that matters here -- parsing is over, so the markup exists.
    expect(context.document.readyState).not.toBe('loading');
    expect(context.document.getElementById('hello')).not.toBeNull();
  });

  it('does not resolve while the frame never loads', async () => {
    // The falsifiable half of the load-wait guarantee. A frame inside a detached subtree never
    // navigates, so it never fires `load` -- which makes this the one arrangement where an eager
    // `reset` is distinguishable from a waiting one under happy-dom, whose synchronous `srcdoc`
    // hides the difference everywhere else. An implementation that resolves without awaiting
    // `load` settles here; the real one stays pending until the timer below wins the race.
    const detached = document.createElement('div');
    const host = createIframeHost(detached);

    // Both outcomes are folded into one label so that a rejection cannot pass as "pending", and
    // so that disposing below -- which settles the in-flight reset -- has a handler waiting.
    const settled = host.reset('<p id="hello">hi</p>').then(
      () => 'settled',
      () => 'settled',
    );
    let timer: ReturnType<typeof setTimeout> | undefined;
    const outcome = await Promise.race([
      settled,
      new Promise<string>((resolve) => {
        timer = setTimeout(() => resolve('pending'), 50);
      }),
    ]);
    clearTimeout(timer);

    expect(outcome).toBe('pending');
    host.dispose();
  });

  it('does not sandbox the frame, so the harness can reach into it', async () => {
    const { host, container } = mountHost();

    await host.reset('<p></p>');

    const frame = container.querySelector('iframe');
    expect(frame).not.toBeNull();
    expect(frame?.hasAttribute('sandbox')).toBe(false);
  });

  it('replaces the frame on reset so no state survives', async () => {
    const { host, container } = mountHost();

    const first = await host.reset('<p id="a"></p>');
    first.window.setTimeout(() => undefined, 100_000);
    const firstFrame = container.querySelector('iframe');
    const second = await host.reset('<p id="b"></p>');

    expect(container.querySelectorAll('iframe')).toHaveLength(1);
    expect(container.querySelector('iframe')).not.toBe(firstFrame);
    expect(second.window).not.toBe(first.window);
    expect(second.document.getElementById('a')).toBeNull();
    expect(second.document.getElementById('b')).not.toBeNull();
  });

  it('discards mutations made to the previous document', async () => {
    const { host } = mountHost();

    const first = await host.reset('<p id="hello">hi</p>');
    const marker = first.document.createElement('span');
    marker.id = 'left-behind';
    first.document.body.append(marker);
    first.document.body.classList.add('dirty');

    // Same markup both times: a `reset` that reused the old document would still satisfy every
    // assertion about `#hello` being present, so the mutations are the only witness of a rebuild.
    const second = await host.reset('<p id="hello">hi</p>');

    expect(second.document.getElementById('left-behind')).toBeNull();
    expect(second.document.body.classList.contains('dirty')).toBe(false);
    expect(second.document.getElementById('hello')).not.toBeNull();
  });

  it('hands back a context belonging to the frame realm, not the app realm', async () => {
    const { host } = mountHost();

    const context = await host.reset('<p id="hello">hi</p>');
    const created = context.document.createElement('div');
    const seeded = context.document.getElementById('hello');

    // The identity checks are what carry the realm guarantee here: nothing but a distinct
    // window and document can satisfy them.
    expect(context.window).not.toBe(globalThis.window);
    expect(context.document).not.toBe(globalThis.document);
    // The two `toBeInstanceOf` checks below are realm checks in a browser only. happy-dom
    // shares one class table across `Window` instances, so `context.window.Element` is the
    // *same* class object as this realm's -- they would hold even if `reset` handed back the
    // app's own window. Kept because they are correct and do discriminate where it counts (a
    // real frame's classes are its own), but they prove nothing under Vitest: read them as
    // documentation of the browser contract, not as this file's evidence for it.
    expect(created).toBeInstanceOf(context.window.Element);
    expect(seeded).toBeInstanceOf(context.window.HTMLParagraphElement);
    expect(context.document.defaultView).toBe(context.window);
  });

  it('runs a whole challenge against the frame', async () => {
    const { host } = mountHost();
    const challenge: Challenge = {
      id: 'iframe-host-1',
      slug: 'iframe-host-1',
      title: 'Iframe host',
      category: 'selection',
      difficulty: 'novice',
      prompt: 'Add the class `found` to #target.',
      html: '<div id="target"></div>',
      starterCode: '',
      tests: [
        {
          name: 'adds the class inside the frame',
          run: ({ doc, win, expect: assert }) => {
            const target = doc.getElementById('target');
            assert(target).toHaveClass('found');
            assert(target).toBeInstanceOf(win.HTMLDivElement);
          },
        },
      ],
      solutions: [{ label: 'Canonical', code: '', explanation: '', tradeoffs: '' }],
      concepts: [],
      relatedIds: [],
    };

    const result = await runChallenge(challenge, 'document.getElementById("target")?.classList.add("found");', host);

    expect(result.error).toBeNull();
    expect(result.passed).toBe(true);
  });

  it('removes the frame on dispose', async () => {
    const { host, container } = mountHost();

    await host.reset('<p></p>');
    host.dispose();

    expect(container.querySelectorAll('iframe')).toHaveLength(0);
  });

  it('tolerates dispose without a frame and dispose twice', () => {
    const { host, container } = mountHost();

    host.dispose();
    host.dispose();

    expect(container.querySelectorAll('iframe')).toHaveLength(0);
  });
});
