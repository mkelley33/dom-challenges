import { useCallback, useRef } from 'react';
import { useParams } from 'react-router';

import { challengeBySlug } from '@/challenges/registry';
import { NotFound } from '@/components/NotFound';
import { useChallengeRun } from '@/hooks/useChallengeRun';
import { useEditorStore } from '@/store/editorStore';
import type { Challenge } from '@/types/challenge';

import { EditorPanel } from './EditorPanel';
import { PreviewFrame } from './PreviewFrame';
import { PromptPanel } from './PromptPanel';
import { ResultPanel } from './ResultPanel';

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

  return (
    // Stacked and scrolling on small screens, three columns filling the viewport from `lg` up.
    // Nothing here ever hides the preview: a frame inside a `display: none` subtree is not
    // rendered, so it never services an animation frame and `tick()` silently degrades.
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto p-4 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)] lg:overflow-hidden">
      <div className={`${PANEL} min-h-48 lg:min-h-0`}>
        <PromptPanel challenge={challenge} />
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
