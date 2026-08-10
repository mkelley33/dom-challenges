import type { EventHelpers } from '@/types/challenge';

/**
 * Returns a function that flushes pending microtasks and then one animation frame.
 *
 * MutationObserver callbacks are delivered as microtasks, so awaiting a resolved promise
 * twice drains them; the rAF hop then covers anything scheduled for the next paint.
 */
export function createTick(win: Window & typeof globalThis): () => Promise<void> {
  return async function tick(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise<void>((resolve) => {
      win.requestAnimationFrame(() => {
        resolve();
      });
    });
  };
}

export function createEventHelpers(win: Window & typeof globalThis): EventHelpers {
  return {
    click(target, init) {
      target.dispatchEvent(new win.MouseEvent('click', { bubbles: true, cancelable: true, ...init }));
    },
    input(target, value) {
      target.value = value;
      target.dispatchEvent(new win.Event('input', { bubbles: true }));
    },
    keydown(target, key, init) {
      target.dispatchEvent(new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, ...init }));
    },
    submit(form) {
      form.dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true }));
    },
  };
}
