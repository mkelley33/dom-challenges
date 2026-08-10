import type { Challenge } from '@/types/challenge';

import { closestRow } from './closestRow';
import { liveVsStatic } from './liveVsStatic';
import { queryBasics } from './queryBasics';

export const selectionChallenges: Challenge[] = [queryBasics, closestRow, liveVsStatic];
