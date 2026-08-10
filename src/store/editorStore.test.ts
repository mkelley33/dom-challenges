import { beforeEach, describe, expect, it } from 'vitest';

import { useEditorStore } from './editorStore';

const STORAGE_KEY = 'dom-challenges-editor';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Reads the raw persist envelope back out of storage and returns its `state` payload.
 *
 * `JSON.parse` returns `any` by lib.dom's own typing, and this is a boundary with data this
 * test wrote itself, not code under test -- so an unchecked assertion would just be asserting
 * away a check that's cheap to do for real. Narrows via runtime `isRecord` guards instead of
 * `as`, throwing with a specific message at whichever step the shape does not hold.
 */
function readPersistedState(): Record<string, unknown> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) {
    throw new Error(`expected localStorage["${STORAGE_KEY}"] to hold a value`);
  }
  const envelope: unknown = JSON.parse(raw);
  if (!isRecord(envelope)) {
    throw new Error('expected a persisted envelope object');
  }
  const { state } = envelope;
  if (!isRecord(state)) {
    throw new Error('expected envelope.state to be an object');
  }
  return state;
}

const initial = useEditorStore.getState();

beforeEach(() => {
  useEditorStore.setState(initial, true);
  localStorage.clear();
});

describe('editor store', () => {
  it('starts with no drafts', () => {
    expect(useEditorStore.getState().drafts).toEqual({});
  });

  it('stores and retrieves a draft per challenge', () => {
    useEditorStore.getState().setDraft('a', 'code-a');
    useEditorStore.getState().setDraft('b', 'code-b');
    expect(useEditorStore.getState().drafts['a']).toBe('code-a');
    expect(useEditorStore.getState().drafts['b']).toBe('code-b');
  });

  it('clears a single draft without touching the others', () => {
    useEditorStore.getState().setDraft('a', 'code-a');
    useEditorStore.getState().setDraft('b', 'code-b');
    useEditorStore.getState().clearDraft('a');
    expect(useEditorStore.getState().drafts['a']).toBeUndefined();
    expect(useEditorStore.getState().drafts['b']).toBe('code-b');
  });

  it('merges partial filter updates', () => {
    useEditorStore.getState().setFilters({ difficulty: 'expert' });
    expect(useEditorStore.getState().filters.difficulty).toBe('expert');
    expect(useEditorStore.getState().filters.category).toBe('all');
  });

  it('merges partial layout updates', () => {
    useEditorStore.getState().setLayout({ promptPercent: 35 });
    expect(useEditorStore.getState().layout.promptPercent).toBe(35);
    expect(useEditorStore.getState().layout.editorPercent).toBe(42);
  });

  it('tracks the active mobile tab', () => {
    useEditorStore.getState().setMobileTab('result');
    expect(useEditorStore.getState().mobileTab).toBe('result');
  });
});

describe('persistence', () => {
  it('writes a draft to localStorage under the documented key as it is set', () => {
    useEditorStore.getState().setDraft('a', 'code-a');

    expect(readPersistedState().drafts).toEqual({ a: 'code-a' });
  });

  it('loads a draft written by a previous session on rehydration', async () => {
    // Simulate the tab having been closed and reopened: write a raw payload to storage
    // directly (bypassing the store entirely, the way an earlier page load would have left
    // it behind), confirm the live store does not have it yet, then rehydrate and confirm
    // the only way the value can appear is by the store actually reading storage.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { drafts: { a: 'code-a' } }, version: 0 }));
    expect(useEditorStore.getState().drafts['a']).toBeUndefined();

    await useEditorStore.persist.rehydrate();

    expect(useEditorStore.getState().drafts['a']).toBe('code-a');
  });

  it('loads previously persisted filters and layout the same way', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        state: {
          filters: { category: 'events', difficulty: 'all', query: '', hideSolved: true },
          layout: { promptPercent: 50, editorPercent: 42 },
        },
        version: 0,
      }),
    );
    expect(useEditorStore.getState().filters.category).toBe('all');
    expect(useEditorStore.getState().layout.promptPercent).toBe(28);

    await useEditorStore.persist.rehydrate();

    expect(useEditorStore.getState().filters.category).toBe('events');
    expect(useEditorStore.getState().filters.hideSolved).toBe(true);
    expect(useEditorStore.getState().layout.promptPercent).toBe(50);
  });

  it('does not persist mobileTab: it is view state for the current visit, not a saved preference', () => {
    useEditorStore.getState().setMobileTab('result');

    expect('mobileTab' in readPersistedState()).toBe(false);
  });

  it('leaves the current mobileTab alone on rehydration, since it is never part of the payload', async () => {
    useEditorStore.getState().setMobileTab('result');

    // A storage payload shaped exactly like partialize actually produces: no mobileTab key.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { drafts: { a: 'code-a' } }, version: 0 }));

    await useEditorStore.persist.rehydrate();

    expect(useEditorStore.getState().drafts['a']).toBe('code-a');
    expect(useEditorStore.getState().mobileTab).toBe('result');
  });
});
