import { describe, expect, it } from 'vitest';

import { createMemoryHost } from '@/test/createMemoryHost';

import { createEventHelpers, createTick } from './context';

/**
 * A form with two submit buttons.
 *
 * Two rather than one so that "the button that was passed" is distinguishable from "the only
 * button there was" -- an implementation that reported `form.querySelector('button')` would
 * satisfy a one-button fixture.
 */
function submitFixture(): { form: HTMLFormElement; save: HTMLButtonElement; draft: HTMLButtonElement } {
  document.body.innerHTML =
    '<form id="f"><button id="save" type="submit">save</button><button id="draft" type="submit">draft</button></form>';
  const form = document.getElementById('f');
  const save = document.getElementById('save');
  const draft = document.getElementById('draft');
  if (!(form instanceof HTMLFormElement) || !(save instanceof HTMLButtonElement)) throw new Error('fixture missing');
  if (!(draft instanceof HTMLButtonElement)) throw new Error('fixture missing');
  return { form, save, draft };
}

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

  it('falls back to a timer when the document never services animation frames', async () => {
    // Animation-frame callbacks run only for documents the browser is rendering. A hidden tab
    // stops servicing them until it is shown again; an iframe inside a `display: none` container
    // never services them at all. A rAF-only `tick()` therefore hangs until the harness times the
    // test out -- reported to the learner as their code being too slow. Standing in a
    // `requestAnimationFrame` that never calls back reproduces that without a real hidden
    // document; the race is what distinguishes "fell back" from "waited forever".
    const original = window.requestAnimationFrame;
    window.requestAnimationFrame = () => 0;
    let stall: ReturnType<typeof setTimeout> | undefined;

    try {
      // A 0ms timer witnesses that `tick()` still waited a turn of the task queue rather than
      // resolving on the spot: without it, a `tick()` that did nothing at all would satisfy
      // "did not stall" for free.
      const ran: string[] = [];
      setTimeout(() => ran.push('macrotask'), 0);
      const outcome = await Promise.race([
        createTick(window)().then(() => 'resolved'),
        new Promise<string>((resolve) => {
          stall = setTimeout(() => resolve('stalled'), 1000);
        }),
      ]);
      expect(outcome).toBe('resolved');
      expect(ran).toEqual(['macrotask']);
    } finally {
      clearTimeout(stall);
      window.requestAnimationFrame = original;
    }
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

  it('lets the key argument win over a key smuggled in through init', () => {
    document.body.innerHTML = '<div id="box" tabindex="0"></div>';
    const box = document.getElementById('box');
    if (!box) throw new Error('fixture missing');

    const events: KeyboardEvent[] = [];
    box.addEventListener('keydown', (event) => {
      events.push(event);
    });

    // `init` carries the modifiers a challenge wants -- Shift+Tab, Ctrl+Z -- so it is spread over
    // the defaults on purpose. But the key is the helper's own argument, and a caller who reuses an
    // init object between two keys would otherwise get the same key twice with nothing to see: the
    // event fires, the listener runs, only the wrong key arrives. The Events category is authored
    // against this helper.
    createEventHelpers(window).keydown(box, 'Escape', { key: 'Enter', shiftKey: true });

    expect(events.map((event) => event.key)).toEqual(['Escape']);
    // Paired so that "init is ignored entirely" cannot pass as "the argument wins".
    expect(events.map((event) => event.shiftKey)).toEqual([true]);
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

  it('reports the button that submitted the form', () => {
    const { form, save } = submitFixture();

    const submitters: (Element | null)[] = [];
    form.addEventListener('submit', (event) => {
      submitters.push(event.submitter);
    });
    createEventHelpers(window).submit(form, save);
    expect(submitters).toEqual([save]);
  });

  it('reports a null submitter when nothing submitted the form', () => {
    const { form } = submitFixture();

    // `null`, not `undefined`: a form submitted with no submitter -- `form.requestSubmit()`, or a
    // scripted dispatch -- is the case `event.submitter === null` exists to describe, and a
    // challenge that branches on it has to be able to reach that branch. A bare `Event` has no
    // `submitter` property at all, which reads as `undefined` and makes the two indistinguishable.
    const submitters: (Element | null)[] = [];
    form.addEventListener('submit', (event) => {
      submitters.push(event.submitter);
    });
    createEventHelpers(window).submit(form);
    expect(submitters).toEqual([null]);
  });

  it('lets the submitter argument win over a submitter smuggled in through init', () => {
    const { form, save, draft } = submitFixture();

    const events: SubmitEvent[] = [];
    form.addEventListener('submit', (event) => {
      events.push(event);
    });

    // The same ordering `keydown` documents at `key`, for the same reason: `init` shapes the rest
    // of the event, it does not replace the helper's own argument. Getting this backwards is
    // invisible -- the form submits, the handler runs, only the wrong button arrives, and "which
    // button submitted this form" is the lesson the Forms category is authored around.
    createEventHelpers(window).submit(form, save, { submitter: draft, cancelable: false });

    expect(events.map((event) => event.submitter)).toEqual([save]);
    // Paired so that "init is ignored entirely" cannot pass as "the argument wins".
    expect(events.map((event) => event.cancelable)).toEqual([false]);
  });

  it('falls back to a submitter given only through init', () => {
    const { form, draft } = submitFixture();

    // The other half of the ordering: the argument wins when there is one, but dropping `init`'s
    // submitter when there is not would be the same silent failure in the other direction.
    const submitters: (Element | null)[] = [];
    form.addEventListener('submit', (event) => {
      submitters.push(event.submitter);
    });
    createEventHelpers(window).submit(form, undefined, { submitter: draft });
    expect(submitters).toEqual([draft]);
  });

  it("builds the event with the challenge realm's constructor", async () => {
    // The realm rule of AGENTS.md §3, from the engine side. Challenge code runs in the host's
    // realm and this helper is handed that host's window, so a bare `new SubmitEvent(...)` would
    // build the event from the *app's* class table. happy-dom shares one class table across its
    // windows, so such a bug passes every other test in this file and fails only in a real
    // browser -- where the content suite cannot see it. Tagging the host window's constructor is
    // what makes the two realms distinguishable here at all.
    const host = createMemoryHost();
    try {
      const { window: hostWin, document: hostDoc } = await host.reset(
        '<form id="f"><button id="save" type="submit">save</button></form>',
      );
      // A locally declared class, not a bare global: `toBeInstanceOf` is exact against it, which is
      // precisely what makes it able to tell the app's `SubmitEvent` from the host's.
      class TaggedSubmitEvent extends hostWin.SubmitEvent {}
      hostWin.SubmitEvent = TaggedSubmitEvent;

      const form = hostDoc.getElementById('f');
      const save = hostDoc.getElementById('save');
      if (!(form instanceof hostWin.HTMLFormElement) || !save) throw new Error('fixture missing');

      const events: Event[] = [];
      form.addEventListener('submit', (event) => {
        events.push(event);
      });
      createEventHelpers(hostWin).submit(form, save);

      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(TaggedSubmitEvent);
    } finally {
      host.dispose();
    }
  });
});
