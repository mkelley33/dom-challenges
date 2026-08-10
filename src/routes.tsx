import { lazy } from 'react';
import type { RouteObject } from 'react-router';
import { createBrowserRouter } from 'react-router';

import { ChallengeList } from './components/browse/ChallengeList';
import { Dashboard } from './components/browse/Dashboard';
import { AppShell } from './components/layout/AppShell';
import { NotFound } from './components/NotFound';

/**
 * The only route that carries the editor chain -- Monaco, `react-markdown`, `remark-gfm` -- so it
 * is the only one worth splitting: statically imported it put all of that in the entry chunk, which
 * every visitor downloads before they have chosen a challenge.
 *
 * `React.lazy` rather than the route's own `lazy` property, so `element` stays a plain element and
 * `createMemoryRouter(routeDefinitions, ...)` keeps working unchanged. `AppShell` owns the
 * `<Suspense>` boundary it suspends into.
 */
const ChallengePage = lazy(async () => {
  const challengePage = await import('./components/challenge/ChallengePage');
  return { default: challengePage.ChallengePage };
});

export const routeDefinitions: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'category/:categoryId', element: <ChallengeList /> },
      { path: 'challenge/:slug', element: <ChallengePage /> },
      { path: '*', element: <NotFound message="That page does not exist." /> },
    ],
  },
];

export const router = createBrowserRouter(routeDefinitions);
