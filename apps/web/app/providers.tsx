"use client";

import { useCallback } from "react";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { AuthKitProvider, useAccessToken, useAuth } from "@workos-inc/authkit-nextjs/components";
import { env } from "./env";
import { SettingsProvider } from "./components/SettingsProvider";
import { HoverPreviewProvider } from "./components/CardPreview";

// No null-guard here any more. The URL is validated in ./env, so a missing one
// fails the build naming the variable rather than rendering a warning box that
// only appears once someone opens the page.
const convex = new ConvexReactClient(env.NEXT_PUBLIC_CONVEX_URL);

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
  return (
    <AuthKitProvider>
      <ConvexProviderWithAuth client={convex} useAuth={useAuthFromAuthKit}>
        <SettingsProvider>
          <HoverPreviewProvider>{children}</HoverPreviewProvider>
        </SettingsProvider>
      </ConvexProviderWithAuth>
    </AuthKitProvider>
  );
}
