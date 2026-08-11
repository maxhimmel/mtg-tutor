"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

// How long to wait before asking Convex to try the token again, and the ceiling
// that wait climbs to. The ceiling is not ours: it is RETRY_DELAY_SECONDS in
// AuthKit's own token store, which schedules exactly this retry on exactly this
// cadence when a refresh fails. A session that is genuinely gone therefore
// settles into the library's rhythm instead of a second one we invented.
const RETRY_MIN_MS = 1_000;
const RETRY_MAX_MS = 300_000;

/**
 * Bridges AuthKit's session into the shape Convex wants. The access token is a
 * WorkOS-issued RS256 JWT that convex/auth.config.ts validates against WorkOS'
 * JWKS, so no token is minted or stored on our side.
 *
 * The retry is the whole reason this is more than four lines.
 *
 * `fetchAccessToken` has to swallow the throw: `client.setAuth` fires
 * `setConfig` as a floating promise, and `setConfig` PAUSES THE SOCKET before
 * fetching and resumes after -- so an error escaping this function leaves the
 * WebSocket paused for the life of the page. Returning null is the only safe
 * answer. But null is also how Convex is told "there is no session", and it
 * acts on that permanently: two nulls in a row (the fetch, then a forced
 * refresh) drop the client into `noAuth`, where nothing retries and nothing
 * re-enters. One dropped request -- a dev server restarting, a deploy landing
 * under an open tab, a laptop asleep through a scheduled token refresh -- and
 * the tab is signed out until somebody reloads it, with the avatar still in the
 * masthead because AuthKit's session is untouched.
 *
 * The only way back in is React re-running Convex's own effect, whose deps
 * include this callback. So a failed fetch schedules a bump of `attempt`, that
 * remakes the callback, and Convex calls `setAuth` again from scratch --
 * `setConfig` opens with `resetAuthState()`, so a `noAuth` client comes back.
 *
 * `accessToken` from useAccessToken() is deliberately NOT a dependency, though
 * it looks like a free win: the token store recovers on its own wake listeners
 * and we would hear about it without a timer. Its identity also changes on
 * every healthy five-minute refresh, which would spend a socket pause and a
 * re-auth round trip on a client that is working perfectly well.
 */
function useAuthFromAuthKit() {
  const { user, loading: isLoading } = useAuth();
  const { getAccessToken, refresh } = useAccessToken();

  const [attempt, setAttempt] = useState(0);
  const backoff = useRef(RETRY_MIN_MS);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current);
    },
    [],
  );

  const scheduleRetry = useCallback(() => {
    // Both halves of a failure -- the initial fetch and the forced refresh
    // Convex follows it with -- land here, and they are one outage, not two.
    if (pending.current) return;
    const delay = backoff.current;
    backoff.current = Math.min(delay * 2, RETRY_MAX_MS);
    pending.current = setTimeout(() => {
      pending.current = null;
      setAttempt((n) => n + 1);
    }, delay);
  }, []);

  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken?: boolean } = {}) => {
      if (!user) return null;
      try {
        const token = (forceRefreshToken ? await refresh() : await getAccessToken()) ?? null;
        if (token) backoff.current = RETRY_MIN_MS;
        return token;
      } catch {
        scheduleRetry();
        return null;
      }
    },
    // `attempt` is unused in the body on purpose: it is here to change this
    // function's identity, which is the signal Convex retries on.
    [user, refresh, getAccessToken, scheduleRetry, attempt],
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
