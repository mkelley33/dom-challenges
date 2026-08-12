import type { EventHelpers } from '@/types/challenge';

/**
 * How long to wait for a document to prove it is being rendered at all.
 *
 * **Not a timeout on the work, and no longer a bet on how fast a frame arrives.** It was both, at
 * 50ms, on the reasoning that this "clears a 60Hz frame (~16ms) several times over". That reasoning
 * measured the wrong document: a *steady* frame is ~16ms apart, but `reset()` hands every test a
 * **freshly created** `srcdoc` iframe, and its first frame is an order of magnitude slower and has
 * a long tail.
 *
 * Measured through the production host in a foregrounded Chrome tab, under the real transpile-and-
 * evaluate workload: first-frame latency p50 21.7ms, p90 24.9ms, p99 29.1ms over 200 warm runs, and
 * a sporadic tail reaching 94.1ms on a colder batch. The old constant sat inside that tail, so the
 * timer won and `tick()` returned **with no frame having run** -- measured at 3 of 60 runs, and in
 * exactly those 3 the learner's frame callback had not fired. Every rAF-dependent assertion was
 * flaky by that much.
 *
 * 250ms is ~2.7x the worst first frame observed and ~11x the median, and it is now only reachable
 * by a document that is not being rendered *at all* -- see `createTick` for why the second hop is
 * what makes that true. A non-rendering document therefore costs one of these per `tick()`, which
 * stays well inside the harness's per-test budget (`DEFAULT_TIMEOUT_MS`, 2000ms).
 */
const FRAME_FALLBACK_MS = 250;

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
 *
 * **Two chained frame hops, and the timer re-armed between them.** With one hop the timer was
 * answering two different questions at once — "is this document rendered?" and "has the frame
 * arrived yet?" — and a rendered document whose first frame was merely slow got the same answer as
 * one that would never produce a frame at all. Since a freshly created iframe's first frame has a
 * tail reaching ~94ms (see `FRAME_FALLBACK_MS`), that misreading was routine rather than
 * theoretical, and it resolved `tick()` before the learner's own frame callback had run.
 *
 * Re-arming the timer once the first hop lands separates the two questions. Reaching the first hop
 * *proves* the document is being rendered, so the budget that was spent proving it is not also
 * charged against waiting for the second — and the timer can now only win when no frame was
 * serviced at all, which is exactly the non-rendering case it exists for.
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

      const armEscape = (): void => {
        win.clearTimeout(fallback);
        fallback = win.setTimeout(finish, FRAME_FALLBACK_MS);
      };

      armEscape();
      win.requestAnimationFrame(() => {
        armEscape();
        win.requestAnimationFrame(finish);
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
