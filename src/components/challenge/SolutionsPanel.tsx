import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { solutionAccess } from '@/lib/solutionAccess';
import type { Solution } from '@/types/challenge';
import type { ProgressRecord } from '@/types/progress';

import { Markdown } from './Markdown';

const ConfirmDialog = lazy(async () => {
  const { ConfirmDialog: Component } = await import('./ConfirmDialog');
  return { default: Component };
});

// Names the way back, which the app now has: clearing deletes the record, and `revealedAt` goes
// with it, so the panel returns to locked. The label is quoted exactly as the control reads -- a
// warning that names an affordance the learner cannot find is worse than one that names none.
const REVEAL_DESCRIPTION =
  'Revealing is recorded against this challenge. From then on these solutions are marked revealed rather than earned, and clearing your progress with "Clear solution" is the only way back.';

interface CodeBlockProps {
  code: string;
}

/**
 * Solution code, syntax-highlighted when the highlighter is available and plain when it is not.
 *
 * The import is dynamic on purpose. `src/lib/highlighter.ts` pulls in shiki, and a static import
 * here would put shiki inside the `ChallengePage` route chunk -- the one Task 13 separated out.
 * Highlighting is decoration, so a slow or failed load never withholds the code: the plain block
 * renders first and stays until (and unless) the highlighter has something better to show.
 */
function CodeBlock({ code }: CodeBlockProps) {
  const [highlighted, setHighlighted] = useState<string | null>(null);
  // Memoised because a fresh object literal in a JSX attribute is a new prop on every render
  // (react-perf/jsx-no-new-object-as-prop).
  const markup = useMemo(() => (highlighted === null ? null : { __html: highlighted }), [highlighted]);

  useEffect(() => {
    let active = true;

    const load = async (): Promise<void> => {
      try {
        const { highlightTypeScript } = await import('@/lib/highlighter');
        const html = await highlightTypeScript(code);
        // Guarded because the panel can unmount, or move to another solution, mid-load.
        if (active) setHighlighted(html);
      } catch {
        // Nothing to report and nothing to do: the fallback below is already on screen.
        //
        // Deleting this `catch` fails the suite only because Vitest reports unhandled rejections by
        // default -- no single test asserts the swallow. Anyone setting
        // `dangerouslyIgnoreUnhandledErrors` removes that protection silently.
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [code]);

  if (markup !== null) {
    return (
      <div
        className="overflow-hidden rounded-md text-xs [&_pre]:overflow-x-auto [&_pre]:p-3"
        // shiki escapes the source it is handed, and that source is challenge content compiled into
        // the bundle -- never anything the learner typed.
        dangerouslySetInnerHTML={markup}
      />
    );
  }

  return (
    // Wrapping rather than scrolling: a horizontally scrolling box needs its own tab stop to be
    // reachable by keyboard, and this block exists only until the highlighter resolves. shiki's own
    // output is focusable, so the scrolling version keeps that route.
    <pre className="rounded-md bg-surface p-3 text-xs leading-relaxed break-words whitespace-pre-wrap">
      <code>{code}</code>
    </pre>
  );
}

interface LockedSolutionsProps {
  onReveal: () => void;
}

/**
 * Its own component so the dialog's state and its preload belong to the locked branch alone -- a
 * hook in `SolutionsPanel` would have to run in both, warming a chunk an unlocked panel never uses.
 */
function LockedSolutions({ onReveal }: LockedSolutionsProps) {
  const [confirming, setConfirming] = useState(false);
  // Latched rather than mirrored from `confirming`: unmounting the dialog the instant it closes
  // would cut short Base UI's exit transition and, with it, the focus restoration to the button.
  const [dialogNeeded, setDialogNeeded] = useState(false);

  useEffect(() => {
    // Warmed as soon as the locked panel is on screen, so the boundary below is a formality by the
    // time a learner has read the copy and decided. Effects run after paint, so this never delays
    // the panel itself -- and without it, a click on a cold connection would sit on `fallback`.
    //
    // Best effort, and swallowed rather than left floating: a failed warm only means the click pays
    // for the load, because `lazy` runs the import again when the boundary is actually crossed.
    import('./ConfirmDialog').catch(() => undefined);
  }, []);

  const handleOpen = useCallback(() => {
    setDialogNeeded(true);
    setConfirming(true);
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    setConfirming(open);
  }, []);

  const handleConfirm = useCallback(() => {
    setConfirming(false);
    onReveal();
  }, [onReveal]);

  return (
    <>
      <h2 className="text-base font-semibold">Solutions</h2>
      <p className="text-sm text-muted">
        Worth a few more attempts first — the test results say exactly which part is not there yet.
      </p>
      <Button variant="outline" className="self-start" onClick={handleOpen}>
        Reveal solution
      </Button>

      {/* `null`, because a dialog is portaled and fixed: nothing it renders sits in this panel's
          flow, so there is no space to reserve and nothing to jump when it arrives. */}
      <Suspense fallback={null}>
        {dialogNeeded && (
          <ConfirmDialog
            open={confirming}
            onOpenChange={handleOpenChange}
            onConfirm={handleConfirm}
            title="Reveal the solution?"
            description={REVEAL_DESCRIPTION}
            cancelLabel="Keep trying"
            confirmLabel="Yes, reveal it"
          />
        )}
      </Suspense>
    </>
  );
}

export interface SolutionsPanelProps {
  solutions: Solution[];
  record: ProgressRecord;
  onReveal: () => void;
}

/**
 * Spec §8.1: one panel, two ways in.
 *
 * `earned` changes the framing -- the heading, the copy, whether a confirm stands in the way -- and
 * nothing else. Both states show every solution, every explanation and every tradeoff. Withholding
 * teaching material from the learner who struggled would invert the point of the app, so there is
 * deliberately no branch below that filters `solutions`.
 */
export function SolutionsPanel({ solutions, record, onReveal }: SolutionsPanelProps) {
  const { unlocked, earned } = solutionAccess(record);

  if (!unlocked) {
    return (
      <section aria-label="Solutions" className="flex min-h-0 flex-col gap-3 overflow-auto p-4">
        <LockedSolutions onReveal={onReveal} />
      </section>
    );
  }

  return (
    <section aria-label="Solutions" className="flex min-h-0 flex-col gap-3 overflow-auto p-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-semibold">{earned ? 'Other approaches' : 'Solution'}</h2>
          {/* A visual echo of the sentence below it, never the only carrier of the state: a badge is
              two words adrift from the prose that explains what they mean. */}
          {!earned && <Badge variant="secondary">revealed</Badge>}
        </div>
        <p className="text-sm text-muted">
          {earned
            ? 'You solved this one unaided. Here are other ways to the same result — read them against what you wrote.'
            : 'You revealed this solution instead of solving it. Read it, then close it and write it again from memory.'}
        </p>
      </div>

      <Tabs defaultValue={solutions[0]?.label}>
        <TabsList aria-label="Solution approaches">
          {solutions.map((solution) => (
            <TabsTrigger key={solution.label} value={solution.label}>
              {solution.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {solutions.map((solution) => (
          <TabsContent key={solution.label} value={solution.label} className="flex flex-col gap-3">
            <CodeBlock code={solution.code} />
            <h3 className="text-sm font-semibold">Why it works</h3>
            <Markdown>{solution.explanation}</Markdown>
            <h3 className="text-sm font-semibold">Tradeoffs</h3>
            <Markdown>{solution.tradeoffs}</Markdown>
          </TabsContent>
        ))}
      </Tabs>
    </section>
  );
}
