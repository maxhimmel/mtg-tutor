"use client";

import { useMemo } from "react";
import type { Id } from "@mtg-tutor/backend/dataModel";
import type { Card } from "@mtg-tutor/core";
import { loadPrinciples, splitCitations } from "@mtg-tutor/core";
import { AiResponse } from "../components/AiResponse";
import { CardPlacard } from "../components/CardPlacard";
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

interface Mark {
  label: string;
  tone: string;
  // The rail drawn down the side of the card this marks. Same colour as the
  // label, one step quieter.
  rail: string;
  // What the word means, for the key. Four coloured labels above a stack of
  // cards are a code, and a code with no key is a guessing game -- "raw-best"
  // against "context-best" is the whole lesson this screen exists to teach, and
  // it is not a distinction anyone infers from a green label and an orange one.
  means: string;
}

// Same vocabulary and the same colours the CLI reveal uses, so the two surfaces
// do not teach two different sets of words for one idea.
//
// Written out rather than through the `eyebrow` utility that sets the rest of
// the app's small caps: `eyebrow` carries a text colour of its own, and two
// utilities setting one property are settled by the order they were generated in
// rather than the order they appear in the class attribute -- so the role's
// colour would win or lose depending on nothing legible from here.
const MARK = "text-[0.6875rem] font-semibold uppercase tracking-[0.14em]";

const GUESS: Mark = {
  label: "your guess",
  tone: "text-base-content/50",
  rail: "bg-base-content/30",
  means: "what you said before the answer",
};
const TOOK: Mark = {
  label: "you took",
  tone: "text-info",
  rail: "bg-info/60",
  means: "the card you actually drafted",
};
const RAW_BEST: Mark = {
  label: "raw-best",
  tone: "text-warning",
  rail: "bg-warning/60",
  means: "the highest win rate in the pack",
};
const CONTEXT_BEST: Mark = {
  label: "context-best",
  tone: "text-success",
  rail: "bg-success/60",
  means: "the best card for the deck you were building",
};

// In order of how much the mark claims. A card can hold several: taking the raw
// best when the raw best was also right for the deck earns three of them.
function marksFor(
  card: Card,
  pick: ReviewPick,
  contextBest: string,
  guess?: string | null,
): Mark[] {
  return [
    card.name === guess && GUESS,
    card.name === pick.picked.name && TOOK,
    card.name === pick.bestName && RAW_BEST,
    card.name === contextBest && CONTEXT_BEST,
  ].filter((m): m is Mark => Boolean(m));
}

/**
 * The rail beside a card, one band per mark it holds.
 *
 * It used to take a single colour, picked by a precedence rule -- context-best
 * over raw-best over you-took -- so a card that was both the raw best AND the
 * right card for the deck was drawn as though it were only the second. That is
 * the one card on the page whose two labels are the entire lesson, and it was
 * the one the rail flattened. Bands instead, top to bottom in the order the
 * labels print left to right, so the rail says as much as the line above it.
 */
function MarkRail({ marks }: { marks: Mark[] }) {
  return (
    <span
      aria-hidden
      className="flex w-[3px] shrink-0 flex-col gap-px overflow-hidden rounded-full"
    >
      {marks.map((mark) => (
        <span key={mark.label} className={`flex-1 ${mark.rail}`} />
      ))}
    </span>
  );
}

/**
 * What the labels above the cards mean.
 *
 * Built out of the same parts as a marked card -- rail, then the label, then a
 * line under it -- so the key is a small picture of the thing it explains rather
 * than a glossary sitting next to it. Read one entry and you have read the shape
 * you are about to meet six times below.
 *
 * Drawn once per view of a shortlist: the walkthrough shows one pick, so it goes
 * inside that pick; the breakdown shows forty, so it goes above them. A key
 * repeated forty times is not a key. `quiz` because "your guess" only ever
 * appears on the walkthrough with guessing turned on, and a key naming a mark the
 * page cannot show is worse than no key.
 */
