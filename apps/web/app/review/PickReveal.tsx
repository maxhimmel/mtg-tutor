"use client";

import { useMemo } from "react";
import type { Id } from "@mtg-tutor/backend/dataModel";
import type { Card } from "@mtg-tutor/core";
import { loadPrinciples, splitCitations } from "@mtg-tutor/core";
import { AiResponse } from "../components/AiResponse";
import { CardPlacardList } from "../components/CardPlacard";
import { CardText } from "../components/CardText";
import { PrincipleBadges } from "../components/PrincipleBadge";
import { pct } from "../lib/format";
import type { ReviewPick } from "./types";
import type { VerdictState } from "./useVerdicts";

const PRINCIPLES = loadPrinciples();

// How many of the pack's cards the reveal argues over. Six is the CLI's number:
// enough to show the shape of the choice, few enough that the answer is not a
// wall of forty names.
const SHOWN = 6;

// The best six by win rate, plus any card the reveal has something to say about.
// The CLI slices strictly, which silently drops the card you took whenever you
// took the seventh-best -- exactly the pick most worth showing you.
function cardsToShow(pick: ReviewPick, contextBest: string, guess?: string | null): Card[] {
  const ranked = [...pick.pack].sort((a, b) => (b.gihWinRate ?? 0) - (a.gihWinRate ?? 0));
  const shown = ranked.slice(0, SHOWN);

  const named = new Set([pick.picked.name, pick.bestName, contextBest, guess ?? ""]);
  for (const card of ranked.slice(SHOWN)) {
    if (named.has(card.name)) shown.push(card);
  }
  return shown;
}

function Marks({
  card,
  pick,
  contextBest,
  guess,
}: {
  card: Card;
  pick: ReviewPick;
  contextBest: string;
  guess?: string | null;
}) {
  // Same vocabulary and the same colours the CLI reveal uses, so the two
  // surfaces do not teach two different sets of words for one idea.
  const marks = [
    card.name === guess && { label: "your guess", className: "badge-outline" },
    card.name === pick.picked.name && { label: "you took", className: "badge-info" },
    card.name === pick.bestName && { label: "raw-best", className: "badge-warning" },
    card.name === contextBest && { label: "context-best", className: "badge-success" },
  ].filter((m): m is { label: string; className: string } => Boolean(m));

  return (
    <span className="flex items-center justify-end gap-1.5">
      {marks.map((mark) => (
        <span key={mark.label} className={`badge badge-sm whitespace-nowrap ${mark.className}`}>
          {mark.label}
        </span>
      ))}
      <span className="w-14 text-right tabular-nums">{pct(card.gihWinRate)}</span>
    </span>
  );
}

/**
 * One pick, explained. Shared by the walkthrough and the breakdown so the two
 * cannot drift into telling the same story differently.
 *
 * `contextBest` falls back to the deterministic raw-power best when there is no
 * verdict, which is what keeps the review working on a deployment with no model
 * key: you still get the data, just not the prose.
 */
export function PickReveal({
  pick,
  verdict,
  pending,
  guess,
  correct,
  draft,
}: {
  pick: ReviewPick;
  verdict: VerdictState;
  // Where this pick sits, so a complaint about the verdict arrives knowing which
  // draft and which set produced it. Passed rather than declared on the page,
  // because the breakdown renders forty of these at once and the anchor has to
  // name one.
  draft: { sessionId: Id<"draftSessions">; setCode: string; format: string };
  // Whether a verdict is actually on its way. Without this, "no verdict" and
  // "verdict coming" look identical, and the breakdown -- which deliberately does
  // not ask until told to -- would spin forever on picks nobody asked about.
  pending: boolean;
  guess?: string | null;
  correct?: boolean | null;
}) {
  const contextBest = verdict?.contextBestName ?? pick.bestName;
  const shown = useMemo(
    () => cardsToShow(pick, contextBest, guess),
    [pick, contextBest, guess],
  );
  const advice = useMemo(
    () => splitCitations(verdict?.narrative ?? "", PRINCIPLES),
    [verdict?.narrative],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <span className="eyebrow">
          Pack {pick.packNo} · Pick {pick.pickNo}
        </span>
        {correct != null && (
          <span
            className={`text-sm font-semibold ${correct ? "text-success" : "text-error"}`}
          >
            {correct ? "✓ nice read" : "✗ not this time"}
          </span>
        )}
      </div>

      <CardPlacardList
        cards={shown}
        trailing={(card) => (
          <Marks card={card} pick={pick} contextBest={contextBest} guess={guess} />
        )}
      />

      {verdict === undefined && pending && (
        <p className="flex items-center gap-2 text-sm text-base-content/60">
          <span className="loading loading-spinner loading-xs" />
          Coach is reviewing this pick…
        </p>
      )}

      {verdict === null && (
        <p className="text-sm text-warning">
          Coach unavailable — showing the data only.
          {contextBest !== pick.bestName && ` Context-best: ${contextBest}.`}
        </p>
      )}

      {verdict && (
        // Both halves inside one wrapper, because they are one generation: the
        // divergence lesson and the narrative come out of a single verdict, and
        // two thumbs would be asking twice about the same answer. No `quote` --
        // reviewVerdicts stores this and freezes it on first review, so the
        // owner's script joins the stored row rather than keeping a copy that
        // could disagree with it.
        <AiResponse
          surface="verdict"
          title="Coach"
          anchor={{
            sessionId: draft.sessionId,
            pickIndex: pick.pickIndex,
            setCode: draft.setCode,
            format: draft.format,
          }}
        >
          <div className="flex flex-col gap-2">
            <div>
              <div className="eyebrow mb-1">Divergence</div>
              <p className="leading-relaxed">
                <CardText text={verdict.divergenceLesson} cards={pick.pack} />
              </p>
            </div>
            <p className="leading-relaxed">
              <CardText text={advice.prose} cards={pick.pack} />
            </p>
            <PrincipleBadges principles={advice.principles} />
          </div>
        </AiResponse>
      )}
    </div>
  );
}
