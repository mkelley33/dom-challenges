import { lazy } from 'react';
import type { RouteObject } from 'react-router';
import { createBrowserRouter } from 'react-router';

import { Dashboard } from './components/browse/Dashboard';
import { AppShell } from './components/layout/AppShell';
import { NotFound } from './components/NotFound';

/**
 * The two routes that carry a dependency chain the landing page does not need. `Dashboard` stays
 * statically imported: it *is* the landing page, so splitting it would only add a round trip
 * before the first thing anyone sees.
 *
 * `React.lazy` rather than the route's own `lazy` property, so `element` stays a plain element and
 * `createMemoryRouter(routeDefinitions, ...)` keeps working unchanged. `AppShell` owns the
 * `<Suspense>` boundary both suspend into.
 */

/**
 * Carries the editor chain -- Monaco, `react-markdown`, `remark-gfm`. Statically imported it put
 * all of that in the entry chunk, which every visitor downloads before choosing a challenge.
 */
const ChallengePage = lazy(async () => {
  const challengePage = await import('./components/challenge/ChallengePage');
  return { default: challengePage.ChallengePage };
});

/**
 * Carries `FilterBar`, whose select and switch pull in Base UI's popup machinery and the lucide
 * icon set: +161,759 bytes of route-level eager weight when this route was statically imported,
 * measured by rebuilding with the bar removed. None of it is reachable from the dashboard, which
 * is where every visitor starts.
 */
const ChallengeList = lazy(async () => {
  const challengeList = await import('./components/browse/ChallengeList');
  return { default: challengeList.ChallengeList };
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
