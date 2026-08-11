export interface AssertionFailure {
  matcher: string;
  expected: unknown;
  actual: unknown;
}

export class AssertionError extends Error {
  readonly detail: AssertionFailure;

  constructor(message: string, detail: AssertionFailure) {
    super(message);
    this.name = 'AssertionError';
    this.detail = detail;
  }
}

export interface Matchers {
  toBe(expected: unknown): void;
  toEqual(expected: unknown): void;
  toBeNull(): void;
  toBeTruthy(): void;
  toBeFalsy(): void;
  toBeInstanceOf(expected: Function): void;
  toHaveLength(expected: number): void;
  toContain(expected: unknown): void;
  toHaveTextContent(expected: string): void;
  toHaveClass(expected: string): void;
  toHaveAttribute(name: string, value?: string): void;
  toThrow(): void;
  readonly not: Matchers;
}

export type ExpectFn = (actual: unknown) => Matchers;

/**
 * DOM checks here are structural, never `instanceof`.
 *
 * Submitted code runs in the host's realm -- a `srcdoc` iframe in the browser -- whose `Element`
 * and `Node` are different class objects from the ones this module closes over. `value instanceof
 * Element` is therefore `false` for every element a learner correctly produced, and in a realm
 * with no DOM globals at all it throws `ReferenceError` instead of failing as an assertion.
 * `nodeType` carries the same numbers in every realm, so it is what these guards read.
 */
function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && 'nodeType' in value && typeof value.nodeType === 'number';
}

/**
 * `nodeType === 1` is `Node.ELEMENT_NODE`, and `tagName` is the second structural witness: it is a
 * member every element carries and no other node type does, which is what `describeElement` prints.
 *
 * It is not a proof that `classList`, `hasAttribute` or `getAttribute` exist -- nothing cheap is --
 * and it does not claim to be. Those are read on the strength of the two checks above naming a real
 * element in *some* realm, which is the most a structural guard can establish.
 */
function isElement(value: unknown): value is Element {
  return isNode(value) && value.nodeType === 1 && 'tagName' in value && typeof value.tagName === 'string';
}

/** How many entries of a collection are printed before the rest are summarised as a count. */
const MAX_LISTED_ITEMS = 10;

/** How much of a text node's data is printed. Long enough to recognise, short enough to scan. */
const MAX_TEXT_CHARS = 30;

/**
 * `<li class="item">` rather than `<li>`.
 *
 * A failure that prints `<div>` three times over tells a learner which *kind* of thing came back
 * and nothing about which ones -- and every challenge in the selection category is about telling
 * one element from its neighbours. `id` and `class` are the two attributes those challenges select
 * on, so they are the two that make the printed element identifiable.
 */
function describeElement(value: Element): string {
  const id = value.getAttribute('id');
  const className = value.getAttribute('class');
  const attributes = [
    id === null || id === '' ? '' : ` id=${JSON.stringify(id)}`,
    className === null || className === '' ? '' : ` class=${JSON.stringify(className)}`,
  ].join('');
  return `<${value.tagName.toLowerCase()}${attributes}>`;
}

function describeNode(value: Node): string {
  if (isElement(value)) return describeElement(value);
  // `nodeType === 3` is `Node.TEXT_NODE`. Its data is quoted and clipped: the childNodes challenges
  // hand back runs of indentation whitespace, and `#text "\n  "` is what makes those legible as the
  // nodes they are rather than as gaps between the elements.
  if (value.nodeType === 3) {
    const data = value.nodeValue ?? '';
    const clipped = data.length > MAX_TEXT_CHARS ? `${data.slice(0, MAX_TEXT_CHARS)}…` : data;
    return `#text ${JSON.stringify(clipped)}`;
  }
  // `#comment`, `#document`, `#document-fragment`: the node's own name already reads as a label.
  return value.nodeName;
}

/**
 * Renders a `NodeList`, an `HTMLCollection` or an array of nodes as a list of its members, or
 * returns `null` for anything that is neither.
 *
 * Structural throughout, for the same reason `isNode` is: the collection was built in the host
 * realm, so `value instanceof NodeList` is `false` for every collection a learner actually
 * produces. `item` is the duck-type both DOM collections share, and it is the only thing that can
 * recognise an *empty* one -- which matters, because an empty NodeList is the actual value behind
 * every `toHaveLength(0)` failure in this category and `{}` is the least informative way to print
 * it. Arrays are recognised by their contents instead, so `["Home","Docs"]` keeps rendering as
 * JSON while `[...document.querySelectorAll('p')]` does not.
 */
