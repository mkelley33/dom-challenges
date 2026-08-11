import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCallback, useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { EditorLayout, PaneEdge } from '@/lib/paneLayout';
import { DEFAULT_LAYOUT, MIN_PANE_PERCENT } from '@/lib/paneLayout';

import { PaneResizer } from './PaneResizer';

/**
 * The three panes the two stored percentages describe.
 *
 * The results pane is never stored -- it is whatever is left -- which is exactly why it is the one
 * that can silently vanish, and why every clamp assertion below reads all three.
 */
function panes(layout: EditorLayout): [number, number, number] {
  return [layout.promptPercent, layout.editorPercent, 100 - layout.promptPercent - layout.editorPercent];
}

/** The `fr` space of a real grid: 1000px shared by the panes, either side of two 16px gutters. */
const TRACK_SPACE = 1000;
const GUTTER_WIDTH = 16;

/** happy-dom has no layout engine, so every measurement the drag path makes is stated here. */
function stubWidth(element: Element, width: number): void {
  element.getBoundingClientRect = (): DOMRect => new DOMRect(0, 0, width, 400);
}

interface HarnessProps {
  edge: PaneEdge;
  initialLayout: EditorLayout;
  onResize: (next: EditorLayout) => void;
}

/**
 * The resizer inside a container, holding the layout in state the way the store does.
 *
 * Stateful deliberately: a second keystroke has to be measured from the split the first one wrote,
 * so a handler that captured the layout of its first render is wrong in a way only this can see.
 */
function Harness({ edge, initialLayout, onResize }: HarnessProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState(initialLayout);

  const handleResize = useCallback(
    (next: EditorLayout) => {
      onResize(next);
      setLayout(next);
    },
    [onResize],
  );

  return (
    <div ref={containerRef} data-testid="grid">
      <PaneResizer edge={edge} layout={layout} containerRef={containerRef} onResize={handleResize} />
    </div>
  );
}

function renderResizer(edge: PaneEdge, initialLayout: EditorLayout = DEFAULT_LAYOUT) {
  const onResize = vi.fn<(next: EditorLayout) => void>();
  render(<Harness edge={edge} initialLayout={initialLayout} onResize={onResize} />);

  const separator = screen.getByRole('separator');
  stubWidth(screen.getByTestId('grid'), TRACK_SPACE + 2 * GUTTER_WIDTH);
  stubWidth(separator, GUTTER_WIDTH);

  return { onResize, separator };
}

/** One drag, as the browser delivers it: press, move, release. */
function drag(separator: HTMLElement, fromX: number, toX: number): void {
  fireEvent.pointerDown(separator, { button: 0, pointerId: 1, clientX: fromX });
  fireEvent.pointerMove(separator, { pointerId: 1, clientX: toX });
  fireEvent.pointerUp(separator, { pointerId: 1, clientX: toX });
}

