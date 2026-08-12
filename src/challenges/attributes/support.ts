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
 * The same, for an `<input>`, typed by the selector that found it.
 *
 * `querySelector<HTMLInputElement>` with the tag name written into the selector rather than
 * `getElementById` plus a cast: the generic tells the compiler which element the selector names, and
 * the `input` in the selector is what makes that claim true at run time too. A cast would say the
 * same thing to the compiler and check nothing -- and `typescript/no-unsafe-type-assertion` is an
 * error in this project, so the honest spelling is also the only one that lints.
 */
export function requireInput(doc: Document, id: string): HTMLInputElement {
  const input = doc.querySelector<HTMLInputElement>(`input#${id}`);
  if (!input) throw new Error(`#${id} is missing from the challenge markup, or is not an <input>`);
  return input;
}

/**
 * The same, for a descendant named by a selector rather than by an id.
 *
 * `Element` rather than `HTMLElement` because nothing here needs more, and returning it needs no
 * assertion of any kind. The message says which root was searched, because "no `.status` in the
 * document" and "no `.status` in the form you were handed" are different bugs.
 */
export function requireIn(root: ParentNode, selector: string): Element {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`no element matching "${selector}" inside the node under test`);
  return element;
}

/** The ids of a list of elements, which is how this category's tests state "these, in this order". */
export function idsOf(elements: Iterable<Element>): string[] {
  return [...elements].map((element) => element.id);
}
