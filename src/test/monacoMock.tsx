import type { ChangeEvent } from 'react';
import { useCallback } from 'react';
import { vi } from 'vitest';

export interface MockEditorProps {
  value: string;
  onChange: (value: string) => void;
  path?: string;
  language?: string;
  options?: { ariaLabel?: string };
}

/**
 * A stand-in for `@monaco-editor/react`'s `<Editor>` for any test that renders `EditorPanel`.
 *
 * One definition, shared, because the important part of it is a rule that is easy to get wrong
 * twice: the accessible name is read off `options.ariaLabel` -- the same channel the real Monaco
 * reads it from -- and is never hardcoded here. Hardcoding it would make every
 * `getByRole('textbox', { name: 'Solution code' })` pass even against an `EditorPanel` that never
 * named the editor at all, which is precisely the production bug those queries exist to rule out.
 *
 * `onRender` receives every prop the editor was mounted with, so a test can assert on
 * non-interactive configuration (like `path`) without reaching into the DOM for it.
 */
export function createMonacoReactMock(onRender?: (props: MockEditorProps) => void) {
  return {
    Editor: (props: MockEditorProps) => {
      onRender?.(props);
      const { value, onChange, options } = props;

      const handleChange = useCallback(
        (event: ChangeEvent<HTMLTextAreaElement>) => {
          onChange(event.target.value);
        },
        [onChange],
      );

      return <textarea aria-label={options?.ariaLabel} value={value} onChange={handleChange} />;
    },
    loader: { config: vi.fn<() => void>() },
  };
}

/**
 * The counterpart mock for `@/lib/monaco`.
 *
 * `monaco.ts`'s `?worker` imports resolve only under Vite's client build, not under Vitest, so
 * loading it for real would fail before any assertion ran. `configureMonaco`'s own correctness --
 * wiring real workers, pointing the loader at the local Monaco -- is covered by the production
 * build, not here.
 */
export function createMonacoLibMock() {
  return { configureMonaco: vi.fn<() => void>() };
}
