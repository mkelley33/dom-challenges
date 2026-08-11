import { afterEach, describe, expect, it } from 'vitest';

import type { HostContext, HostHandle } from '@/runner/harness';

import { createMemoryHost } from './createMemoryHost';

/**
 * What the content suite's engine cannot do, pinned so that a dependency bump says so.
 *
 * Phase 2's reconnaissance established these by measurement, and every one of them then lived only
 * in prose -- category docblocks, commit bodies, a report. Prose does not fail. Nothing would have
 * noticed a happy-dom release that started firing `IntersectionObserver`, and the category blocked
 * on it would have stayed blocked because the note saying so had gone stale in silence.
 *
 * So these tests assert the **absence** of a capability, which makes them the inverse of every
 * other test here: they are meant to fail one day, and the failure is the news. A red test in this
 * file means "go and re-read the category that was blocked on this", never "go and fix this file".
 *
 * Everything is read through `createMemoryHost` and the host realm's own globals rather than the
 * ambient ones. Node supplies `structuredClone` to the Vitest process, so asserting on a bare
 * global would measure the wrong realm entirely -- and the host realm is where challenge code runs.
 */
const openHosts: HostHandle[] = [];

async function hostContext(html = '<div id="target">target</div><ul id="list"></ul>'): Promise<HostContext> {
  const host = createMemoryHost();
  openHosts.push(host);
  return host.reset(html);
}

afterEach(() => {
  for (const host of openHosts) host.dispose();
  openHosts.length = 0;
});

/** Long enough that a delivery mechanism which works has visibly worked. */
const SETTLE_MS = 150;

async function settle(win: Window & typeof globalThis): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise<void>((resolve) => {
    win.setTimeout(resolve, SETTLE_MS);
  });
}

/**
 * A delivery channel that is known to work in this document, observed across the same wait.
 *
 * **This is the point of the whole file.** "X never fired" and "the wait was too short" are the
 * same observation, and this project has already produced one confident wrong answer by failing to
 * separate them: a first Chrome run reported `IntersectionObserver`, `ResizeObserver` and
 * `requestAnimationFrame` all dead, when the tab was simply backgrounded. A negative is only worth
 * recording next to a positive taken at the same instant in the same document. See AGENTS.md §5.
 */
function positiveControl(context: HostContext): { fired: () => number; stop: () => void } {
  const list = context.document.getElementById('list');
  if (!list) throw new Error('#list is missing from the fixture');

  let fired = 0;
  const observer = new context.window.MutationObserver(() => {
    fired += 1;
  });
  observer.observe(list, { childList: true });
  list.append(context.document.createElement('li'));

  return { fired: () => fired, stop: () => observer.disconnect() };
}

describe('APIs the memory host does not have at all', () => {
  it('has no indexedDB, so the Storage category cannot be authored against it', async () => {
    const context = await hostContext();
    expect(typeof context.window.indexedDB).toBe('undefined');
  });

  it('has no requestIdleCallback, so the Async category cannot schedule on idle time', async () => {
    const context = await hostContext();
    expect(typeof context.window.requestIdleCallback).toBe('undefined');
  });

  it('has no structuredClone', async () => {
    const context = await hostContext();
    // Read off the host window on purpose: Node gives the Vitest process its own `structuredClone`,
    // so the ambient global is present and says nothing about the realm challenge code runs in.
    expect(typeof context.window.structuredClone).toBe('undefined');
    expect(typeof structuredClone).toBe('function');
  });

  it('returns null from canvas.getContext("2d"), so Canvas challenges are browser-only', async () => {
    const context = await hostContext();
    const canvas = context.document.createElement('canvas');

    // The control: a real `<canvas>` with a real `getContext` method. Without it, `null` could just
    // as well mean the element was never created or the method was misspelled.
    expect(canvas.tagName).toBe('CANVAS');
    expect(typeof canvas.getContext).toBe('function');
    expect(canvas.getContext('2d')).toBeNull();
  });
});

describe('observers that construct but never deliver', () => {
  it('never invokes an IntersectionObserver callback', async () => {
    const context = await hostContext();
    const target = context.document.getElementById('target');
    if (!target) throw new Error('#target is missing from the fixture');

    let entries = 0;
    const observer = new context.window.IntersectionObserver((records) => {
      entries += records.length;
    });
    observer.observe(target);

    const control = positiveControl(context);
    await settle(context.window);
    observer.disconnect();
    control.stop();

    // The control first: if this were 0 the assertion below would be worthless.
    expect(control.fired()).toBeGreaterThan(0);
    expect(entries).toBe(0);
    // A browser delivers an initial entry for every observed element the moment observation starts,
    // so "not intersecting" is not what zero means here -- nothing was delivered at all.
    expect(observer.takeRecords()).toHaveLength(0);
  });

  it('never invokes a ResizeObserver callback, even after the observed box changes', async () => {
    const context = await hostContext();
    const target = context.document.getElementById('target');
    if (!target) throw new Error('#target is missing from the fixture');

    let entries = 0;
    const observer = new context.window.ResizeObserver((records) => {
      entries += records.length;
    });
    observer.observe(target);
    target.style.width = '400px';

    const control = positiveControl(context);
    await settle(context.window);
    observer.disconnect();
    control.stop();

    expect(control.fired()).toBeGreaterThan(0);
    expect(entries).toBe(0);
  });
});