describe('PaneResizer', () => {
  it('is a vertical separator that names the two panes it sits between', () => {
    render(
      <Harness edge="prompt-editor" initialLayout={DEFAULT_LAYOUT} onResize={vi.fn<(next: EditorLayout) => void>()} />,
    );

    // Named, not merely present: a handle a screen-reader user cannot tell apart from the other one
    // is a control they cannot aim, and there are exactly two of them on the page.
    const separator = screen.getByRole('separator', { name: 'Resize the Problem and Code panes' });
    expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    expect(separator).toHaveAttribute('tabindex', '0');
  });

  it('names the other pair at the other boundary', () => {
    render(
      <Harness edge="editor-result" initialLayout={DEFAULT_LAYOUT} onResize={vi.fn<(next: EditorLayout) => void>()} />,
    );

    expect(screen.getByRole('separator', { name: 'Resize the Code and Results panes' })).toBeInTheDocument();
  });

  it('reports where the boundary sits and how far it may travel', () => {
    // Deliberately not the stored defaults: values read off a hardcoded 28/42 would pass against
    // those and fail here. The maximum is the pair's total minus the other pane's floor, which is
    // the same bound the clamp enforces -- so what is announced is what the control will do.
    const { separator } = renderResizer('prompt-editor', { promptPercent: 20, editorPercent: 50 });

    expect(separator).toHaveAttribute('aria-valuenow', '20');
    expect(separator).toHaveAttribute('aria-valuemin', String(MIN_PANE_PERCENT));
    expect(separator).toHaveAttribute('aria-valuemax', String(70 - MIN_PANE_PERCENT));
  });

  it('reports the editor/results boundary against its own pair, not the prompt pair', () => {
    const { separator } = renderResizer('editor-result', { promptPercent: 20, editorPercent: 50 });

    expect(separator).toHaveAttribute('aria-valuenow', '50');
    expect(separator).toHaveAttribute('aria-valuemax', String(80 - MIN_PANE_PERCENT));
  });

  it('moves the boundary with the arrow keys, writing the whole split each time', async () => {
    const user = userEvent.setup();
    const { onResize, separator } = renderResizer('prompt-editor');
    separator.focus();

    await user.keyboard('{ArrowRight}{ArrowRight}{ArrowLeft}');

    // Each call carries both percentages, and each one is measured from the previous write rather
    // than from the layout the first render happened to see.
    expect(onResize.mock.calls.map(([next]) => next)).toEqual([
      { promptPercent: 30, editorPercent: 40 },
      { promptPercent: 32, editorPercent: 38 },
      { promptPercent: 30, editorPercent: 40 },
    ]);
    // And the control says so, so the next press of the key is announced from where it now is.
    expect(separator).toHaveAttribute('aria-valuenow', '30');
  });

  it('ignores keys that are not an arrow along its own axis', async () => {
    const user = userEvent.setup();
    const { onResize, separator } = renderResizer('prompt-editor');
    separator.focus();

    await user.keyboard('{ArrowUp}{ArrowDown}{Enter}a');
    expect(onResize).not.toHaveBeenCalled();

    // Paired with a key that does move it, so "the component never writes at all" cannot pass.
    await user.keyboard('{ArrowRight}');
    expect(onResize.mock.calls.map(([next]) => next)).toEqual([{ promptPercent: 30, editorPercent: 40 }]);
  });

  it('stops at the minimum instead of writing a split it would have to clamp anyway', async () => {
    const user = userEvent.setup();
    const { onResize, separator } = renderResizer('prompt-editor', {
      promptPercent: MIN_PANE_PERCENT,
      editorPercent: 55,
    });
    separator.focus();

    await user.keyboard('{ArrowLeft}');
    expect(onResize).not.toHaveBeenCalled();

    await user.keyboard('{ArrowRight}');
    expect(onResize.mock.calls.map(([next]) => next)).toEqual([{ promptPercent: 17, editorPercent: 53 }]);
  });

  it('stops before the results pane reaches its floor, from the keyboard', async () => {
    const user = userEvent.setup();
    const { onResize, separator } = renderResizer('editor-result', { promptPercent: 28, editorPercent: 57 });
    separator.focus();

    // The results pane is already at 15. Growing the editor further is the move that would take the
    // preview frame's pane away, and it is refused.
    await user.keyboard('{ArrowRight}');
    expect(onResize).not.toHaveBeenCalled();

    await user.keyboard('{ArrowLeft}');
    expect(onResize.mock.calls.map(([next]) => next)).toEqual([{ promptPercent: 28, editorPercent: 55 }]);
  });

  it('drags the boundary by the pointer, as a share of the space the panes actually share', () => {
    const { onResize, separator } = renderResizer('prompt-editor');

    // 200px of a 1000px track space is twenty points, and the two 16px gutters are not part of it.
    // The distance is chosen so the two readings differ by more than the rounding: measured against
    // the whole 1032px row this lands on 47, and the handle trails the pointer further the further
    // it is dragged. A shorter drag rounds to the same answer either way and proves nothing.
    drag(separator, 500, 700);

    expect(onResize.mock.calls.map(([next]) => next)).toEqual([{ promptPercent: 48, editorPercent: 22 }]);
  });

  it('measures a drag from where it started, so moving back returns the split it started from', () => {
    const { onResize, separator } = renderResizer('prompt-editor');

    fireEvent.pointerDown(separator, { button: 0, pointerId: 1, clientX: 500 });
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 700 });
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 450 });
    fireEvent.pointerUp(separator, { pointerId: 1, clientX: 450 });

    // Deltas applied to the split each previous move wrote would compound: the second move would
    // land on 43, not 23, and every drag would accelerate away from the pointer.
    expect(onResize.mock.calls.map(([next]) => next)).toEqual([
      { promptPercent: 48, editorPercent: 22 },
      { promptPercent: 23, editorPercent: 47 },
    ]);
  });

  it('clamps the pointer path through the same floor as the keyboard path', () => {
    const { onResize, separator } = renderResizer('editor-result');

    // Two thirds of the way across the grid, which is far past what the results pane can give up.
    drag(separator, 500, 1200);

    expect(onResize.mock.calls.map(([next]) => panes(next))).toEqual([[28, 57, MIN_PANE_PERCENT]]);
  });

  it('stops following the pointer once the button is released', () => {
    const { onResize, separator } = renderResizer('prompt-editor');

    drag(separator, 500, 700);
    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 900 });

    // A drag that outlived its own pointerup would keep resizing under a pointer that is merely
    // passing over the handle.
    expect(onResize.mock.calls.map(([next]) => next)).toEqual([{ promptPercent: 48, editorPercent: 22 }]);
  });

  it('ignores a pointer that never pressed the handle', () => {
    const { onResize, separator } = renderResizer('prompt-editor');

    fireEvent.pointerMove(separator, { pointerId: 1, clientX: 900 });
    expect(onResize).not.toHaveBeenCalled();

    drag(separator, 500, 700);
    expect(onResize.mock.calls.map(([next]) => next)).toEqual([{ promptPercent: 48, editorPercent: 22 }]);
  });

  it('is not on screen below the desktop breakpoint', () => {
    const { separator } = renderResizer('prompt-editor');

    // The phone layout is one column behind a segmented control, where a handle between two panes
    // that are never side by side would be a focus stop that does nothing. happy-dom applies no
    // stylesheet, so the class is the only trace there is -- `hidden` is Tailwind's fixed name for
    // `display: none`, and the `lg:` half is what puts it back.
    expect([separator.classList.contains('hidden'), separator.classList.contains('lg:flex')]).toEqual([true, true]);
  });
});
