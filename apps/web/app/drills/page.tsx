"use client";

import Link from "next/link";
import { Authenticated, useQuery } from "convex/react";
import { api } from "@mtg-tutor/backend";
import { PageShell } from "../components/PageShell";
import { Panel } from "../components/Panel";
import { SignedOut } from "../components/SignedOut";

// What there is to play, as opposed to what the category is called.
//
// The page names the games and never announces a heading over them, because the
// word for the category is not settled -- "drills" is what the code, the routes
// and the events call it, and whether that is the word a person should read is a
// separate decision that costs nothing to change later. A page that leads with
// the category name would put that undecided word in the largest type on the
// screen for no benefit; the games explain themselves.

export default function DrillsIndex() {
  return (
    <PageShell>
      <SignedOut>
        <section className="max-w-2xl py-6">
          <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight">
            A few minutes, one skill.
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-base-content/70">
            Short sessions built out of your own drafts — the packs you got wrong, dealt
            back one at a time.
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
        <Games />
      </Authenticated>
    </PageShell>
  );
}

function Games() {
  // What it would deal right now, so the card can say whether there is anything
  // to play rather than sending somebody to an empty screen to find out. The
  // question objects come with it -- a run is ten packs, which is the cost of
  // knowing, and it is the same query the drill itself subscribes to, so
  // clicking through pays for nothing twice.
  const run = useQuery(api.drills.misses.deal, {});

  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Panel title="Take the pick back" bodyClassName="gap-3">
        <p className="text-sm leading-relaxed text-base-content/70">
          The packs you got wrong, dealt again — same cards, same deck behind you, no sign
          of what you took the first time.
        </p>
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-base-300 pt-3">
          <span className="text-sm tabular-nums text-base-content/50">
            {run === undefined
              ? "…"
              : run.questions.length === 0
                ? "nothing waiting"
                : `${run.questions.length} waiting`}
          </span>
          <Link href="/drills/misses" className="btn btn-sm btn-primary">
            Play
          </Link>
        </div>
      </Panel>
    </section>
  );
}
