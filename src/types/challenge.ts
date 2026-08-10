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
  /**
   * Reads a named export from the submitted code as `T`.
   *
   * This is how a challenge test reaches the value the prompt asked the learner to export --
   * typically a function, though `fn` is generic over any export shape. The alternative --
   * asserting a type onto `exports` in the challenge file -- is an unsafe assertion repeated in
   * every one of ~100 challenge modules; here the one unavoidable assertion lives in the harness,
   * at the seam that already owns the boundary with the submitted code.
   *
   * Checks presence, not shape. Throws with a message naming the missing export when the code
   * does not export `name` at all, so a typo fails the test as "you did not export this" rather
   * than as "undefined is not a function". An export that exists but is not callable is not
   * caught here -- it is handed back as `T`, and calling it produces whatever error that mismatch
   * produces.
   */
  fn: <T>(name: string) => T;
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
