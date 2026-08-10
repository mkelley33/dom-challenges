import { loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
// monaco-editor's package.json "exports" map is `"./*": "./esm/vs/*.js"` -- it already prepends
// `esm/vs/`, so a specifier that repeats that prefix (as older monaco-editor + Vite guides show)
// resolves to a doubled, nonexistent path. These subpaths are what actually exist post-exports-map.
import editorWorker from 'monaco-editor/editor/editor.worker?worker';
import tsWorker from 'monaco-editor/language/typescript/ts.worker?worker';

let configured = false;

/** Points @monaco-editor/react at the bundled Monaco instead of a CDN, and wires its workers. */
export function configureMonaco(): void {
  if (configured) return;
  configured = true;

  window.MonacoEnvironment = {
    getWorker(_workerId: string, label: string): Worker {
      return label === 'typescript' || label === 'javascript' ? new tsWorker() : new editorWorker();
    },
  };

  // monaco-editor 0.56 deprecated `monaco.languages.typescript` in favour of a new top-level
  // `monaco.typescript` namespace (the old path's type is a literal `{ deprecated: true }` and
  // no longer carries `typescriptDefaults` etc.); this wiring targets the new namespace.
  monaco.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.typescript.ScriptTarget.ES2020,
    lib: ['es2020', 'dom', 'dom.iterable'],
    strict: true,
    moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
    allowNonTsExtensions: true,
  });

  // Submitted code is a standalone snippet, so "top-level await" and "unused export"
  // style diagnostics would be noise rather than teaching.
  monaco.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    diagnosticCodesToIgnore: [1375, 1378],
  });

  loader.config({ monaco });
}
