import { describe, expect, it } from 'vitest';

import type { EditorLayout, PaneEdge } from './paneLayout';
import { DEFAULT_LAYOUT, MIN_PANE_PERCENT, resizePanes } from './paneLayout';

/**
 * The three panes the two stored percentages describe.
 *
 * The results pane is never stored -- it is whatever is left -- which is exactly why it is the one
 * that can silently vanish, and why every clamp assertion below reads all three.
 */
function panes(layout: EditorLayout): [number, number, number] {
  return [layout.promptPercent, layout.editorPercent, 100 - layout.promptPercent - layout.editorPercent];
}

describe('resizePanes', () => {
  it('moves the prompt/editor boundary by giving one pane exactly what the other loses', () => {
    // The whole object, not just the pane that grew: the editor giving up precisely six points --
    // and the results pane not moving at all -- is the entire content of "a boundary moved".
    expect(resizePanes(DEFAULT_LAYOUT, 'prompt-editor', 6)).toEqual({ promptPercent: 34, editorPercent: 36 });
    expect(panes(resizePanes(DEFAULT_LAYOUT, 'prompt-editor', 6))).toEqual([34, 36, 30]);
  });

  it('moves the editor/results boundary without touching the prompt', () => {
    expect(resizePanes(DEFAULT_LAYOUT, 'editor-result', 6)).toEqual({ promptPercent: 28, editorPercent: 48 });
    expect(panes(resizePanes(DEFAULT_LAYOUT, 'editor-result', 6))).toEqual([28, 48, 24]);
  });

  it('rounds to whole percentages, so a long drag cannot drift the persisted split', () => {
    expect(resizePanes(DEFAULT_LAYOUT, 'prompt-editor', 3.7)).toEqual({ promptPercent: 32, editorPercent: 38 });
  });

  it('clamps the prompt/editor boundary at both ends rather than collapsing either pane', () => {
    // A drag does not stop at the handle: the pointer keeps going, and the delta it produces is
    // unbounded. Both ends, because a clamp written for one of them is a clamp for one of them.
    expect(panes(resizePanes(DEFAULT_LAYOUT, 'prompt-editor', -1000))).toEqual([MIN_PANE_PERCENT, 55, 30]);
    expect(panes(resizePanes(DEFAULT_LAYOUT, 'prompt-editor', 1000))).toEqual([55, MIN_PANE_PERCENT, 30]);
  });

  it('clamps the editor/results boundary at both ends, so the preview keeps a pane to live in', () => {
    expect(panes(resizePanes(DEFAULT_LAYOUT, 'editor-result', -1000))).toEqual([28, MIN_PANE_PERCENT, 57]);
    // The one that matters most: the results pane holds the preview frame, and this split is
    // persisted -- a learner who dragged it to zero would reload into a page with no way back.
    expect(panes(resizePanes(DEFAULT_LAYOUT, 'editor-result', 1000))).toEqual([28, 57, MIN_PANE_PERCENT]);
  });

  it('keeps every pane at or above its minimum, and the three at 100, for any delta a drag can make', () => {
    const deltas = [-1000, -73.4, -12, -0.4, 0, 0.4, 12, 73.4, 1000];
    const edges: PaneEdge[] = ['prompt-editor', 'editor-result'];
    const outcomes = edges.flatMap((edge) => deltas.map((delta) => panes(resizePanes(DEFAULT_LAYOUT, edge, delta))));

    // Pinned first: a `flatMap` over an empty list is an empty list, and "every case held" would
    // then read identically to "no case ran".
    expect(outcomes).toHaveLength(edges.length * deltas.length);
    for (const outcome of outcomes) {
      expect(outcome.reduce((total, percent) => total + percent, 0)).toBe(100);
      expect(Math.min(...outcome)).toBeGreaterThanOrEqual(MIN_PANE_PERCENT);
    }
  });

  it('refuses to move a boundary whose two panes cannot both make the minimum', () => {
    // Not reachable through the UI -- the clamp above prevents it -- but reachable through the
    // persisted key, which is a plain localStorage entry anyone can edit. Refusing beats picking a
    // winner: moving the boundary here would have to push one of the two panes below the floor.
    const cramped: EditorLayout = { promptPercent: 80, editorPercent: 10 };

    expect(resizePanes(cramped, 'editor-result', 5)).toEqual(cramped);
    expect(resizePanes(cramped, 'editor-result', -5)).toEqual(cramped);
  });
});
