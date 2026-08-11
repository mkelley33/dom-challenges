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

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const XHTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

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

  it('stores the ARIAMixin properties without reflecting them to attributes', async () => {
    const context = await hostContext('<button id="trigger">Trigger</button>');
    const trigger = context.document.getElementById('trigger');
    if (!trigger) throw new Error('#trigger is missing from the fixture');

    trigger.setAttribute('aria-checked', 'mixed');
    trigger.ariaExpanded = 'true';
    trigger.role = 'switch';

    // The controls: attributes written as attributes are readable and selectable, and `role` -- the
    // one ARIA IDL property happy-dom really does reflect -- round-trips. So the failures below are
    // the mixin specifically, not ARIA attributes being ignored wholesale.
    expect(trigger.getAttribute('aria-checked')).toBe('mixed');
    expect(context.document.querySelectorAll('[aria-checked="mixed"]')).toHaveLength(1);
    expect(trigger.getAttribute('role')).toBe('switch');

    // Chrome writes `aria-expanded="true"` and reads `ariaChecked` back as `"mixed"`. Here the
    // assignment lands on a plain JS property that nothing else can see, so a solution written with
    // the IDL form is correct in a browser and invisible to every attribute selector in a test.
    expect(trigger.getAttribute('aria-expanded')).toBeNull();
    expect(trigger.ariaChecked).toBe(undefined);
  });

  it('lets a plain div take focus, and never matches :focus-within', async () => {
    const context = await hostContext('<div id="wrap"><button id="real">Real</button></div><div id="plain">p</div>');
    const plain = context.document.getElementById('plain');
    const real = context.document.getElementById('real');
    const wrap = context.document.getElementById('wrap');
    if (!plain || !real || !wrap) throw new Error('the fixture is missing an element');

    // The control: focus works, and it works the way a browser's does for something focusable.
    real.focus();
    expect(context.document.activeElement).toBe(real);
    expect(real.matches(':focus')).toBe(true);

    // Chrome refuses: a `<div>` with no `tabindex` is not focusable, so `activeElement` stays put.
    // Any challenge whose focus assertions involve a non-focusable element would pass here and fail
    // in a browser -- hence every focusable element in `src/challenges/a11y` being a <button>.
    plain.focus();
    expect(context.document.activeElement).toBe(plain);

    // Chrome matches this the moment #real has focus.
    real.focus();
    expect(wrap.matches(':focus-within')).toBe(false);
  });

  it('raises tooShort/tooLong on an unedited value, empties validationMessage, and never matches :invalid', async () => {
    const context = await hostContext(
      [
        '<form id="f">',
        '  <input id="short" name="short" minlength="5" value="ab">',
        '  <input id="required" name="required" required>',
        '</form>',
      ].join('\n'),
    );
    const short = context.document.querySelector<HTMLInputElement>('input#short');
    const required = context.document.querySelector<HTMLInputElement>('input#required');
    if (!short || !required) throw new Error('the fixture is missing a field');

    // The controls: the validity engine is running and agrees with Chrome on the flag this file is
    // not complaining about, and a message the code sets itself does round-trip. So the three
    // failures below are those specific rules, not a validity object that was never populated.
    expect(required.validity.valueMissing).toBe(true);
    required.setCustomValidity('Say something');
    expect(required.validationMessage).toBe('Say something');
    required.setCustomValidity('');

    // `tooShort`/`tooLong` apply only once the value has been edited by the user. Chrome reports
    // `valid` for a value that came from the markup; happy-dom ignores the condition -- so a
    // challenge built on `minlength`/`maxlength` would pass here and do nothing in a browser.
    expect(short.validity.tooShort).toBe(true);
    // Chrome: "Please fill out this field." A browser's own message is localised and non-empty.
    expect(required.validationMessage).toBe('');
    // Chrome matches all three. So "style the invalid fields" cannot be validated here at all.
    expect(required.matches(':invalid')).toBe(false);
    expect(required.matches(':required')).toBe(false);
  });

  it('does not retarget an event that leaves an open shadow root', async () => {
    const context = await hostContext('<div id="host"></div>');
    const host = context.document.getElementById('host');
    if (!host) throw new Error('#host is missing from the fixture');

    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<button id="inner">In</button>';
    const inner = root.querySelector('#inner');
    if (!inner) throw new Error('the shadow tree is missing #inner');

    let seenTarget: string | null = null;
    let composed: string[] = [];
    context.document.addEventListener(
      'click',
      (event) => {
        seenTarget = event.target instanceof Element ? event.target.id : 'not an element';
        composed = event
          .composedPath()
          .filter((node): node is Element => node instanceof Element)
          .map((element) => element.id || element.nodeName);
      },
      { once: true },
    );
    inner.dispatchEvent(new context.window.MouseEvent('click', { bubbles: true, composed: true }));

    // The controls: the event crossed the boundary at all, and the composed path is exactly what
    // Chrome reports -- so what follows is retargeting specifically, not a missing event or a
    // shadow root the engine failed to build.
    expect(composed).toEqual(['inner', 'host', 'BODY', 'HTML']);

    // Chrome reports "host": an event leaving a shadow tree is retargeted to the element the
    // listener is allowed to know about. That makes `event.target.closest(...)` the natural wrong
    // answer, and it makes it one the content suite cannot catch on its own -- hence the shape of
    // `src/challenges/events/composedPath.ts`, whose markup rejects it from the other direction.
    expect(seenTarget).toBe('inner');
  });

  it('attaches a listener whose AbortSignal was already aborted, where a browser does not', async () => {
    const context = await hostContext('<button id="target">t</button>');
    const target = context.document.getElementById('target');
    if (!target) throw new Error('#target is missing from the fixture');

    const controller = new context.window.AbortController();
    controller.abort();

    let alreadyAborted = 0;
    target.addEventListener('click', () => (alreadyAborted += 1), { signal: controller.signal });

    // The control: aborting a signal *after* the listener is attached does remove it, so listener
    // removal through a signal works here and only the already-aborted case is wrong.
    const live = new context.window.AbortController();
    let removedLater = 0;
    target.addEventListener('click', () => (removedLater += 1), { signal: live.signal });
    target.click();
    live.abort();
    target.click();

    expect(controller.signal.aborted).toBe(true);
    expect(removedLater).toBe(1);
    // Chrome never attaches this one at all, so a browser reports 0.
    expect(alreadyAborted).toBe(2);
  });

  it('hands back specified rather than computed values from getComputedStyle', async () => {
    const context = await hostContext(
      [
        '<style>',
        '  #named { color: red; padding-left: 4px; --tone: rgb(1, 2, 3); }',
        '  #child { outline-color: var(--missing, rgb(3, 3, 3)); }',
        '</style>',
        '<div id="named"><i id="child">c</i></div>',
      ].join('\n'),
    );
    const named = context.document.getElementById('named');
    const child = context.document.getElementById('child');
    if (!named || !child) throw new Error('the fixture is missing an element');

    const namedStyle = context.window.getComputedStyle(named);

    // The control: the cascade genuinely ran. A px length written as px, and a custom property read
    // off the element that declares it, both come back correct -- which is the portable subset
    // `src/challenges/styles/index.ts` records, and what makes the failures below about
    // *serialisation* rather than about the stylesheet having been ignored.
    expect(namedStyle.paddingLeft).toBe('4px');
    expect(namedStyle.getPropertyValue('--tone')).toBe('rgb(1, 2, 3)');

    // Chrome computes `red` to `rgb(255, 0, 0)`; happy-dom hands the specified token back.
    expect(namedStyle.color).toBe('red');
    // Chrome builds the shorthand out of the longhands: `0px 0px 0px 4px`.
    expect(namedStyle.padding).toBe('');
    // Chrome reports the inherited custom property on the descendant; happy-dom reports nothing,
    // even though the same value resolves correctly through `var()`.
    expect(context.window.getComputedStyle(child).getPropertyValue('--tone')).toBe('');
    // Chrome takes the `var()` fallback and reports `rgb(3, 3, 3)`.
    expect(context.window.getComputedStyle(child).outlineColor).toBe('');
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

  it('parses insertAdjacentHTML into an <svg> as HTML rather than as foreign content', async () => {
    const context = await hostContext('<svg id="chart" viewBox="0 0 10 10"><title id="cap">t</title></svg>');
    const chart = context.document.getElementById('chart');
    if (!chart) throw new Error('#chart is missing from the fixture');

    // Two controls, both in this document, and together they say the parser *can* produce foreign
    // content here: the markup in the page did, and so does the same element's `innerHTML`. Without
    // them a wrong namespace below would be indistinguishable from happy-dom having no SVG support
    // at all, which is a different finding with a different consequence.
    expect(chart.namespaceURI).toBe(SVG_NAMESPACE);
    chart.innerHTML += '<circle class="viaInnerHtml" r="1"></circle>';
    expect(chart.querySelector('.viaInnerHtml')?.namespaceURI).toBe(SVG_NAMESPACE);

    chart.insertAdjacentHTML('beforeend', '<circle class="viaAdjacent" r="1"></circle>');

    // Chrome puts this one in the SVG namespace and reports `tagName` as `circle`; measured twice,
    // in a foregrounded tab, through the production `createIframeHost`. Here it is an
    // `HTMLUnknownElement` that renders nothing -- so a Creation challenge that reached for this
    // route would be green in the suite and broken for the learner, which is why
    // `src/challenges/creation/svgNamespace.ts` uses `createElementNS` and `cloneNode` instead.
    expect(chart.querySelector('.viaAdjacent')?.namespaceURI).toBe(XHTML_NAMESPACE);
    expect(chart.querySelector('.viaAdjacent')?.tagName).toBe('CIRCLE');
  });

  it('reflects an SVG element’s className to the class attribute, where a browser does not', async () => {
    const context = await hostContext('<svg id="chart" viewBox="0 0 10 10"></svg>');
    const chart = context.document.getElementById('chart');
    if (!chart) throw new Error('#chart is missing from the fixture');

    const dot = context.document.createElementNS(SVG_NAMESPACE, 'circle');
    chart.append(dot);

    // The control: this really is a foreign element, so what follows is about `className` on an SVG
    // element rather than about `createElementNS` having quietly produced an HTML one.
    expect(dot.namespaceURI).toBe(SVG_NAMESPACE);
    expect(dot.tagName).toBe('circle');

    // In Chrome `className` on an SVG element is a read-only `SVGAnimatedString`, so this assignment
    // **throws** under the strict-mode module code the harness runs -- `TypeError: Cannot set
    // property className of #<SVGElement> which has only a getter` -- and no class is set;
    // `getAttribute('class')` stays null and `.dot` matches nothing. Measured twice through the
    // production `createIframeHost` in a foregrounded tab, with an HTML `<div>` as the control in the
    // same probe, which does reflect. Here it behaves like the `<div>`, which is the direction that
    // matters: the suite accepts an answer a browser refuses to run at all.
    // `creation/svgNamespace.ts` asserts the `class` *attribute* for exactly this reason, and
    // AGENTS.md §3 forbids the property.
    Reflect.set(dot, 'className', 'dot');
    expect(dot.getAttribute('class')).toBe('dot');
    expect(chart.querySelectorAll('.dot')).toHaveLength(1);
  });
});
