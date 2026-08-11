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

/**
 * The split both boundaries are moved *from* when a stored one is normalised: every pane at the
 * extreme the clamp allows.
 *
 * Chosen so that neither move below is constrained by anything but `MIN_PANE_PERCENT` itself. From
 * here the first boundary may land anywhere in `[MIN, 100 - 2 * MIN]` and the second anywhere the
 * first leaves room for, which between them is exactly the set of splits the resizer can produce.
 */
const WIDEST_SEED: EditorLayout = { promptPercent: MIN_PANE_PERCENT, editorPercent: 100 - 2 * MIN_PANE_PERCENT };

function finitePercent(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Where a boundary sits, as a share of the row measured from its left edge. */
function boundaries(layout: EditorLayout): [number, number] {
  return [layout.promptPercent, layout.promptPercent + layout.editorPercent];
}

/**
 * A split read back out of storage, turned into one the workspace can actually be driven from.
 *
 * The stored value is a plain `localStorage` entry: it can be hand-edited, and `persist` declares
 * no `version` and no `migrate`, so any future change to `EditorLayout`'s shape arrives here too.
 * A split summing past 100 gives the results track a negative `fr`, which invalidates the entire
 * `grid-template-columns` declaration -- three columns become one, and **no control in the app
 * undoes it**, because every move `resizePanes` makes preserves its own pair's total.
 *
 * Expressed as two moves through `resizePanes` rather than as a clamp of its own. The clamp exists
 * once so that the pointer path and the keyboard path cannot disagree about where a pane's floor
 * is; a third copy here would be a third thing to keep in step. Each boundary is asked for the
 * position the stored split wanted, from a seed where nothing but that clamp can refuse it -- and
 * because `resizePanes` moves a boundary by moving the pane leading it, "the position the stored
 * split wanted" is the *difference between boundaries*, not between pane widths.
 */
export function normaliseLayout(stored: unknown): EditorLayout {
  if (typeof stored !== 'object' || stored === null) return DEFAULT_LAYOUT;
  if (!('promptPercent' in stored) || !('editorPercent' in stored)) return DEFAULT_LAYOUT;

  const promptPercent = finitePercent(stored.promptPercent);
  const editorPercent = finitePercent(stored.editorPercent);
  if (promptPercent === null || editorPercent === null) return DEFAULT_LAYOUT;

  const [wantedFirst, wantedSecond] = boundaries({ promptPercent, editorPercent });
  const [seedFirst, seedSecond] = boundaries(WIDEST_SEED);

  const firstPlaced = resizePanes(WIDEST_SEED, 'prompt-editor', wantedFirst - seedFirst);
  // `prompt-editor` preserves its pair's total, so the second boundary is still the seed's.
  return resizePanes(firstPlaced, 'editor-result', wantedSecond - seedSecond);
}
