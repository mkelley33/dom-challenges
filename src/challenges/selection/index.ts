import type { Challenge } from '@/types/challenge';

import { attributeSelectors } from './attributeSelectors';
import { childrenVsChildNodes } from './childrenVsChildNodes';
import { closestRow } from './closestRow';
import { firstElementChild } from './firstElementChild';
import { liveVsStatic } from './liveVsStatic';
import { queryAll } from './queryAll';
import { queryBasics } from './queryBasics';
import { scopedQuery } from './scopedQuery';
import { siblingTraversal } from './siblingTraversal';

export const selectionChallenges: Challenge[] = [
  queryBasics,
  closestRow,
  liveVsStatic,
  queryAll,
  scopedQuery,
  attributeSelectors,
  childrenVsChildNodes,
  firstElementChild,
  siblingTraversal,
];
