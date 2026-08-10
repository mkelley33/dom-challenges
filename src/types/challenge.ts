import type { Matchers } from '@/runner/expect';

export type CategoryId =
  | 'selection'
  | 'creation'
  | 'attributes'
  | 'styles'
  | 'events'
  | 'forms'
  | 'observers'
  | 'async'
  | 'storage'
  | 'web-apis'
  | 'performance'
  | 'a11y'
  | 'react';

export type Difficulty = 'novice' | 'intermediate' | 'advanced' | 'expert';

export interface EventHelpers {
  click(target: Element, init?: MouseEventInit): void;
  input(target: HTMLInputElement | HTMLTextAreaElement, value: string): void;
  keydown(target: Element, key: string, init?: KeyboardEventInit): void;
  submit(form: HTMLFormElement): void;
}

export interface TestContext {
  doc: Document;
  win: Window & typeof globalThis;
  expect: (actual: unknown) => Matchers;
  exports: Readonly<Record<string, unknown>>;
  tick: () => Promise<void>;
  fire: EventHelpers;
}

export interface ChallengeTest {
  name: string;
  run: (ctx: TestContext) => void | Promise<void>;
  timeoutMs?: number;
}

export interface Solution {
  label: string;
  code: string;
  explanation: string;
  tradeoffs: string;
}

export interface Challenge {
  id: string;
  slug: string;
  title: string;
  category: CategoryId;
  difficulty: Difficulty;
  prompt: string;
  html: string;
  starterCode: string;
  tests: ChallengeTest[];
  solutions: Solution[];
  concepts: string[];
  relatedIds: string[];
}
