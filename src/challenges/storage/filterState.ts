import type { ChallengeContent } from '@/types/challenge';

interface Filters {
  q: string;
  tags: string[];
  page: number;
}

/**
 * The filter state, read out of the form the learner can see in the preview.
 *
 * Derived from the markup rather than written as a literal here so the two cannot drift: the values
 * the tests round-trip through storage are exactly the ones the panel is showing. `FormData` is the
 * shortest honest way to read a form -- it skips the unchecked checkbox and hands back `tags` twice,
 * which is also the shape `URLSearchParams` wants.
 *
 * Everything `FormData` returns is a string, including the number input. Turning `page` back into a
 * number here is the same conversion the submitted `load` has to make, for the same reason.
 */
function readFilters(win: Window & typeof globalThis, doc: Document): Filters {
  // `win.HTMLFormElement`, never the bare global: this runs in the app's realm and `form` was built
  // in the host's, so the app's constructor is a different class object and the check would be false
  // for every form a learner actually sees. AGENTS.md §3.
  const form = doc.getElementById('filters');
  if (!(form instanceof win.HTMLFormElement)) {
    throw new Error('#filters is missing from the challenge markup, or is not a <form>');
  }

  const data = new win.FormData(form);
  const q = data.get('q');
  const page = data.get('page');
  if (typeof q !== 'string' || typeof page !== 'string') {
    throw new Error('#filters is missing its q or page control');
  }

  return {
    q,
    tags: data.getAll('tags').filter((tag): tag is string => typeof tag === 'string'),
    page: Number(page),
  };
}

/** Every key these tests, or the code they call, can leave behind. */
const TEST_KEYS = ['filters:a', 'filters:b', 'filters:junk'];

/**
 * Removes the keys this challenge writes.
 *
 * The preview frame is same-origin with the app, so it shares one storage area with it (AGENTS.md
 * §2) -- a key this challenge leaves behind is left in the learner's own origin, permanently,
 * because nothing will ever come back for it. The runner repairs `dom-challenges-*` and deliberately
 * touches nothing else, which makes tidying up after itself the challenge's own job.
 *
 * In a `finally`, so a failing assertion still cleans up: a learner debugging a red test would
 * otherwise accumulate one stale key per run.
 */
function clearTestKeys(win: Window & typeof globalThis): void {
  for (const key of TEST_KEYS) win.localStorage.removeItem(key);
}

