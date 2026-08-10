import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCallback, type ChangeEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { EditorPanel } from './EditorPanel';

interface MockEditorProps {
  value: string;
  onChange: (v: string) => void;
  path?: string;
  language?: string;
  options?: { ariaLabel?: string };
}

// Captures every prop Monaco's <Editor> is mounted with, so tests can assert on
// non-interactive config (like `path`) without reaching into the DOM for it.
const editorSpy = vi.fn<(props: MockEditorProps) => void>();

vi.mock('@monaco-editor/react', () => ({
  Editor: (props: MockEditorProps) => {
    editorSpy(props);
    const { value, onChange, options } = props;

    const handleChange = useCallback(
      (e: ChangeEvent<HTMLTextAreaElement>) => {
        onChange(e.target.value);
      },
      [onChange],
    );

    // The label comes from `options.ariaLabel`, the same channel the real Monaco reads it from,
    // rather than being hardcoded here. Hardcoding it would make every `getByRole('textbox',
    // { name: 'Solution code' })` below pass even if EditorPanel never named the editor at all --
    // which is precisely the production bug those queries exist to rule out.
    return <textarea aria-label={options?.ariaLabel} value={value} onChange={handleChange} />;
  },
  loader: { config: vi.fn<() => void>() },
}));

// EditorPanel imports configureMonaco eagerly (unlike the lazily-loaded editor itself), and
// monaco.ts's `?worker` imports only resolve under Vite's client build -- not under Vitest's
// test environment. configureMonaco's own correctness (wiring real workers, pointing the loader
// at the local Monaco) is verified by the build check in the task brief, not here; this mock
// exists purely so loading EditorPanel.tsx does not try to resolve those worker modules.
vi.mock('@/lib/monaco', () => ({ configureMonaco: vi.fn<() => void>() }));

describe('EditorPanel', () => {
  const baseProps = {
    challengeId: 'c1',
    starterCode: '// start',
    value: '// start',
    onChange: vi.fn<(code: string) => void>(),
    onRun: vi.fn<() => void>(),
    isRunning: false,
  };

  it('renders a run button', async () => {
    render(<EditorPanel {...baseProps} />);
    expect(await screen.findByRole('button', { name: /run/i })).toBeInTheDocument();
  });

  it('calls onRun when the run button is pressed', async () => {
    const onRun = vi.fn<() => void>();
    render(<EditorPanel {...baseProps} onRun={onRun} />);
    await userEvent.click(await screen.findByRole('button', { name: /run/i }));
    expect(onRun).toHaveBeenCalledOnce();
  });

  it('disables the run button while a run is in flight', async () => {
    render(<EditorPanel {...baseProps} isRunning />);
    expect(await screen.findByRole('button', { name: /running/i })).toBeDisabled();
  });

  it('shows the value passed in for the current challenge, not the starter code', async () => {
    render(<EditorPanel {...baseProps} starterCode="// starter" value="// a learner's draft" />);
    const field = await screen.findByRole('textbox', { name: 'Solution code' });
    expect(field).toHaveValue("// a learner's draft");
  });

  it('calls onChange with the edited text when the learner types, so a caller can persist it as a draft', async () => {
    const onChange = vi.fn<(code: string) => void>();
    render(<EditorPanel {...baseProps} onChange={onChange} />);
    const field = await screen.findByRole('textbox', { name: 'Solution code' });

    await userEvent.type(field, '!');

    expect(onChange).toHaveBeenCalledWith('// start!');
  });

  it("switching to a different challenge shows that challenge's value, not the previous one, and re-scopes the editor's model path", async () => {
    const { rerender } = render(<EditorPanel {...baseProps} challengeId="a" value="// code for a" />);
    expect(await screen.findByRole('textbox', { name: 'Solution code' })).toHaveValue('// code for a');
    expect(editorSpy).toHaveBeenLastCalledWith(expect.objectContaining({ path: expect.stringContaining('a') }));

    rerender(<EditorPanel {...baseProps} challengeId="b" value="// code for b" />);

    const field = await screen.findByRole('textbox', { name: 'Solution code' });
    expect(field).toHaveValue('// code for b');
    expect(field).not.toHaveValue('// code for a');
    expect(editorSpy).toHaveBeenLastCalledWith(expect.objectContaining({ path: expect.stringContaining('b') }));
  });
});
