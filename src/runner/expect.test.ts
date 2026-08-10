import { describe, it, expect as vitestExpect } from 'vitest';

import { AssertionError, expect } from './expect';

const describeValueFixtureFn = (): undefined => undefined;

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
