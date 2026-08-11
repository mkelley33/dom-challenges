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

/**
 * The sentence a learner reads, for an assertion that must fail.
 *
 * Throwing when the assertion *passes* is the point: every caller below is checking the wording of
 * a failure, and a matcher that quietly stopped failing would otherwise report a missing message
 * as an empty string and be read as a wording bug.
 */
function messageOf(assertion: () => void): string {
  try {
    assertion();
  } catch (error) {
    if (error instanceof AssertionError) return error.message;
    throw error;
  }
  throw new Error('The assertion passed, so there is no failure message to read.');
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

    // The branch nearly every selection challenge actually lands on. A NodeList is not an array,
    // so it reaches `lengthOf`'s separate `'length' in value` path -- and until this was written,
    // deleting that path left the whole suite green while `toHaveLength` on a `querySelectorAll`
    // result silently answered "no length" and failed every count assertion in the category.
    document.body.innerHTML = '<ul><li></li><li></li><li></li></ul>';
    const items = document.querySelectorAll('li');
    vitestExpect(Array.isArray(items)).toBe(false);
    vitestExpect(() => {
      expect(items).toHaveLength(3);
    }).not.toThrow();
    vitestExpect(() => {
      expect(items).toHaveLength(2);
    }).toThrow(AssertionError);

    // An HTMLCollection reaches it too, and an empty one is the value behind every `toHaveLength(0)`
    // failure in the category -- the case where "no length" and "length 0" are easiest to confuse.
    vitestExpect(() => {
      expect(document.getElementsByTagName('td')).toHaveLength(0);
    }).not.toThrow();
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

  it('describes foreign-realm elements by tag and attributes rather than as plain objects', () => {
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
      vitestExpect(caught.message).toBe('Expected <p id="t" class="a b"> to be null null');
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

  it('reads a multi-word matcher name back as words', () => {
    // The learner reads this sentence when their code is wrong, so it has to be a sentence:
    // lowercasing the matcher name whole turned `toHaveClass` into `haveclass`.
    document.body.innerHTML = '<p id="t" class="a"></p>';
    let caught: unknown;
    try {
      expect(document.getElementById('t')).toHaveClass('missing');
      throw new Error('should have thrown');
    } catch (error) {
      caught = error;
    }
    if (!(caught instanceof AssertionError)) throw caught;
    vitestExpect(caught.message).toBe('Expected <p id="t" class="a"> to have class "missing"');
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

  it('describes a NodeList as its elements rather than as an object keyed by index', () => {
    // The message a beginner failing `selection-query-all` reads first. Rendered through
    // `JSON.stringify` this is `{"0":{},"1":{},"2":{}}`, which names neither the tag nor the fact
    // that a collection -- not an array of strings -- came back.
    document.body.innerHTML = '<ul><li class="item">Home</li><li class="item">Docs</li></ul>';
    vitestExpect(
      messageOf(() => {
        expect(document.querySelectorAll('.item')).toEqual(['Home', 'Docs']);
      }),
    ).toBe('Expected [<li class="item">, <li class="item">] to equal ["Home","Docs"]');
  });

  it('describes an HTMLCollection the same way, without reaching for instanceof', () => {
    document.body.innerHTML = '<ul id="list"><li class="row">1</li></ul>';
    const list = document.getElementById('list');
    vitestExpect(
      messageOf(() => {
        expect(list?.children).toHaveLength(0);
      }),
    ).toBe('Expected [<li class="row">] to have length 0');
  });

  it('describes a plain array of elements, which is what a spread or Array.from hands back', () => {
    document.body.innerHTML = '<p id="only">x</p>';
    const found = [...document.querySelectorAll('p')];
    vitestExpect(
      messageOf(() => {
        expect(found).toHaveLength(0);
      }),
    ).toBe('Expected [<p id="only">] to have length 0');
  });

  it('describes an empty collection as an empty list, not as an empty object', () => {
    document.body.innerHTML = '<div></div>';
    // `{}` is what `JSON.stringify` makes of an empty NodeList, and it reads as "some object" --
    // the one shape a learner cannot tell apart from a bug in the test.
    vitestExpect(
      messageOf(() => {
        expect(document.querySelectorAll('.nothing')).toHaveLength(3);
      }),
    ).toBe('Expected [] to have length 3');
  });

  it('caps a long collection instead of printing every node into the results panel', () => {
    document.body.innerHTML = `<ul>${'<li class="row"></li>'.repeat(25)}</ul>`;
    const listed = Array.from({ length: 10 }, () => '<li class="row">').join(', ');
    vitestExpect(
      messageOf(() => {
        expect(document.querySelectorAll('.row')).toHaveLength(0);
      }),
    ).toBe(`Expected [${listed}, …15 more] to have length 0`);
  });

  it('carries id and class on an element, since three identical tags identify nothing', () => {
    document.body.innerHTML = '<div id="menu" class="a b"></div>';
    vitestExpect(
      messageOf(() => {
        expect(document.getElementById('menu')).toBeNull();
      }),
    ).toBe('Expected <div id="menu" class="a b"> to be null null');
  });

  it('describes the non-element nodes a childNodes walk returns', () => {
    document.body.innerHTML = '<div id="box">hi<!-- note --></div>';
    const box = document.getElementById('box');
    vitestExpect(
      messageOf(() => {
        expect(box?.childNodes).toHaveLength(0);
      }),
    ).toBe('Expected [#text "hi", #comment] to have length 0');
  });

  it('truncates a long text node rather than pasting a paragraph into the message', () => {
    document.body.innerHTML = `<div id="box">${'x'.repeat(60)}</div>`;
    const box = document.getElementById('box');
    vitestExpect(
      messageOf(() => {
        expect(box?.childNodes).toHaveLength(0);
      }),
    ).toBe(`Expected [#text "${'x'.repeat(30)}…"] to have length 0`);
  });

  it('leaves values that are not collections of nodes rendered as they were', () => {
    // The list branch must not swallow the ordinary cases: a string array is still JSON, and an
    // object that merely has a numeric `length` is not a collection.
    vitestExpect(
      messageOf(() => {
        expect(['a', 'b']).toHaveLength(3);
      }),
    ).toBe('Expected ["a","b"] to have length 3');
    vitestExpect(
      messageOf(() => {
        expect({ length: 2 }).toHaveLength(3);
      }),
    ).toBe('Expected {"length":2} to have length 3');
  });

  it('describes collections from a foreign realm, where instanceof NodeList is false', () => {
    document.body.innerHTML = '<ul><li class="item">Home</li></ul>';
    const items = document.querySelectorAll('.item');
    withForeignDomGlobals(() => {
      vitestExpect(
        messageOf(() => {
          expect(items).toHaveLength(0);
        }),
      ).toBe('Expected [<li class="item">] to have length 0');
    });
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
