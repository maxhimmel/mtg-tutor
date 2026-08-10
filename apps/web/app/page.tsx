"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Authenticated, Unauthenticated, useMutation, useQuery } from "convex/react";
import { api } from "@mtg-tutor/backend";
import { useEffect, useRef, useState } from "react";
import { PageShell } from "./components/PageShell";
import { SetGrid } from "./components/SetGrid";
import { SetList } from "./components/SetList";
import { accessBlocked, draftRefused } from "./lib/analytics";
import { useSettings, type SetView } from "./lib/useSettings";
import { humanError } from "./lib/humanError";

export default function Home() {
  return (
    <PageShell>
      <Unauthenticated>
        <section className="max-w-2xl py-6">
          {/* The break is written rather than left to the viewport, because the
              two sentences are the two halves of the app -- the draft, then the
              review -- and a wrap that fell after "Leave" would say nothing.
              Stacked at 1.05 they read as a couplet, which is the shape of the
              claim: the second line is what the first one earns you.

              The heading it replaced, "Every pick, graded.", is not lost: the
              paragraph under it makes the same claim with the numbers in. */}
          <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
            Draft on instinct.
            <br />
            Leave with reasons.
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-base-content/70">
            Draft a real pack from any recent set. Every pick is scored against 17Lands
            win-rate data, and the coach tells you what you passed up.
          </p>
          {/* Two actions, because there are two kinds of visitor and only one
              of them can act on "Sign in". Asking for an invite was a link
              inside the paragraph below and nobody could find it -- which made
              the app look closed rather than closed-but-asking. */}
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a className="btn btn-primary" href="/sign-in">
              Sign in
            </a>
            <Link href="/sign-up" className="btn btn-outline">
              Ask for an invite
            </Link>
          </div>
          <p className="mt-4 text-sm text-base-content/60">
            Drafts save to your account, and accounts are invite only while this
            is in beta. Or read the{" "}
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

  // A signed-in account that may do nothing at all -- almost always a WorkOS
  // organization membership that was never set. Until now this was invisible
  // from here: the friend sees a wall, and nothing anywhere records that they
  // hit it. Once per mount, because a role does not change while a page is open.
  const blocked = useRef(false);
  useEffect(() => {
    if (quota?.role !== "none" || blocked.current) return;
    blocked.current = true;
    accessBlocked({ source: quota.source });
  }, [quota?.role, quota?.source]);

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
      const message = humanError(e);
      setRefused(message);
      setStarting(null);
      // Captured here rather than in quota.enforce, and not by choice: a Convex
      // capture schedules its send inside the transaction, so a mutation that
      // refuses rolls the send back with itself and nothing is ever sent. The
      // browser is the only side of this that survives a refusal.
      draftRefused({ setCode, format, message });
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
              onChange={(setView) => update({ setView }, "sets")}
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
