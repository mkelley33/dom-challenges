import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';

import { deleteProgress, fetchAllProgress, saveProgress } from '@/api/progress';
import type { ProgressRecord } from '@/types/progress';

export const PROGRESS_QUERY_KEY = ['progress'] as const;

export function emptyProgress(challengeId: string): ProgressRecord {
  return {
    id: challengeId,
    challengeId,
    status: 'unattempted',
    attempts: 0,
    solvedAt: null,
    revealedAt: null,
    lastCode: null,
    updatedAt: new Date().toISOString(),
  };
}

export function useProgressQuery(): UseQueryResult<ProgressRecord[]> {
  return useQuery({ queryKey: PROGRESS_QUERY_KEY, queryFn: fetchAllProgress, staleTime: 30_000 });
}

/**
 * Always returns a record. "No row yet" and "unattempted" are the same thing to the UI.
 *
 * Shared with the run flow, which reads the record straight off a settled fetch rather than out of
 * a render, so both sides resolve "which row is this challenge's" the same way.
 */
export function findChallengeProgress(records: ProgressRecord[] | undefined, challengeId: string): ProgressRecord {
  return records?.find((record) => record.challengeId === challengeId) ?? emptyProgress(challengeId);
}

export function useChallengeProgress(challengeId: string): ProgressRecord {
  const { data } = useProgressQuery();
  return findChallengeProgress(data, challengeId);
}

export function useSaveProgress(): UseMutationResult<
  ProgressRecord,
  Error,
  ProgressRecord,
  { previous: ProgressRecord[] }
> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: saveProgress,
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: PROGRESS_QUERY_KEY });
      const previous = queryClient.getQueryData<ProgressRecord[]>(PROGRESS_QUERY_KEY) ?? [];
      const others = previous.filter((record) => record.challengeId !== next.challengeId);
      queryClient.setQueryData<ProgressRecord[]>(PROGRESS_QUERY_KEY, [...others, next]);
      return { previous };
    },
    onError: (_error, _next, context) => {
      if (context) queryClient.setQueryData(PROGRESS_QUERY_KEY, context.previous);
    },
    onSettled: () => {
      // `refetchType: 'all'`, not the 'active' default: the run flow reads this query imperatively
      // through `ensureQueryData`, so on the challenge page there is no observer and an 'active'
      // invalidation would refetch nothing at all. The optimistic record would then be the only one
      // in the cache -- and on a create it carries the `id` this client made up, which json-server
      // discarded in favour of its own. Anything later keying off that id (a DELETE, say) would aim
      // at a row that does not exist. One GET per write is the price of the cache telling the truth.
      void queryClient.invalidateQueries({ queryKey: PROGRESS_QUERY_KEY, refetchType: 'all' });
    },
  });
}

/**
 * `recordId` must be a real json-server `id` read off a fetched `ProgressRecord`, never one
 * constructed by hand. json-server assigns its own `id` on POST and discards any client-supplied
 * one (see the docblock on `saveProgress` in `src/api/progress.ts`), so a value like
 * `emptyProgress(challengeId).id` -- which is just `challengeId` -- will not match any row's real
 * id. The DELETE then 404s, and `apiFetch` throws on the status before it reads the body, so the
 * mutation rejects and rolls back instead of clearing the record the caller intended.
 */
export function useClearProgress(): UseMutationResult<unknown, Error, string, { previous: ProgressRecord[] }> {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (recordId: string) => deleteProgress(recordId),
    onMutate: async (recordId) => {
      await queryClient.cancelQueries({ queryKey: PROGRESS_QUERY_KEY });
      const previous = queryClient.getQueryData<ProgressRecord[]>(PROGRESS_QUERY_KEY) ?? [];
      queryClient.setQueryData<ProgressRecord[]>(
        PROGRESS_QUERY_KEY,
        previous.filter((record) => record.id !== recordId),
      );
      return { previous };
    },
    onError: (_error, _recordId, context) => {
      if (context) queryClient.setQueryData(PROGRESS_QUERY_KEY, context.previous);
    },
    onSettled: () => {
      // Deliberately left on the 'active' default, unlike `useSaveProgress` above. A delete removes
      // a row rather than creating one, so there is no server-assigned field for the cache to be
      // missing: after `onMutate` filters the row out, the cache already equals what the server
      // holds. The asymmetry between the two mutations is a decision, not an oversight -- do not
      // "align" them without a reason that survives that argument.
      void queryClient.invalidateQueries({ queryKey: PROGRESS_QUERY_KEY });
    },
  });
}
