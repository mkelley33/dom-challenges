export interface NotFoundProps {
  message?: string;
}

/**
 * The dead end, wherever it is reached from: an unknown slug, or a path that matches no route.
 *
 * The message is the page's `h1` rather than a paragraph. Every other page in the app names itself
 * with a level-one heading, and heading navigation is how a screen reader user orients on arrival;
 * a page whose only content is unheaded prose is the one place that stops working.
 */
export function NotFound({ message = "We couldn't find that challenge." }: NotFoundProps) {
  return (
    <div className="flex flex-col gap-2 p-8">
      <h1 className="text-lg font-semibold">{message}</h1>
      <p className="text-sm text-muted">Pick another challenge from the dashboard.</p>
    </div>
  );
}
