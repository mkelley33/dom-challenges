import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RouteError } from './RouteError';

/**
 * What the route throws, set per test.
 *
 * Module-level rather than a prop, because the value has to arrive through `useRouteError` -- the
 * hook is the thing under test as much as the branch is, and it is typed `unknown` precisely
 * because anything at all can be thrown.
 */
let thrown: unknown = new Error('unset');

function Boom(): never {
  throw thrown;
}

function renderThrown(value: unknown) {
  thrown = value;
  const router = createMemoryRouter([{ path: '/', element: <Boom />, errorElement: <RouteError /> }], {
    initialEntries: ['/'],
  });
  return render(<RouterProvider router={router} />);
}

/** The message block: the explanatory sentence, plus the error's own detail when there is one. */
function message(): HTMLElement {
  return screen.getByRole('status');
}

/**
 * How many lines the message block holds.
 *
 * Text alone cannot tell "no detail" from "a detail that is the empty string": an empty element adds
 * no text and would read identically, while leaving a blank line on screen. Counting the children is
 * what distinguishes the branch.
 */
function messageLines(): number {
  return message().children.length;
}

beforeEach(() => {
  // react-router logs every error it catches, and a caught error is what each test here arranges.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RouteError', () => {
  it('names itself with a heading and offers exactly one control', () => {
    renderThrown(new Error('Failed to fetch dynamically imported module'));

    expect(screen.getByRole('heading', { level: 1, name: /could not be loaded/i })).toBeInTheDocument();
    // The way back to a working page is the shell's navigation, which is why this renders inside the
    // shell; a second control here would be a duplicate of it.
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
  });

  it('moves focus to its heading, which is the only thing that gets the page announced at all', () => {
    renderThrown(new Error('boom'));

    const heading = screen.getByRole('heading', { level: 1, name: /could not be loaded/i });
    // A live region is announced when its content changes *while it is already present*; content
    // that is there at insertion is not. This page is a whole-route replacement, so the `<output>`
    // below arrives with its text already in it and react-router moves no focus on navigation --
    // without this, a screen-reader user gets silence. `role="alert"` is the documented exception,
    // and it is the one this page gave up to stop being assertive and atomic over its own controls.
    expect(heading).toHaveFocus();
    // -1, not 0: focusable to be announced, never a stop a keyboard user has to Tab past.
    expect(heading).toHaveAttribute('tabindex', '-1');
  });

  it('announces politely, and does not sweep the heading and the retry into the announcement', () => {
    renderThrown(new Error('boom'));

    // `role="alert"` would be assertive and atomic over the whole page -- an interruption, plus the
    // heading and the button text read out as one string, for a page the learner just arrived at.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(within(message()).queryByRole('heading')).not.toBeInTheDocument();
    expect(within(message()).queryByRole('button')).not.toBeInTheDocument();
  });

  it("carries an Error's message through, so the sentence is not the same for every fault", () => {
    renderThrown(new Error('Failed to fetch dynamically imported module'));

    expect(message()).toHaveTextContent(/failed to fetch dynamically imported module/i);
    expect(messageLines()).toBe(2);
  });

  it('carries a thrown string through as well, since not everything thrown is an Error', () => {
    renderThrown('the chunk went missing');

    expect(message()).toHaveTextContent(/the chunk went missing/i);
    expect(messageLines()).toBe(2);
  });

  it('reports no detail at all rather than an empty line when the error carries no message', () => {
    renderThrown(new Error(''));

    // `''` is falsy but it is still a `string`, so a branch testing only `typeof message ===
    // 'string'` would render an empty line: a blank, unexplained gap under the copy.
    expect(messageLines()).toBe(1);
    expect(screen.getByRole('heading', { level: 1, name: /could not be loaded/i })).toBeInTheDocument();
  });

  it('reports no detail for a thrown value that has no readable message', () => {
    renderThrown({ status: 500 });

    // `[object Object]` tells a learner nothing and `{"status":500}` tells them almost nothing; the
    // static copy is better than either.
    expect(messageLines()).toBe(1);
    expect(message()).not.toHaveTextContent(/object|500/i);
  });
});
