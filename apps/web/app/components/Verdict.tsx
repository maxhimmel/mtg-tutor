"use client";

import type { Card, PickScore } from "@mtg-tutor/core";
import { gradeColor, points } from "../lib/format";
import { CardPlacard } from "./CardPlacard";

// The payoff of the whole app: you picked, and this says how that went. The
// grade is set large and in the display face because it is the one thing a
// player is actually waiting for, and both cards are drawn as the same Arena
// placards the pool uses -- so a miss reads as two rows to compare rather than
// a sentence to parse.
//
// The card shown is the one the grade was measured against, which is
// `contextBest` and not `rawBest`. Showing the raw best under a grade computed
// against the context best is how this screen came to say "You took Dragonstorm
// Globe / Best was Dragonstorm Globe, -0.0%": the pick WAS the strongest card in
// the pack, the deck wanted a different one, and the panel named neither
// question it was answering. Same defect the biggest-misses table had.
//
// It is labelled as the DENOMINATOR of the grade rather than as the better card,
// because most of the time the app cannot say that it is. The gap is
// `contextBestValue - pickedContextValue` and `gapMargin` puts the error bars on
// two 17Lands win rates at around a point, so a 0.3pp gap is a coin flip the
// score renders as two grades apart. "Better for your deck" asserted the thing
// the margin exists to deny; "Graded against" states only what happened, which
// is also what the grade beside it is asking about.
export function Verdict({ score }: { score: PickScore<Card> }) {
  // The gap the grade is made of, in the units it was computed in. The raw win
  // rate difference between two cards is a third scale -- neither the score nor
  // anything the coach was told -- and it read as 0.0% whenever the pick and the
  // raw best were the same card.
  const lost = points(score.pickedContextValue - score.contextBestValue);

  return (
    <div className="flex items-start gap-4">
      <div className="w-16 shrink-0 text-center">
        <div
          className="font-display text-[3.25rem] font-semibold leading-none tracking-tight"
          style={{ color: gradeColor(score.grade) }}
        >
          {score.grade}
        </div>
        <div className="mt-2 text-xs tabular-nums text-base-content/60">
          {score.score}
          <span className="text-base-content/45">/100</span>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2.5">
        <div>
          <div className="eyebrow mb-1.5">
            {score.isBest ? "Nothing scored higher" : "You took"}
          </div>
          <CardPlacard card={score.picked} />
        </div>

        {!score.isBest && (
          <div>
            <div className="eyebrow mb-1.5 flex items-baseline justify-between gap-2">
              <span>Graded against</span>
              <span className="tabular-nums normal-case tracking-normal">{lost}</span>
            </div>
            <CardPlacard card={score.contextBest} />
          </div>
        )}
      </div>
    </div>
  );
}
