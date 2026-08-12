/**
 * Shared lookups for the Forms & Validation tests.
 *
 * Each reads an element the challenge markup is supposed to contain and throws a message naming it
 * when it is not there, for the reason `styles/support.ts` records: `expect(el).not.toBeNull()`
 * followed by an early return reports a test that found nothing to assert on as a pass, where a
 * throw fails it pointing at the markup rather than at the learner.
 *
 * The typed variants put the tag in the selector so the `querySelector<T>` type argument is true at
 * run time as well -- `typescript/no-unsafe-type-assertion` is an error in this repo, and a form
 * test asks for `.value`, `.validity` and `.checked`, none of which exist on a bare `Element`.
 */
export function requireElement(doc: Document, id: string): HTMLElement {
  const element = doc.getElementById(id);
  if (!element) throw new Error(`#${id} is missing from the challenge markup`);
  return element;
}

export function requireForm(doc: Document, id: string): HTMLFormElement {
  const form = doc.querySelector<HTMLFormElement>(`form#${id}`);
  if (!form) throw new Error(`#${id} is missing from the challenge markup, or is not a <form>`);
  return form;
}

export function requireInput(doc: Document, id: string): HTMLInputElement {
  const input = doc.querySelector<HTMLInputElement>(`input#${id}`);
  if (!input) throw new Error(`#${id} is missing from the challenge markup, or is not an <input>`);
  return input;
}

export function requireSelect(doc: Document, id: string): HTMLSelectElement {
  const select = doc.querySelector<HTMLSelectElement>(`select#${id}`);
  if (!select) throw new Error(`#${id} is missing from the challenge markup, or is not a <select>`);
  return select;
}

export function requireButton(doc: Document, id: string): HTMLButtonElement {
  const button = doc.querySelector<HTMLButtonElement>(`button#${id}`);
  if (!button) throw new Error(`#${id} is missing from the challenge markup, or is not a <button>`);
  return button;
}
