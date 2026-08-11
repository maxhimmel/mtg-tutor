"use client";

import type { ReactNode } from "react";
import { Unauthenticated } from "convex/react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";

/**
 * Signed-out copy, shown only to people who are actually signed out.
 *
 * `<Unauthenticated>` alone is not that test. It answers for Convex, which
 * decides on a token, and a token that failed to arrive reads there exactly
 * like a session that does not exist -- so the landing page gets shown to
 * somebody whose avatar is in the masthead above it, inviting them to sign in
 * to an account they are already using. WorkOS is the authority on whether
 * there is a session at all, so it settles which of the two this is.
 *
 * The three pages that use this are the three with signed-out copy to protect.
 * On /review and /challenge that copy is unreachable by design -- neither is in
 * the middleware's unauthenticatedPaths, so a real visitor without a session
 * bounces to WorkOS long before it renders -- which means until now those
 * screens appeared for one reason only, and it was this bug.
 */
export function SignedOut({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return <Unauthenticated>{user ? <Reconnecting /> : children}</Unauthenticated>;
}

/**
 * The way out, beside the thing that refused -- the same shape as a refused
 * pick or a refused draft. It recovers on its own within a second or two, so
 * the button is not the plan; it is for the failure that never resolves, a tab
 * holding a build that no longer exists, where nothing but a reload can help
 * and nothing on the page would say so.
 */
function Reconnecting() {
  return (
    <p className="py-6 text-base-content/60">
      Reconnecting…{" "}
      <button
        type="button"
        className="link link-primary cursor-pointer"
        onClick={() => window.location.reload()}
      >
        Reload
      </button>
    </p>
  );
}
