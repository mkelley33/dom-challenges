import { Link } from 'react-router';

import { CATEGORY_META, challengesInCategory } from '@/challenges/registry';
import type { CategoryId } from '@/types/challenge';

/**
 * `Object.keys` types as `string[]` no matter how narrow the object's own key type is -- a
 * known gap in the standard library's types, not something this object's shape leaves in
 * doubt. Filtering with this predicate recovers `CategoryId[]` through real narrowing instead
 * of an unchecked assertion.
 */
function isCategoryId(id: string): id is CategoryId {
  return Object.prototype.hasOwnProperty.call(CATEGORY_META, id);
}

export function Dashboard() {
  const categoryIds = Object.keys(CATEGORY_META).filter(isCategoryId);

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold">Your progress</h1>
      <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categoryIds.map((categoryId) => {
          const meta = CATEGORY_META[categoryId];
          const count = challengesInCategory(categoryId).length;

          return (
            <li key={categoryId}>
              <Link
                to={`/category/${categoryId}`}
                className="block rounded-lg border bg-surface-raised p-4 hover:border-accent"
              >
                <span className="font-medium">{meta.title}</span>
                <p className="mt-1 text-sm text-muted">{meta.blurb}</p>
                <p className="mt-2 text-sm text-muted">{count} challenges</p>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
