import type { RefObject } from 'react';

export interface PreviewFrameProps {
  containerRef: RefObject<HTMLDivElement | null>;
}

export function PreviewFrame({ containerRef }: PreviewFrameProps) {
  return (
    <section aria-label="Preview" className="min-h-40 flex-1 overflow-hidden rounded-md border bg-white">
      <div ref={containerRef} className="h-full w-full" />
    </section>
  );
}
