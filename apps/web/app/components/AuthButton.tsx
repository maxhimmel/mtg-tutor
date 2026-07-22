"use client";

import Link from "next/link";
import { useAuth } from "@workos-inc/authkit-nextjs/components";

export function AuthButton() {
  const { user, loading, signOut } = useAuth();

  if (loading) return <span className="muted">…</span>;

  if (!user) {
    return (
      <Link className="authLink" href="/sign-in">
        Sign in
      </Link>
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
