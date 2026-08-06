"use client";

import { useCallback } from "react";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { AuthKitProvider, useAccessToken, useAuth } from "@workos-inc/authkit-nextjs/components";
import { env } from "./env";
import { SettingsProvider } from "./components/SettingsProvider";
import { HoverPreviewProvider } from "./components/CardPreview";
import { FeedbackProvider } from "./components/Feedback";
import { AnalyticsIdentity } from "./components/AnalyticsIdentity";

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
      {/*
        Inside AuthKitProvider because it reads useAuth, and above everything
        else because it renders nothing and only has to run once per session.
      */}
      <AnalyticsIdentity />
      <ConvexProviderWithAuth client={convex} useAuth={useAuthFromAuthKit}>
        <SettingsProvider>
          {/*
            Inside ConvexProviderWithAuth because it writes through useMutation
            and gates its button on being signed in, and outside
            HoverPreviewProvider because the card preview has nothing to say to
            it -- the two only meet at z-index, which the <dialog> settles by
            rendering in the browser's top layer.
          */}
          <FeedbackProvider>
            <HoverPreviewProvider>{children}</HoverPreviewProvider>
          </FeedbackProvider>
        </SettingsProvider>
      </ConvexProviderWithAuth>
    </AuthKitProvider>
  );
}
