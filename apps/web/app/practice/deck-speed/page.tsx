"use client";

import Link from "next/link";
import { Authenticated } from "convex/react";
import { PageShell } from "../../components/PageShell";
import { SignedOut } from "../../components/SignedOut";
import { DeckSpeedQuiz } from "./DeckSpeedQuiz";

export default function DeckSpeedPage() {
  return (
    <PageShell>
      <SignedOut>
        <section className="max-w-2xl py-6">
          <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight">
            How fast is this card&rsquo;s deck?
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-base-content/70">
            One card, and whether the decks that played it were trying to end the game
            early, go long, or neither. Measured from how long the games actually
            ran — not from what anyone says the card is for.
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
        <DeckSpeedQuiz />
      </Authenticated>
    </PageShell>
  );
}
