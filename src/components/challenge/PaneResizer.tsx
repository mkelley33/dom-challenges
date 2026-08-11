import type { KeyboardEvent, PointerEvent, RefObject } from 'react';
import { useCallback, useRef } from 'react';

import type { EditorLayout, PaneEdge } from '@/lib/paneLayout';
import { MIN_PANE_PERCENT, panePair, resizePanes } from '@/lib/paneLayout';

/** How far one arrow press moves a boundary. Small enough to aim, large enough to be worth pressing. */
const KEYBOARD_STEP_PERCENT = 2;

/** Three panes, two boundaries between them -- see the comment in `handlePointerDown`. */
const SEPARATOR_COUNT = 2;

// The panels are labelled "Problem", "Code editor" and "Test results", and the phone tab bar calls
// them Problem / Code / Results. These follow the tab bar: a name is only useful if it matches the
// word the learner would use for the thing they can see.
const EDGE_LABEL: Record<PaneEdge, string> = {
  'prompt-editor': 'Resize the Problem and Code panes',
  'editor-result': 'Resize the Code and Results panes',
};

// A lookup rather than a chain of comparisons, so a key that is not one of these two produces
// `undefined` and is left alone -- rather than falling into whichever branch was written last.
const STEP_BY_KEY: Record<string, number> = {
  ArrowLeft: -KEYBOARD_STEP_PERCENT,
  ArrowRight: KEYBOARD_STEP_PERCENT,
};

export interface PaneResizerProps {
  edge: PaneEdge;
  layout: EditorLayout;
  /** The grid the panes are tracks of: the only element that knows what a pixel is worth in percent. */
  containerRef: RefObject<HTMLElement | null>;
  onResize: (next: EditorLayout) => void;
}

interface DragOrigin {
  pointerId: number;
  clientX: number;
  /** The width the three panes share, measured once when the drag began. */
  trackSpace: number;
  /** The split the drag started from -- every move of this drag is measured against it. */
  layout: EditorLayout;
}

/**
 * The draggable, focusable boundary between two panes of the desktop workspace.
 *
 * `role="separator"` with a tabindex is the ARIA window-splitter pattern: a separator that can be
 * focused is a widget rather than a decoration, which is what makes `aria-valuenow` meaningful on
 * it and what obliges it to answer the arrow keys. Every other control on this branch is operable
 * without a pointer, and a resizer that is not would be the single exception.
 *
 * Rendered at every size and hidden below `lg` by CSS rather than by a `matchMedia` read: the
 * panes are only side by side above the breakpoint, and the layout is CSS everywhere else in this
 * page for the same reason -- a broken `matchMedia` must not be able to rearrange it.
 */
export function PaneResizer({ edge, layout, containerRef, onResize }: PaneResizerProps) {
  const dragRef = useRef<DragOrigin | null>(null);
  const { leading, total } = panePair(layout, edge);

  const commit = useCallback(
    (from: EditorLayout, deltaPercent: number) => {
      const next = resizePanes(from, edge, deltaPercent);
      // Compared against what is on screen, never against `from`: a drag that wanders past the
      // clamp and comes back has a `from` the panes no longer match, and skipping that write would
      // strand them where the drag last left them.
      if (next.promptPercent === layout.promptPercent && next.editorPercent === layout.editorPercent) return;
      onResize(next);
    },
    [edge, layout.editorPercent, layout.promptPercent, onResize],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const step = STEP_BY_KEY[event.key];
      if (step === undefined) return;
      // Otherwise the arrow scrolls the workspace out from under the handle being aimed.
      event.preventDefault();
      commit(layout, step);
    },
    [commit, layout],
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      // Secondary buttons open menus; they do not drag.
      if (event.button !== 0) return;
      const container = containerRef.current;
      if (container === null) return;

      // The panes share the row *minus the two handles*, which are the only tracks in it that are
      // not `fr` -- the grid's column gap is zero above `lg` precisely so that stays true. Measured
      // against the whole row instead, the handle would trail the pointer by the handles' share of
      // it, and trail further the further the drag went.
      const gutters = SEPARATOR_COUNT * event.currentTarget.getBoundingClientRect().width;
      const trackSpace = container.getBoundingClientRect().width - gutters;
      // A row with no measurable width -- before first layout, or in a test environment with no
      // layout engine at all -- gives a delta of infinity rather than a resize.
      if (trackSpace <= 0) return;

      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { pointerId: event.pointerId, clientX: event.clientX, trackSpace, layout };
    },
    [containerRef, layout],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (drag === null || drag.pointerId !== event.pointerId) return;
      // Measured from where the drag began rather than from the last move it wrote: a delta applied
      // to an already-moved split compounds, and the handle accelerates away from the pointer.
      commit(drag.layout, ((event.clientX - drag.clientX) / drag.trackSpace) * 100);
    },
    [commit],
  );

  const handlePointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  return (
    <div
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={EDGE_LABEL[edge]}
      aria-valuenow={leading}
      aria-valuemin={MIN_PANE_PERCENT}
      aria-valuemax={total - MIN_PANE_PERCENT}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="group/resizer hidden w-4 cursor-col-resize touch-none items-center justify-center rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50 lg:flex"
    >
      {/* The handle is 16px wide so it can be hit; the line it draws is 1px so it reads as a seam
          rather than as a fourth panel. It thickens and takes the accent colour on hover and on
          keyboard focus, which is the only visible answer a focused separator can give. */}
      <span
        aria-hidden="true"
        className="h-full w-px rounded-full bg-border transition-all group-hover/resizer:w-1 group-hover/resizer:bg-primary group-focus-visible/resizer:w-1 group-focus-visible/resizer:bg-primary"
      />
    </div>
  );
}
