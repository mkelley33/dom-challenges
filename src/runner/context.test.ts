import { describe, expect, it } from 'vitest';

import { createEventHelpers, createTick } from './context';

describe('createTick', () => {
  it('flushes pending microtasks', async () => {
    const order: string[] = [];
    const tick = createTick(window);
    // Two chained `.then()` hops, not one: a bare `await` on an already-resolved
    // promise (what a no-op `tick()` would give for free) only buys a single
    // microtask turn, so a one-hop chain here would pass even if `tick()` did
    // nothing. Chaining a second hop means only a `tick()` that actually drains
    // the microtask queue can get the callback to run before the assertion.
    void Promise.resolve()
      .then(() => undefined)
      .then(() => order.push('microtask'));
    await tick();
    expect(order).toEqual(['microtask']);
  });

  it('flushes a pending animation frame callback', async () => {
    const order: string[] = [];
    const tick = createTick(window);
    window.requestAnimationFrame(() => order.push('raf'));
    await tick();
    expect(order).toEqual(['raf']);
  });

  it('flushes a pending MutationObserver callback', async () => {
    document.body.innerHTML = '<ul id="list"></ul>';
    const list = document.getElementById('list');
    if (!list) throw new Error('fixture missing');

    let called = 0;
    const observer = new MutationObserver(() => {
      called += 1;
    });
    observer.observe(list, { childList: true });

    const tick = createTick(window);
    // Defer the mutation itself by one microtask hop. happy-dom delivers
    // MutationObserver callbacks via a single `queueMicrotask` hop, so mutating
    // synchronously (as before) makes the callback observable after exactly the
    // one microtask turn a no-op `tick()` gets for free via `await`. Queuing the
    // mutation turns delivery into a second hop, reachable only by a `tick()`
    // that actually drains the microtask queue before this test resumes.
    void Promise.resolve().then(() => {
      list.append(document.createElement('li'));
    });
    await tick();
    observer.disconnect();
    expect(called).toBe(1);
  });
});

describe('createEventHelpers', () => {
  it('fires a bubbling click', () => {
    document.body.innerHTML = '<div id="parent"><button id="child">go</button></div>';
    const parent = document.getElementById('parent');
    const child = document.getElementById('child');
    if (!parent || !child) throw new Error('fixture missing');

    let seen = 0;
    parent.addEventListener('click', () => {
      seen += 1;
    });
    createEventHelpers(window).click(child);
    expect(seen).toBe(1);
  });

  it('sets the value before dispatching input so listeners observe the new value', () => {
    document.body.innerHTML = '<input id="field" />';
    const field = document.getElementById('field');
    if (!(field instanceof HTMLInputElement)) throw new Error('fixture missing');

    const observed: string[] = [];
    field.addEventListener('input', (event) => {
      if (event.target instanceof HTMLInputElement) observed.push(event.target.value);
    });
    createEventHelpers(window).input(field, 'hello');
    expect(observed).toEqual(['hello']);
  });

  it('fires keydown with the given key', () => {
    document.body.innerHTML = '<div id="box" tabindex="0"></div>';
    const box = document.getElementById('box');
    if (!box) throw new Error('fixture missing');

    const keys: string[] = [];
    box.addEventListener('keydown', (event) => {
      keys.push(event.key);
    });
    createEventHelpers(window).keydown(box, 'Escape');
    expect(keys).toEqual(['Escape']);
  });

  it('fires a cancelable submit event', () => {
    document.body.innerHTML = '<form id="f"><button type="submit">ok</button></form>';
    const form = document.getElementById('f');
    if (!(form instanceof HTMLFormElement)) throw new Error('fixture missing');

    let submitted = 0;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submitted += 1;
    });
    createEventHelpers(window).submit(form);
    expect(submitted).toBe(1);
  });
});
