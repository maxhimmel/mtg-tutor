"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@mtg-tutor/backend";
import { UserMenu } from "./UserMenu";
import { NavDrawer, NavDrawerRow } from "./NavDrawer";
import { useDismissable } from "../lib/useDismissable";
import { navOpened } from "../lib/analytics";

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
//
// TWO PRESENTATIONS, ONE LIST. From `sm` up the sections are the inline row
// below. Under it they are NavDrawer, because the row needs 468px and a 375px
// phone leaves 327px -- it used to simply hang 116px off the right of every
// page on every route, which is a navigation surface partly out of reach and a
// Level AA failure of SC 1.4.10, written at 320px and so stricter than the
// width it was found at. Both presentations read this array, so a section
// cannot exist on one and not the other.
const NAV = [
  { href: "/", label: "Draft", match: (p: string) => p === "/" || p.startsWith("/draft") },
  { href: "/review", label: "Review", match: (p: string) => p.startsWith("/review") },
  { href: "/stats", label: "Stats", match: (p: string) => p.startsWith("/stats") },
  // "Practice" everywhere a person reads, "drills" everywhere a machine does.
  // The label and the route now agree; the EVENTS still say `drill_*` and
  // always will, because an event name cannot be repaired retroactively and a
  // chart keyed on the old one would silently become a chart of nothing. That
  // is the one mismatch left, and it is the one that costs nothing: nobody
  // reads an event name.
  { href: "/practice", label: "Practice", match: (p: string) => p.startsWith("/practice") },
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
  // The ref goes on the header rather than on the drawer, so a tap on the
  // masthead beside the trigger closes the panel the way a tap on the page
  // does. Escape and click-away come with the hook; the overlay and every row
  // close it themselves.
  const { open, setOpen, ref } = useDismissable<HTMLElement>();

  // A row you tapped has already taken you somewhere, so leaving the panel over
  // the new page would make every navigation cost two gestures.
  useEffect(() => setOpen(false), [pathname, setOpen]);

  return (
    <header
      ref={ref}
      className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-base-300"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
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

        {/* Below `sm` this row is replaced by NavDrawer, not folded: it needs
            468px and the widest phone this app draws for leaves 327px. `sm` is
            a NAMED breakpoint on purpose -- the row genuinely fits from 516px
            up, but Tailwind emits every arbitrary `min-[...]` variant BEFORE
            the named blocks, so a `min-[516px]:` here would lose to any named
            variant it met. That cascade cost the draft board 324px off the
            screen once already. */}
        <nav className="hidden items-center gap-x-5 sm:flex" aria-label="Sections">
          {NAV.map((item) => {
            const here = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={here ? "page" : undefined}
                // The marker is a segment of the header's own bottom rule, drawn
                // in parchment rather than gold, and that is true only where the
                // row is inline -- from `sm` up. The drawer's rows carry a left
                // rule instead, because a bottom-rule segment away from the
                // bottom rule is just an underline. Gold in this app means the
                // thing you are holding or the choice you have made -- a card
                // pulled out of the pack, the ceremony you picked. Where you
                // happen to be standing is not that, and colouring it gold would
                // make four of them, one of which is always lit.
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

      <div className="flex items-center gap-x-2">
        {/* One NAV array, two presentations, so the sections cannot drift apart
            -- which is the failure a second hand-kept list would eventually
            produce. */}
        <NavDrawer
          open={open}
          setOpen={(next) => {
            if (next) navOpened({ from: pathname });
            setOpen(next);
          }}
        >
          {NAV.map((item) => (
            <NavDrawerRow
              key={item.href}
              href={item.href}
              here={item.match(pathname)}
              onNavigate={() => setOpen(false)}
            >
              {item.label}
              {item.badge === true && <UnreadBadge />}
            </NavDrawerRow>
          ))}
        </NavDrawer>
        <UserMenu />
      </div>
    </header>
  );
}
