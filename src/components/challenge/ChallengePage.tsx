import { useParams } from 'react-router';

import { challengeBySlug } from '@/challenges/registry';
import { NotFound } from '@/components/NotFound';

export function ChallengePage() {
  const { slug } = useParams();
  const challenge = slug ? challengeBySlug(slug) : undefined;

  if (!challenge) {
    return <NotFound />;
  }

  return (
    <div className="grid h-full grid-rows-[auto_1fr] gap-4 p-4">
      <h1 className="text-xl font-semibold">{challenge.title}</h1>
      <div className="grid min-h-0 grid-cols-1 gap-4 lg:grid-cols-3">
        <section aria-label="Problem" className="min-h-0 overflow-auto rounded-lg border bg-surface-raised p-4" />
        <section aria-label="Code" className="min-h-0 overflow-auto rounded-lg border bg-surface-raised p-4" />
        <section aria-label="Result" className="min-h-0 overflow-auto rounded-lg border bg-surface-raised p-4" />
      </div>
    </div>
  );
}
