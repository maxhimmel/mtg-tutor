"use client";

import { useCallback } from "react";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { AuthKitProvider, useAccessToken, useAuth } from "@workos-inc/authkit-nextjs/components";

// Built lazily rather than thrown at module scope: .env.local is gitignored, so
// a fresh clone (or CI) has no URL, and a module-level throw would fail the
// build instead of just the runtime that actually needs a backend.
const url = process.env.NEXT_PUBLIC_CONVEX_URL;
const convex = url ? new ConvexReactClient(url) : null;

// Bridges AuthKit's session into the shape Convex wants. The access token is a
// WorkOS-issued RS256 JWT that convex/auth.config.ts validates against WorkOS'
// JWKS, so no token is minted or stored on our side.
function useAuthFromAuthKit() {
  const { user, loading: isLoading } = useAuth();
  const { getAccessToken, refresh } = useAccessToken();

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken?: boolean } = {}) => {
      if (!user) return null;
      try {
        return (forceRefreshToken ? await refresh() : await getAccessToken()) ?? null;
      } catch {
        return null;
      }
    },
    [user, refresh, getAccessToken],
  );

  return { isLoading, isAuthenticated: !!user, fetchAccessToken };
}

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

  return (
    <AuthKitProvider>
      <ConvexProviderWithAuth client={convex} useAuth={useAuthFromAuthKit}>
        {children}
      </ConvexProviderWithAuth>
    </AuthKitProvider>
  );
}
