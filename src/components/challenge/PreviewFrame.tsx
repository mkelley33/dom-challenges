import type { RefObject } from 'react';

export interface PreviewFrameProps {
  containerRef: RefObject<HTMLDivElement | null>;
  /**
   * Whether the frame is currently parked off-screen, and so should be unreachable.
   *
   * It is a prop rather than something this component works out because the answer depends on the
   * viewport, and neither `inert` nor `aria-hidden` has a media-query form: there is no CSS that can
   * write either. The page owns the breakpoint; this owns the element.
   */
  offScreen?: boolean;
}

export function PreviewFrame({ containerRef, offScreen = false }: PreviewFrameProps) {
  return (
    // `inert` carries this, not `aria-hidden` alone. What is inside is an <iframe>, iframes are in
    // the tab order, and challenges render buttons and links into them -- so `aria-hidden` on its
    // own would leave a learner able to tab into content parked 200vw to the left, with no visible
    // focus ring and, to a screen reader, a focused element absent from the accessibility tree.
    // `inert` blocks that: it propagates into nested browsing contexts, and it says nothing about
    // rendering, so the frame keeps the box the harness's `tick()` depends on.
    //
    // `aria-hidden` stays alongside it as the explicit statement of the same fact. Both come from
    // one prop, so they cannot disagree, and neither is load-bearing for the other.
    <section
      aria-label="Preview"
      aria-hidden={offScreen}
      inert={offScreen}
      className="min-h-40 flex-1 overflow-hidden rounded-md border bg-white"
    >
      <div ref={containerRef} className="h-full w-full" />
    </section>
  );
}
