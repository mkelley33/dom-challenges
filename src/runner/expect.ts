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
      if (value instanceof Element) return `<${value.tagName.toLowerCase()}>`;
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

function createMatchers(actual: unknown, negated: boolean): Matchers {
  const check = (name: string, passed: boolean, expected: unknown): void => {
    if (passed !== negated) return;
    const matcher = negated ? `not.${name}` : name;
    const verb = negated ? 'not to' : 'to';
    throw new AssertionError(
      `Expected ${describeValue(actual)} ${verb} ${name.replace(/^to/, '').toLowerCase()} ${describeValue(expected)}`,
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
      const text = actual instanceof Node ? (actual.textContent ?? '') : '';
      check('toHaveTextContent', text.trim() === expected.trim(), expected);
    },
    toHaveClass: (expected) => {
      const passed = actual instanceof Element && actual.classList.contains(expected);
      check('toHaveClass', passed, expected);
    },
    toHaveAttribute: (name, value) => {
      const present = actual instanceof Element && actual.hasAttribute(name);
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
