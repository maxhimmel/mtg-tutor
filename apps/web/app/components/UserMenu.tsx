"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { PICK_CEREMONIES, useSettings } from "../lib/useSettings";
import { useDismissable } from "../lib/useDismissable";

// 2 is "coach everything except the literally forced last card"; 9 stops at the
// halfway point of a Play Booster pack.
const COACH_THRESHOLDS = [2, 3, 5, 7, 9];

// One hue per player, all cut at the same lightness and chroma as the theme's
// accents (oklch 74% 0.105) so a signet always belongs to the chrome around it.
// DiceBear's own palette is a pastel wheel that reads as pasted on. Red is
// deliberately absent: the theme's warm end is the grade scale, and a red avatar
// would read as a bad pick rather than as a person.
const RING_COLORS = [
  "c9a658", // gold, hue 85
  "e29572", // copper, hue 45
  "79be87", // green, hue 150
  "48bfbf", // teal, hue 195
  "76b0eb", // blue, hue 250
  "ba9ae0", // violet, hue 305
].join(",");

// Concentric arcs cut from one hue -- the same thing a set symbol does for a
// card, done for a player. Always decorative: every place it appears, the label
// beside it or the trigger's aria-label already says whose account this is.
//
// Rendered by DiceBear rather than by us. Generating it here instead would mean
// bundling @dicebear/core, which is 78kB gzipped -- 56kB of it precompiled AJV
// validators that `new Style()` calls and so cannot be shaken out -- to draw a
// 32px mark. The two things we give up by fetching: the API pins no version
// below `10.x`, so an upstream redesign of `rings` would restyle every signet at
// once, and DiceBear does not promise uptime. Both are survivable for chrome; if
// either ever bites, the fix is to self-host their instance or vendor the marks,
// not to move the generator into the bundle.
//
// A plain <img>, not next/image: the optimizer passes SVG through untouched
// unless dangerouslyAllowSVG is set, so it would add configuration and a hop
// without shrinking anything. `block` matters -- an inline image leaves
// descender space under it, which would pad the trigger button below the mark
// and throw its outline ring off-centre.
function Signet({ seed, className }: { seed: string; className?: string }) {
  const src = `https://api.dicebear.com/10.x/rings/svg?seed=${encodeURIComponent(seed)}&ringColor=${RING_COLORS}`;
  return <img src={src} alt="" referrerPolicy="no-referrer" className={`block ${className ?? ""}`} />;
}

export function UserMenu() {
  const { user, loading, signOut } = useAuth();
  const { settings, update } = useSettings();
  const { open, setOpen, ref: menuRef } = useDismissable<HTMLDivElement>();

  if (loading) return <span className="text-base-content/60">…</span>;

  // A plain anchor, deliberately not next/link: /sign-in is a Route Handler that
  // 307s to WorkOS, and the client router cannot follow a cross-origin redirect
  // as an RSC payload -- it errors, then falls back to a full navigation. Worse,
  // Link's prefetch hits the route a second time and each hit mints a fresh PKCE
  // verifier cookie, so the two requests race to own it.
  if (!user) {
    return (
      <a className="btn btn-sm btn-primary" href="/sign-in">
        Sign in
      </a>
    );
  }

  const label = user.email ?? "Account";

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        className={`block cursor-pointer rounded-full outline-1 outline-offset-[3px] transition-[outline-color] focus-visible:outline-2 focus-visible:outline-primary ${
          open ? "outline-primary" : "outline-transparent hover:outline-base-content/30"
        }`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Account and settings for ${label}`}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <Signet seed={user.id} className="size-8" />
      </button>

      {/* Mounted only while open, and deliberately not daisyUI's `dropdown`:
          that hides its content with `:not(:focus-within) { display: none }`,
          so a trigger that still holds focus keeps the panel in the layout
          after it is "closed" -- an invisible 18rem box over the column below,
          swallowing hovers. Not daisyUI's `menu` either, whose child styling
          fights any row that is not a single link. */}
      {open && (
        <div className="popup-surface absolute right-0 top-full z-50 mt-2 flex w-72 flex-col gap-1 p-2">
          {/* The trigger no longer says who you are, so this is the one place
              the account is named. */}
          <div className="flex items-center gap-3 px-2 py-1.5">
            <Signet seed={user.id} className="size-9 shrink-0" />
            <span className="truncate text-sm">{label}</span>
          </div>

          <div className="mb-1 border-t border-base-300" />

          {/* First in the menu because it is the largest thing the app does
              differently, and because this menu is in the masthead of the draft
              board itself -- a player halfway through a pack who wants the other
              flow reaches it here, without leaving the draft. */}
          <div className="flex flex-col gap-1.5 px-2 py-1.5 text-sm">
            <span>Making a pick</span>
            <div
              className="flex rounded-lg bg-base-300 p-0.5"
              role="group"
              aria-label="What happens between choosing a card and the pick landing"
            >
              {PICK_CEREMONIES.map(({ id, label }) => {
                const selected = settings.pickCeremony === id;
                return (
                  <button
                    key={id}
                    type="button"
                    className={`flex-1 cursor-pointer rounded-md py-1 text-xs transition-colors ${
                      selected
                        ? "bg-primary font-semibold text-primary-content"
                        : "text-base-content/50 hover:bg-base-100 hover:text-base-content"
                    }`}
                    aria-pressed={selected}
                    onClick={() => update({ pickCeremony: id })}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {/* The blurb describes the one that is on, not all of them. Two
                descriptions side by side would be a comparison to read; this is
                a statement about what the next pick will ask of you. */}
            <span className="text-xs text-base-content/60">
              {PICK_CEREMONIES.find((c) => c.id === settings.pickCeremony)?.blurb}
            </span>
            <span className="text-xs text-base-content/45">
              Safe to change mid-draft — it applies to your next pick.
            </span>
          </div>

          <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg px-2 py-1.5 text-sm hover:bg-base-300">
            <span className="flex flex-col">
              <span>Guiderails</span>
              <span className="text-xs text-base-content/60">
                Show a card&apos;s draft data when you hover it, while drafting
              </span>
            </span>
            <input
              type="checkbox"
              className="toggle toggle-primary toggle-sm"
              checked={settings.guiderails}
              onChange={(e) => update({ guiderails: e.target.checked })}
              aria-label="Toggle guiderails (per-card draft data on hover)"
            />
          </label>

          {/* Not a <select>: a segmented control keeps every option visible and
            never leaves the page, so the menu cannot be dismissed by its own
            control. */}
          <div className="flex flex-col gap-1.5 px-2 py-1.5 text-sm">
            <span>AI coach</span>
            <span className="text-xs text-base-content/60">
              Skips picks with fewer than {settings.coachMinPackCards} cards left
            </span>
            <div
              className="flex rounded-lg bg-base-300 p-0.5"
              role="group"
              aria-label="Smallest pack the AI coach comments on"
            >
              {COACH_THRESHOLDS.map((n) => {
                const selected = settings.coachMinPackCards === n;
                return (
                  <button
                    key={n}
                    type="button"
                    className={`flex-1 cursor-pointer rounded-md py-1 text-xs tabular-nums transition-colors ${
                      selected
                        ? "bg-primary font-semibold text-primary-content"
                        : "text-base-content/50 hover:bg-base-100 hover:text-base-content"
                    }`}
                    aria-pressed={selected}
                    onClick={() => update({ coachMinPackCards: n })}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="my-1 border-t border-base-300" />

          <button
            type="button"
            className="cursor-pointer rounded-lg px-2 py-1.5 text-left text-sm hover:bg-base-300"
            onClick={() => signOut()}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
