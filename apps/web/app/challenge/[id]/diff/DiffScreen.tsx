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
import { Decks } from "./Decks";
import { Forks } from "./Forks";
import { Shelf } from "./Shelf";
import { Summary } from "./Summary";
import type { Face } from "./faces";
import { theirName } from "./sides";

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
    const mineBuilt = diff.yourDeck.basicLands !== undefined;
    const theirsBuilt = diff.theirDeck.basicLands !== undefined;
    diffViewed({
      challengeId,
      rows: diff.tally.rows,
      comparable: diff.tally.comparable,
      agreed: diff.tally.agreed,
      forks: diff.tally.forks.length,
      // Off the registered forties rather than off what the panel rendered: the
      // panel can also fall back when a re-ingest drops a card, and that is a
      // different fact from nobody having built a deck.
      decks:
        mineBuilt && theirsBuilt
          ? "both"
          : mineBuilt
            ? "yours"
            : theirsBuilt
              ? "theirs"
              : "neither",
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

  const forkIndices = useMemo(
    () => new Set((diff?.tally.forks ?? []).map((f) => f.pickIndex)),
    [diff],
  );

  /**
   * Move the shelf, and report it only when it landed on a fork.
   *
   * The track is navigation over all forty-two picks now, not a list of forks,
   * so firing `fork_opened` on every step would drown the one number the event
   * exists to produce -- which of the readings actually drives the stepper.
   * Stepping to an ordinary pick is not somebody opening a fork.
   */
  const goTo = useCallback(
    (pickIndex: number, from: "track" | "hero" | "braid" | "tick", scroll: boolean) => {
      setAt(pickIndex);
      if (forkIndices.has(pickIndex)) forkOpened({ challengeId, pickIndex, from });

      const node = shelfRef.current;
      if (!scroll || !node) return;

      // Only when the shelf is not already where you are looking. Re-aligning a
      // panel somebody is already reading is a jump with nothing to show for it.
      const box = node.getBoundingClientRect();
      if (box.top < window.innerHeight * 0.75 && box.bottom > 140) return;

      node.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    },
    [challengeId, forkIndices],
  );

  // Arrow keys step the shelf, with the usual escape hatch for anything a
  // person might be typing into -- and for the track itself, which handles its
  // own arrows to move between ticks and says so by preventing the default.
  // Without that check, focusing the track stepped two picks per press.
  useEffect(() => {
    if (!diff) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
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

  // Named rather than "a friend", because the page is a comparison between two
  // people and one of them was anonymous in every label on it.
  const them = theirName(diff.side, diff.fromName);

  return (
    <PageShell>
      <PageHeading
        icon={<SetIcon uri={diff.iconUri} className="size-6 text-base-content/50" />}
        title={
          <>
            You vs. {them}{" "}
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

      <div className="flex flex-col gap-4">
        <Summary
          rows={diff.rows}
          tally={diff.tally}
          them={them}
          at={at}
          onAt={(i, scroll) => goTo(i, "track", scroll)}
        />

        <Forks
          rows={diff.rows}
          tally={diff.tally}
          impacts={impactByIndex}
          impactsUnavailable={impacts === null}
          them={them}
          faceOf={faceOf}
          onOpen={(i) => goTo(i, "hero", true)}
        />
      </div>

      <Braid
        rows={diff.rows}
        tally={diff.tally}
        them={them}
        at={at}
        onOpenFork={(i) => goTo(i, "braid", true)}
      />

      {/* After the picks, because a deck is what the picks were for -- and
          before the pick-by-pick shelf, which is the reference section rather
          than part of the argument. */}
      <Decks
        rows={diff.rows}
        them={them}
        yourDeck={diff.yourDeck}
        theirDeck={diff.theirDeck}
        yourSessionId={diff.yourSessionId}
        faceOf={faceOf}
      />

      <div ref={shelfRef} className="mt-10 scroll-mt-4">
        <p className="eyebrow mb-3 text-base-content/45">Pick by pick</p>
        <Shelf rows={diff.rows} them={them} at={at} faceOf={faceOf} />
      </div>
    </PageShell>
  );
}
