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

  it('lets a CSSOM sheet edit go stale for an element already read, where a browser recomputes', async () => {
    const context = await hostContext(
      [
        '<style>',
        '  .a { padding-left: 4px; }',
        '  .a.big { padding-left: 20px; }',
        '</style>',
        '<div class="a" id="a">a</div><ul id="list"></ul>',
      ].join('\n'),
    );
    const el = context.document.getElementById('a');
    const sheet = context.document.styleSheets[0];
    if (!el || sheet === undefined) throw new Error('the fixture is missing an element or its sheet');

    // The control, first half: on an element's *first* computed read, a rule inserted through the
    // CSSOM is honoured -- the cascade itself is not broken, only its invalidation.
    sheet.insertRule('.a { padding-left: 9px; }', sheet.cssRules.length);
    expect(context.window.getComputedStyle(el).paddingLeft).toBe('9px');

    // The divergence: the element has now been read once, and from here on `insertRule` and
    // `deleteRule` no longer reach it. Chrome recomputes on every read; happy-dom serves the
    // cached answer until a DOM mutation touches the element. This is why no challenge test in
    // the styles category reads an element's computed style before running the code under test.
    sheet.insertRule('.a { padding-left: 12px; }', sheet.cssRules.length);
    expect(context.window.getComputedStyle(el).paddingLeft).toBe('9px');

    // The control, second half: a DOM mutation invalidates the cache and the pending edit lands,
    // which is what separates "stale cache" from "the insert never happened".
    el.classList.add('poke');
    expect(context.window.getComputedStyle(el).paddingLeft).toBe('12px');

    // And the index default diverges on its own: CSSOM says an omitted index means 0 (prepend);
    // happy-dom appends and returns the end index. A tie "won" by bare insertRule is therefore
    // green here and silently loses in Chrome, where the prepended rule sits *earlier* in source
    // order. Measured in both engines through this exact shape.
    const index = sheet.insertRule('.a { padding-left: 30px; }');
    expect(index).toBe(sheet.cssRules.length - 1);
  });

  it('never lets a rule edit, a disabled flag, or a post-adoption change reach the cascade', async () => {
    const context = await hostContext(
      ['<style>', '  .a { padding-left: 4px; }', '</style>', '<div class="a" id="a">a</div><ul id="list"></ul>'].join(
        '\n',
      ),
    );
    const el = context.document.getElementById('a');
    const sheet = context.document.styleSheets[0];
    const styleRule = sheet?.cssRules[0];
    if (!el || !styleRule || !(styleRule instanceof context.window.CSSStyleRule)) {
      throw new Error('the fixture is missing an element or its rule');
    }

    // Editing a parsed rule's declaration updates the rule object and its serialisation...
    styleRule.style.setProperty('padding-left', '9px');
    expect(styleRule.style.paddingLeft).toBe('9px');
    expect(styleRule.cssText).toBe('.a { padding-left: 9px; }');
    // ...and no element ever restyles, even after a DOM mutation flushes the computed cache.
    // Chrome restyles immediately, so the browser-correct "edit the rule in place" answer cannot
    // be a verified solution in this suite.
    el.classList.add('poke');
    expect(context.window.getComputedStyle(el).paddingLeft).toBe('4px');

    // `disabled`, in both spellings, is ignored here and honoured in Chrome (where the padding
    // would fall back to the UA default). The class perturbations keep the cached answer honest.
    sheet.disabled = true;
    el.classList.add('poke2');
    expect(context.window.getComputedStyle(el).paddingLeft).toBe('4px');
    sheet.disabled = false;

    // Adopted sheets, by contrast, share the *staleness* divergence rather than this blindness:
    // a constructed sheet filled before adoption applies and wins the tie against a markup sheet
    // (Chrome agrees), and post-adoption changes -- `replaceSync`, even un-adoption -- are
    // honoured, but only on a computation something in the DOM triggers. Without the perturbation
    // between them, the second read below reports 15px: measured, and originally misread as
    // "frozen at adoption" until a perturbed re-run separated the cache from the semantics.
    const constructed = new context.window.CSSStyleSheet();
    constructed.replaceSync('.a { padding-left: 15px; }');
    context.document.adoptedStyleSheets = [...context.document.adoptedStyleSheets, constructed];
    el.classList.add('poke3');
    expect(context.window.getComputedStyle(el).paddingLeft).toBe('15px');
    constructed.replaceSync('.a { padding-left: 25px; }');
    el.classList.add('poke4');
    expect(context.window.getComputedStyle(el).paddingLeft).toBe('25px');
    context.document.adoptedStyleSheets = [];
    el.classList.add('poke5');
    expect(context.window.getComputedStyle(el).paddingLeft).toBe('4px');
  });

  it('reports a border width whose missing border-style would zero it in a browser', async () => {
    const context = await hostContext(
      [
        '<style>',
        '  .bare { border-left-width: 4px; }',
        '  .styled { border-left-style: solid; border-left-width: 4px; }',
        '</style>',
        '<div class="bare" id="bare">b</div><div class="styled" id="styled">s</div><ul id="list"></ul>',
      ].join('\n'),
    );
    const bare = context.document.getElementById('bare');
    const styled = context.document.getElementById('styled');
    if (!bare || !styled) throw new Error('the fixture is missing an element');

    // The control: with an explicit border-style, both engines report the written width.
    expect(context.window.getComputedStyle(styled).borderLeftWidth).toBe('4px');
    // The divergence: with no border-style, the used border-style is `none` and Chrome computes
    // the width to 0px; happy-dom hands the specified value back. A *computed* border-width
    // assertion is portable only when the challenge's own CSS also sets the style, which is why
    // every computed one in the styles category does. `inline-wins` also asserts border-left-width,
    // with no such rule -- safely, because it reads the inline declaration directly, never
    // getComputedStyle, so this divergence does not reach it.
    expect(context.window.getComputedStyle(bare).borderLeftWidth).toBe('4px');
  });

  it('expands inline shorthands faithfully but is not iterable and computes no logical properties', async () => {
    const context = await hostContext('<div id="target">target</div><ul id="list"></ul>');
    const el = context.document.getElementById('target');
    if (!el) throw new Error('#target is missing from the fixture');

    // The control: the inline declaration model itself matches Chrome declaration for declaration
    // -- the shorthand expands to four longhands, resets the unmentioned ones, normalises the
    // unitless zero, and serialises identically.
    el.style.marginLeft = '3px';
    el.style.margin = '8px 0';
    expect(el.style.length).toBe(4);
    expect(el.style.marginLeft).toBe('0px');
    // Compared as a sorted projection: the *members* are measured identical in both engines; their
    // enumeration order after a longhand-then-shorthand write was not measured in Chrome, so it is
    // deliberately not pinned.
    const names = Array.from({ length: el.style.length }, (_, index) => el.style.item(index));
    expect(names.toSorted()).toEqual(['margin-bottom', 'margin-left', 'margin-right', 'margin-top']);
    expect(el.getAttribute('style')).toBe('margin: 8px 0px;');

    // Divergence one: Chrome's CSSStyleDeclaration is iterable (`[...el.style]` lists the four
    // names); happy-dom's has no Symbol.iterator, so solutions enumerate with length/item.
    expect(Symbol.iterator in el.style).toBe(false);

    // Divergence two: a logical shorthand is stored and serialised but computes nothing, where
    // Chrome moves both vertical margins. The browser-correct `margin-block` answer to
    // shorthand-reset fails this suite for exactly this reason.
    el.style.setProperty('margin-block', '5px');
    expect(el.style.getPropertyValue('margin-block')).toBe('5px');
    expect(context.window.getComputedStyle(el).marginTop).toBe('8px');

    // Divergence three: repeat getComputedStyle calls hand back the same object here and a fresh
    // one in Chrome -- identity across calls is not assertable. Liveness, the thing worth
    // asserting, agrees in both engines and is the control for this read.
    const held = context.window.getComputedStyle(el);
    el.style.marginTop = '11px';
    expect(held.marginTop).toBe('11px');
    expect(context.window.getComputedStyle(el)).toBe(held);
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
  it('snapshots the live attributes map when iterating it, where a browser skips', async () => {
    const context = await hostContext('<div id="card" class="a" title="t" lang="en" hidden data-x="1"></div>');
    const card = context.document.getElementById('card');
    if (!card) throw new Error('#card is missing from the fixture');

    // The controls: the map really is live in this engine -- its length follows the element -- and
    // it really is iterable. So what follows is about the *iterator* taking a snapshot rather than
    // about `attributes` being an inert copy or `for..of` failing outright.
    const map = card.attributes;
    expect(map).toHaveLength(6);
    card.setAttribute('role', 'note');
    expect(map).toHaveLength(7);
    card.removeAttribute('role');
    expect([...card.attributes].map((attribute) => attribute.name)).toEqual(card.getAttributeNames());

    for (const attribute of card.attributes) card.removeAttribute(attribute.name);

    // Chrome leaves `["class", "lang", "data-x"]`: `NamedNodeMap` gets its iterator from its indexed
    // getter, so the walk advances an index while the map shrinks under it and every second
    // attribute is stepped over. Measured twice through the production `createIframeHost` in a
    // foregrounded tab. Here the whole list goes -- which is the dangerous direction, because the
    // buggy loop is the one that passes. No Attributes challenge may ask for bulk attribute
    // removal for this reason; `attributes/copyAttributes.ts` only ever writes to a *different*
    // element, and its tradeoffs carry the warning.
    expect(card.getAttributeNames()).toEqual([]);
  });

  it('resolves a dashed dataset key, and accepts writing one, where a browser does neither', async () => {
    const context = await hostContext('<div id="card" data-view-count="3" data--x="dd"></div>');
    const card = context.document.getElementById('card');
    if (!card) throw new Error('#card is missing from the fixture');

    // The controls: the camelCase mapping both engines agree on, in both directions. Without them a
    // failure below would be indistinguishable from `dataset` not working here at all.
    expect(card.dataset.viewCount).toBe('3');
    card.dataset.pageSize = '50';
    expect(card.getAttribute('data-page-size')).toBe('50');

    // Chrome answers `undefined` for a dashed key and throws `SyntaxError` when one is written --
    // a `-` followed by an ASCII lowercase letter is not a legal `dataset` name. It also exposes
    // `data--x` as `dataset.X`, which this engine does not. Measured twice through the production
    // `createIframeHost`. The read is the dangerous direction: a solution that indexes `dataset`
    // with the attribute's own name works here and returns `undefined` for the learner, so
    // `attributes/dataAttributes.ts` never asks for one.
    expect(Reflect.get(card.dataset, 'view-count')).toBe('3');
    expect(Reflect.get(card.dataset, 'X')).toBe(undefined);
    Reflect.set(card.dataset, 'foo-bar', 'q');
    expect(card.getAttribute('data-foo-bar')).toBe('q');
  });

  it('accepts an empty and a whitespace-bearing class token, where a browser throws', async () => {
    const context = await hostContext('<div id="card" class="chip"></div>');
    const card = context.document.getElementById('card');
    if (!card) throw new Error('#card is missing from the fixture');

    // The control: an ordinary token is added, and the list is a real `DOMTokenList` that
    // de-duplicates. So the two below are about token *validation* rather than `add` being a no-op.
    card.classList.add('is-open');
    card.classList.add('is-open');
    expect(card.getAttribute('class')).toBe('chip is-open');

    // Chrome throws `SyntaxError` for the empty token and `InvalidCharacterError` for the one with a
    // space in it, and adds nothing. Measured twice through the production `createIframeHost`. Here
    // both are accepted, and the second is split into two tokens -- so a challenge asserting either
    // throw would be green here and wrong in a browser, and `attributes/classThreeWays.ts` only
    // discusses them in prose.
    card.classList.add('');
    card.classList.add('a b');
    expect(card.getAttribute('class')).toBe('chip is-open a b');
  });

  it('ignores a dashed CSS property written as an index, and returns nothing from removeProperty', async () => {
    const context = await hostContext('<div id="card" style="height: 8px; --tone: teal"></div>');
    const card = context.document.getElementById('card');
    if (!card) throw new Error('#card is missing from the fixture');

    // The controls: the camelCase property and `setProperty` both work, including for a custom
    // property, and the declaration block is parsed rather than held as text.
    expect(card.style).toHaveLength(2);
    card.style.marginTop = '3px';
    card.style.setProperty('--tone', 'plum');
    expect(card.style.getPropertyValue('margin-top')).toBe('3px');
    expect(card.style.getPropertyValue('--tone')).toBe('plum');

    // CSSOM defines a *dashed attribute* for every property whose name contains a dash, so
    // `style['margin-bottom'] = …` is a real declaration in Chrome, and `removeProperty` returns the
    // value it removed (`''` when there was none). Measured twice through the production
    // `createIframeHost`. Both are the safe direction -- this engine rejects a correct answer rather
    // than accepting a wrong one -- but `attributes/styleAttribute.ts` avoids both spellings so that
    // a learner's browser-correct answer is not graded differently by the two hosts.
    Reflect.set(card.style, 'margin-bottom', '5px');
    expect(card.style.getPropertyValue('margin-bottom')).toBe('');
    expect(card.style.removeProperty('height')).toBe(undefined);
  });

  it('gives the host frame a real location origin, where a srcdoc frame reports "null"', async () => {
    const context = await hostContext('<a id="link" href="/docs/page">docs</a>');
    const link = context.document.querySelector<HTMLAnchorElement>('a#link');
    if (!link) throw new Error('#link is missing from the fixture');

    // The control: URL decomposition works, and an absolute href decomposes identically in both
    // engines because none of it depends on the base URL.
    expect(link.getAttribute('href')).toBe('/docs/page');
    expect(link.pathname).toBe('/docs/page');

    // The production host is an `about:srcdoc` frame, whose *document* inherits the parent's origin
    // while its `location.origin` is the string `"null"` -- measured twice through the production
    // `createIframeHost`, where every link in the frame therefore compared as cross-origin and two
    // `mailto:` links compared as same-origin. Here `location.origin` is the memory host's URL, so
    // the comparison works. That is the dangerous direction, and it is why no challenge in this
    // category tests a link against `location.origin`.
    expect(context.window.location.origin).toBe('https://challenges.local');
    expect(link.origin).toBe(context.window.location.origin);
  });
  it('clones an input’s dirty value but not its dirty checkedness, where a browser copies both', async () => {
    const context = await hostContext(
      '<form id="draft"><input id="title" value="Quarterly report"><textarea id="notes">Nothing yet.</textarea><input id="public" type="checkbox" checked><input id="pinned" type="checkbox"></form>',
    );
    const form = context.document.querySelector<HTMLFormElement>('form#draft');
    const title = context.document.querySelector<HTMLInputElement>('input#title');
    const notes = context.document.querySelector<HTMLTextAreaElement>('textarea#notes');
    const publicBox = context.document.querySelector<HTMLInputElement>('input#public');
    const pinned = context.document.querySelector<HTMLInputElement>('input#pinned');
    if (!form || !title || !notes || !publicBox || !pinned) throw new Error('the draft fixture is incomplete');

    title.value = 'Q4 report';
    notes.value = 'Ship on Friday.';
    publicBox.checked = false;
    pinned.checked = true;

    // The clone goes into a holder rather than being asserted onto a narrower type: `cloneNode`
    // returns `Node`, and `append` takes one, so the holder supplies `querySelector` without any
    // assertion at all.
    const holder = context.document.createElement('div');
    holder.append(form.cloneNode(true));
    const clonedTitle = holder.querySelector<HTMLInputElement>('input#title');
    const clonedNotes = holder.querySelector<HTMLTextAreaElement>('textarea#notes');
    const clonedPublic = holder.querySelector<HTMLInputElement>('input#public');
    const clonedPinned = holder.querySelector<HTMLInputElement>('input#pinned');
    if (!clonedTitle || !clonedNotes || !clonedPublic || !clonedPinned) throw new Error('the clone is incomplete');

    // The controls, and they are the sharpest kind available: the *same clone*, made by the *same
    // call*, carries the dirty value of both text controls. So the checkbox result below is about
    // checkedness specifically, not about `cloneNode` failing to propagate state at all.
    expect(clonedTitle.value).toBe('Q4 report');
    expect(clonedTitle.getAttribute('value')).toBe('Quarterly report');
    expect(clonedNotes.value).toBe('Ship on Friday.');

    // HTML's cloning steps for `input` propagate value, checkedness **and both dirty flags**, and
    // Chrome does: measured twice through the production `createIframeHost` in a foregrounded tab
    // with a positive control, the clone reports `public` unchecked and `pinned` checked. Here both
    // revert to their content attributes. The direction is safe -- this engine rejects an answer a
    // browser accepts -- but it is why `attributes/formStateSnapshot.ts` offers "clone the form and
    // sync the clone" only as prose in its tradeoffs and not as a solution: that solution passes in
    // a browser and fails the checkbox test here.
    expect(clonedPublic.checked).toBe(true);
    expect(clonedPinned.checked).toBe(false);
  });
  it('ignores the capture flag when removing a listener, where a browser treats it as part of the identity', async () => {
    const context = await hostContext('<div id="outer"><button id="target">t</button></div>');
    const outer = context.document.getElementById('outer');
    const target = context.document.getElementById('target');
    if (!outer || !target) throw new Error('the fixture is incomplete');

    let captured = 0;
    const listener = (): void => {
      captured += 1;
    };
    outer.addEventListener('click', listener, true);

    // The control, and it has to come first: a capture listener that never fired at all would make
    // the reading below indistinguishable from "the removal worked".
    target.click();
    const control = captured;

    // Chrome identifies a registration by (type, callback, capture), so this removal matches
    // nothing and the listener keeps firing -- measured through the production `createIframeHost`,
    // where `listener-identity`'s "remove with the wrong capture flag" answer fails all four tests
    // and passes all four here. Nothing in that challenge asserts on the flag for this reason.
    outer.removeEventListener('click', listener);
    target.click();

    expect(control).toBe(1);
    expect(captured).toBe(1);
  });

  it('reports CAPTURING_PHASE at the target for a capture-registered listener, where a browser reports AT_TARGET', async () => {
    const context = await hostContext('<div id="outer"><button id="target">t</button></div>');
    const outer = context.document.getElementById('outer');
    const target = context.document.getElementById('target');
    if (!outer || !target) throw new Error('the fixture is incomplete');

    const phases: number[] = [];
    outer.addEventListener('click', (event) => phases.push(event.eventPhase), true);
    target.addEventListener('click', (event) => phases.push(event.eventPhase), true);
    target.addEventListener('click', (event) => phases.push(event.eventPhase));
    outer.addEventListener('click', (event) => phases.push(event.eventPhase));

    target.click();

    // The first and last entries are the controls: the ancestor's two passes report 1 and 3 in both
    // engines, so only the middle pair is in question. Chrome reports `2,2` there -- both listeners
    // on the target are at the target, whichever phase they registered for. Measured. No challenge
    // asserts `eventPhase` at all.
    expect(phases).toEqual([1, 1, 2, 3]);
  });

  it('goes on invoking a listener removed mid-dispatch from the target it is on, where a browser skips it', async () => {
    const context = await hostContext('<button id="target">t</button>');
    const target = context.document.getElementById('target');
    if (!target) throw new Error('#target is missing from the fixture');

    const log: string[] = [];
    const second = (): void => {
      log.push('second');
    };
    const first = (): void => {
      log.push('first');
      target.removeEventListener('click', second);
    };
    target.addEventListener('click', first);
    target.addEventListener('click', second);
    target.click();

    // The control: the same removal, aimed at an *ancestor* the event has not reached yet, is
    // honoured in both engines -- so this is about the copied listener list of the object being
    // dispatched at, not about `removeEventListener` failing.
    const outerLog: string[] = [];
    const ancestor = context.document.body;
    const doomed = (): void => {
      outerLog.push('ancestor');
    };
    ancestor.addEventListener('click', doomed);
    target.addEventListener('click', () => ancestor.removeEventListener('click', doomed));
    target.click();

    expect(outerLog).toEqual([]);
    // The removal *did* take effect -- `second` is gone by the second dispatch in both engines.
    // What differs is the dispatch it happened in: Chrome checks each listener's removed flag as it
    // walks its copy of the list and skips it, logging `first, first`. happy-dom runs the copy it
    // took. `AbortController.abort()` called from inside a listener behaves the same way, which is
    // why `abort-many` never asserts on either.
    expect(log).toEqual(['first', 'second', 'first']);
  });

  it('ignores the legacy cancelBubble and returnValue setters, where a browser honours both', async () => {
    const context = await hostContext('<div id="outer"><button id="target">t</button></div>');
    const outer = context.document.getElementById('outer');
    const target = context.document.getElementById('target');
    if (!outer || !target) throw new Error('the fixture is incomplete');

    const log: string[] = [];
    outer.addEventListener('click', () => log.push('ancestor'));
    target.addEventListener('click', (event) => {
      log.push('target');
      Reflect.set(event, 'cancelBubble', true);
    });

    // The control: the modern spelling stops propagation here, so the reading below is about the
    // legacy alias and not about propagation being broken.
    const controlLog: string[] = [];
    const controlOuter = context.document.body;
    controlOuter.addEventListener('click', () => controlLog.push('body'));
    target.addEventListener('click', (event) => event.stopPropagation(), { once: true });
    target.click();
    expect(controlLog).toEqual([]);

    log.length = 0;
    target.click();

    const cancelable = new context.window.Event('probe', { cancelable: true });
    target.addEventListener('probe', (event) => Reflect.set(event, 'returnValue', false), { once: true });
    const returned = target.dispatchEvent(cancelable);

    // Chrome: `cancelBubble = true` is `stopPropagation()`, so the ancestor does not run; and
    // `returnValue = false` is `preventDefault()`, so `defaultPrevented` is true and `dispatchEvent`
    // returns false. Both are safe directions for the suite -- it rejects answers a browser accepts
    // -- but a learner writing either is graded differently by the two hosts, so nothing here uses
    // them and `prevent-default`'s "legacy returnValue" answer passes in Chrome and fails here.
    expect(log).toEqual(['target', 'ancestor']);
    expect(cancelable.defaultPrevented).toBe(false);
    expect(returned).toBe(true);
  });

  it('runs an onclick handler after every addEventListener listener, whatever order they were set in', async () => {
    const context = await hostContext('<button id="target">t</button>');
    const target = context.document.getElementById('target');
    if (!target) throw new Error('#target is missing from the fixture');

    const log: string[] = [];
    target.addEventListener('click', () => log.push('before'));
    // Assigned through `Reflect.set` rather than written as `target.onclick = ...`, which
    // `unicorn/prefer-add-event-listener` rejects -- rightly, everywhere except here, where the
    // handler slot *is* the subject. Reaching for a scoped override in `.oxlintrc.json` would turn
    // the rule off for this whole file and every gap added to it later; this is one expression, and
    // it says what it is doing.
    Reflect.set(target, 'onclick', () => log.push('onclick'));
    target.addEventListener('click', () => log.push('after'));

    target.click();

    // The control is the log holding all three: every handler fired, so this is about their order
    // and not about `onclick` being ignored.
    expect(log).toHaveLength(3);
    // Chrome registers the `onclick` slot in the listener list at the point it is first assigned,
    // so it logs `before, onclick, after`. Measured through the production `createIframeHost`,
    // where `once-listener`'s `onclick` answer fails one test and here it fails two. Both engines
    // reject it, by different counts -- which is what makes it safe to leave unasserted.
    expect(log).toEqual(['before', 'after', 'onclick']);
  });
  it('invokes a once listener before removing its registration, where a browser removes it first', async () => {
    const context = await hostContext('<button id="target">t</button>');
    const target = context.document.getElementById('target');
    if (!target) throw new Error('#target is missing from the fixture');

    // The control: `once` does remove the registration, and does it before the *next* dispatch.
    // Without this, the reading below could not tell "removed late" from "never removed".
    let plain = 0;
    target.addEventListener(
      'probe',
      () => {
        plain += 1;
      },
      { once: true },
    );
    target.dispatchEvent(new context.window.Event('probe'));
    target.dispatchEvent(new context.window.Event('probe'));
    expect(plain).toBe(1);

    const log: string[] = [];
    let depth = 0;
    const listener = (): void => {
      log.push('once');
      if (depth > 0) return;
      depth += 1;
      // A callback that dispatches its own event again is what a real one does by accident: it
      // changes the DOM, and changing the DOM under a pointer produces more events.
      target.dispatchEvent(new context.window.Event('reentrant'));
    };
    target.addEventListener('reentrant', listener, { once: true });
    target.dispatchEvent(new context.window.Event('reentrant'));

    // DOM's "inner invoke" removes a `once` listener from the target's list *before* calling it, so
    // Chrome logs `once` exactly once -- measured through the production `createIframeHost` in a
    // foregrounded tab with a positive control asserted first, and repeated. Here the removal
    // happens after the callback returns, so the nested dispatch still finds it.
    //
    // Two consequences. `once-listener` cannot assert re-entrancy at all, because its own reference
    // solution would fail such a test on this engine -- which is why the wrong answer that removes
    // itself *after* calling the callback passes every test there, and why that is said out loud in
    // its tradeoffs rather than left implied. And the hand-rolled removal is only equivalent to
    // `once` in a browser; here `once` is the weaker of the two.
    expect(log).toEqual(['once', 'once']);

    // The throwing half of the same claim does hold here: a `once` registration is spent even when
    // its callback throws.
    let threw = 0;
    target.addEventListener(
      'boom',
      () => {
        threw += 1;
        throw new Error('boom');
      },
      { once: true },
    );
    try {
      target.dispatchEvent(new context.window.Event('boom'));
    } catch {
      // A listener exception is reported rather than propagated in both engines; caught so a
      // difference there cannot end this test early.
    }
    target.dispatchEvent(new context.window.Event('boom'));
    expect(threw).toBe(1);
  });
});

