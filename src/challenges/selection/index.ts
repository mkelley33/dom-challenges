import type { Challenge } from '@/types/challenge';

import { attributeSelectors } from './attributeSelectors';
import { childrenVsChildNodes } from './childrenVsChildNodes';
import { closestRow } from './closestRow';
import { liveVsStatic } from './liveVsStatic';
import { queryAll } from './queryAll';
import { queryBasics } from './queryBasics';
import { scopedQuery } from './scopedQuery';

export const selectionChallenges: Challenge[] = [
  queryBasics,
  closestRow,
  liveVsStatic,
  queryAll,
  scopedQuery,
  attributeSelectors,
  childrenVsChildNodes,
];
