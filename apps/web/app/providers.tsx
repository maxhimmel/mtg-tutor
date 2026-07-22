"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";

// Built lazily rather than thrown at module scope: .env.local is gitignored, so
// a fresh clone (or CI) has no URL, and a module-level throw would fail the
// build instead of just the runtime that actually needs a backend.
const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = url ? new ConvexReactClient(url) : null;

// Plain ConvexProvider for now. When WorkOS lands this becomes
// ConvexProviderWithAuth -- the draft functions already scope by identity.
export function ConvexClientProvider({ children }: { children: React.ReactNode }) {
  if (!convex) {
    return (
      <main className="shell">
        <div className="warn">
          <strong>NEXT_PUBLIC_CONVEX_URL is not set.</strong> Copy{" "}
          <code>apps/web/.env.example</code> to <code>apps/web/.env.local</code> and fill
          it in from <code>packages/backend/.env.local</code>.
        </div>
      </main>
    );
  }

  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