export const filterState: ChallengeContent = {
  prompt: [
    'The panel below is a search filter, and its state should survive a reload and be shareable as a',
    'link. Two different serialisations of the same thing, and neither is free: `localStorage` holds',
    '**strings and nothing else**, and a query string has no types at all.',
    '',
    'Export three functions:',
    '',
    '- `save(key, filters)` — put `filters` into `localStorage` under `key`, as **one** entry.',
    '- `load(key)` — read it back as a `Filters`, with `page` a number again. Return `null` when there',
    '  is nothing under that key, **and also** when what is there is not something `save` wrote.',
    '- `toQuery(filters)` — build the query string: `q`, one `tags` entry per tag, and `page`.',
    '',
    'That third rule on `load` is the one that bites. `localStorage` is shared by everything on the',
    'origin — other features, an older version of this one, a browser extension — so the string under',
    'your key is not necessarily yours, and `JSON.parse` on a value that is not JSON **throws**. A',
    '`load` that throws takes the whole page down on a key it did not write.',
    '',
    'The test copies whatever `save` leaves in storage to a *different* key and loads it from there, so',
    'the round trip has to go through `localStorage` rather than through a variable your module kept.',
  ].join('\n'),
  html: [
    '<form id="filters">',
    '  <p><label>Search <input name="q" value="dom &amp; css"></label></p>',
    '  <fieldset>',
    '    <legend>Tags</legend>',
    '    <label><input type="checkbox" name="tags" value="events" checked> events</label>',
    '    <label><input type="checkbox" name="tags" value="layout" checked> layout</label>',
    '    <label><input type="checkbox" name="tags" value="forms"> forms</label>',
    '  </fieldset>',
    '  <p><label>Page <input type="number" name="page" value="3"></label></p>',
    '</form>',
  ].join('\n'),
  starterCode: [
    'export interface Filters {',
    '  q: string;',
    '  tags: string[];',
    '  page: number;',
    '}',
    '',
    'export function save(key: string, filters: Filters): void {',
    '  // localStorage stores strings. `filters` is not one, and this is what happens if you forget:',
    '  // the entry reads "[object Object]".',
    '  localStorage.setItem(key, String(filters));',
    '}',
    '',
    'export function load(key: string): Filters | null {',
    '  const stored = localStorage.getItem(key);',
    '  if (stored === null) return null;',
    '',
    '  // TODO: turn `stored` back into a Filters -- and return null if it is not one.',
    '  return null;',
    '}',
    '',
    'export function toQuery(filters: Filters): string {',
    '  // TODO: q, one `tags` entry per tag, page.',
    '  return `q=${filters.q}`;',
    '}',
    '',
  ].join('\n'),
  tests: [
    {
      name: 'what save() stores can be read back by load() from a different key',
      run: ({ doc, expect, fn, win }) => {
        try {
          const filters = readFilters(win, doc);
          const save = fn<(key: string, filters: Filters) => void>('save');
          const load = fn<(key: string) => Filters | null>('load');

          save('filters:a', filters);

          // Whatever is under `filters:a` is moved to `filters:b` and the original removed. A module
          // that kept the object in a variable, or keyed a cache by `filters:a`, has nothing to
          // answer with -- the only thing that survived this is the string in storage.
          const raw = win.localStorage.getItem('filters:a');
          if (raw === null) throw new Error('save() left nothing in localStorage under "filters:a"');
          win.localStorage.setItem('filters:b', raw);
          win.localStorage.removeItem('filters:a');

          // `page` has to be the number 3 and not the string "3": everything that went into storage
          // came out as a string, and putting the type back is the work.
          expect(load('filters:b')).toEqual(filters);
        } finally {
          clearTestKeys(win);
        }
      },
    },
    {
      name: 'load() returns null for a key that was never written',
      run: ({ expect, fn }) => {
        expect(fn<(key: string) => Filters | null>('load')('filters:never-written')).toBeNull();
      },
    },
    {
      name: 'load() returns null instead of throwing on a value it did not write',
      run: ({ expect, fn, win }) => {
        try {
          // Something else on the origin got there first. `JSON.parse` throws on this, and an
          // unguarded `load` throws with it.
          win.localStorage.setItem('filters:junk', 'left here by something else');

          expect(fn<(key: string) => Filters | null>('load')('filters:junk')).toBeNull();
        } finally {
          clearTestKeys(win);
        }
      },
    },
    {
      name: 'toQuery() encodes the filters so they survive a round trip',
      run: ({ doc, expect, fn, win }) => {
        const filters = readFilters(win, doc);
        const params = new win.URLSearchParams(fn<(filters: Filters) => string>('toQuery')(filters));

        // `q` holds a space and an ampersand. Built by hand, the `&` starts a new parameter and `q`
        // comes back as "dom " with a stray `css` key alongside it.
        expect(params.get('q')).toBe(filters.q);
        expect(params.getAll('tags')).toEqual(filters.tags);
        expect(params.get('page')).toBe(String(filters.page));
        expect(Array.from(params.keys())).toHaveLength(4);
      },
    },
  ],
  solutions: [
    {
      label: 'JSON blob, validated on the way in',
      code: [
        'export interface Filters {',
        '  q: string;',
        '  tags: string[];',
        '  page: number;',
        '}',
        '',
        'function isFilters(value: unknown): value is Filters {',
        "  if (typeof value !== 'object' || value === null) return false;",
        "  if (!('q' in value) || typeof value.q !== 'string') return false;",
        "  if (!('page' in value) || typeof value.page !== 'number') return false;",
        "  if (!('tags' in value)) return false;",
        '',
        '  const { tags } = value;',
        '',
        '  return Array.isArray(tags) && tags.every((tag: unknown) => typeof tag === "string");',
        '}',
        '',
        'export function save(key: string, filters: Filters): void {',
        '  localStorage.setItem(key, JSON.stringify(filters));',
        '}',
        '',
        'export function load(key: string): Filters | null {',
        '  const stored = localStorage.getItem(key);',
        '  if (stored === null) return null;',
        '',
        '  try {',
        '    const parsed: unknown = JSON.parse(stored);',
        '',
        '    return isFilters(parsed) ? parsed : null;',
        '  } catch {',
        '    return null;',
        '  }',
        '}',
        '',
        'export function toQuery(filters: Filters): string {',
        '  const params = new URLSearchParams();',
        "  params.set('q', filters.q);",
        "  for (const tag of filters.tags) params.append('tags', tag);",
        "  params.set('page', String(filters.page));",
        '',
        '  return params.toString();',
        '}',
        '',
      ].join('\n'),
      explanation: [
        '`localStorage` is a string-to-string map and nothing more. `setItem(key, filters)` does not',
        'fail — it calls `String()` on the value and stores `"[object Object]"`, which is the shape of',
        'the bug: the write succeeds, the data is gone, and you find out on the read.',
        '`JSON.stringify` is the conversion that has to happen, and `JSON.parse` is the one that undoes',
        'it.',
        '',
        'The `try`/`catch` is not defensive style. `JSON.parse` **throws** on input that is not JSON,',
        'and the input is a string that anything on this origin could have written — another feature,',
        'an extension, or last month’s version of this code with a different shape. A `load` that',
        'throws is a page that will not start, for a user whose only mistake was having used your site',
        'before.',
        '',
        '`isFilters` covers the half that `try`/`catch` cannot: `"null"`, `"42"` and `"[]"` are all',
        'valid JSON, so they parse without throwing and hand you something that is not a `Filters` at',
        'all. Typing the parsed value `unknown` rather than letting it default is what makes the',
        'compiler insist on the check — `JSON.parse` is declared as returning `any`, and `any` would',
        'have let every one of those straight through to a caller reading `.tags.length`.',
        '',
        '`URLSearchParams` does the escaping in `toQuery`. `q` here contains a space and an ampersand;',
        "written as a template string, that `&` begins a new parameter and `q` reads back as `'dom '`.",
        '`append` rather than `set` for the tags, because `set` replaces and `append` adds — repeating',
        'a key is how a query string expresses a list.',
      ].join('\n'),
      tradeoffs: [
        'JSON is the right default for anything with structure. It nests, it keeps numbers and booleans',
        'as numbers and booleans, and one entry is one atomic write.',
        '',
        'What to know before relying on it:',
        '',
        '- **The types are narrower than they look.** `Date` becomes a string, `Map` and `Set` become',
        '  `{}`, `undefined` disappears from objects and becomes `null` inside arrays. Anything richer',
        '  needs its own encoding on both sides.',
        '- **`localStorage` is synchronous and on the main thread.** Every read and write blocks. A few',
        '  kilobytes is nothing; a megabyte of JSON parsed during startup is a visible stall, and it is',
        '  parsed on *every* startup. That is the point where `IndexedDB` — asynchronous, indexed,',
        '  structured-clone rather than JSON — stops being overkill.',
        '- **It is shared per origin and it is small.** Roughly 5 MB for everything on the domain,',
        '  `setItem` throws `QuotaExceededError` when it is full, and it is full because of code that',
        '  is not yours. Namespace your keys (`app:filters`, not `filters`).',
        '- **It never expires.** A schema you change is a schema you still have to read next year.',
        '  Version the stored shape, or treat the failed `isFilters` as "discard and start over" — which',
        '  is exactly what returning `null` here does.',
        '',
        'Do not put anything sensitive in it. It is readable by every script on the origin, including',
        'ones you added by accident.',
      ].join('\n'),
    },
    {
      label: 'Store the query string itself',
      code: [
        'export interface Filters {',
        '  q: string;',
        '  tags: string[];',
        '  page: number;',
        '}',
        '',
        'export function toQuery(filters: Filters): string {',
        '  const params = new URLSearchParams();',
        "  params.set('q', filters.q);",
        "  for (const tag of filters.tags) params.append('tags', tag);",
        "  params.set('page', String(filters.page));",
        '',
        '  return params.toString();',
        '}',
        '',
        'export function save(key: string, filters: Filters): void {',
        '  localStorage.setItem(key, toQuery(filters));',
        '}',
        '',
        'export function load(key: string): Filters | null {',
        '  const stored = localStorage.getItem(key);',
        '  if (stored === null) return null;',
        '',
        '  const params = new URLSearchParams(stored);',
        "  const q = params.get('q');",
        "  const rawPage = params.get('page');",
        '  if (q === null || rawPage === null) return null;',
        '',
        '  const page = Number(rawPage);',
        '  if (!Number.isInteger(page)) return null;',
        '',
        "  return { q, tags: params.getAll('tags'), page };",
        '}',
        '',
      ].join('\n'),
      explanation: [
        'One format instead of two. The string in `localStorage` *is* the query string, so the stored',
        'state and the shareable link are the same thing and cannot disagree — paste the entry into a',
        'URL and it works.',
        '',
        '`URLSearchParams` never throws on malformed input, which removes the `try`/`catch` and replaces',
        'it with a different obligation. Every value is a string or `null`, so `load` has to check each',
        'one and convert the number itself.',
        '',
        'The `rawPage === null` check is the interesting line, and leaving it out is a real bug rather',
        'than an untidiness. `Number(null)` is `0`, and `Number.isInteger(0)` is `true` — so a stored',
        'string with no `page` at all would load as a perfectly plausible page zero. `Number("")` is',
        'also `0`. The guard has to happen before the conversion, because after it the missing value and',
        'a real one are indistinguishable.',
        '',
        '`getAll` returns `[]` for a key that is not there, which is the right answer for "no tags" and',
        'is why `tags` needs no guard of its own.',
      ].join('\n'),
      tradeoffs: [
        'Pick this when the state is genuinely a set of filters — flat, all strings and numbers, and',
        'something a user might want to send to someone. Having one canonical encoding for the URL, the',
        'stored copy, and the request to the server removes a whole class of "the link and the reload',
        'disagree" bugs, and the stored value is legible in devtools, which JSON at any size is not.',
        '',
        'Its limits are hard ones. A query string is flat — no nesting, no objects inside arrays — and',
        'everything is a string, so every type has to be reconstructed by hand and every reconstruction',
        'is a chance to write `Number(x)` where `x` might be `null`. It has no way to distinguish an',
        'absent key from an empty one without a convention, and no way to say "false".',
        '',
        'There is a third option this challenge does not have room for, and it is the one to reach for',
        'when the state belongs in the URL rather than merely being shareable: `history.replaceState`',
        'with a `URL` whose `search` you have rewritten, so the address bar tracks the filters and the',
        'back button undoes them. That makes the URL the single source of truth and demotes storage to',
        'a fallback for a fresh visit.',
      ].join('\n'),
    },
  ],
};
