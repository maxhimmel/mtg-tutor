"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { useDismissable } from "../lib/useDismissable";

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

/**
 * Who you are, and the way out. Nothing else.
 *
 * This used to also carry every setting the app has, which put the card stats,
 * the coach threshold and the pick ceremony two clicks away from the one screen
 * any of them affects, with their state unreadable until you opened it. They now
 * sit on the draft board as the terms of the table (see TableTerms), and the set
 * picker keeps its own view toggle -- so every setting in the app is on the
 * surface it changes, and this is an account menu again.
 */
export function UserMenu() {
  const { user, loading, signOut } = useAuth();
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
        aria-label={`Account for ${label}`}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        <Signet seed={user.id} className="size-8" />
      </button>

      {/* Mounted only while open, and deliberately not daisyUI's `dropdown`:
          that hides its content with `:not(:focus-within) { display: none }`,
          so a trigger that still holds focus keeps the panel in the layout
          after it is "closed" -- an invisible 16rem box over the column below,
          swallowing hovers. Not daisyUI's `menu` either, whose child styling
          fights any row that is not a single link. */}
      {open && (
        <div className="popup-surface absolute right-0 top-full z-50 mt-2 flex w-64 flex-col gap-1 p-2">
          {/* The trigger no longer says who you are, so this is the one place
              the account is named. */}
          <div className="flex items-center gap-3 px-2 py-1.5">
            <Signet seed={user.id} className="size-9 shrink-0" />
            <span className="truncate text-sm">{label}</span>
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