describe('APIs present but not faithful', () => {
  it('drops a DragEvent’s dataTransfer, and reports it as undefined rather than null', async () => {
    const context = await hostContext();
    const data = new context.window.DataTransfer();
    data.setData('text/plain', 'row-1');

    const dragged = new context.window.DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true });

    // The control: the same init-dictionary mechanism, on the sibling event that *does* work. It is
    // what makes this a DragEvent gap rather than "constructed events lose their init here".
    const copied = new context.window.ClipboardEvent('copy', { clipboardData: data, bubbles: true });
    expect(copied.clipboardData).not.toBeNull();

    // `undefined`, not `null`, and the difference is load-bearing: the property is typed
    // `DataTransfer | null`, so a `=== null` guard does not return and the `.getData()` after it
    // throws a TypeError instead of taking the guarded branch.
    expect(dragged.dataTransfer).toBe(undefined);
    expect(dragged.dataTransfer).not.toBeNull();
  });

  it('orders an animation frame before a zero timer, which is the reverse of a browser', async () => {
    const context = await hostContext();
    const order: string[] = [];

    context.window.requestAnimationFrame(() => order.push('frame'));
    context.window.setTimeout(() => order.push('timer'), 0);
    await settle(context.window);

    // Chrome runs the timer first; happy-dom models frames with `setImmediate` and runs the frame
    // first. Measured in both. Pinned here so the divergence has somewhere to be seen -- and so the
    // rule it forces (AGENTS.md §3: no challenge may assert cross-scheduler ordering) has a reason
    // attached that outlives the person who found it.
    expect(order).toEqual(['frame', 'timer']);
  });

  it('queues one childList record per child of an inserted fragment, where a browser queues one', async () => {
    const context = await hostContext('<ul id="list"></ul>');
    const list = context.document.getElementById('list');
    if (!list) throw new Error('#list is missing from the fixture');

    const records: MutationRecord[] = [];
    let callbacks = 0;
    const observer = new context.window.MutationObserver((batch) => {
      callbacks += 1;
      records.push(...batch);
    });
    observer.observe(list, { childList: true });

    const fragment = context.document.createDocumentFragment();
    for (const name of ['a', 'b', 'c']) {
      const item = context.document.createElement('li');
      item.textContent = name;
      fragment.append(item);
    }
    list.append(fragment);

    await settle(context.window);
    observer.disconnect();

    // The controls: the insertion happened, and delivery is batched into a single callback exactly
    // as it is in a browser. So what follows is about record *granularity*, not about the observer
    // having missed anything or having been read too early.
    expect(list.children).toHaveLength(3);
    expect(callbacks).toBe(1);

    // Chrome queues ONE record carrying all three nodes, because a fragment is spliced in as a
    // single operation. happy-dom queues one per child, which makes a fragment insertion
    // indistinguishable from three separate `append` calls -- so no challenge can assert that a
    // batch was batched. Measured in both. See `src/challenges/creation/index.ts`.
    expect(records).toHaveLength(3);
    expect(records.map((record) => record.addedNodes.length)).toEqual([1, 1, 1]);
  });

  it('reports a null previousSibling on a childList record where a browser names the element', async () => {
    const context = await hostContext('<ul id="list"><li id="first">first</li></ul>');
    const list = context.document.getElementById('list');
    if (!list) throw new Error('#list is missing from the fixture');

    const records: MutationRecord[] = [];
    const observer = new context.window.MutationObserver((batch) => {
      records.push(...batch);
    });
    observer.observe(list, { childList: true });

    const added = context.document.createElement('li');
    added.id = 'second';
    list.append(added);
    await settle(context.window);
    observer.disconnect();

    // The control: the record itself arrived and describes the right mutation, so the null below is
    // a missing field rather than a missing record.
    expect(records).toHaveLength(1);
    expect(records[0]?.addedNodes).toHaveLength(1);
    // Chrome reports `<li id="first">` here. Hence AGENTS.md §3: no challenge may assert on it.
    expect(records[0]?.previousSibling).toBeNull();
  });
});
