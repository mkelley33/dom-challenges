import type { CSSProperties } from 'react';
import { useCallback, useMemo, useRef } from 'react';
import { useParams } from 'react-router';

import { challengeBySlug } from '@/challenges/registry';
import { MobileTabs } from '@/components/layout/MobileTabs';
import { NotFound } from '@/components/NotFound';
import { useChallengeRun } from '@/hooks/useChallengeRun';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useChallengeProgress, useSaveProgress, useStoredProgress } from '@/hooks/useProgress';
import { solutionAccess } from '@/lib/solutionAccess';
import { cn } from '@/lib/utils';
import { useEditorStore } from '@/store/editorStore';
import type { Challenge } from '@/types/challenge';

import { ClearButton } from './ClearButton';
import { EditorPanel } from './EditorPanel';
import { PreviewFrame } from './PreviewFrame';
import { PromptPanel } from './PromptPanel';
import { ResultPanel } from './ResultPanel';
import { RunButton } from './RunButton';
import { SolutionsPanel } from './SolutionsPanel';

/** Tailwind's `lg`. The layout itself is CSS; this is read only where CSS cannot reach -- see below. */
const DESKTOP_MEDIA_QUERY = '(min-width: 64rem)';

// No `min-h-*` here on purpose: each panel sets its own, and two min-height utilities in one class
// string are resolved by stylesheet order rather than by the order they are written.
const PANEL = 'overflow-hidden rounded-lg border bg-surface-raised';

// Deliberately without a display utility. `flex` and `hidden` are both `display`, and two of them
// in one class string are resolved by stylesheet order rather than by the order they are written --
// so which one wins would be Tailwind's business rather than this file's. Each column below picks
// exactly one.
const COLUMN = 'min-h-0 flex-col gap-4';

/** The active phone tab, and every column from `lg` up. */
const SHOWN = 'flex';

/** A column that is not the active phone tab: out of the box tree below `lg`, back in it above. */
const HIDDEN_BELOW_LG = 'hidden lg:flex';

/**
 * How the column holding the preview frame steps aside instead — never `hidden`.
 *
 * Tailwind's `hidden` is `display: none`, and a document inside a subtree that is not rendered
 * never services `requestAnimationFrame`: the harness's `tick()` would fall back to its 50 ms timer
 * on every call, and any paint-dependent work in a learner's code simply would not happen. Taken
 * out of flow and parked off to the left, the frame keeps a real box and a real rendering.
 *
 * The `lg:` half puts it back in the grid, so this never depends on JavaScript knowing the
 * viewport: layout is CSS, and a broken `matchMedia` cannot move a panel.
 */
