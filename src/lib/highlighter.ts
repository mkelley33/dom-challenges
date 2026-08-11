import type { HighlighterCore } from 'shiki/core';
import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';

/**
 * Syntax highlighting for solution code, built from shiki's fine-grained entry points.
 *
 * Nothing here may be reached by a static import from a component: this module exists to be
 * `import()`ed so shiki lands in its own chunk. `shiki`'s default entry point is a bundle trap --
 * it carries every grammar and every theme it ships, megabytes of them -- so the highlighter is
 * assembled from `shiki/core` with exactly one grammar and one theme instead.
 *
 * The JavaScript RegExp engine replaces the default oniguruma one. TypeScript's grammar is
 * supported by it, which makes the oniguruma WASM binary pure weight.
 *
 * The `.mjs` suffixes are load-bearing. `@shikijs/langs` and `@shikijs/themes` are transitive
 * dependencies, so pnpm's strict layout puts them out of reach of a direct import; `shiki`'s own
 * export map reaches them through a `"./*": "./dist/*"` catch-all that does no extension
 * resolution, so `shiki/langs/typescript` fails where `shiki/langs/typescript.mjs` resolves.
 */
const LANGUAGE = 'typescript';

// Single theme, matching the only palette the app actually renders: `.dark` is declared in
// index.css but nothing applies the class yet. A second theme belongs here the day a toggle does.
const THEME = 'github-light';

let pending: Promise<HighlighterCore> | null = null;

function loadHighlighter(): Promise<HighlighterCore> {
  pending ??= createHighlighterCore({
    langs: [import('shiki/langs/typescript.mjs')],
    themes: [import('shiki/themes/github-light.mjs')],
    engine: createJavaScriptRegexEngine(),
  }).catch((error: unknown) => {
    // A cached rejection would make one failed load permanent for the rest of the session.
    pending = null;
    throw error;
  });

  return pending;
}

/** Resolves to a `<pre><code>` fragment. Rejects if the highlighter cannot be built. */
export async function highlightTypeScript(code: string): Promise<string> {
  const highlighter = await loadHighlighter();
  return highlighter.codeToHtml(code, { lang: LANGUAGE, theme: THEME });
}
