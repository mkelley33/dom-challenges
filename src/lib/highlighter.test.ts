import { describe, expect, it } from 'vitest';

import { highlightTypeScript } from './highlighter';

describe('highlightTypeScript', () => {
  it('returns a pre/code block carrying the original source text', async () => {
    const html = await highlightTypeScript("const target = document.getElementById('target');");

    expect(html).toContain('<pre');
    expect(html).toContain('<code');
    // Tokenised markup splits the source across spans, so the identifiers are checked rather than
    // the whole line: what matters is that nothing was dropped on the way through.
    expect(html).toContain('getElementById');
    expect(html).toContain('target');
  });

  it('actually tokenises TypeScript rather than merely wrapping it', async () => {
    const html = await highlightTypeScript('const answer: number = 42;');

    // A stub that returned `<pre><code>${code}</code></pre>` would satisfy the test above. Distinct
    // colours on distinct tokens are the part only a real grammar plus theme can produce, and
    // `number` is the token that proves it was the *TypeScript* grammar: in plain JS it is an
    // ordinary identifier, not a type.
    const colours = new Set(Array.from(html.matchAll(/color:(#[0-9a-fA-F]{3,8})/g), (match) => match[1]));
    expect(colours.size).toBeGreaterThan(1);
    expect(html).toMatch(/<span[^>]*>\s*number<\/span>/);
  });

  it('escapes markup in the source instead of emitting it', async () => {
    const html = await highlightTypeScript("el.innerHTML = '<img onerror=alert(1)>';");

    expect(html).not.toContain('<img');
    expect(html).toContain('&#x3C;img');
  });
});