const PREVIEW_OFF_SCREEN = 'absolute top-0 -left-[200vw] h-96 w-80 lg:static lg:h-auto lg:w-auto';

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
  const mobileTab = useEditorStore((state) => state.mobileTab);
  const setMobileTab = useEditorStore((state) => state.setMobileTab);
  const layout = useEditorStore((state) => state.layout);
  const { result, isRunning, run, reset } = useChallengeRun(challenge, previewRef);
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

  // `aria-hidden` is the one part of the responsive layout that CSS cannot express, so it is the
  // one part that has to ask where the viewport is. Keyed off the tab alone it would hide the
  // preview from every desktop screen-reader user whose last phone tab was not "Results".
  const isDesktop = useMediaQuery(DESKTOP_MEDIA_QUERY);
  const previewInactive = mobileTab !== 'result';
  const previewOffScreen = previewInactive && !isDesktop;

  // Applied unconditionally, and inert below `lg` by construction: the container is `display: flex`
  // until the breakpoint, and `grid-template-columns` means nothing to a flex container. That is
  // what lets a persisted, learner-controlled ratio live in an inline style without also needing a
  // second, mobile-shaped version of it.
  const gridStyle = useMemo<CSSProperties>(() => {
    const resultPercent = 100 - layout.promptPercent - layout.editorPercent;
    const track = (percent: number): string => `minmax(0, ${String(percent)}fr)`;
    // `fr` rather than `%`, so the three tracks keep the stored *ratio* without the gaps between
    // them pushing the row past the width of the grid.
    return {
      gridTemplateColumns: [track(layout.promptPercent), track(layout.editorPercent), track(resultPercent)].join(' '),
    };
  }, [layout.editorPercent, layout.promptPercent]);

  const handleRun = useCallback(() => {
    // On a phone the results are behind a tab, and a live region that is off screen announces to a
    // learner who cannot then read it. Moving to the results as the run starts puts the outcome and
    // its announcement in the same place. Above `lg` the tab is not on screen and nothing moves.
    setMobileTab('result');
    // `run` reports every failure through `result`; it never rejects.
    void run(code);
  }, [code, run, setMobileTab]);

  const handleCleared = useCallback(() => {
    // The third of the three things a clear resets, and the only one the button cannot do itself:
    // the result on screen. The editor needs nothing here -- `clearDraft` already removed the
    // draft, and `code` falls back to the starter code the moment it is gone.
    //
    // Before a first run this renders nothing at all, deliberately: the preview frame is created by
    // a run, and a page that has not been run has no preview. See `useChallengeRun.test.tsx`.
    // `reset` reports its own failures through `result` and never rejects, as `run` does.
    void reset(challenge.starterCode);
  }, [challenge.starterCode, reset]);

  const handleReveal = useCallback(() => {
    const reveal = async (): Promise<void> => {
      // Never the `record` above: that is a render-time value, and on a cold deep-link it is still
      // the `emptyProgress` placeholder. `saveProgress` PATCHes a whole record body, so revealing
      // from the placeholder would trade a learner's attempts, status and solve date for a
      // `revealedAt`. Same read the run flow makes, for the same reason.
      const stored = await readStoredProgress();
      if (stored === null) return;

      // The settled record may already be unlocked, in which case the button that got us here was
      // offered by a panel rendering the `emptyProgress` placeholder -- it did not know yet. Two
      // things hide behind this one check, and `solutionAccess` is where both are defined:
      //
      //  - an unaided solve. Stamping `revealedAt` on it drops `earned` to false permanently, and
      //    no control in the app puts it back. An irreversible mislabel of an achievement, caused
      //    by an action the app offered only because it had not finished loading.
      //  - an earlier reveal. First reveal wins: a second click is the same decision, not a later
      //    one, and rewriting the timestamp would move a moment that already happened.
      if (solutionAccess(stored).unlocked) return;

      const now = new Date().toISOString();
      writeProgress({ ...stored, revealedAt: now, updatedAt: now });
    };

    void reveal();
  }, [readStoredProgress, writeProgress]);

  return (
    // One tree at every size. The breakpoint changes presentation only -- nothing below is mounted
    // or unmounted by a viewport -- so rotating a phone never resets a panel's state, and no later
    // task has two layouts to keep in step.
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      <MobileTabs value={mobileTab} onChange={setMobileTab} />

      {/* `relative` so the parked preview below has this box to be positioned against. Stacked and
          scrolling below `lg`, three columns filling the remaining height from `lg` up. */}
      <div
        style={gridStyle}
        className="relative flex min-h-0 flex-1 flex-col gap-4 overflow-auto lg:grid lg:overflow-hidden"
      >
        {/* Prompt and solutions share the first column: they are the two halves of "what am I being
            asked, and how else could it have been done", and the solutions half is empty of content
            until it is unlocked. */}
        <div data-panel="problem" className={cn(COLUMN, mobileTab === 'problem' ? SHOWN : HIDDEN_BELOW_LG)}>
          <div className={`${PANEL} min-h-48 lg:min-h-0 lg:flex-[2]`}>
            <PromptPanel challenge={challenge} />
          </div>
          <div className={`${PANEL} min-h-40 lg:min-h-0 lg:flex-[1]`}>
            <SolutionsPanel solutions={challenge.solutions} record={record} onReveal={handleReveal} />
          </div>
        </div>

        {/* This column is its own panel, so it carries the panel's chrome directly. `overflow-hidden`
            only from `lg`: below it, the box must not be a scroll container or the sticky action row
            at its foot would have no scrollport to stick to and would simply never stick. */}
        <div
          data-panel="code"
          className={cn(
            'min-h-96 flex-col rounded-lg border bg-surface-raised lg:min-h-0 lg:overflow-hidden',
            mobileTab === 'code' ? SHOWN : HIDDEN_BELOW_LG,
          )}
        >
          <EditorPanel
            challengeId={challenge.id}
            starterCode={challenge.starterCode}
            value={code}
            onChange={handleChange}
          />
          {/* Both controls live outside the editor's own region: neither edits the code. One runs
              it, the other throws the whole attempt away. Sticky below `lg` so the primary action
              is under a thumb rather than scrolled off the top with the panel header. */}
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center gap-2 border-t bg-surface-raised px-3 py-2 lg:static">
            <RunButton onRun={handleRun} isRunning={isRunning} />
            <ClearButton challengeId={challenge.id} onCleared={handleCleared} />
          </div>
        </div>

        {/* Never `HIDDEN_BELOW_LG`: see `PREVIEW_OFF_SCREEN`. The results panel rides along, which
            also means its live region stays in the accessibility tree on every tab -- so a run
            started from the code tab is still announced. */}
        <div data-panel="result" className={cn(COLUMN, SHOWN, previewInactive && PREVIEW_OFF_SCREEN)}>
          <PreviewFrame containerRef={previewRef} hiddenFromScreenReaders={previewOffScreen} />
          <div className={`${PANEL} min-h-40 flex-1`}>
            <ResultPanel result={result} isRunning={isRunning} />
          </div>
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
