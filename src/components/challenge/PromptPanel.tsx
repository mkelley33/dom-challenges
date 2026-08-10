import { Badge } from '@/components/ui/badge';
import type { Challenge } from '@/types/challenge';

import { Markdown } from './Markdown';

export interface PromptPanelProps {
  challenge: Challenge;
}

export function PromptPanel({ challenge }: PromptPanelProps) {
  return (
    <section aria-label="Problem" className="flex min-h-0 flex-col gap-3 overflow-auto p-4">
      <div className="flex flex-col gap-2">
        <h1 className="text-lg font-semibold text-balance">{challenge.title}</h1>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{challenge.difficulty}</Badge>
          {challenge.concepts.map((concept) => (
            <Badge key={concept} variant="outline">
              {concept}
            </Badge>
          ))}
        </div>
      </div>

      <Markdown>{challenge.prompt}</Markdown>
    </section>
  );
}