export function PickMarksKey({ quiz = false }: { quiz?: boolean }) {
  const marks = quiz ? [GUESS, TOOK, RAW_BEST, CONTEXT_BEST] : [TOOK, RAW_BEST, CONTEXT_BEST];

  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2.5">
      {marks.map((mark) => (
        <div key={mark.label} className="flex items-stretch gap-2">
          <MarkRail marks={[mark]} />
          <div>
            <dt className={`${MARK} ${mark.tone}`}>{mark.label}</dt>
            <dd className="text-xs text-base-content/50">{mark.means}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

/**
 * One card in the shortlist.
 *
 * The role goes ABOVE the placard, not beside it. Beside it, the badges were what
 * forced the row wide -- a placard plus three chips plus a win rate needs six
 * hundred pixels, and a placard stretched to fill six hundred pixels stops
 * reading as a card (see NATURAL_W in CardPlacard). Above it, the shortlist fits
 * a column the placard was actually drawn for, and the two or three cards that
 * carry a role get a line of air the others do not.
 *
 * A label sitting on its own line above a card is not enough on its own, though.
 * Read down a stack it is ambiguous -- a caption under the card before it, or a
 * title for the card after it -- and no amount of margin settles that, because
 * the reader has to measure two gaps to find out. So the label and its card are
 * bracketed by a rail in the mark's own colours, which says they are one object
 * rather than leaving it to be inferred from spacing. The rail is drawn on every
 * row, banded only where there is something to say, so all the placards keep a
 * single left edge and the mark reads as a mark and not as an indent -- the same
 * bargain the deck board makes with its gold rail.
 */
function ShortlistCard({ card, marks }: { card: Card; marks: Mark[] }) {
  return (
    <li className={`flex items-stretch gap-2 ${marks.length > 0 ? "mt-3 first:mt-0" : ""}`}>
      <MarkRail marks={marks} />
      <div className="min-w-0 flex-1">
        {marks.length > 0 && (
          <div className="mb-0.5 flex flex-wrap items-baseline gap-x-1.5">
            {marks.map((mark, i) => (
              <span key={mark.label} className={`${MARK} ${mark.tone}`}>
                {i > 0 && <span className="mr-1.5 text-base-content/25">·</span>}
                {mark.label}
              </span>
            ))}
          </div>
        )}
        <div className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-2">
          <CardPlacard card={card} />
          <span className="text-right text-sm tabular-nums text-base-content/60">
            {pct(card.gihWinRate)}
          </span>
        </div>
      </div>
    </li>
  );
}

/**
 * One pick, explained. Shared by the walkthrough and the breakdown so the two
 * cannot drift into telling the same story differently.
 *
 * Two columns: the pack's shortlist on the left, the coach on the right. Stacked,
 * these were a full-width list of card rows followed by a paragraph, which made
 * both of them worse -- the placards stretched to a width they are not drawn for,
 * and the breakdown became a scroll of forty alternating lists and paragraphs
 * with no way to see which pick you were in. Side by side, the cards are the
 * evidence and the prose is the argument, which is the relationship they already
 * have.
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
  onAsk,
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
  // Ask for this one pick's verdict. Only the breakdown passes it -- the
  // walkthrough asks on arrival, so there is nothing there to offer.
  onAsk?: () => void;
}) {
  const contextBest = verdict?.contextBestName ?? pick.bestName;
  const shown = useMemo(() => cardsToShow(pick, contextBest, guess), [pick, contextBest, guess]);
  const advice = useMemo(
    () => splitCitations(verdict?.narrative ?? "", PRINCIPLES),
    [verdict?.narrative],
  );

  return (
    // 19rem is a placard plus its win-rate gutter and nothing else, so the
    // shortlist is exactly as wide as the cards in it. Everything left over goes
    // to the prose, which is capped at a reading measure of its own.
    <div className="grid items-start gap-x-7 gap-y-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
      <div className="flex flex-col gap-2">
        {correct != null && (
          <span className={`text-sm font-semibold ${correct ? "text-success" : "text-error"}`}>
            {correct ? "✓ nice read" : "✗ not this time"}
          </span>
        )}
        <ol className="flex flex-col gap-0.5">
          {/* Keyed by position: a pack can hold two copies of the same common. */}
          {shown.map((card, i) => (
            <ShortlistCard
              key={`${card.name}-${i}`}
              card={card}
              marks={marksFor(card, pick, contextBest, guess)}
            />
          ))}
        </ol>
      </div>

      <div className="flex max-w-prose flex-col gap-3">
        {verdict === undefined &&
          (pending ? (
            <p className="flex items-center gap-2 text-sm text-base-content/60">
              <span className="loading loading-spinner loading-xs" />
              Coach is reviewing this pick…
            </p>
          ) : (
            // The breakdown deliberately does not ask on arrival, so this column
            // is empty until somebody spends the calls -- and the way to spend
            // one belongs here, beside the pick it would explain, rather than
            // only in the all-or-nothing button at the top of the page.
            onAsk && (
              <button type="button" className="btn btn-sm btn-outline w-fit" onClick={onAsk}>
                Ask the coach about this pick
              </button>
            )
          ))}

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
    </div>
  );
}
