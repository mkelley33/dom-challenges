/**
 * Reads an element the challenge markup is supposed to contain, throwing a message that names it
 * when it is not there.
 *
 * Shared by this category's tests because the alternative -- `expect(el).not.toBeNull()` followed by
 * `if (!el) return;` at the top of every test -- is two lines of ceremony before every assertion,
 * and that early `return` reports a test that found nothing to assert on as a pass. A throw fails
 * the test instead, with a message pointing at the markup rather than at the learner.
 */
export function requireElement(doc: Document, id: string): HTMLElement {
  const element = doc.getElementById(id);
  if (!element) throw new Error(`#${id} is missing from the challenge markup`);
  return element;
}

/**
 * The same, for a `<style>` element a test needs to rewrite or relocate, typed by the selector that
 * found it rather than by a cast -- `typescript/no-unsafe-type-assertion` is an error here, and the
 * `style` in the selector is what makes the claim true at run time too.
 */
export function requireStyle(doc: Document, id: string): HTMLStyleElement {
  const element = doc.querySelector<HTMLStyleElement>(`style#${id}`);
  if (!element) throw new Error(`style#${id} is missing from the challenge markup, or is not a <style>`);
  return element;
}

/**
 * One computed longhand, read through the host's own window.
 *
 * Every test in this category asks this question, and every one of them must ask it of `ctx.win`
 * rather than the app's window: in the browser the element lives in the preview frame, and only the
 * frame's `getComputedStyle` is defined over it. The dashed name goes through `getPropertyValue`,
 * which is also the only spelling that can read a custom property.
 *
 * Callers stay inside the portable subset the category docblock records: px lengths written as px,
 * longhands the challenge's own CSS sets, custom properties read off the element that declares
 * them. This helper cannot enforce that; the docblock is the contract.
 */
export function computedValue(win: Window & typeof globalThis, element: Element, property: string): string {
  return win.getComputedStyle(element).getPropertyValue(property);
}
