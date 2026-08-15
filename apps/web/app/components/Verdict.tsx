"use client";

import type { Card, PickScore } from "@mtg-tutor/core";
import { gapMargin, loadPrinciples, splitCitations, tiebreakLine } from "@mtg-tutor/core";
import { gradeColor, points } from "../lib/format";
import { CardPlacard } from "./CardPlacard";
import { PrincipleBadge } from "./PrincipleBadge";

const PRINCIPLES = loadPrinciples();

// Why that card and not another, with its ground cited the way every other
// citation in the app is cited.
//
// `tiebreakLine` ends in a bracketed id -- "[MANA-02]" -- because it is a
// sentence and the CLI has to be able to print it. On the web that left the one
// principle reference in the app rendered as raw text: not a link, not
// explainable on hover, and not even recognisable as the same thing the badges
// under the coach are. It goes through `splitCitations`, which is what already
// turns the coach's own bracketed ids into badges, so both paths now lose the
// brackets to the same code.
function TiebreakNote({ name, reasons }: { name: string; reasons: PickScore<Card>["reasons"] }) {
  const line = tiebreakLine(name, reasons);
  if (!line) return null;

  const cited = splitCitations(line, PRINCIPLES);
  return (
    <p className="text-xs leading-relaxed text-base-content/60">
      {cited.prose}{" "}
      {cited.principles.map((p) => (
        <PrincipleBadge key={p.id} principle={p} />
      ))}
    </p>
  );
}

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
  const gap = score.contextBestValue - score.pickedContextValue;
  const lost = points(-gap);

  // The error bars on the two win rates the gap is a difference of. The panel
  // used to show the gap alone, which is the exact defect the prompt was fixed
  // for and left standing on the screen: at 17Lands sample sizes the bars run to
  // about a point, so a 0.3pp miss is a coin flip rendered as two grades. It
  // matters more now that the player has just been asked to defend a position --
  // being told they were wrong by an amount the data cannot see is the one way
  // this flow could teach something false. Undefined when either card is
  // unrated, and then it says so rather than inventing one.
  // Read off the SCORE rather than recomputed here, so the words and the number
  // cannot disagree: `scorePick` is what decided the grade, and it decided it
  // with the margin. `gapMargin` is still called for the size of the bars, which
  // is a display detail and not a verdict.
  const margin = gapMargin(score.contextBest, score.picked);
  const unresolved = score.indistinguishable;

  // How many cards this row is actually about: the band plus the pick itself.
  // One number for the label and the sentence under it, so they cannot count
  // differently.
  const tied = unresolved && score.band.length > 0 ? score.band.length + 1 : 2;

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
            {/* Three states, not two. "Nothing scored higher" is a claim about
                the numbers and stays reserved for when it is literally true;
                a pick inside the error bars is a different and weaker claim --
                something did score higher, by less than the data can measure --
                and saying the strong one over it would be the same conflation
                the score just stopped making. */}
            {score.isBest
              ? "Nothing scored higher"
              : score.indistinguishable
                ? "Nothing measurably better"
                : "You took"}
          </div>
          <CardPlacard card={score.picked} />
        </div>

        {!score.isBest && (
          <div>
            <div className="eyebrow mb-1.5 flex items-baseline justify-between gap-2">
              {/* Three labels for three different claims. "Graded against" is
                  what the grade was measured against and is only true when the
                  data could measure it. Inside the margin there is no single
                  better card -- there is a set of cards nothing can separate --
                  so the label says so and the cards below are all of them. */}
              <span>
                {!score.indistinguishable
                  ? "Graded against"
                  : score.band.length > 1
                    ? `The ${tied} the data cannot separate`
                    : "Just as good"}
              </span>
              <span className="tabular-nums normal-case tracking-normal">
                {lost}
                <span className="text-base-content/45">
                  {margin == null ? " · no margin" : ` ± ${points(margin).slice(1)}`}
                </span>
              </span>
            </div>
            {/* Every card in the tie, not the float's winner. Which of them
                `contextBest` happens to name is a coin flip at this margin, and
                printing that one name is what let this panel and the challenge
                below it argue about a pack neither could rank. */}
            <div className="flex flex-col gap-1.5">
              {(score.indistinguishable && score.band.length > 0
                ? score.band
                : [score.contextBest]
              ).map((c) => (
                <div key={c.name} className="flex flex-col gap-0.5">
                  <CardPlacard card={c} />
                  {/* The one the deck wanted, marked inside the set rather than
                      shown instead of it. Same card the challenge put up, from
                      the same `tiebreak` over the same needs -- which is what
                      the whole parity change bought, and what stops this panel
                      and the one below it naming two cards off one pack. */}
                  {score.preferred?.name === c.name && (
                    <TiebreakNote name={c.name} reasons={score.reasons} />
                  )}
                </div>
              ))}
            </div>
            {/* Said in words, not left to be read off two numbers. The whole
                point of carrying the margin is that a gap smaller than it is not
                a gap, and a grade sitting above this row is about to imply
                otherwise.

                Counts the cards it is talking about rather than assuming two.
                The row above can be a band of seven, and following it with "the
                data cannot tell these two apart" reads as a sentence written for
                a different pack than the one on screen. */}
            <p className="mt-1.5 text-xs leading-relaxed text-base-content/60">
              {margin == null
                ? "One of these cards is unrated, so there are no error bars on this gap."
                : unresolved
                  ? tied > 2
                    ? `That is inside the margin of error: the data cannot separate these ${tied}, so this pick is not marked down for it.`
                    : "That is inside the margin of error: the data cannot tell these two apart, so this pick is not marked down for it."
                  : "That gap is larger than the margin of error on the two win rates."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
