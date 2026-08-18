"use client";

import Link from "next/link";
import { Authenticated } from "convex/react";
import { PageShell } from "../../components/PageShell";
import { SignedOut } from "../../components/SignedOut";
import { MissesDrill } from "./MissesDrill";

export default function MissesPage() {
  return (
    <PageShell>
      <SignedOut>
        <section className="max-w-2xl py-6">
          <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight">
            Take the pick back.
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-base-content/70">
            The packs you got wrong, dealt again — the same fourteen cards, the same deck
            behind you, and no sign of what you took the first time. A few minutes rather
            than a whole draft.
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
        <MissesDrill />
      </Authenticated>
    </PageShell>
  );
}
