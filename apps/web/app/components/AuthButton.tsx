"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";

export function AuthButton() {
  const { user, loading, signOut } = useAuth();

  if (loading) return <span className="muted">…</span>;

  // A plain anchor, deliberately not next/link: /sign-in is a Route Handler that
  // 307s to WorkOS, and the client router cannot follow a cross-origin redirect
  // as an RSC payload -- it errors, then falls back to a full navigation. Worse,
  // Link's prefetch hits the route a second time and each hit mints a fresh PKCE
  // verifier cookie, so the two requests race to own it.
  if (!user) {
    return (
      <a className="authLink" href="/sign-in">
        Sign in
      </a>
    );
  }

  return (
    <span className="authBox">
      <span className="muted">{user.email}</span>
      <button className="authLink" onClick={() => signOut()}>
        Sign out
      </button>
    </span>
  );
}
