"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { useConvexAuth } from "convex/react";

import { authRecovered, authStalled } from "../lib/analytics";

/**
 * Watches the seam between the two auth systems. Renders nothing.
 *
 * WorkOS says signed in, Convex says signed out: a state neither side can see
 * on its own, and the only place both are readable is here, between the
 * providers. See app/providers.tsx for what causes it and how it recovers.
 *
 * Here rather than in the component that draws the stalled screen, for two
 * reasons. That component lives inside `<Unauthenticated>`, so it is unmounted
 * by the very event it would need to report -- it can announce the stall and
 * never its end. And the draft board does not draw a stalled screen at all; it
 * just starts failing picks, which is the expensive case and would otherwise be
 * the one case that went uncounted.
 */
export function AuthStall() {
  const { user, loading } = useAuth();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const pathname = usePathname() ?? "/";

  // Where and when it started, kept together because both events report the
  // route the stall began on. Somebody who navigates while stuck is still stuck
  // on the screen that first refused them, and moving the label to wherever
  // they landed would file it against the wrong surface.
  const stall = useRef<{ at: number; route: string } | null>(null);

  const stalled = !loading && !!user && !isLoading && !isAuthenticated;

  useEffect(() => {
    if (stalled) {
      if (stall.current) return;
      stall.current = { at: Date.now(), route: pathname };
      authStalled({ route: pathname });
      return;
    }

    if (!stall.current) return;
    // Only a return to authenticated is a recovery. The other way out of a
    // stall is signing out, which resolves the disagreement without fixing
    // anything, and counting it would flatter the number this exists to test.
    if (isAuthenticated) {
      authRecovered({ route: stall.current.route, stalledMs: Date.now() - stall.current.at });
    }
    stall.current = null;
  }, [stalled, isAuthenticated, pathname]);

  return null;
}
