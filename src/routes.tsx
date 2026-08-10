import type { RouteObject } from 'react-router';
import { createBrowserRouter } from 'react-router';

import { ChallengeList } from './components/browse/ChallengeList';
import { Dashboard } from './components/browse/Dashboard';
import { ChallengePage } from './components/challenge/ChallengePage';
import { AppShell } from './components/layout/AppShell';
import { NotFound } from './components/NotFound';

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
