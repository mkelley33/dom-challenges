import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Hoisted: a fresh array literal as a prop on every render is what react-perf's
// jsx-no-new-array-as-prop flags, and this one is static.
const REMARK_PLUGINS = [remarkGfm];

// No typography plugin is installed, so the handful of elements challenge prose can produce are
// styled here rather than inherited from `prose`.
const MARKDOWN_STYLES = [
  'text-sm leading-relaxed',
  '[&_p]:mt-0 [&_p]:mb-3 [&_p:last-child]:mb-0',
  '[&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5',
  '[&_code]:rounded [&_code]:bg-surface [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]',
  '[&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-surface [&_pre]:p-3',
  '[&_strong]:font-semibold [&_a]:text-accent [&_a]:underline',
].join(' ');

export interface MarkdownProps {
  children: string;
}

/**
 * Challenge-authored prose: prompts, solution explanations, tradeoffs.
 *
 * Shared rather than repeated per panel so the two never drift into rendering the same authored
 * markdown differently -- the plugin set decides what syntax an author may rely on.
 */
export function Markdown({ children }: MarkdownProps) {
  return (
    <div className={MARKDOWN_STYLES}>
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS}>{children}</ReactMarkdown>
    </div>
  );
}
