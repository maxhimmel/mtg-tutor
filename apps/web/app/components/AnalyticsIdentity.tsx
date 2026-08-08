"use client";

import { useEffect } from "react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";

import { identify, signInRestarted, signedOut } from "../lib/analytics";
import { SIGN_IN_RESTARTED_COOKIE } from "../lib/signInRestart";

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

  // Second, and it has to stay second: the effect above runs first, so the
  // event is filed against the friend it happened to rather than against an
  // anonymous browser id that never merges with them. Gated on `user` for the
  // same reason -- a restart that landed signed in is the only one worth
  // reporting, and anything else surfaces as a callback error already.
  useEffect(() => {
    if (!user) return;
    const present = document.cookie
      .split("; ")
      .some((c) => c.startsWith(`${SIGN_IN_RESTARTED_COOKIE}=`));
    if (!present) return;
    document.cookie = `${SIGN_IN_RESTARTED_COOKIE}=; path=/; max-age=0`;
    signInRestarted();
  }, [user]);

  return null;
}
