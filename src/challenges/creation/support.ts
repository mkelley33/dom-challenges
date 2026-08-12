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
 * The same, for a descendant named by a selector rather than by an id.
 *
 * This category's tests reach *inside* nodes the submitted code just built or moved -- the button in
 * the row that was pinned, the title in the card that was cloned -- and those have no ids to look
 * up. `Element` rather than `HTMLElement` because nothing here needs more: `addEventListener`,
 * `textContent`, `classList` and `fire.click` are all satisfied by it, and returning it needs no
 * assertion of any kind.
 *
 * The message says which root was searched, because "no `.star` in the document" and "no `.star` in
 * the row you just moved" are different bugs and only one of them is the learner's.
 */
export function requireIn(root: ParentNode, selector: string): Element {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`no element matching "${selector}" inside the node under test`);
  return element;
}
