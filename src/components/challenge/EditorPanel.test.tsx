import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { MockEditorProps } from '@/test/monacoMock';

import { EditorPanel } from './EditorPanel';

// Captures every prop Monaco's <Editor> is mounted with, so tests can assert on
// non-interactive config (like `path`) without reaching into the DOM for it.
const editorSpy = vi.fn<(props: MockEditorProps) => void>();

// The mock itself lives in `@/test/monacoMock` so the rule it encodes -- the editor's accessible
// name is read off `options.ariaLabel` and never hardcoded -- has exactly one place to diverge
// from now that three test files stand in for Monaco. See that file for why hardcoding it would
// make every `getByRole('textbox', { name: 'Solution code' })` below vacuous.
vi.mock('@monaco-editor/react', async () => {
  const { createMonacoReactMock } = await import('@/test/monacoMock');
  return createMonacoReactMock((props) => {
    editorSpy(props);
  });
});

vi.mock('@/lib/monaco', async () => {
  const { createMonacoLibMock } = await import('@/test/monacoMock');
  return createMonacoLibMock();
});

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
