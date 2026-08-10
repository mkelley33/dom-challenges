import { useCallback, useEffect, useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { solutionAccess } from '@/lib/solutionAccess';
import type { Solution } from '@/types/challenge';
import type { ProgressRecord } from '@/types/progress';

import { Markdown } from './Markdown';

// Hoisted so the element handed to Base UI's `render` prop is created once rather than per render
// (react-perf/jsx-no-jsx-as-prop) -- safe because it closes over nothing.
const keepTryingRender = <Button variant="outline" />;

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
  const [confirming, setConfirming] = useState(false);
  const { unlocked, earned } = solutionAccess(record);

  const handleOpen = useCallback(() => {
    setConfirming(true);
  }, []);

  const handleOpenChange = useCallback((open: boolean) => {
    setConfirming(open);
  }, []);

  const handleConfirm = useCallback(() => {
    setConfirming(false);
    onReveal();
  }, [onReveal]);

  if (!unlocked) {
    return (
      <section aria-label="Solutions" className="flex min-h-0 flex-col gap-3 overflow-auto p-4">
        <h2 className="text-base font-semibold">Solutions</h2>
        <p className="text-sm text-muted">
          Worth a few more attempts first — the test results say exactly which part is not there yet.
        </p>
        <Button variant="outline" className="self-start" onClick={handleOpen}>
          Reveal solution
        </Button>

        <Dialog open={confirming} onOpenChange={handleOpenChange}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reveal the solution?</DialogTitle>
              <DialogDescription>
                This challenge will be marked as revealed, and that cannot be undone for this attempt. Clearing your
                progress is the only way back.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={keepTryingRender}>Keep trying</DialogClose>
              <Button onClick={handleConfirm}>Yes, reveal it</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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