function describeCollection(value: object, depth: number): string | null {
  const length = Reflect.get(value, 'length');
  if (typeof length !== 'number' || !Number.isInteger(length) || length < 0) return null;

  const isDomCollection = typeof Reflect.get(value, 'item') === 'function';
  const shown = Math.min(length, MAX_LISTED_ITEMS);
  const members: string[] = [];
  let sawNode = false;

  for (let index = 0; index < shown; index += 1) {
    const member = Reflect.get(value, index);
    if (isNode(member)) sawNode = true;
    members.push(describeValue(member, depth + 1));
  }

  if (!isDomCollection && !sawNode) return null;
  if (length > shown) members.push(`…${String(length - shown)} more`);
  return `[${members.join(', ')}]`;
}

/**
 * `depth` exists only to stop the collection branch recursing into itself: a member of a collection
 * is described one level down, where the branch is off and `JSON.stringify` (which detects its own
 * cycles) takes over. Without it a self-referential array holding one node would recurse forever.
 */
function describeValue(value: unknown, depth = 0): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  switch (typeof value) {
    case 'string':
      return JSON.stringify(value);
    case 'number':
    case 'boolean':
    case 'bigint':
      return String(value);
    case 'symbol':
      return value.toString();
    case 'function':
      return String(value);
    case 'object': {
      if (isNode(value)) return describeNode(value);
      if (depth === 0) {
        const listed = describeCollection(value, depth);
        if (listed !== null) return listed;
      }
      try {
        return JSON.stringify(value);
      } catch {
        return Object.prototype.toString.call(value);
      }
    }
    default:
      return Object.prototype.toString.call(value);
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;

  return aKeys.every(
    (key) => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(Reflect.get(a, key), Reflect.get(b, key)),
  );
}

function lengthOf(value: unknown): number | null {
  if (typeof value === 'string' || Array.isArray(value)) return value.length;
  if (typeof value === 'object' && value !== null && 'length' in value) {
    const { length } = value;
    return typeof length === 'number' ? length : null;
  }
  return null;
}

/**
 * Reads a matcher name back as the words of the sentence a learner sees: `toHaveClass` becomes
 * `have class`. The split on capitals has to come before lowercasing -- doing it the other way
 * round is what produced `Expected <p> to haveclass "x"`.
 */
function matcherPhrase(name: string): string {
  return name
    .replace(/^to/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase();
}

function createMatchers(actual: unknown, negated: boolean): Matchers {
  const check = (name: string, passed: boolean, expected: unknown): void => {
    if (passed !== negated) return;
    const matcher = negated ? `not.${name}` : name;
    const verb = negated ? 'not to' : 'to';
    throw new AssertionError(
      `Expected ${describeValue(actual)} ${verb} ${matcherPhrase(name)} ${describeValue(expected)}`,
      { matcher, expected, actual },
    );
  };

  return {
    toBe: (expected) => {
      check('toBe', Object.is(actual, expected), expected);
    },
    toEqual: (expected) => {
      check('toEqual', deepEqual(actual, expected), expected);
    },
    toBeNull: () => {
      check('toBeNull', actual === null, null);
    },
    toBeTruthy: () => {
      check('toBeTruthy', Boolean(actual), true);
    },
    toBeFalsy: () => {
      check('toBeFalsy', !actual, false);
    },
    toBeInstanceOf: (expected) => {
      check('toBeInstanceOf', actual instanceof expected, expected);
    },
    toHaveLength: (expected) => {
      check('toHaveLength', lengthOf(actual) === expected, expected);
    },
    toContain: (expected) => {
      const passed =
        typeof actual === 'string'
          ? actual.includes(String(expected))
          : Array.isArray(actual) && actual.includes(expected);
      check('toContain', passed, expected);
    },
    toHaveTextContent: (expected) => {
      const textContent = isNode(actual) ? actual.textContent : null;
      const text = typeof textContent === 'string' ? textContent : '';
      check('toHaveTextContent', text.trim() === expected.trim(), expected);
    },
    toHaveClass: (expected) => {
      const passed = isElement(actual) && actual.classList.contains(expected);
      check('toHaveClass', passed, expected);
    },
    toHaveAttribute: (name, value) => {
      const present = isElement(actual) && actual.hasAttribute(name);
      const passed = value === undefined ? present : present && actual.getAttribute(name) === value;
      check('toHaveAttribute', passed, value === undefined ? name : `${name}="${value}"`);
    },
    toThrow: () => {
      let threw = false;
      if (typeof actual === 'function') {
        try {
          actual();
        } catch {
          threw = true;
        }
      }
      check('toThrow', threw, 'to throw');
    },
    get not(): Matchers {
      return createMatchers(actual, !negated);
    },
  };
}

export const expect: ExpectFn = (actual) => createMatchers(actual, false);
