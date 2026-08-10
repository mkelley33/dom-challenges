import { describe, it, expect as vitestExpect } from 'vitest';

import { AssertionError, expect } from './expect';

const describeValueFixtureFn = (): undefined => undefined;

/** Stands in for an iframe realm's DOM constructors: no value in this realm is an instance of it. */
class ForeignRealmConstructor {
  readonly realm: string = 'iframe';
}

/**
 * The browser host is a `srcdoc` iframe, whose `Element` is a different class object from the
 * one this module sees: every element the learner correctly produces there fails
 * `value instanceof Element` in the app realm. happy-dom shares a single class table across all
 * of its windows and so cannot reproduce that divergence on its own -- swapping the app realm's
 * DOM globals for foreign classes is what puts these matchers in the browser's situation.
 */
function withForeignDomGlobals(run: () => void): void {
  const realElement: unknown = Reflect.get(globalThis, 'Element');
  const realNode: unknown = Reflect.get(globalThis, 'Node');
  Reflect.set(globalThis, 'Element', ForeignRealmConstructor);
  Reflect.set(globalThis, 'Node', ForeignRealmConstructor);
  try {
    run();
  } finally {
    Reflect.set(globalThis, 'Element', realElement);
    Reflect.set(globalThis, 'Node', realNode);
  }
}

/** The harsher case: a realm with no DOM globals at all, where `instanceof Element` throws. */
function withoutDomGlobals(run: () => void): void {
  const realElement: unknown = Reflect.get(globalThis, 'Element');
  const realNode: unknown = Reflect.get(globalThis, 'Node');
  Reflect.deleteProperty(globalThis, 'Element');
  Reflect.deleteProperty(globalThis, 'Node');
  try {
    run();
  } finally {
    Reflect.set(globalThis, 'Element', realElement);
    Reflect.set(globalThis, 'Node', realNode);
  }
}

describe('expect', () => {
  it('passes toBe on identical primitives', () => {
    vitestExpect(() => {
      expect(3).toBe(3);
    }).not.toThrow();
  });

  it('throws AssertionError with structured detail on toBe mismatch', () => {
    let caught: unknown;
    try {
      expect(3).toBe(4);
      throw new Error('should have thrown');
    } catch (error) {
      caught = error;
    }
    vitestExpect(caught).toBeInstanceOf(AssertionError);
    if (!(caught instanceof AssertionError)) throw caught;
    vitestExpect(caught.detail).toEqual({ matcher: 'toBe', expected: 4, actual: 3 });
  });

  it('deep-compares with toEqual', () => {
    vitestExpect(() => {
      expect({ a: [1, 2] }).toEqual({ a: [1, 2] });
    }).not.toThrow();
    vitestExpect(() => {
      expect({ a: [1, 2] }).toEqual({ a: [1, 3] });
    }).toThrow(AssertionError);
  });

  it('inverts via .not', () => {
    vitestExpect(() => {
      expect(3).not.toBe(4);
    }).not.toThrow();
    vitestExpect(() => {
      expect(3).not.toBe(3);
    }).toThrow(AssertionError);
  });

  it('reports the negated matcher name in detail', () => {
    let caught: unknown;
    try {
      expect(3).not.toBe(3);
      throw new Error('should have thrown');
    } catch (error) {
      caught = error;
    }
    if (!(caught instanceof AssertionError)) throw caught;
    vitestExpect(caught.detail.matcher).toBe('not.toBe');
  });

  it('supports toHaveLength on arrays and NodeLists', () => {
    vitestExpect(() => {
      expect([1, 2]).toHaveLength(2);
    }).not.toThrow();
    vitestExpect(() => {
      expect([1, 2]).toHaveLength(3);
    }).toThrow(AssertionError);
  });

  it('supports DOM matchers', () => {
    document.body.innerHTML = '<p id="t" class="a b" data-x="1">hi</p>';
    const el = document.getElementById('t');
    vitestExpect(() => {
      expect(el).toHaveTextContent('hi');
    }).not.toThrow();
    vitestExpect(() => {
      expect(el).toHaveClass('a');
    }).not.toThrow();
    vitestExpect(() => {
      expect(el).toHaveClass('zzz');
    }).toThrow(AssertionError);
    vitestExpect(() => {
      expect(el).toHaveAttribute('data-x', '1');
    }).not.toThrow();
  });

  it('applies the DOM matchers to elements from a foreign realm', () => {
    document.body.innerHTML = '<p id="t" class="a b" data-x="1">hi</p>';
    const el = document.getElementById('t');
    withForeignDomGlobals(() => {
      vitestExpect(() => {
        expect(el).toHaveClass('a');
      }).not.toThrow();
      vitestExpect(() => {
        expect(el).toHaveAttribute('data-x', '1');
      }).not.toThrow();
      vitestExpect(() => {
        expect(el).toHaveTextContent('hi');
      }).not.toThrow();
      // The negative half still has to fail, so this cannot be passed by a matcher that
      // gave up and returned `true` for everything element-shaped.
      vitestExpect(() => {
        expect(el).toHaveClass('zzz');
      }).toThrow(AssertionError);
    });
  });

  it('describes foreign-realm elements by tag name rather than as plain objects', () => {
    document.body.innerHTML = '<p id="t" class="a b">hi</p>';
    const el = document.getElementById('t');
    withForeignDomGlobals(() => {
      let caught: unknown;
      try {
        expect(el).toBeNull();
        throw new Error('should have thrown');
      } catch (error) {
        caught = error;
      }
      if (!(caught instanceof AssertionError)) throw caught;
      vitestExpect(caught.message).toBe('Expected <p> to benull null');
    });
  });

  it('fails cleanly instead of throwing when the realm has no DOM globals', () => {
    document.body.innerHTML = '<p id="t" class="a b" data-x="1">hi</p>';
    const el = document.getElementById('t');
    withoutDomGlobals(() => {
      vitestExpect(() => {
        expect(el).toHaveClass('a');
      }).not.toThrow();
      vitestExpect(() => {
        expect(el).toHaveClass('zzz');
      }).toThrow(AssertionError);
      vitestExpect(() => {
        expect(el).toHaveAttribute('data-x');
      }).not.toThrow();
      vitestExpect(() => {
        expect(el).toHaveTextContent('hi');
      }).not.toThrow();
    });
  });

  it('describes function values using their source text, not [object Function]', () => {
    let caught: unknown;
    try {
      expect(describeValueFixtureFn).toBe(null);
      throw new Error('should have thrown');
    } catch (error) {
      caught = error;
    }
    vitestExpect(caught).toBeInstanceOf(AssertionError);
    if (!(caught instanceof AssertionError)) throw caught;
    vitestExpect(caught.message).toBe(`Expected ${String(describeValueFixtureFn)} to be null`);
  });

  it('supports toThrow', () => {
    vitestExpect(() => {
      expect(() => {
        throw new Error('boom');
      }).toThrow();
    }).not.toThrow();
    vitestExpect(() => {
      expect(() => undefined).toThrow();
    }).toThrow(AssertionError);
  });
});
