"use client";

import { useEffect } from "react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";

import { identify, signedOut } from "../lib/analytics";

/**
 * Puts a name to the events. Renders nothing.
 *
 * The id is WorkOS's `user.id`, which is the same string the backend uses as
 * distinctId -- roles.ts calls it "the WorkOS user id" and MTG_TUTOR_ROLES is
 * keyed on it. Deliberately NOT the tokenIdentifier that draftSessions.userId
 * holds: that one is `${issuer}|${subject}`, and using it here would file every
 * person twice, once per side of the app.
 *
 * The reset matters more than it looks. Without it the next person to use the
 * browser inherits the last one's identity, so two friends sharing a laptop
 * merge into one -- and that merge does not come apart afterwards.
 */
export function AnalyticsIdentity() {
  const { user } = useAuth();

  useEffect(() => {
    if (user) identify(user.id, user.email ?? undefined);
    else signedOut();
  }, [user]);

  return null;
}
