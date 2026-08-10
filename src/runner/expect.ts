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

/** `nodeType === 1` is `Node.ELEMENT_NODE`; `tagName` is checked so the members read below exist. */
function isElement(value: unknown): value is Element {
  return isNode(value) && value.nodeType === 1 && 'tagName' in value && typeof value.tagName === 'string';
}

function describeValue(value: unknown): string {
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
    case 'object':
      if (isElement(value)) return `<${value.tagName.toLowerCase()}>`;
      try {
        return JSON.stringify(value);
      } catch {
        return Object.prototype.toString.call(value);
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
