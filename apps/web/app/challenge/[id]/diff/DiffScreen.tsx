"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AuthLoading,
  Authenticated,
  Unauthenticated,
  useConvex,
  useMutation,
  useQuery,
} from "convex/react";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import type { Card } from "@mtg-tutor/core";
import { normalizeName, textIndex } from "@mtg-tutor/core";
import { PageHeading } from "../../../components/PageHeading";
import { PageNotice, PageShell } from "../../../components/PageShell";
import { SetIcon } from "../../../components/SetIcon";
import { diffViewed, forkOpened } from "../../../lib/analytics";
import { humanError } from "../../../lib/humanError";
import { Braid } from "./Braid";
import { Hero } from "./Hero";
import { Shelf } from "./Shelf";
import type { Face } from "./faces";

export function DiffScreen({ challengeId }: { challengeId: string }) {
  return (
    <>
      <AuthLoading>
        <PageNotice>Signing in…</PageNotice>
      </AuthLoading>
      <Unauthenticated>
        <PageNotice>Signing in…</PageNotice>
      </Unauthenticated>
      <Authenticated>
        <Screen challengeId={challengeId as Id<"challenges">} />
      </Authenticated>
    </>
  );
}

function Screen({ challengeId }: { challengeId: Id<"challenges"> }) {
  const convex = useConvex();
  const diff = useQuery(api.challenges.diff, { challengeId });
  // Its own query on purpose: it is the only part that replays, so a set that
  // has moved costs the braid its weights instead of the screen. Handed the
  // forks the diff already found, because re-deriving them here meant reading
  // both drafts' rows a second time -- 163KB against the diff's own 138KB,
  // measured, for a list this component is holding.
  const impacts = useQuery(
    api.challenges.forkImpacts,
    diff ? { challengeId, forks: diff.tally.forks.map((f) => ({ pickIndex: f.pickIndex, theirs: f.theirs })) } : "skip",
  );
  const markSeen = useMutation(api.challenges.markSeen);

  const [text, setText] = useState<ReturnType<typeof textIndex> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [at, setAt] = useState(0);
  const shelfRef = useRef<HTMLDivElement | null>(null);

  // The same join the draft board does: one read of the set's text per visit,
  // matched by name against rows that carry names only.
  const setCode = diff?.setCode;
  const format = diff?.format;
  useEffect(() => {
    if (!setCode || !format) return;
    let cancelled = false;
    convex
      .query(api.sets.cardText, { setCode, format })
      .then((rows) => {
        if (!cancelled) setText(textIndex(rows));
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(humanError(e));
      });
    return () => {
      cancelled = true;
    };
  }, [convex, setCode, format]);

  // Clears the badge. Idempotent and challenger-only server-side, so the friend
  // calling it is a no-op rather than a refusal.
  const seen = useRef(false);
  useEffect(() => {
    if (!diff || seen.current) return;
    seen.current = true;
    void markSeen({ challengeId });
    diffViewed({
      challengeId,
      rows: diff.tally.rows,
      comparable: diff.tally.comparable,
      agreed: diff.tally.agreed,
      forks: diff.tally.forks.length,
    });
  }, [diff, challengeId, markSeen]);

  /**
   * A name to something renderable, tolerantly.
   *
   * `hydrateCard` throws on a name it cannot find, which is right on the draft
   * board -- a card being dealt with no text means two halves of a set written
   * by different ingests, and a blank frame is worse than a crash. It is wrong
   * here: this screen reads rows written weeks ago, and a re-ingest that dropped
   * one card must cost that card its art, not the whole comparison.
   */
  const faceOf = useCallback(
    (name: string, colors: readonly string[]): Face => {
      const half = text?.get(normalizeName(name));
      if (!half) return { name, colors: [...colors], card: null };
      return { name, colors: [...colors], card: { ...half, name, colors: [...colors] } as Card };
    },
    [text],
  );

  const openFork = useCallback(
    (pickIndex: number, from: "hero" | "braid" | "tick") => {
      setAt(pickIndex);
      forkOpened({ challengeId, pickIndex, from });
      shelfRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    },
    [challengeId],
  );

  // Arrow keys step the shelf, with the usual escape hatch for anything a
  // person might be typing into.
  useEffect(() => {
    if (!diff) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) {
        return;
      }
      if (e.key === "ArrowLeft") setAt((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setAt((i) => Math.min(diff.tally.rows - 1, i + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [diff]);

  const impactByIndex = useMemo(
    () => new Map((impacts ?? []).map((i) => [i.pickIndex, i])),
    [impacts],
  );

  if (loadError) return <PageNotice tone="error">{loadError}</PageNotice>;
  if (diff === undefined) return <PageNotice>Reading both drafts…</PageNotice>;

  return (
    <PageShell>
      <PageHeading
        icon={<SetIcon uri={diff.iconUri} className="size-6 text-base-content/50" />}
        title={
          <>
            You vs. a friend{" "}
            <span className="text-base-content/45">
              {diff.setName ?? diff.setCode.toUpperCase()}
            </span>
          </>
        }
        controls={
          <Link href="/challenge" className="link link-hover text-sm text-base-content/60">
            All challenges →
          </Link>
        }
      />

      <Hero
        rows={diff.rows}
        tally={diff.tally}
        faceOf={faceOf}
        onOpenFork={(i) => openFork(i, "hero")}
      />

      <Braid
        rows={diff.rows}
        tally={diff.tally}
        impacts={impactByIndex}
        impactsUnavailable={impacts === null}
        at={at}
        onOpenFork={(i) => openFork(i, "braid")}
      />

      <div ref={shelfRef} className="mt-10 scroll-mt-4">
        <p className="eyebrow mb-3 text-base-content/45">Pick by pick</p>
        <Shelf
          rows={diff.rows}
          tally={diff.tally}
          at={at}
          faceOf={faceOf}
          onAt={(i) => setAt(i)}
          onTick={(i) => openFork(i, "tick")}
        />
      </div>
    </PageShell>
  );
}
