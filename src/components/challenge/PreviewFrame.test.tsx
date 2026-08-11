import { render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { describe, expect, it } from 'vitest';

import { createIframeHost } from '@/runner/iframeHost';

import { PreviewFrame } from './PreviewFrame';

describe('PreviewFrame', () => {
  it('exposes its mount point through the ref', () => {
    const containerRef = createRef<HTMLDivElement>();

    render(<PreviewFrame containerRef={containerRef} />);

    const region = screen.getByRole('region', { name: 'Preview' });
    expect(containerRef.current).not.toBeNull();
    expect(region).toContainElement(containerRef.current);
  });

  it('gives an iframe host somewhere to mount', async () => {
    const containerRef = createRef<HTMLDivElement>();
    render(<PreviewFrame containerRef={containerRef} />);
    const container = containerRef.current;
    if (container === null) throw new Error('PreviewFrame did not populate the ref.');

    const host = createIframeHost(container);
    try {
      const context = await host.reset('<p id="hello">hi</p>');

      expect(context.document.getElementById('hello')).not.toBeNull();
      expect(screen.getByRole('region', { name: 'Preview' }).querySelectorAll('iframe')).toHaveLength(1);
    } finally {
      host.dispose();
    }
  });
});
