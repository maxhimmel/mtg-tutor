"use client";

import { useRouter } from "next/navigation";
import { Authenticated, Unauthenticated, useMutation, useQuery } from "convex/react";
import { api } from "@mtg-tutor/backend";
import { useState } from "react";
import { AuthButton } from "./components/AuthButton";

export default function Home() {
  return (
    <main className="mx-auto max-w-[1500px] px-6 pb-16 pt-5">
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-4 border-b border-base-300 pb-3">
        <div className="text-lg font-bold tracking-tight">
          mtg<span className="text-primary">-</span>tutor
        </div>
        <AuthButton />
      </div>

      <Unauthenticated>
        <h1 className="mb-4 text-xl font-semibold">
          Practice drafting with 17Lands-based scoring
        </h1>
        <p className="mb-4 text-base-content/60">
          Drafts are saved to your account, so sign in to start one.
        </p>
        <a className="btn btn-primary btn-sm" href="/sign-in">
          Sign in
        </a>
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
      <h1 className="mb-4 text-xl font-semibold">Pick a set to draft</h1>

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

      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-4">
        {sets?.map((s) => (
          <button
            key={`${s.code}-${s.format}`}
            className="btn h-auto flex-col items-start gap-1 border-base-300 bg-base-200 p-4 text-left font-normal normal-case"
            onClick={() => start(s.code, s.format)}
            disabled={starting !== null}
          >
            <span className="text-lg font-bold tracking-wide">{s.code.toUpperCase()}</span>
            <span className="text-sm text-base-content/60">
              {s.cardCount} cards · {s.ratedCardCount} with 17Lands data
            </span>
            <span className="text-sm text-base-content/60">{s.format}</span>
            {starting === s.code && <span className="text-sm text-base-content/60">Starting…</span>}
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
