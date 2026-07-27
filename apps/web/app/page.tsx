"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Authenticated, Unauthenticated, useMutation, useQuery } from "convex/react";
import { api } from "@mtg-tutor/backend";
import { useState } from "react";
import { AppHeader } from "./components/AppHeader";
import { SetPlate, type SetSummary } from "./components/SetPlate";

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

// `sets.list` already sorts newest first, so a set's year band is just a run of
// neighbours sharing a release year -- no regrouping, and the bands come out in
// the same order the list is in. Release year is how drafters index formats
// ("the 2022 sets"), which is why the page is banded by it rather than by
// anything invented for the layout.
function byYear(sets: SetSummary[]): { year: string; sets: SetSummary[] }[] {
  const bands: { year: string; sets: SetSummary[] }[] = [];
  for (const set of sets) {
    const year = set.releasedAt?.slice(0, 4) ?? "Undated";
    const last = bands.at(-1);
    if (last?.year === year) last.sets.push(set);
    else bands.push({ year, sets: [set] });
  }
  return bands;
}

function SetPicker() {
  const sets = useQuery(api.sets.list);
  const startDraft = useMutation(api.draft.start);
  const router = useRouter();
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function start(setCode: string, format: string) {
    setStarting(setCode);
    setError(null);
    try {
      const sessionId = await startDraft({ setCode, format });
      router.push(`/draft/${sessionId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStarting(null);
    }
  }

  return (
    <>
      <div className="mb-8 max-w-xl">
        <h1 className="font-display text-3xl font-semibold tracking-tight">
          Pick a format
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-base-content/60">
          Each set shows the two-colour pair that wins most in it — the lane to beat.
        </p>
      </div>

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

      {error && (
        <div role="alert" className="alert alert-error my-4">
          <span>Couldn&rsquo;t start that draft. {error}</span>
        </div>
      )}

      <div className="flex flex-col gap-10">
        {byYear(sets ?? []).map((band) => (
          <section key={band.year}>
            <h2 className="eyebrow mb-4 flex items-center gap-4 tabular-nums">
              {band.year}
              <span className="h-px flex-1 bg-base-300" />
            </h2>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2">
              {band.sets.map((s) => (
                <SetPlate
                  key={`${s.code}-${s.format}`}
                  set={s}
                  starting={starting === s.code}
                  dimmed={starting !== null && starting !== s.code}
                  onStart={() => start(s.code, s.format)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {sets?.some((s) => s.ratedCardCount === 0) && (
        <p className="mt-10 max-w-xl text-sm leading-relaxed text-base-content/50">
          A set marked <strong className="font-semibold">no win-rate data</strong> is
          graded on rarity alone — 17Lands stops publishing win rates once a format
          leaves rotation. Its grades mean much less.
        </p>
      )}
    </>
  );
}
