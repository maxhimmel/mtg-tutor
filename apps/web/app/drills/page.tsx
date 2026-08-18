"use client";

import Link from "next/link";
import { Authenticated } from "convex/react";
import { PageShell } from "../components/PageShell";
import { SignedOut } from "../components/SignedOut";

// What there is to play, as opposed to what the category is called.
//
// The page never announces a heading over the games, because the word for the
// category is not settled -- "drills" is what the code, the routes and the
// events call it, and whether that is the word a person should read is a
// separate decision that costs nothing to change later. Leading with an
// undecided word in the largest type on the screen buys nothing; the games
// explain themselves.
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
    href: "/drills/misses",
    name: "Take the pick back",
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
