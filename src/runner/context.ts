import type { EventHelpers } from '@/types/challenge';

/**
 * How long to wait for an animation frame before giving up and continuing anyway.
 *
 * Long enough to clear a 60Hz frame (~16ms) several times over on a busy main thread, short
 * enough to stay well inside the harness's per-test budget (`DEFAULT_TIMEOUT_MS`, 2000ms) even
 * when a test ticks repeatedly.
 */
const FRAME_FALLBACK_MS = 50;

/**
 * Returns a function that flushes pending microtasks and then one animation frame.
 *
 * MutationObserver callbacks are delivered as microtasks, so awaiting a resolved promise
 * twice drains them; the rAF hop then covers anything scheduled for the next paint.
 *
 * The frame hop is raced against a timer because animation-frame callbacks run only for
 * documents the browser is *rendering*. Two cases reach a learner: a hidden tab, which stops
 * servicing frames until it is shown again — click Run, switch tabs, and every `tick()` test
 * fails as `Test "..." timed out` — and, permanently, a frame inside a `display: none`
 * container, which is never rendered and so never services a frame at all. **Whatever hosts the
 * preview must keep it rendered rather than hiding it with `display: none`**; the fallback keeps
 * a non-rendered document degrading to a timer instead of hanging, but it cannot make
 * paint-dependent work happen in a document the browser is not painting.
 */
export function createTick(win: Window & typeof globalThis): () => Promise<void> {
  return async function tick(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await new Promise<void>((resolve) => {
      let fallback: number | undefined;
      let settled = false;
      const finish = (): void => {
        if (settled) return;
        settled = true;
        win.clearTimeout(fallback);
        resolve();
      };

      fallback = win.setTimeout(finish, FRAME_FALLBACK_MS);
      win.requestAnimationFrame(finish);
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
      // `key` last: `init` is there to add the modifiers a challenge needs, not to replace the
      // helper's own argument. Spread the other way round and a stale `init.key` silently wins.
      target.dispatchEvent(new win.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init, key }));
    },
    submit(form, submitter, init) {
      // A `SubmitEvent`, not an `Event`, because `event.submitter` is the whole of "which button
      // submitted this form" -- a core Forms & Validation lesson, and one a bare `Event` reports as
      // `undefined` for every case including the genuinely submitter-less one.
      //
      // `init` is typed `EventInit`, not `SubmitEventInit`, so there is no `init.submitter` for the
      // argument to have to win against -- the collision `keydown` can only document as an ordering
      // rule at `key` cannot be written here at all. `submitter` still comes last so the guarantee
      // survives an `init` that carries the field at run time without declaring it in its type.
      form.dispatchEvent(
        new win.SubmitEvent('submit', {
          bubbles: true,
          cancelable: true,
          ...init,
          submitter: submitter ?? null,
        }),
      );
    },
  };
}
