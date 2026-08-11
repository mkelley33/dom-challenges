import { useCallback, useEffect, useRef } from 'react';
import { useRouteError } from 'react-router';

import { buttonVariants } from '@/components/ui/buttonVariants';

/**
 * `useRouteError` is typed `unknown`, and correctly so: anything a component threw arrives here,
 * including values that are not `Error` at all. The check is structural for the same reason the
 * runner's is -- a rejected chunk import can carry an error built in another realm -- and anything
 * without a readable message is reported as no detail rather than as `[object Object]`.
 */
function detailOf(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message === '' ? null : error.message;
  }
  return typeof error === 'string' && error !== '' ? error : null;
}

/**
 * What the learner sees when part of the app fails to render — a rejected chunk, most often.
 *
 * Mounted as the `errorElement` of a pathless route *inside* `AppShell` rather than on the shell
 * route itself: react-router renders an `errorElement` in place of the element belonging to the
 * route that carries it, so hanging it on the shell would replace the header and the navigation
 * with this page and strand the learner on a dead end. From inside, it costs them the one page that
 * failed and leaves the way out intact.
 */
export function RouteError() {
  const error = useRouteError();
  const detail = detailOf(error);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    // The only thing that gets this page announced at all.
    //
    // A live region is read when its content changes *while the region is already on the page*;
    // content that is present when the region is inserted is not announced. This is a whole-route
    // replacement, so the `<output>` below arrives with its text already inside it, and react-router
    // moves no focus on navigation -- a polite region alone would be silence. `role="alert"` is the
    // documented exception to that rule, and it is exactly what this page gave up in order to stop
    // being assertive and atomic over its own heading and button.
    //
    // Focusing the heading is the conventional SPA route-change answer: it announces the heading
    // without interrupting, and it puts a keyboard user at the top of a page they were thrown to
    // rather than wherever focus happened to be when the chunk failed.
    headingRef.current?.focus();
  }, []);

  const handleReload = useCallback(() => {
    // A reload rather than a re-render. React caches a rejected `lazy` payload for the life of the
    // module registry and re-throws the same rejection on every later attempt, so nothing this page
    // can do in-place re-issues the import: only a fresh document does.
    window.location.reload();
  }, []);

  return (
    <div className="flex h-full flex-col items-start gap-3 p-8">
      {/* `-1`, so the effect above can focus it while it never becomes a Tab stop of its own. */}
      <h1 ref={headingRef} tabIndex={-1} className="text-lg font-semibold">
        This page could not be loaded
      </h1>
      {/* The message alone is the live region, not the page. `role="alert"` here would be assertive
          and atomic: it interrupts whatever a screen reader is saying, and it reads the whole region
          as one string -- heading, copy, detail and the button's label together. This page arrives
          as the result of a navigation the learner just made, where an interruption buys nothing and
          the heading and the control are better reached as themselves.
          `<output>` rather than `role="status"` on a div, matching `ResultPanel`: it carries the
          same implicit polite-live-region role as an element rather than an attribute. It takes
          phrasing content, which is why the two lines below are spans. */}
      <output className="flex max-w-prose flex-col gap-3">
        <span className="text-sm text-muted">
          Part of the app did not finish downloading. Nothing you have saved is affected — reloading usually fixes it,
          and the rest of the app still works.
        </span>
        {detail !== null && <span className="font-mono text-xs break-words text-muted">{detail}</span>}
      </output>
      {/* A native <button> wearing `buttonVariants`, rather than the `Button` component. This
          module is reachable from the entry chunk -- it has to be, since it is what renders when a
          chunk fails to arrive -- so everything it can reach is weight every visitor downloads
          before the dashboard paints. `Button` wraps Base UI's primitive, and measuring the built
          output put that at ~9 kB on the landing page for one control on a page almost nobody
          reaches. The variants are class strings and carry none of it. Nothing here needs the
          primitive's behaviour: this button is never disabled and never opens a popup.
          It is also the only control on the page: the way back to a working one is the shell's own
          navigation, which is the whole reason this renders inside the shell rather than in place
          of it. */}
      <button type="button" onClick={handleReload} className={buttonVariants()}>
        Reload the page
      </button>
    </div>
  );
}