/**
 * Found while filling out the forms category (Phase 4), by running its solutions -- not inherited
 * from Phase 2's reconnaissance, whose "FormData in full" claim the first of these narrows. The
 * happy-dom side of every test here was measured through `createMemoryHost`.
 *
 * **The browser side of all six is now measured**, through the production `createIframeHost` in
 * Chromium, in a scratch run under `vitest.browser.config.ts` -- **not** covered by the committed
 * `pnpm test:browser` pass (AGENTS.md §1), which runs the shipping library's solutions and starters
 * and touches none of these six behaviours. Re-running `pnpm test:browser` does not re-take these
 * readings; if one is ever doubted, it has to be re-measured the same way, by hand, in a scratch
 * file. Each reading is admissible on its own terms regardless: every one of the six is a
 * synchronous dispatch or an attribute/serialisation read, none awaits a frame, and each sat beside
 * its in-document control -- none of them depends on the rendering the committed pass's probe
 * establishes. Every one agreed with the spec's answer cited per test, so each browser column below
 * is a measurement rather than a derivation. Two of them supersede a smaller claim: the first four
 * were previously measured in a **backgrounded** tab, and the last two -- `requestSubmit`'s
 * submitter check and `isTrusted` -- had no browser run at all.
 *
 * The one thing that run could **not** measure is focus: `document.hasFocus()` is false in both the
 * top document and the frame under a headless browser, exactly as it was under the backgrounded
 * tab. Nothing below reads focus, and nothing here may start to.
 *
 * No challenge builds on any behaviour below; the forms category docblock records what each one
 * cost.
 */
