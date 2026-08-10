import { Link, Outlet } from 'react-router';

export function AppShell() {
  return (
    <div className="flex h-full flex-col bg-surface text-ink">
      <header className="flex items-center gap-4 border-b px-4 py-3">
        <Link to="/" className="font-semibold tracking-tight">
          DOM Challenges
        </Link>
        <nav aria-label="Main" className="text-sm text-muted">
          <Link to="/">Dashboard</Link>
        </nav>
      </header>
      <main className="min-h-0 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
