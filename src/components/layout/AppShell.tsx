import { Suspense } from 'react';
import { Link, Outlet } from 'react-router';

// Hoisted out of the tree: an inline element would be a fresh object on every render of the shell.
const ROUTE_LOADING_FALLBACK = <p className="p-4 text-sm text-muted">Loading…</p>;

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
        {/* Around the outlet rather than around one route, so the header and its navigation stay on
            screen while a split route's chunk loads, and any route split later is already covered. */}
        <Suspense fallback={ROUTE_LOADING_FALLBACK}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
