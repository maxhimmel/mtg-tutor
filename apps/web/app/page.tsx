"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Authenticated, Unauthenticated, useMutation, useQuery } from "convex/react";
import { api } from "@mtg-tutor/backend";
import { useState } from "react";
import { PageShell } from "./components/PageShell";
import { SetGrid } from "./components/SetGrid";
import { SetList } from "./components/SetList";
import { useSettings, type SetView } from "./lib/useSettings";

export default function Home() {
  return (
    <PageShell>
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
    </PageShell>
  );
}

function ViewIcon({ view }: { view: SetView }) {
  return view === "grid" ? (
    <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden="true">
      <rect x="1" y="1" width="6" height="6" rx="1.5" />
      <rect x="9" y="1" width="6" height="6" rx="1.5" />
      <rect x="1" y="9" width="6" height="6" rx="1.5" />
      <rect x="9" y="9" width="6" height="6" rx="1.5" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" className="size-4" fill="currentColor" aria-hidden="true">
      <rect x="1" y="2" width="14" height="2.5" rx="1.25" />
      <rect x="1" y="6.75" width="14" height="2.5" rx="1.25" />
      <rect x="1" y="11.5" width="14" height="2.5" rx="1.25" />
    </svg>
  );
}

// One button rather than a two-option segmented control: with exactly two views
// the unselected half of a segmented control is already the button, so the
// second one only costs width. It draws the view it switches *to*, which is the
// convention for a flip control -- and since an icon alone cannot say whether
// it means "you are here" or "go here", the accessible name says it outright.
function SetViewToggle({
  value,
  onChange,
}: {
  value: SetView;
  onChange: (view: SetView) => void;
}) {
  const next: SetView = value === "grid" ? "list" : "grid";
  const label = `Switch to ${next} view`;

  return (
    <button
      type="button"
      className="btn btn-sm btn-ghost btn-square"
      onClick={() => onChange(next)}
      aria-label={label}
      title={label}
    >
      <ViewIcon view={next} />
    </button>
  );
}

function SetPicker() {
  const sets = useQuery(api.sets.list);
  const quota = useQuery(api.quota.mine, {});
  const startDraft = useMutation(api.draft.start);
  const router = useRouter();
  const [starting, setStarting] = useState<string | null>(null);
  const [refused, setRefused] = useState<string | null>(null);
  const { settings, update } = useSettings();

  async function start(setCode: string, format: string) {
    setRefused(null);
    setStarting(setCode);
    try {
      const sessionId = await startDraft({ setCode, format });
      router.push(`/draft/${sessionId}`);
    } catch (e) {
      // Shown on this surface rather than in an alert(), so the way out is
      // beside the thing that refused -- the same reasoning as Stage's error
      // in the commitment flow.
      setRefused(e instanceof Error ? e.message : String(e));
      setStarting(null);
    }
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Pick a set to draft
        </h1>
        <div className="flex items-center gap-3">
          {/* A wall you can see coming is an expectation rather than a wall,
              so this says what is left before it is spent -- and says nothing
              at all to anyone who is never charged. */}
          {quota?.limited && quota.remaining != null && (
            <span className="text-xs text-base-content/55">
              {quota.remaining.drafts} of {quota.of.drafts} drafts left today
            </span>
          )}
          {/* Only once there is something to view. A toggle over an empty page
              offers a choice between two ways of seeing nothing. */}
          {sets != null && sets.length > 0 && (
            <SetViewToggle
              value={settings.setView}
              onChange={(setView) => update({ setView })}
            />
          )}
        </div>
      </div>

      {refused && (
        <div role="alert" className="alert alert-warning my-4">
          <span>{refused}</span>
        </div>
      )}

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

      {sets != null &&
        (settings.setView === "list" ? (
          <SetList sets={sets} starting={starting} onStart={start} />
        ) : (
          <SetGrid sets={sets} starting={starting} onStart={start} />
        ))}

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
