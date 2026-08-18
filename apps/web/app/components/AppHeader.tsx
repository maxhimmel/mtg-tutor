"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@mtg-tutor/backend";
import { UserMenu } from "./UserMenu";

// The app's frame, and only that. It used to take a `children` slot for the
// per-page middle -- the draft's counters, the review's score and quiz toggle --
// which made it a different shape on every page and left it reading as half
// navbar, half toolbar. Page state and page controls now live in the page, under
// PageHeading; this says where you are in the app and nothing else.
//
// `/` is the set picker, which is where a draft starts, so it is named Draft
// rather than left to the wordmark. That also separates it from Principles,
// which as "Draft principles" sat next to Review looking like a second verb.
//
// Stats sits next to Review because the two are the same subject at two scales
// -- one draft read back, or all of them averaged -- and because a screen the
// app never links to is a screen nobody has.
const NAV = [
  { href: "/", label: "Draft", match: (p: string) => p === "/" || p.startsWith("/draft") },
  { href: "/review", label: "Review", match: (p: string) => p.startsWith("/review") },
  { href: "/stats", label: "Stats", match: (p: string) => p.startsWith("/stats") },
  // "Practice" rather than "Drills", which is what the code, the routes and the
  // events call it. The two do not have to agree: an event name can never be
  // repaired retroactively and a nav label can be changed this afternoon, so the
  // internal word is locked and the read one is not.
  { href: "/drills", label: "Practice", match: (p: string) => p.startsWith("/drills") },
  {
    href: "/challenge",
    label: "Challenges",
    match: (p: string) => p.startsWith("/challenge"),
    badge: true,
  },
  { href: "/principles", label: "Principles", match: (p: string) => p.startsWith("/principles") },
  { href: "/glossary", label: "Glossary", match: (p: string) => p.startsWith("/glossary") },
];

/**
 * The count of finished challenges nobody has looked at.
 *
 * The one place gold is allowed to mean "where you are" and does not: this is a
 * thing waiting for you, which is the same sense as a card pulled out of a pack
 * -- something of yours, held. The nav marker beside it stays parchment.
 *
 * Skipped rather than gated in a wrapper, because the masthead renders above
 * `<Authenticated>` on every page and a query fired into the gap while AuthKit
 * is still fetching a token answers "you need to be signed in" for a badge.
 */
function UnreadBadge() {
  const { isAuthenticated } = useConvexAuth();
  const count = useQuery(api.challenges.unread, isAuthenticated ? {} : "skip");

  if (!count) return null;

  return (
    <span className="badge badge-xs badge-primary" aria-label={`${count} finished`}>
      {count}
    </span>
  );
}

export function AppHeader() {
  const pathname = usePathname() ?? "/";

  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-x-6 border-b border-base-300">
      <div className="flex flex-wrap items-center gap-x-6">
        {/* Pack one, pick one: the coordinate every draft opens on, and the
            only one the whole format argues about.

            The two halves are a pack and a pick, and the gold goes on the pick
            -- which is not decoration but the app's own rule applied to its
            name. Gold here means the choice you made or the card you are
            holding (see the nav marker below, which is deliberately not gold),
            and a pick is the only thing in "P1P1" that is a choice.

            Nothing separates the halves but that colour. Spoken it is one word,
            and a dot or a space between them would make it a filename. The
            tracking that the old lowercase wordmark carried comes off for the
            same reason it went on: four alternating letters and figures need
            the room, where nine tight lowercase letters needed closing up. */}
        <Link
          href="/"
          className="py-3 font-display text-xl font-semibold text-base-content no-underline"
        >
          P1<span className="text-primary">P1</span>
        </Link>

        <nav className="flex items-center gap-x-5" aria-label="Sections">
          {NAV.map((item) => {
            const here = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={here ? "page" : undefined}
                // The marker is a segment of the header's own bottom rule, drawn
                // in parchment rather than gold. Gold in this app means the thing
                // you are holding or the choice you have made -- a card pulled
                // out of the pack, the ceremony you picked. Where you happen to
                // be standing is not that, and colouring it gold would make four
                // of them, one of which is always lit.
                className={`-mb-px border-b-2 py-3 text-sm no-underline transition-colors ${
                  here
                    ? "border-base-content/70 text-base-content"
                    : "border-transparent text-base-content/55 hover:text-base-content"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {item.label}
                  {item.badge === true && <UnreadBadge />}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      <UserMenu />
    </header>
  );
}
