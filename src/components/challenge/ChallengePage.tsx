import { useCallback, useRef } from 'react';
import { useParams } from 'react-router';

import { challengeBySlug } from '@/challenges/registry';
import { NotFound } from '@/components/NotFound';
import { useChallengeRun } from '@/hooks/useChallengeRun';
import { useChallengeProgress, useSaveProgress, useStoredProgress } from '@/hooks/useProgress';
import { useEditorStore } from '@/store/editorStore';
import type { Challenge } from '@/types/challenge';

import { EditorPanel } from './EditorPanel';
import { PreviewFrame } from './PreviewFrame';
import { PromptPanel } from './PromptPanel';
import { ResultPanel } from './ResultPanel';
import { SolutionsPanel } from './SolutionsPanel';

// No `min-h-*` here on purpose: each panel sets its own, and two min-height utilities in one class
// string are resolved by stylesheet order rather than by the order they are written.
const PANEL = 'overflow-hidden rounded-lg border bg-surface-raised';

interface ChallengeWorkspaceProps {
  challenge: Challenge;
}

/**
 * The workspace is split out from the route component so that the "unknown slug" branch can return
 * before any hook runs -- and so the route can remount it on `challenge.id`, which is the simplest
 * possible guarantee that no editor text, result or preview frame survives a move between
 * challenges.
 */
function ChallengeWorkspace({ challenge }: ChallengeWorkspaceProps) {
  const previewRef = useRef<HTMLDivElement>(null);
  const draft = useEditorStore((state) => state.drafts[challenge.id]);
  const setDraft = useEditorStore((state) => state.setDraft);
  const { result, isRunning, run } = useChallengeRun(challenge, previewRef);
  const record = useChallengeProgress(challenge.id);
  const readStoredProgress = useStoredProgress(challenge.id);
  const { mutate: writeProgress } = useSaveProgress();

  // The editor is controlled from the store, so the fallback lives here: "no draft yet" and "the
  // starter code" are the same thing to the learner, but only the first must stay unpersisted.
  const code = draft ?? challenge.starterCode;

  const handleChange = useCallback(
    (next: string) => {
      setDraft(challenge.id, next);
    },
    [challenge.id, setDraft],
  );

  const handleRun = useCallback(() => {
    // `run` reports every failure through `result`; it never rejects.
    void run(code);
  }, [code, run]);

  const handleReveal = useCallback(() => {
    const reveal = async (): Promise<void> => {
      // Never the `record` above: that is a render-time value, and on a cold deep-link it is still
      // the `emptyProgress` placeholder. `saveProgress` PATCHes a whole record body, so revealing
      // from the placeholder would trade a learner's attempts, status and solve date for a
      // `revealedAt`. Same read the run flow makes, for the same reason.
      const stored = await readStoredProgress();
      if (stored === null) return;

      const now = new Date().toISOString();
      writeProgress({
        ...stored,
        // First reveal wins: a second click is the same decision, not a later one.
        revealedAt: stored.revealedAt ?? now,
        updatedAt: now,
      });
    };

    void reveal();
  }, [readStoredProgress, writeProgress]);

  return (
    // Stacked and scrolling on small screens, three columns filling the viewport from `lg` up.
    // Nothing here ever hides the preview: a frame inside a `display: none` subtree is not
    // rendered, so it never services an animation frame and `tick()` silently degrades.
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto p-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)] lg:overflow-hidden">
      {/* Prompt and solutions share the first column: they are the two halves of "what am I being
          asked, and how else could it have been done", and the solutions half is empty of content
          until it is unlocked. */}
      <div className="flex min-h-0 flex-col gap-4">
        <div className={`${PANEL} min-h-48 lg:min-h-0 lg:flex-[2]`}>
          <PromptPanel challenge={challenge} />
        </div>
        <div className={`${PANEL} min-h-40 lg:min-h-0 lg:flex-[1]`}>
          <SolutionsPanel solutions={challenge.solutions} record={record} onReveal={handleReveal} />
        </div>
      </div>

      <div className={`${PANEL} flex min-h-96 flex-col lg:min-h-0`}>
        <EditorPanel
          challengeId={challenge.id}
          starterCode={challenge.starterCode}
          value={code}
          onChange={handleChange}
          onRun={handleRun}
          isRunning={isRunning}
        />
      </div>

      <div className="flex min-h-0 flex-col gap-4">
        <PreviewFrame containerRef={previewRef} />
        <div className={`${PANEL} min-h-40 flex-1`}>
          <ResultPanel result={result} isRunning={isRunning} />
        </div>
      </div>
    </div>
  );
}

export function ChallengePage() {
  const { slug } = useParams();
  const challenge = slug ? challengeBySlug(slug) : undefined;

  if (!challenge) {
    return <NotFound />;
  }

  return <ChallengeWorkspace key={challenge.id} challenge={challenge} />;
}
