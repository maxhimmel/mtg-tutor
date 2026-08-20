"use client";

import Link from "next/link";
import { Authenticated } from "convex/react";
import { PageShell } from "../components/PageShell";
import { SignedOut } from "../components/SignedOut";

// What there is to play, as opposed to what the category is called.
//
// The page still announces no heading over the games, and the reason has
// changed. It used to be that the word was undecided; it is decided now --
// "Practice" in the nav and in the route, "drills" only where a machine reads
// it -- and a heading saying "Practice" directly under a nav item saying
// "Practice" is a line of the largest type on the screen spent repeating the
// thing that got you here. The games still explain themselves.
//
// The events are the one place the old word survives, and deliberately: a
// PostHog event name cannot be repaired retroactively, so renaming `drill_*`
// would orphan every chart keyed on it and start a second, shorter history of
// the same thing.
//
// AND IT ASKS THE SERVER NOTHING. The obvious version of this page shows how
// many packs are waiting, which means dealing a run -- ten packs of card text,
// about 180KB -- to render a number somebody may not click. The count belongs
// on the drill itself, where it is the first thing you see and the read is one
// you were going to pay anyway.
//
// A row rather than a card in a grid. One card in a three-column grid reads as
// a dashboard with two tiles missing, and this is not a dashboard: it is a
// short list that gets longer.

const DRILLS = [
  {
    href: "/practice/misses",
    // Named for the thing it deals rather than the act it invites. "Take the
    // pick back" said what you DO and left the route -- and the Results screen's
    // own "Biggest missed picks" panel -- using a word the link never did, so a
    // person who had just read that panel had nothing to connect it to.
    name: "Missed picks",
    what: "The packs you got wrong, dealt again — the same cards, the same deck behind you, and no sign of what you took the first time.",
    length: "10 packs · a few minutes",
  },
];

export default function DrillsIndex() {
  return (
    <PageShell>
      <SignedOut>
        <section className="max-w-2xl py-6">
          <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight">
            A few minutes,
            <br />
            one thing at a time.
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-base-content/70">
            Short sessions built out of your own drafts — starting with the packs you got
            wrong, dealt back one at a time.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a className="btn btn-primary" href="/sign-in">
              Sign in
            </a>
            <Link href="/sign-up" className="btn btn-outline">
              Ask for an invite
            </Link>
          </div>
          <p className="mt-4 text-sm text-base-content/60">
            Accounts are invite only while this is in beta.
          </p>
        </section>
      </SignedOut>

      <Authenticated>
        <ul className="flex flex-col">
          {DRILLS.map((drill) => (
            <li key={drill.href} className="border-b border-base-300 last:border-0">
              <Link
                href={drill.href}
                className="group flex flex-wrap items-baseline gap-x-6 gap-y-2 py-6 no-underline"
              >
                <h2 className="font-display text-2xl font-semibold tracking-tight transition-colors group-hover:text-primary">
                  {drill.name}
                </h2>
                <span className="eyebrow shrink-0">{drill.length}</span>
                <p className="w-full max-w-prose leading-relaxed text-base-content/70">
                  {drill.what}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </Authenticated>
    </PageShell>
  );
}
