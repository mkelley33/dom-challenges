import { lazy, Suspense, useCallback } from 'react';

import { Button } from '@/components/ui/button';

// `configureMonaco` is imported here, inside the lazy loader, rather than at module scope.
// `monaco.ts` itself statically imports `@monaco-editor/react` (for `loader.config`), so a
// top-level `import { configureMonaco } from '@/lib/monaco'` in this file would make that whole
// dependency -- and the ~3 MB monaco-editor core behind it -- reachable the moment anything
// imports EditorPanel, regardless of this dynamic `import()`. Vite's build confirms this: with a
// static import elsewhere, it reports `INEFFECTIVE_DYNAMIC_IMPORT` and folds Monaco into the
// importer's chunk instead of splitting it. Loading `configureMonaco` only from within this same
// dynamic-import boundary is what keeps Monaco out of any chunk that does not render an editor,
// and running it before returning the Editor component also guarantees the local-loader
// configuration is in place before @monaco-editor/react ever tries to initialize Monaco itself.
const MonacoEditor = lazy(async () => {
  const [{ configureMonaco }, monacoReact] = await Promise.all([
    import('@/lib/monaco'),
    import('@monaco-editor/react'),
  ]);
  configureMonaco();
  return { default: monacoReact.Editor };
});

// Hoisted to module scope -- both are static across every render, and creating them inline as
// JSX/object literal prop values on every render is exactly what react-perf's
// jsx-no-jsx-as-prop/jsx-no-new-object-as-prop rules flag.
const EDITOR_LOADING_FALLBACK = <p className="p-3 text-sm text-muted">Loading editor…</p>;
const EDITOR_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 14,
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: 2,
};

export interface EditorPanelProps {
  challengeId: string;
  starterCode: string;
  value: string;
  onChange: (code: string) => void;
  onRun: () => void;
  isRunning: boolean;
}

export function EditorPanel({ challengeId, value, onChange, onRun, isRunning }: EditorPanelProps) {
  const handleEditorChange = useCallback(
    (next: string | undefined) => {
      onChange(next ?? '');
    },
    [onChange],
  );

  return (
    <section aria-label="Code editor" className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <h2 className="text-sm font-medium">Your solution</h2>
        <Button onClick={onRun} disabled={isRunning} size="sm">
          {isRunning ? 'Running…' : 'Run tests'}
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <Suspense fallback={EDITOR_LOADING_FALLBACK}>
          <MonacoEditor
            key={challengeId}
            language="typescript"
            path={`file:///${challengeId}.ts`}
            value={value}
            onChange={handleEditorChange}
            options={EDITOR_OPTIONS}
          />
        </Suspense>
      </div>
    </section>
  );
}
