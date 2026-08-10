import { Link, useParams } from 'react-router';

import { CATEGORY_META, challengesInCategory } from '@/challenges/registry';
import { NotFound } from '@/components/NotFound';
import type { CategoryId } from '@/types/challenge';

/**
 * A route param arrives untyped as `string | undefined`. Checking it against `CATEGORY_META`'s
 * own keys at runtime -- rather than casting -- is what lets TypeScript narrow it to
 * `CategoryId` in the branch below, since `hasOwnProperty` alone returns a plain `boolean` with
 * no type-level meaning until it is wrapped in a declared type predicate like this one.
 */
function isCategoryId(id: string): id is CategoryId {
  return Object.prototype.hasOwnProperty.call(CATEGORY_META, id);
}

export function ChallengeList() {
  const { categoryId } = useParams();

  if (!categoryId || !isCategoryId(categoryId)) {
    return <NotFound message="Unknown category." />;
  }

  const meta = CATEGORY_META[categoryId];
  const challenges = challengesInCategory(categoryId);

  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold">{meta.title}</h1>
      <p className="mt-1 text-sm text-muted">{meta.blurb}</p>
      <ul className="mt-6 space-y-2">
        {challenges.map((challenge) => (
          <li key={challenge.id}>
            <Link to={`/challenge/${challenge.slug}`} className="text-accent hover:underline">
              {challenge.title}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
