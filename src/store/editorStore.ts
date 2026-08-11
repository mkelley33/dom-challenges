import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { EditorLayout } from '@/lib/paneLayout';
import { DEFAULT_LAYOUT } from '@/lib/paneLayout';
import type { CategoryId, Difficulty } from '@/types/challenge';

export type MobileTab = 'code' | 'problem' | 'result';

export interface ChallengeFilters {
  /**
   * Deliberately unread by the browse UI, and deliberately still here.
   *
   * `/category/:categoryId` is already scoped by its route param, and `ChallengeList` filters
   * within that scope. Applying this on top would let the two disagree -- a stored `events` and a
   * URL saying `selection` would empty a listing the learner navigated to on purpose, with nothing
   * on screen explaining why. The field persists a preference the app has no surface for yet; do
   * not wire it into the category page without also giving the learner a way to see and clear it.
   */
  category: CategoryId | 'all';
  difficulty: Difficulty | 'all';
  query: string;
  hideSolved: boolean;
}

interface EditorStore {
  drafts: Record<string, string>;
  filters: ChallengeFilters;
  layout: EditorLayout;
  mobileTab: MobileTab;
  setDraft: (challengeId: string, code: string) => void;
  clearDraft: (challengeId: string) => void;
  setFilters: (partial: Partial<ChallengeFilters>) => void;
  setLayout: (partial: Partial<EditorLayout>) => void;
  setMobileTab: (tab: MobileTab) => void;
}

const DEFAULT_FILTERS: ChallengeFilters = { category: 'all', difficulty: 'all', query: '', hideSolved: false };

export const useEditorStore = create<EditorStore>()(
  persist(
    (set) => ({
      drafts: {},
      filters: DEFAULT_FILTERS,
      layout: DEFAULT_LAYOUT,
      mobileTab: 'problem',
      setDraft: (challengeId, code) => {
        set((state) => ({ drafts: { ...state.drafts, [challengeId]: code } }));
      },
      clearDraft: (challengeId) => {
        set((state) => {
          const { [challengeId]: _removed, ...rest } = state.drafts;
          return { drafts: rest };
        });
      },
      setFilters: (partial) => {
        set((state) => ({ filters: { ...state.filters, ...partial } }));
      },
      setLayout: (partial) => {
        set((state) => ({ layout: { ...state.layout, ...partial } }));
      },
      setMobileTab: (tab) => {
        set({ mobileTab: tab });
      },
    }),
    {
      name: 'dom-challenges-editor',
      // mobileTab is view state for the current visit, not something to restore days later.
      partialize: (state) => ({ drafts: state.drafts, filters: state.filters, layout: state.layout }),
    },
  ),
);
