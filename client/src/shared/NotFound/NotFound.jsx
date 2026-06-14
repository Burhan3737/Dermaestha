// @ts-check
import { Link } from 'react-router-dom';

/** Dedicated 404 page for unknown SPA routes (ISSUE-8). Uses the doc 06 §1 empty-state pattern. */
export function NotFound() {
  return (
    <main className="container" style={{ padding: 'var(--sp-12) var(--sp-4)' }}>
      <div className="empty">
        <h1>Page not found</h1>
        <p className="help">The page you’re looking for doesn’t exist or has moved.</p>
        <Link className="btn btn--primary" to="/browse">
          Back to Browse
        </Link>
      </div>
    </main>
  );
}
