import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { entriesInCategory } from '@/challenges/registry';
import type { ChallengeFilters } from '@/store/editorStore';
import { useEditorStore } from '@/store/editorStore';
import type { ChallengeEntry } from '@/types/challenge';
import type { ProgressRecord } from '@/types/progress';

import { ChallengeList } from './ChallengeList';

const NO_FILTERS: ChallengeFilters = { category: 'all', difficulty: 'all', query: '', hideSolved: false };

const challenges: ChallengeEntry[] = entriesInCategory('selection');

function challengeAt(index: number): ChallengeEntry {
  const challenge = challenges[index];
  if (!challenge) throw new Error(`the selection category has no challenge at index ${index}`);
  return challenge;
}

/** A search term matched by one challenge, and the challenge it belongs to. */
interface UniqueTerm {
  challenge: ChallengeEntry;
  term: string;
}

/**
 * The challenges whose title or concepts carry `term` as a case-insensitive substring.
 *
 * A statement about the content, not a copy of `matchesQuery`: it says which challenges *mention*
 * the term, which is what makes a term usable as a fixture for "searching narrows the list to one
 * entry". What the search does with a term is exactly what the tests below are asserting, so it is
 * derived from the data and never from the filter.
 */
function challengesMentioning(term: string): ChallengeEntry[] {
  const needle = term.trim().toLowerCase();
  return challenges.filter((challenge) =>
    [challenge.title, ...challenge.concepts].some((text) => text.toLowerCase().includes(needle)),
  );
}

/**
 * The first term produced by `termsFor` that exactly one challenge mentions.
 *
 * Every search test below asserts the list narrows to a single entry, so the term has to be unique
 * -- and taking it from a fixed position ("the second challenge's title") makes that uniqueness an
 * accident of registration order. It broke the moment the category was sorted by difficulty:
 * `Collect the text of every item` truncates to `collect`, which `Live collections versus static
 * lists` also carries. Searching for a term counted first, and failing loudly when nothing in the
 * category is unique, keeps the assertion about the search rather than about the registry's shape.
 */
function uniqueTerm(label: string, termsFor: (challenge: ChallengeEntry) => string[]): UniqueTerm {
  for (const challenge of challenges) {
    for (const term of termsFor(challenge)) {
      if (challengesMentioning(term).length === 1) return { challenge, term };
    }
  }

  throw new Error(`no ${label} in the selection category is carried by exactly one challenge`);
}

function solvedRecord(challengeId: string): ProgressRecord {
  return {
    id: `row-${challengeId}`,
    challengeId,
    status: 'solved',
    attempts: 2,
    solvedAt: '2026-01-02T00:00:00.000Z',
    revealedAt: null,
    lastCode: null,
    updatedAt: '2026-01-02T00:00:00.000Z',
  };
}

function stubProgress(records: ProgressRecord[]): void {
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(() => Promise.resolve(new Response(JSON.stringify(records), { status: 200 }))),
  );
}

