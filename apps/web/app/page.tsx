"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Authenticated, Unauthenticated, useMutation, useQuery } from "convex/react";
import { api } from "@mtg-tutor/backend";
import { useState } from "react";
import { AppHeader } from "./components/AppHeader";
import { SetIcon } from "./components/SetIcon";
import { releaseDate } from "./lib/format";

export default function Home() {
  return (
    <main className="mx-auto max-w-[1500px] px-6 pb-16 pt-5">
      <AppHeader />

      <Unauthenticated>
        <section className="max-w-2xl py-6">
          <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
            Every pick, graded.
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-base-content/70">
            Draft a real pack from any recent set. Every pick is scored against 17Lands
            win-rate data, and the coach tells you what you passed up.
          </p>
          <a className="btn btn-primary mt-7" href="/sign-in">
            Sign in
          </a>
          <p className="mt-4 text-sm text-base-content/60">
            Drafts save to your account. Or read the{" "}
            <Link href="/principles" className="link link-primary">
              draft principles
            </Link>{" "}
            the coach is grounded in — free, no account needed.
          </p>
        </section>
      </Unauthenticated>

      <Authenticated>
        <SetPicker />
      </Authenticated>
    </main>
  );
}

function SetPicker() {
  const sets = useQuery(api.sets.list);
  const startDraft = useMutation(api.draft.start);
  const router = useRouter();
  const [starting, setStarting] = useState<string | null>(null);

  async function start(setCode: string, format: string) {
    setStarting(setCode);
    try {
      const sessionId = await startDraft({ setCode, format });
      router.push(`/draft/${sessionId}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      setStarting(null);
    }
  }

  return (
    <>
      <h1 className="mb-5 font-display text-2xl font-semibold tracking-tight">
        Pick a set to draft
      </h1>

      {sets === undefined && <p className="text-base-content/60">Loading sets…</p>}

      {sets?.length === 0 && (
        <div role="alert" className="alert alert-warning my-4">
          <span>
            No sets ingested yet. Run{" "}
            <code>
              pnpm --filter @mtg-tutor/backend exec convex run sets:ingest
              {' \'{"setCode":"fdn"}\''}
            </code>{" "}
            to pull one in.
          </span>
        </div>
      )}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
        {sets?.map((s) => (
          <button
            key={`${s.code}-${s.format}`}
            type="button"
            className="group card relative cursor-pointer overflow-hidden border border-base-300 bg-base-200 p-4 text-left transition-colors hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => start(s.code, s.format)}
            disabled={starting !== null}
          >
            {/* A set symbol is the mark a set stamps on every card in it, so it
                gets to be the thing that identifies the set here too -- oversized
                and bled off the corner, behind the type rather than beside it. */}
            <SetIcon
              uri={s.iconUri}
              className="pointer-events-none absolute -right-4 -top-3 size-28 text-base-content/[0.07] transition-colors group-hover:text-primary/20"
            />

            <span className="relative flex flex-col gap-1">
              <span className="font-display text-lg font-semibold leading-tight">
                {s.name ?? s.code.toUpperCase()}
              </span>
              <span className="eyebrow">
                {s.code.toUpperCase()} · {s.format}
              </span>
              <span className="mt-2 text-sm tabular-nums text-base-content/60">
                {s.cardCount} cards · {s.ratedCardCount} with 17Lands data
              </span>
              <span className="text-sm text-base-content/60">
                {starting === s.code ? "Starting…" : releaseDate(s.releasedAt)}
              </span>
            </span>
          </button>
        ))}
      </div>

      {sets?.some((s) => s.ratedCardCount === 0) && (
        <div role="alert" className="alert alert-warning my-4">
          <span>
            Sets showing <strong>0 with 17Lands data</strong> will be scored on rarity
            baselines alone — 17Lands stops serving win rates once a set leaves rotation.
            Grades will be much less meaningful.
          </span>
        </div>
      )}
    </>
  );
}
