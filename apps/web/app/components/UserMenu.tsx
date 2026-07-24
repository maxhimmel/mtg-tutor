"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { useSettings } from "../lib/useSettings";

export function UserMenu() {
  const { user, loading, signOut } = useAuth();
  const { settings, update } = useSettings();

  if (loading) return <span className="text-base-content/60">…</span>;

  // A plain anchor, deliberately not next/link: /sign-in is a Route Handler that
  // 307s to WorkOS, and the client router cannot follow a cross-origin redirect
  // as an RSC payload -- it errors, then falls back to a full navigation. Worse,
  // Link's prefetch hits the route a second time and each hit mints a fresh PKCE
  // verifier cookie, so the two requests race to own it.
  if (!user) {
    return (
      <a className="btn btn-sm btn-outline" href="/sign-in">
        Sign in
      </a>
    );
  }

  const label = user.email ?? "Account";

  return (
    <div className="dropdown dropdown-end">
      <div
        tabIndex={0}
        role="button"
        className="btn btn-sm btn-outline gap-2"
        aria-label={`Account and settings for ${label}`}
      >
        <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-content">
          {label.charAt(0).toUpperCase()}
        </span>
        <span className="hidden max-w-[16ch] truncate sm:inline">{label}</span>
      </div>

      {/* The dropdown opens on focus-within, so the toggle inside it can be
          clicked without the menu closing under the pointer. */}
      <ul
        tabIndex={0}
        className="menu dropdown-content z-50 mt-2 w-72 gap-1 rounded-box border border-base-300 bg-base-200 p-2 shadow-xl"
      >
        <li className="menu-title truncate">{label}</li>

        <li>
          <label className="flex cursor-pointer items-start justify-between gap-3">
            <span className="flex flex-col">
              <span>Guiderails</span>
              <span className="text-xs text-base-content/60">
                Show each card&apos;s win rate while drafting
              </span>
            </span>
            <input
              type="checkbox"
              className="toggle toggle-primary toggle-sm"
              checked={settings.guiderails}
              onChange={(e) => update({ guiderails: e.target.checked })}
              aria-label="Toggle guiderails (per-card win-rate hints)"
            />
          </label>
        </li>

        <li>
          <button onClick={() => signOut()}>Sign out</button>
        </li>
      </ul>
    </div>
  );
}
