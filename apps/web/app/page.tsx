"use client";

import { useRouter } from "next/navigation";
import { Authenticated, Unauthenticated, useMutation, useQuery } from "convex/react";
import { api } from "@mtg-tutor/backend";
import { useState } from "react";
import { AuthButton } from "./components/AuthButton";

export default function Home() {
  return (
    <main className="shell">
      <div className="topbar">
        <div className="brand">
          mtg<span>-</span>tutor
        </div>
        <AuthButton />
      </div>

      <Unauthenticated>
        <h1 style={{ fontSize: "1.3rem", margin: "0 0 1rem" }}>
          Practice drafting with 17Lands-based scoring
        </h1>
        <p className="muted" style={{ marginBottom: "1rem" }}>
          Drafts are saved to your account, so sign in to start one.
        </p>
        <a className="authLink" href="/sign-in">
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
      <h1 style={{ fontSize: "1.3rem", margin: "0 0 1rem" }}>Pick a set to draft</h1>

      {sets === undefined && <p className="muted">Loading sets…</p>}

      {sets?.length === 0 && (
        <div className="warn">
          No sets ingested yet. Run{" "}
          <code>
            pnpm --filter @mtg-tutor/backend exec convex run sets:ingest
            {' \'{"setCode":"fdn"}\''}
          </code>{" "}
          to pull one in.
        </div>
      )}

      <div className="sets">
        {sets?.map((s) => (
          <button
            key={`${s.code}-${s.format}`}
            className="setCard"
            onClick={() => start(s.code, s.format)}
            disabled={starting !== null}
          >
            <span className="code">{s.code.toUpperCase()}</span>
            <span className="meta">
              {s.cardCount} cards · {s.ratedCardCount} with 17Lands data
            </span>
            <span className="meta">{s.format}</span>
            {starting === s.code && <span className="meta">Starting…</span>}
          </button>
        ))}
      </div>

      {sets?.some((s) => s.ratedCardCount === 0) && (
        <div className="warn">
          Sets showing <strong>0 with 17Lands data</strong> will be scored on rarity
          baselines alone — 17Lands stops serving win rates once a set leaves rotation.
          Grades will be much less meaningful.
        </div>
      )}
    </>
  );
}
