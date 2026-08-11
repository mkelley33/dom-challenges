export type ProgressStatus = 'unattempted' | 'attempted' | 'solved';

export interface ProgressRecord {
  id: string;
  challengeId: string;
  status: ProgressStatus;
  attempts: number;
  solvedAt: string | null;
  revealedAt: string | null;
  lastCode: string | null;
  updatedAt: string;
}
