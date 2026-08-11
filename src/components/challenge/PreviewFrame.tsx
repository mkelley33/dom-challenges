import type { RefObject } from 'react';

export interface PreviewFrameProps {
  containerRef: RefObject<HTMLDivElement | null>;
  /**
   * Whether the frame is currently parked off-screen, and so should be out of the accessibility
   * tree as well.
   *
   * It is a prop rather than something this component works out because the answer depends on the
   * viewport, and `aria-hidden` is an attribute: there is no media query that can write it. The
   * page owns the breakpoint; this owns the element.
   */
  hiddenFromScreenReaders?: boolean;
}

export function PreviewFrame({ containerRef, hiddenFromScreenReaders = false }: PreviewFrameProps) {
  return (
    <section
      aria-label="Preview"
      aria-hidden={hiddenFromScreenReaders}
      className="min-h-40 flex-1 overflow-hidden rounded-md border bg-white"
    >
      <div ref={containerRef} className="h-full w-full" />
    </section>
  );
}
