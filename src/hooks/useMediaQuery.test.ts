import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useMediaQuery } from './useMediaQuery';

const QUERY = '(min-width: 64rem)';

/**
 * Replaces `matchMedia` with one whose answer the test controls.
 *
 * happy-dom answers from a viewport it will not let a test resize mid-render, and the whole point
 * of the hook is what happens when the answer *changes*, so the fake is the only way to reach the
 * second half of it.
 */
function stubMatchMedia(initial: boolean) {
  const listeners = new Set<() => void>();
  let matches = initial;

  vi.stubGlobal('matchMedia', (media: string) => ({
    media,
    get matches() {
      return matches;
    },
    addEventListener: (_type: string, listener: () => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: () => void) => {
      listeners.delete(listener);
    },
  }));

  return {
    listenerCount: (): number => listeners.size,
    change(next: boolean): void {
      matches = next;
      for (const listener of listeners) listener();
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useMediaQuery', () => {
  it('reports whether the query matches right now', () => {
    stubMatchMedia(true);

    const { result } = renderHook(() => useMediaQuery(QUERY));

    expect(result.current).toBe(true);
  });

  it('reports a query that does not match as false rather than defaulting to true', () => {
    stubMatchMedia(false);

    const { result } = renderHook(() => useMediaQuery(QUERY));

    expect(result.current).toBe(false);
  });

  it('re-renders with the new answer when the viewport crosses the breakpoint', () => {
    const media = stubMatchMedia(false);
    const { result } = renderHook(() => useMediaQuery(QUERY));

    act(() => {
      media.change(true);
    });

    // A hook that read `matches` once and kept it would pass both tests above and fail here, which
    // is the whole reason this one exists: a phone that is rotated crosses the breakpoint without
    // remounting anything.
    expect(result.current).toBe(true);
  });

  it('drops its listener on unmount', () => {
    const media = stubMatchMedia(false);
    const { unmount } = renderHook(() => useMediaQuery(QUERY));
    expect(media.listenerCount()).toBe(1);

    unmount();

    expect(media.listenerCount()).toBe(0);
  });
});
