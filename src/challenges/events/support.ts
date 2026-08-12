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
 * This category's tests dispatch events at nodes *inside* the thing under test -- the tick inside
 * the button inside the row -- and those have no ids to look up. `Element` rather than `HTMLElement`
 * because nothing here needs more: `dispatchEvent`, `addEventListener` and `fire.click` are all
 * satisfied by it, and returning it needs no assertion of any kind.
 */
export function requireIn(root: ParentNode, selector: string): Element {
  const element = root.querySelector(selector);
  if (!element) throw new Error(`no element matching "${selector}" inside the node under test`);
  return element;
}

/**
 * A recorder a test hands to submitted code and reads back afterwards.
 *
 * Every challenge here is about *when a listener runs*, so nearly every test is "call this, then
 * tell me what arrived and in what order". Passing a `push` bound to a local array is the whole
 * pattern; naming it means the tests read as the sequence they are asserting rather than as
 * bookkeeping, and it keeps the array out of the submitted code's reach.
 */
export interface Recorder<T> {
  entries: T[];
  record: (value: T) => void;
}

export function createRecorder<T>(): Recorder<T> {
  const entries: T[] = [];
  return { entries, record: (value: T) => entries.push(value) };
}
