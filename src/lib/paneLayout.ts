/**
 * The arithmetic of the desktop three-pane split, with no React in it.
 *
 * It lives here rather than beside the handle that drives it because the *store* needs it too: a
 * persisted split has to be clamped when it is read back, and a store that imported a component to
 * do that would put the component in the module graph of every route that reads a filter.
 */

/** The two boundaries in the desktop three-column layout, named by the panes on either side. */
export type PaneEdge = 'editor-result' | 'prompt-editor';

export interface EditorLayout {
  promptPercent: number;
  editorPercent: number;
}

/**
 * The narrowest a pane may be left, as a percentage of the space the three of them share.
 *
 * The split is persisted, so this is not only a matter of taste: a boundary dragged to zero would
 * still be at zero after a reload, and the handle for a pane with no width is a handle with no
 * width. There is no control anywhere in the app that undoes that.
 */
export const MIN_PANE_PERCENT = 15;

/** The split a learner who has never dragged a handle sees, and the store's initial state. */
export const DEFAULT_LAYOUT: EditorLayout = { promptPercent: 28, editorPercent: 42 };

export interface PanePair {
  /** The pane on the left of this boundary: the one the stored percentages name directly. */
  leading: number;
  /** What the two panes have between them, which no move of this boundary may change. */
  total: number;
}

/**
 * The two panes a boundary sits between.
 *
 * The results pane is the one the store never holds -- it is whatever the other two leave -- so it
 * is reconstructed here rather than read, and it is the pane that would silently absorb every
 * rounding error if the arithmetic below were written the other way round.
 */
export function panePair(layout: EditorLayout, edge: PaneEdge): PanePair {
  if (edge === 'prompt-editor') {
    return { leading: layout.promptPercent, total: layout.promptPercent + layout.editorPercent };
  }
  const resultPercent = 100 - layout.promptPercent - layout.editorPercent;
  return { leading: layout.editorPercent, total: layout.editorPercent + resultPercent };
}

/**
 * The layout that moving one boundary by `deltaPercent` produces, clamped so no pane collapses.
 *
 * The one place any input path is allowed to do this arithmetic. A pointer delta, an arrow key and
 * a split read back out of storage are the same request in different units, and a clamp applied to
 * only some of them is a clamp the other ones get around.
 */
export function resizePanes(layout: EditorLayout, edge: PaneEdge, deltaPercent: number): EditorLayout {
  const { leading, total } = panePair(layout, edge);
  const highest = total - MIN_PANE_PERCENT;
  if (highest < MIN_PANE_PERCENT) {
    // No position of this boundary gives both panes their minimum. Refusing beats choosing which of
    // the two to starve. Unreachable by dragging -- the clamp below is what keeps it so -- but the
    // split is a plain localStorage entry, so it is reachable.
    return layout;
  }

  // Rounded before it is clamped, so the bounds are exact rather than nearly: whole percentages
  // also keep the persisted split readable and keep `aria-valuenow` a number worth announcing.
  const nextLeading = Math.min(Math.max(Math.round(leading + deltaPercent), MIN_PANE_PERCENT), highest);

  // Only the leading pane is chosen; the trailing one takes exactly the rest of the pair's total.
  // That is what holds the three at 100 however many times a boundary is moved -- a second
  // subtraction would let rounding drift into the pane nobody is dragging.
  return edge === 'prompt-editor'
    ? { promptPercent: nextLeading, editorPercent: total - nextLeading }
    : { promptPercent: layout.promptPercent, editorPercent: nextLeading };
}
