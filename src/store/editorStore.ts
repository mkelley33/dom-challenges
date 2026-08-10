import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { CategoryId, Difficulty } from '@/types/challenge';

export type MobileTab = 'code' | 'problem' | 'result';

export interface ChallengeFilters {
  category: CategoryId | 'all';
  difficulty: Difficulty | 'all';
  query: string;
  hideSolved: boolean;
}

export interface EditorLayout {
  promptPercent: number;
  editorPercent: number;
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
const DEFAULT_LAYOUT: EditorLayout = { promptPercent: 28, editorPercent: 42 };

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