function renderCategory(path = '/category/selection') {
  const router = createMemoryRouter([{ path: '/category/:categoryId', element: <ChallengeList /> }], {
    initialEntries: [path],
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

function setFilters(partial: Partial<ChallengeFilters>): void {
  useEditorStore.setState({ filters: { ...NO_FILTERS, ...partial } });
}

function linkNames(): string[] {
  return screen.queryAllByRole('link').map((link) => link.textContent ?? '');
}

beforeEach(() => {
  stubProgress([]);
  useEditorStore.setState({ filters: NO_FILTERS });
});

afterEach(() => {
  vi.unstubAllGlobals();
  useEditorStore.setState({ filters: NO_FILTERS });
});

describe('ChallengeList', () => {
  it('lists every challenge in the category when nothing is filtered', async () => {
    renderCategory();

    expect(await screen.findByRole('heading', { level: 1, name: /selection & traversal/i })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(challenges.length);
  });

  it('points each entry at its own challenge, in the order the registry lists them', async () => {
    renderCategory();

    // Title and href together, as pairs. Reading only the text -- which is all this file did until
    // now -- leaves the destination unasserted anywhere in the suite: point every entry at one
    // hard-coded slug and nothing goes red, while every link on the page but one 404s. The
    // Dashboard's category links have always asserted their href; these are the ones a learner
    // actually clicks.
    const links = await screen.findAllByRole('link');
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual(
      challenges.map((challenge) => [challenge.title, `/challenge/${challenge.slug}`]),
    );
  });

  it('matches the search text against the title', async () => {
    // The first eight characters of a title, which is a learner typing the beginning of one they
    // half-remember rather than the whole thing.
    const { challenge: wanted, term } = uniqueTerm('title prefix', (challenge) => [challenge.title.slice(0, 8)]);
    setFilters({ query: term.toUpperCase() });

    renderCategory();

    // Upper-cased on purpose: a case-sensitive `includes` would find nothing here, and that learner
    // would be told there is no such challenge.
    expect(await screen.findByRole('link', { name: wanted.title })).toBeInTheDocument();
    expect(linkNames()).toEqual([wanted.title]);
  });

  it('matches the search text against a concept that never appears in the title', async () => {
    // Restricted to concepts absent from their own challenge's title, so a title-only search cannot
    // find it either -- and unique across the category, so one match is the correct answer.
    const { challenge: wanted, term } = uniqueTerm('concept', (challenge) =>
      challenge.concepts.filter((concept) => !challenge.title.toLowerCase().includes(concept.toLowerCase())),
    );

    setFilters({ query: term });

    renderCategory();

    // The whole point of indexing concepts: `closest` and `MutationObserver` are what a learner
    // actually searches for, and no challenge title contains them.
    expect(await screen.findByRole('link', { name: wanted.title })).toBeInTheDocument();
    expect(linkNames()).toEqual([wanted.title]);
  });

  it('keeps only the chosen difficulty', async () => {
    const wanted = challengeAt(2);
    // Derived, because the category grows: the expectation is "every challenge in this tier and
    // nothing else", and a hard-coded single title turns writing a second challenge at the same
    // difficulty into a failure of the *filter* test.
    const sameTier = challenges.filter((challenge) => challenge.difficulty === wanted.difficulty);
    setFilters({ difficulty: wanted.difficulty });

    renderCategory();

    expect(await screen.findByRole('link', { name: wanted.title })).toBeInTheDocument();
    // The filter has to actually exclude something, or a list that ignores the difficulty passes.
    expect(sameTier.length, 'the chosen tier holds the whole category, so this filters nothing').toBeLessThan(
      challenges.length,
    );
    expect(linkNames()).toEqual(sameTier.map((challenge) => challenge.title));
  });

  it('drops the challenges the progress records say are solved', async () => {
    const solved = challengeAt(0);
    stubProgress([solvedRecord(solved.id)]);
    setFilters({ hideSolved: true });

    renderCategory();

    // The records arrive from a query that has not resolved on the first paint, so the wait is on
    // the list having shrunk -- the only observable that cannot be true before they land.
    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(challenges.length - 1);
    });
    expect(linkNames()).not.toContain(solved.title);
  });

  it('keeps an attempted-but-unsolved challenge visible while hide-solved is on', async () => {
    const solved = challengeAt(0);
    const attempted = challengeAt(1);
    stubProgress([solvedRecord(solved.id), { ...solvedRecord(attempted.id), status: 'attempted', solvedAt: null }]);
    setFilters({ hideSolved: true });

    renderCategory();

    // "Hide solved" is not "hide anything with a record". Reading the presence of a row rather
    // than its status would hide exactly the challenges the learner is still working on.
    //
    // The solved row is here so the wait has something positive to land on: both challenges are
    // on screen until the records arrive, so `findByRole(attempted)` alone resolves on the first
    // paint and passes against an implementation that goes on to hide it. Exactly one entry may
    // disappear -- a row-presence check would take two, and this never reaches length 2.
    await waitFor(() => {
      expect(screen.getAllByRole('listitem')).toHaveLength(challenges.length - 1);
    });
    expect(screen.getByRole('link', { name: attempted.title })).toBeInTheDocument();
    expect(linkNames()).not.toContain(solved.title);
  });

  it('announces an empty state instead of leaving a blank panel when the filters exclude everything', async () => {
    setFilters({ query: 'nothing here matches this' });

    renderCategory();

    const empty = await screen.findByRole('status');
    expect(empty).toHaveTextContent(/no challenges match/i);
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('keeps the live region mounted and silent while there is still something to list', async () => {
    const user = userEvent.setup();

    renderCategory();

    // A live region inserted in the same commit as its text is announced inconsistently -- Safari
    // with VoiceOver and JAWS routinely miss it, because there was no region to observe when the
    // mutation happened. So it has to be here, and empty, before there is anything to say.
    const region = await screen.findByRole('status');
    expect(region).toBeEmptyDOMElement();
    expect(screen.getAllByRole('listitem')).toHaveLength(challenges.length);

    await user.type(screen.getByRole('textbox', { name: 'Search challenges' }), 'nothing matches this');

    // Asserted against the node captured *before* the filter emptied the list. A region rendered
    // only when `visible.length === 0` produces a different element here, and this held reference
    // -- detached from the document -- never receives the text, so the wait times out.
    await waitFor(() => {
      expect(region).toHaveTextContent(/no challenges match/i);
    });
    expect(screen.getByRole('status')).toBe(region);
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('says a category with nothing in it is empty rather than blaming the filters', async () => {
    renderCategory('/category/react');

    const empty = await screen.findByRole('status');
    expect(empty).toHaveTextContent(/no challenges in this category yet/i);
  });

  it('still refuses an unknown category', async () => {
    renderCategory('/category/not-a-category');

    expect(await screen.findByText(/unknown category/i)).toBeInTheDocument();
  });
});
