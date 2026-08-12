import type { ChallengeEntry } from '@/types/challenge';

/**
 * The Web APIs category, as metadata plus one dynamic import each.
 *
 * Three of the things this category is named for were measured before anything was authored, and
 * only one of the clipboard's two halves survives:
 *
 * - **Canvas** is unusable here. `canvas.getContext('2d')` returns `null` under the pinned
 *   happy-dom, and `toDataURL()` answers with an empty `data:image/png;base64,` stub rather than
 *   failing -- so a Canvas challenge cannot be validated, and would look like it had been.
 * - **`navigator.clipboard`** is the trap in the other direction. happy-dom resolves `writeText`
 *   and `readText` and round-trips text through them; real Chrome rejects both inside the preview
 *   frame with `NotAllowedError: Document is not focused`, because the frame document is not the
 *   focused one even when the page is. Green suite, broken learner.
 * - **Drag and drop** is the trap in the first direction: `new DragEvent('drop', { dataTransfer })`
 *   carries its `dataTransfer` in Chrome and drops it under happy-dom, where the listener sees
 *   **`undefined`** -- not `null`. The distinction is small and load-bearing: the property is typed
 *   `DataTransfer | null`, so the `=== null` guard a careful author writes does not return, and the
 *   `.getData()` after it throws a `TypeError` rather than taking the guarded branch. Pinned by
 *   `src/test/happyDomGaps.test.ts`.
 *
 * `ClipboardEvent` plus `DataTransfer` behaves identically in both -- `setData`, `getData`, the
 * event's `clipboardData` identity, `defaultPrevented`, and the empty-flavour `''` -- which is what
 * this challenge is built on. See AGENTS.md §3 and §10.
 */
export const webApisEntries: ChallengeEntry[] = [
  {
    id: 'web-apis-copy-handler',
    slug: 'copy-handler',
    title: 'Decide what copying produces',
    category: 'web-apis',
    difficulty: 'advanced',
    concepts: ['ClipboardEvent', 'DataTransfer', 'preventDefault', 'event delegation', 'HTML escaping'],
    relatedIds: [],
    load: () => import('./copyHandler').then((module) => module.copyHandler),
  },
];
