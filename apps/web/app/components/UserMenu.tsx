"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { useSettings } from "../lib/useSettings";

// 2 is "coach everything except the literally forced last card"; 9 stops at the
// halfway point of a Play Booster pack.
const COACH_THRESHOLDS = [2, 3, 5, 7, 9];

export function UserMenu() {
  const { user, loading, signOut } = useAuth();
  const { settings, update } = useSettings();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // daisyUI's dropdown opens on :focus-within, which cannot survive a control
  // that takes focus out of the document -- a native <select> opens an OS-level
  // popup and the whole menu collapses under it. Owning the open state instead
  // means anything at all can live in here.
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

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
    <div ref={menuRef} className={`dropdown dropdown-end ${open ? "dropdown-open" : ""}`}>
      <button
        type="button"
        className="btn btn-sm btn-outline gap-2"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Account and settings for ${label}`}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-content">
          {label.charAt(0).toUpperCase()}
        </span>
        <span className="hidden max-w-[16ch] truncate sm:inline">{label}</span>
      </button>

      {/* A settings panel rather than daisyUI's `menu`, whose child styling
          fights anything that is not a single link per row. */}
      <div className="popup-surface dropdown-content z-50 mt-2 flex w-72 flex-col gap-1 p-2">
        <div className="truncate px-2 py-1 text-xs text-base-content/60">{label}</div>

        <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-base-300">
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

        {/* Not a <select>: a segmented control keeps every option visible and
            never leaves the page, so the menu cannot be dismissed by its own
            control. */}
        <div className="flex flex-col gap-1.5 px-2 py-1.5 text-sm">
          <span>AI coach</span>
          <span className="text-xs text-base-content/60">
            Skip picks with fewer cards left than this
          </span>
          <div
            className="join w-full"
            role="group"
            aria-label="Smallest pack the AI coach comments on"
          >
            {COACH_THRESHOLDS.map((n) => (
              <button
                key={n}
                type="button"
                className={`btn join-item btn-xs flex-1 ${
                  settings.coachMinPackCards === n ? "btn-primary" : "btn-outline"
                }`}
                aria-pressed={settings.coachMinPackCards === n}
                onClick={() => update({ coachMinPackCards: n })}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <div className="my-1 border-t border-base-300" />

        <button
          type="button"
          className="rounded-lg px-2 py-1.5 text-left text-sm hover:bg-base-300"
          onClick={() => signOut()}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
