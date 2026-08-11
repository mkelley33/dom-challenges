import { useCallback } from 'react';
import { useRouteError } from 'react-router';

import { Button } from '@/components/ui/button';

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

  const handleReload = useCallback(() => {
    // A reload rather than a re-render. React caches a rejected `lazy` payload for the life of the
    // module registry and re-throws the same rejection on every later attempt, so nothing this page
    // can do in-place re-issues the import: only a fresh document does.
    window.location.reload();
  }, []);

  return (
    <div role="alert" className="flex h-full flex-col items-start gap-3 p-8">
      <h1 className="text-lg font-semibold">This page could not be loaded</h1>
      <p className="max-w-prose text-sm text-muted">
        Part of the app did not finish downloading. Nothing you have saved is affected — reloading usually fixes it, and
        the rest of the app still works.
      </p>
      {detail !== null && <p className="max-w-prose font-mono text-xs break-words text-muted">{detail}</p>}
      {/* The only control here. The way back to a working page is the shell's own navigation, which
          is the whole reason this renders inside the shell rather than in place of it. */}
      <Button onClick={handleReload}>Reload the page</Button>
    </div>
  );
}
