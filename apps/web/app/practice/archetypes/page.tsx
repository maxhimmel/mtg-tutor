"use client";

import Link from "next/link";
import { Authenticated } from "convex/react";
import { PageShell } from "../../components/PageShell";
import { SignedOut } from "../../components/SignedOut";
import { ArchetypeQuiz } from "./ArchetypeQuiz";

export default function ArchetypesPage() {
  return (
    <PageShell>
      <SignedOut>
        <section className="max-w-2xl py-6">
          <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight">
            Which deck wants it?
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-base-content/70">
            One card, two decks that both played it, and one of them got a lot more
            out of it. Learn what each deck in a set is actually after — from what
            the decks did, not from what anyone says they do.
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
        <ArchetypeQuiz />
      </Authenticated>
    </PageShell>
  );
}
