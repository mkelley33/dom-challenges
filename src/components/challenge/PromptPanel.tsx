import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { Badge } from '@/components/ui/badge';
import type { Challenge } from '@/types/challenge';

// Hoisted: a fresh array literal as a prop on every render is what react-perf's
// jsx-no-new-array-as-prop flags, and this one is static.
const REMARK_PLUGINS = [remarkGfm];

// No typography plugin is installed, so the handful of elements a prompt can produce are styled
// here rather than inherited from `prose`.
const MARKDOWN_STYLES = [
  'text-sm leading-relaxed',
  '[&_p]:mt-0 [&_p]:mb-3 [&_p:last-child]:mb-0',
  '[&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5',
  '[&_code]:rounded [&_code]:bg-surface [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]',
  '[&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-surface [&_pre]:p-3',
  '[&_strong]:font-semibold [&_a]:text-accent [&_a]:underline',
].join(' ');

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

      <div className={MARKDOWN_STYLES}>
        <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{challenge.prompt}</ReactMarkdown>
      </div>
    </section>
  );
}