describe('what filling out the forms category found', () => {
  it('gives FormData one entry per select multiple, not one per selected option', async () => {
    const context = await hostContext(
      [
        '<form id="f">',
        '  <input type="checkbox" name="topping" value="mushroom" checked>',
        '  <input type="checkbox" name="topping" value="olive" checked>',
        '  <select name="day" multiple>',
        '    <option value="mon" selected>m</option>',
        '    <option value="wed" selected>w</option>',
        '  </select>',
        '</form>',
      ].join('\n'),
    );
    const form = context.document.querySelector<HTMLFormElement>('#f');
    const select = context.document.querySelector<HTMLSelectElement>('select');
    if (!form || !select) throw new Error('the fixture is missing its form');

    // The controls: the option state itself is right (both options report selected), and the
    // entry list does keep repeated names -- the checkbox group arrives whole. So the failure
    // below is specific to how the select is read, not selection state and not getAll.
    expect([...select.options].map((option) => option.selected)).toEqual([true, true]);
    const data = new context.window.FormData(form);
    expect(data.getAll('topping').map(String)).toEqual(['mushroom', 'olive']);

    // Spec ("constructing the entry list") and measured in Chrome through the production host:
    // one entry per selected option -- ['mon', 'wed'] here, ['wed', 'fri'] in the property-write
    // spelling of the same probe.
    // happy-dom reads the select's `.value`, which is the *first* selected option, and emits one
    // entry. Same result when selection is made by property writes. So a multi-select may never
    // be read through FormData in a challenge: `getAll` over it is correct in a browser and wrong
    // here. `getall-or-lose-them` uses two checkbox groups for exactly this reason.
    expect(data.getAll('day').map(String)).toEqual(['mon']);
  });

  it('reports the form itself as the submitter of a no-argument requestSubmit()', async () => {
    const context = await hostContext(
      '<form id="f"><input name="x" value="ok"><button id="go" type="submit">Go</button></form>',
    );
    const form = context.document.querySelector<HTMLFormElement>('#f');
    const go = context.document.querySelector<HTMLButtonElement>('#go');
    if (!form || !go) throw new Error('the fixture is missing its form');

    // The string arm is a legible sentinel: if the engine ever stops dispatching SubmitEvents at
    // all, the identity assertions below fail printing it, rather than conflating "not a
    // SubmitEvent" with "a SubmitEvent whose submitter was null".
    const submitters: Array<EventTarget | string | null> = [];
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submitters.push(event instanceof context.window.SubmitEvent ? event.submitter : 'not a SubmitEvent');
    });

    // The control: with a button named, the event carries that button -- identical to a browser,
    // and what `request-submit-gate` asserts.
    form.requestSubmit(go);
    expect(submitters[0]).toBe(go);

    // Spec, and measured in Chrome through the production host (the button for the named call,
    // null for the bare one): requestSubmit() with no submitter submits "from the form element itself", and the
    // resulting SubmitEvent's submitter is null -- which is also what fire.submit(form) models.
    // happy-dom fills in the *form element* instead. The dangerous direction: `submitter !== null`
    // for a buttonless submit passes here and lies about every browser, so no challenge may
    // assert anything about a no-argument requestSubmit's submitter.
    form.requestSubmit();
    expect(submitters[1]).toBe(form);
  });

  it("accepts any element as requestSubmit()'s submitter, where a browser rejects it", async () => {
    const context = await hostContext(
      [
        '<form id="f">',
        '  <input id="text" name="text" value="ok">',
        '  <button id="go" type="submit">Go</button>',
        '  <button id="cancel" type="button">Cancel</button>',
        '  <span id="label">x</span>',
        '</form>',
        '<form id="other"><button id="foreign" type="submit">Other</button></form>',
      ].join('\n'),
    );
    const form = context.document.querySelector<HTMLFormElement>('#f');
    const other = context.document.querySelector<HTMLFormElement>('#other');
    const go = context.document.querySelector<HTMLButtonElement>('#go');
    const cancel = context.document.querySelector<HTMLButtonElement>('#cancel');
    const label = context.document.querySelector<HTMLElement>('#label');
    const foreign = context.document.querySelector<HTMLButtonElement>('#foreign');
    if (!form || !other || !go || !cancel || !label || !foreign) throw new Error('the fixture is missing a control');

    const submitters: Array<EventTarget | string | null> = [];
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      submitters.push(event instanceof context.window.SubmitEvent ? event.submitter : 'not a SubmitEvent');
    });
    // The second form is only ever a source of foreign buttons; its own submissions are cancelled
    // so nothing here depends on what this engine does with an uncancelled one.
    other.addEventListener('submit', (event) => {
      event.preventDefault();
    });

    // The control, in this document at this moment: the form's own submit button submits it. So
    // every reading below is "this call was accepted", never "this form never submits at all".
    form.requestSubmit(go);
    expect(submitters).toEqual([go]);

    // Spec, and measured in Chromium through the production host (TypeError for the type=button
    // and the span, NotFoundError for the foreign button, and #f submitted exactly once -- by the
    // control): requestSubmit throws a TypeError when the submitter is not a submit button, and a
    // "NotFoundError" DOMException when it is not owned by this form -- the check that makes
    // `requestSubmit(via)` refuse arguments a forged `dispatchEvent` would happily carry. happy-dom
    // runs neither test: a type=button button, a plain span and another form's submit button are
    // each accepted, and each submits #f naming the element it was handed.
    form.requestSubmit(cancel);
    form.requestSubmit(label);
    form.requestSubmit(foreign);
    expect(submitters).toEqual([go, cancel, label, foreign]);

    // The other half of why this is unauthorable rather than merely unmeasured: `click()` refuses
    // both of those elements here exactly as a browser does -- a type=button does not submit, and a
    // foreign button submits its own form. So `request-submit-gate`'s two reference solutions
    // disagree with each other on these inputs *in this engine*, and no test may use them.
    cancel.click();
    foreign.click();
    expect(submitters).toEqual([go, cancel, label, foreign]);
  });

  it('leaves isTrusted undefined on a submit event, whichever path produced it', async () => {
    const context = await hostContext(
      '<form id="f"><input name="x" value="ok"><button id="go" type="submit">Go</button></form>',
    );
    const form = context.document.querySelector<HTMLFormElement>('#f');
    const go = context.document.querySelector<HTMLButtonElement>('#go');
    if (!form || !go) throw new Error('the fixture is missing its form');

    const seen: Array<{ trusted: unknown; type: string }> = [];
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      seen.push({ trusted: event.isTrusted, type: typeof event.isTrusted });
    });

    // The control and the measurement are the same two calls: both events must arrive, or
    // "isTrusted was not a boolean" would just be "no event was read".
    form.requestSubmit(go);
    form.dispatchEvent(new context.window.SubmitEvent('submit', { bubbles: true, cancelable: true, submitter: go }));
    expect(seen).toHaveLength(2);

    // Spec, and measured in Chromium through the production host (true then false, in this order,
    // from this exact fixture): an event fired by the user agent -- which is what `requestSubmit`
    // does -- is trusted, and `dispatchEvent` sets isTrusted false. That pair is the one channel
    // that would tell a real `requestSubmit(via)` from a hand-dispatched imitation of it. happy-dom
    // implements neither side: the flag is absent from both, so `request-submit-gate` cannot reject
    // the full imitation -- confirmed by running that imitation through the production host in
    // Chromium, where it also passes, because the challenge's tests cannot assert either channel.
    expect(seen.map((entry) => entry.type)).toEqual(['undefined', 'undefined']);
  });

  it("keeps a barred field's validity flags raised where a browser computes them barred-aware", async () => {
    const context = await hostContext(
      [
        '<form id="f">',
        '  <input id="normal" name="normal" required>',
        '  <input id="ro" name="ro" required readonly>',
        '  <input id="dis" name="dis" required disabled>',
        '</form>',
      ].join('\n'),
    );
    const normal = context.document.querySelector<HTMLInputElement>('#normal');
    const ro = context.document.querySelector<HTMLInputElement>('#ro');
    const dis = context.document.querySelector<HTMLInputElement>('#dis');
    const form = context.document.querySelector<HTMLFormElement>('#f');
    if (!normal || !ro || !dis || !form) throw new Error('the fixture is missing a field');

    // The controls: everything a challenge actually builds on agrees with a browser. willValidate
    // knows the fields are barred, per-field checkValidity() answers true for them, and the
    // form-level walk skips them entirely (true here because only barred fields "look" invalid
    // once #normal is filled).
    expect([normal.willValidate, ro.willValidate, dis.willValidate]).toEqual([true, false, false]);
    expect([ro.checkValidity(), dis.checkValidity()]).toEqual([true, true]);
    normal.value = 'filled';
    expect(form.checkValidity()).toBe(true);

    // Spec, and measured in Chrome through the production host (valueMissing false, valid true
    // for both barred fields): "suffering from being missing" requires the element to be *mutable*, so a readonly or
    // disabled required field reports valueMissing false and valid true in a browser. happy-dom
    // computes the flags with no mutability condition. The consequence for authors: never read
    // `validity` off a barred field -- an unguarded `!field.validity.valid` audit flags these two
    // here and passes them in Chrome, the same code with two verdicts. `who-blocks-submission`'s
    // second solution guards on willValidate first for exactly this reason.
    expect(ro.validity.valueMissing).toBe(true);
    expect(ro.validity.valid).toBe(false);
    expect(dis.validity.valueMissing).toBe(true);
  });

  it('lets reset() leave two radios checked when two carry defaultChecked', async () => {
    const context = await hostContext(
      [
        '<form id="f">',
        '  <input id="light" type="radio" name="theme" value="light">',
        '  <input id="system" type="radio" name="theme" value="system" checked>',
        '</form>',
      ].join('\n'),
    );
    const form = context.document.querySelector<HTMLFormElement>('#f');
    const light = context.document.querySelector<HTMLInputElement>('#light');
    const system = context.document.querySelector<HTMLInputElement>('#system');
    if (!form || !light || !system) throw new Error('the fixture is missing a radio');

    // The controls: live exclusivity holds (checking one unchecks the other), and reset() with a
    // *single* defaultChecked is faithful -- which is all `commit-the-draft` relies on, because a
    // correct commit never leaves two defaults standing.
    light.checked = true;
    expect(system.checked).toBe(false);
    system.defaultChecked = false;
    light.defaultChecked = true;
    form.reset();
    expect([light.checked, system.checked]).toEqual([true, false]);

    // Now the stale-default state a buggy commit produces: both radios carry defaultChecked.
    // Spec, and measured in Chrome through the production host ({light: false, system: true} from
    // this exact fixture): reset restores each control and the radio group invariant still applies, so a browser
    // ends with exactly one checked (the later one, as each restore unchecks the group). happy-dom
    // restores each radio independently and leaves *both* checked -- an unrepresentable state in a
    // browser. So no test may run reset() over a group carrying two defaults; the wrong answer is
    // caught by asserting defaultChecked as a value *before* any reset instead.
    system.defaultChecked = true;
    system.checked = false;
    form.reset();
    expect([light.checked, system.checked]).toEqual([true, true]);
  });
});
