"use client";

import type { PickScore } from "@mtg-tutor/core";
import { gradeColor, pctPoints } from "../lib/format";
import { CardPlacard } from "./CardPlacard";

// The payoff of the whole app: you picked, and this says how that went. The
// grade is set large and in the display face because it is the one thing a
// player is actually waiting for, and both cards are drawn as the same Arena
// placards the pool uses -- so a miss reads as two rows to compare rather than
// a sentence to parse.
export function Verdict({ score }: { score: PickScore }) {
  const lost = pctPoints(score.best.gihWinRate, score.picked.gihWinRate);

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
          <div className="eyebrow mb-1.5">{score.isBest ? "Best in the pack" : "You took"}</div>
          <CardPlacard card={score.picked} />
        </div>

        {!score.isBest && (
          <div>
            <div className="eyebrow mb-1.5 flex items-baseline justify-between gap-2">
              <span>Best was</span>
              {lost && <span className="tabular-nums normal-case tracking-normal">−{lost}</span>}
            </div>
            <CardPlacard card={score.best} />
          </div>
        )}
      </div>
    </div>
  );
}
