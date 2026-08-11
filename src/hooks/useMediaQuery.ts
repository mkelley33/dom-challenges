import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether a CSS media query matches, kept in sync as the viewport changes.
 *
 * Deliberately narrow in what it is used for. Layout belongs to CSS -- the responsive challenge
 * layout is one component tree with breakpoint utilities on it, so nothing here decides what is
 * mounted or how wide it is, and a broken `matchMedia` cannot rearrange the page. ARIA is the one
 * thing CSS cannot express: `aria-hidden` is an attribute, not a declaration, so a panel that is
 * hidden from assistive technology *only below a breakpoint* has to ask JavaScript where the
 * viewport is. That single attribute is what this exists for.
 *
 * `useSyncExternalStore` rather than `useState` in an effect: the first render then reads the real
 * answer instead of a default that is corrected one paint later.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onStoreChange);
      return () => {
        list.removeEventListener('change', onStoreChange);
      };
    },
    [query],
  );

  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query]);

  return useSyncExternalStore(subscribe, getSnapshot);
}
