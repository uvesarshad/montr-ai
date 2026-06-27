'use client';

import { useEffect } from 'react';

// `global-error.tsx` replaces the entire `<html>`/`<body>` shell when an
// uncaught error escapes the root layout. Without this file Next.js falls back
// to a blank white page on render-time errors anywhere in the tree.
//
// Keep this component as self-contained as possible — it must render without
// depending on providers, theme, or any context, because the surrounding
// providers may be the thing that crashed.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to Sentry if it's wired up. Best-effort — never throw from here.
    try {
      const sentry = (globalThis as { Sentry?: { captureException?: (err: unknown) => void } }).Sentry;
      sentry?.captureException?.(error);
    } catch {
      // ignore
    }
    // Always log to console so devtools / server logs catch it.
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', backgroundColor: '#0a0a0a', color: '#fafafa' }}>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div style={{ maxWidth: 480, textAlign: 'center' }}>
            <p style={{ fontSize: '0.875rem', color: '#a1a1aa', margin: 0 }}>
              Something broke
            </p>
            <h1
              style={{
                fontSize: '1.75rem',
                fontWeight: 600,
                margin: '0.5rem 0 1rem',
                letterSpacing: '-0.01em',
              }}
            >
              We hit an unexpected error
            </h1>
            <p style={{ color: '#a1a1aa', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              The team has been notified. You can try again, or head back to the
              dashboard.
            </p>
            {error?.digest && (
              <p
                style={{
                  fontFamily: 'ui-monospace, monospace',
                  fontSize: '0.75rem',
                  color: '#71717a',
                  marginBottom: '1.5rem',
                }}
              >
                Reference: {error.digest}
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
              <button
                onClick={reset}
                style={{
                  padding: '0.5rem 1rem',
                  background: '#fafafa',
                  color: '#0a0a0a',
                  borderRadius: '0.375rem',
                  border: 'none',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Try again
              </button>
              <a
                href="/dashboard"
                style={{
                  padding: '0.5rem 1rem',
                  background: 'transparent',
                  color: '#fafafa',
                  borderRadius: '0.375rem',
                  border: '1px solid #3f3f46',
                  fontWeight: 500,
                  textDecoration: 'none',
                }}
              >
                Back to dashboard
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
