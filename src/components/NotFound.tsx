export function NotFound({ message = "We couldn't find that challenge." }: { message?: string }) {
  return (
    <div className="p-8">
      <p className="text-muted">{message}</p>
    </div>
  );
}
