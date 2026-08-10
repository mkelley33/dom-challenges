import type { ProgressRecord } from '@/types/progress';

export interface SolutionAccess {
  unlocked: boolean;
  earned: boolean;
}

/** Single source of truth for spec §8.1. Both flags derive from the record alone. */
export function solutionAccess(record: ProgressRecord): SolutionAccess {
  const revealed = record.revealedAt !== null;
  const solved = record.status === 'solved';
  return { unlocked: solved || revealed, earned: solved && !revealed };
}
