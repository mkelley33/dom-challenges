import { describe, expect, it } from 'vitest';

import type { ProgressRecord } from '@/types/progress';

import { solutionAccess } from './solutionAccess';

function record(overrides: Partial<ProgressRecord>): ProgressRecord {
  return {
    id: 'c1',
    challengeId: 'c1',
    status: 'unattempted',
    attempts: 0,
    solvedAt: null,
    revealedAt: null,
    lastCode: null,
    updatedAt: '2026-08-09T00:00:00.000Z',
    ...overrides,
  };
}

describe('solutionAccess', () => {
  it('locks solutions for an unattempted challenge', () => {
    expect(solutionAccess(record({}))).toEqual({ unlocked: false, earned: false });
  });

  it('locks solutions for an attempted but unsolved challenge', () => {
    expect(solutionAccess(record({ status: 'attempted', attempts: 3 }))).toEqual({ unlocked: false, earned: false });
  });

  it('unlocks and marks earned when solved without revealing', () => {
    expect(solutionAccess(record({ status: 'solved' }))).toEqual({ unlocked: true, earned: true });
  });

  it('unlocks without earning when the solution was revealed', () => {
    const revealed = record({ status: 'attempted', revealedAt: '2026-08-09T01:00:00.000Z' });
    expect(solutionAccess(revealed)).toEqual({ unlocked: true, earned: false });
  });

  it('does not count as earned when solved after revealing', () => {
    const both = record({ status: 'solved', revealedAt: '2026-08-09T01:00:00.000Z' });
    expect(solutionAccess(both)).toEqual({ unlocked: true, earned: false });
  });
});
