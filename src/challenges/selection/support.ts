/**
 * Reads an element the challenge markup is supposed to contain, throwing a message that names it
 * when it is not there.
 *
 * Shared by the selection challenges' tests because the alternative -- `expect(el).not.toBeNull()`
 * followed by `if (!el) return;` at the top of every test -- is two lines of ceremony before every
 * assertion, and that early `return` reports a test that found nothing to assert on as a pass. A
 * throw fails the test instead, with a message pointing at the markup rather than at the learner.
 */
export function requireElement(doc: Document, id: string): HTMLElement {
  const element = doc.getElementById(id);
  if (!element) throw new Error(`#${id} is missing from the challenge markup`);
  return element;
}
