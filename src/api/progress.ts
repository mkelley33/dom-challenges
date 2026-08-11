import type { ProgressRecord } from '@/types/progress';

import { apiFetch } from './client';

export function fetchAllProgress(): Promise<ProgressRecord[]> {
  return apiFetch<ProgressRecord[]>('/progress');
}

/**
 * json-server has no upsert, so an existing record is looked up by challengeId first.
 *
 * The lookup always re-resolves the row's actual `id` rather than assuming it equals
 * `challengeId`: the pinned json-server version (1.0.0-beta.15) discards any client-supplied
 * `id` on create and assigns its own (`lib/service.js`'s `create` does
 * `{ ...data, id: randomId() }`), so the id a POST returns is never the one that was sent.
 * Keying the lookup on `challengeId` instead of `id` is what keeps a challenge from ever
 * accumulating two progress rows despite that.
 */
export async function saveProgress(record: ProgressRecord): Promise<ProgressRecord> {
  const existing = await apiFetch<ProgressRecord[]>(`/progress?challengeId=${encodeURIComponent(record.challengeId)}`);
  const current = existing[0];

  if (current) {
    return apiFetch<ProgressRecord>(`/progress/${current.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ ...record, id: current.id }),
    });
  }

  return apiFetch<ProgressRecord>('/progress', { method: 'POST', body: JSON.stringify(record) });
}

export function deleteProgress(recordId: string): Promise<unknown> {
  return apiFetch<unknown>(`/progress/${recordId}`, { method: 'DELETE' });
}
