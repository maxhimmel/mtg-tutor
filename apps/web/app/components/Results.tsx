"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useConvex, useConvexAuth } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import {
  DECK,
  alignDecks,
  buildDeck,
  colorKey,
  committedColors,
  deckPiles,
  decksAgree,
  loadPrinciples,
  splitCitations,
} from "@mtg-tutor/core";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import { CardName } from "./CardText";
import { ColorPips } from "./ColorPips";
import { DeckBoard } from "./DeckBoard";
import { DeckBuilder } from "./DeckBuilder";
import { ChallengeAFriend } from "./ChallengeAFriend";
import { ChallengeAnswered, RESULT_ANCHOR } from "./ChallengeAnswered";
import { Panel } from "./Panel";
import { PrincipleBadge } from "./PrincipleBadge";
import { AfterDraft } from "./AfterDraft";
import { humanError } from "../lib/humanError";
import { buildCompared } from "../lib/analytics";

const PRINCIPLES = loadPrinciples();

type ResultsData = FunctionReturnType<typeof api.draft.results>;

// The verdict arrives in order rather than all at once. The app rations
// animation to moments worth marking, and this is the largest one it has: a
// draft ends here. Same keyframe a graded pick lands on, at the scale of the
// whole draft -- which is the relationship the two things already have.
//
// Written out rather than computed, because Tailwind reads the source for class
// names and never sees one that was assembled at runtime.
const REVEAL = [
  "motion-safe:animate-verdict",
  "motion-safe:animate-verdict [animation-delay:70ms]",
  "motion-safe:animate-verdict [animation-delay:140ms]",
  "motion-safe:animate-verdict [animation-delay:210ms]",
];

// Rare by construction -- `splitBasics` pays every floor it can afford, so this
// only appears on a deck asking for more colour than any legal land count can
// serve. It is also the one thing this screen can say that no card score can:
// every term in the value is about how good a card is, and none of them is
// about whether you can cast it.
//
// The grounds go through `splitCitations` rather than being spelled in the
// sentence. This was the last raw citation in the app -- "[MANA-02, MANA-05]"
// as literal text, not a link, not explainable on hover, and not recognisable
// as the same thing the badges under the coach are. `Verdict`'s `TiebreakNote`
// had the identical problem and the identical fix.
function Uncastable({ colors }: { colors: string }) {
  const cited = splitCitations(
    "cannot reach a reliable number of sources at this land count — eight for a main colour, " +
      "three for a splash [MANA-02, MANA-05].",
    PRINCIPLES,
  );

  return (
    <p className="text-sm text-warning">
      <ColorPips colors={colors} className="text-base" /> {cited.prose}{" "}
      {cited.principles.map((p) => (
        <PrincipleBadge key={p.id} principle={p} />
      ))}
    </p>
  );
}

export function Results({
  sessionId,
  asking = false,
  onSubject,
}: {
  sessionId: Id<"draftSessions">;
  // Whether this is the moment a draft just ended, rather than a deck being
  // reread later. Only the draft board knows the difference, and only that
  // moment has earned the right to ask somebody a question.
  asking?: boolean;
  // Which draft this turned out to be. `draft.results` is the only query the
  // review's deck view is willing to pay for -- see ReviewDeck -- so the set and
  // the colours it puts in its masthead can only come back out of here.
  onSubject?: (subject: { setCode: string; format: string; colorPair: string }) => void;
}) {
  const convex = useConvex();
  const { isAuthenticated } = useConvexAuth();

  // Read once and re-read on purpose, not held open as a subscription. Answering
  // this query replays the draft and reads the whole pool, and the deck builder
  // below writes to the session on every card it moves -- so a live query would
  // pay for that replay again on each one. The only write that changes what this
  // screen says is locking the deck in, and that one asks for the reload itself.
  const [results, setResults] = useState<ResultsData | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Held in a ref rather than closed over, because `load` is a dependency of the
  // effect that runs it: a caller passing an inline handler would give `load` a
  // new identity on every render and this screen would refetch itself forever.
  const subject = useRef(onSubject);
  useEffect(() => {
    subject.current = onSubject;
  }, [onSubject]);

  const load = useCallback(async () => {
    try {
      const data = await convex.query(api.draft.results, { sessionId });
      setResults(data);
      subject.current?.({
        setCode: data.setCode,
        format: data.format,
        colorPair: data.summary.colorPair,
      });
    } catch (e: unknown) {
      setLoadError(humanError(e));
    }
  }, [convex, sessionId]);

  // Ownership is checked server-side, so this waits for the token.
  useEffect(() => {
    if (!isAuthenticated) return;
    void load();
  }, [isAuthenticated, load]);

  /**
   * Locking the forty in, which swaps this screen for a different one.
   *
   * Back to the top, because the screen being replaced is a deck builder that
   * was scrolled down to the pile somebody was cutting, and nothing about a
   * re-render moves the page. So the results arrived already scrolled -- past
   * the masthead, past the top of the challenge banner, which is the one thing
   * on that screen built to be the only thing on the screen.
   *
   * `instant`, not the smooth default: the content underneath is being replaced
   * in the same beat, and a page gliding upward through two different screens is
   * a longer way to arrive at the same place looking broken.
   */
  const lockedIn = useCallback(async () => {
    await load();
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [load]);

  // The comparison, once it exists. `results` is refetched when the deck locks
  // in, so the guard is on the session rather than on the effect running: the
  // same forty must not be reported twice because the query answered twice.
  const compared = useRef<string | null>(null);
  useEffect(() => {
    const diff = results?.diff;
    if (!results || !diff || compared.current === sessionId) return;
    compared.current = sessionId;
    buildCompared({
      sessionId,
      setCode: results.setCode,
      format: results.format,
      apart: diff.onlyBuilt.length + diff.onlySuggested.length,
      onlyBuilt: diff.onlyBuilt.length,
      onlySuggested: diff.onlySuggested.length,
      sameColors: diff.colors.built.join("") === diff.colors.suggested.join(""),
      landsBuilt: diff.lands.built,
      landsSuggested: diff.lands.suggested,
      ...(results.deck && results.deck.uncastable.length > 0
        ? { uncastable: results.deck.uncastable.join("") }
        : {}),
    });
  }, [results, sessionId]);

  // Re-ingesting a set strands every draft taken against the old data, and this
  // screen is now linked to from the drafts list -- which reads the stored
  // summary and so cannot know until you click. Said in place rather than as a
  // page of its own, because there is a masthead around this either way.
  if (loadError) {
    return (
      <div className="flex max-w-prose flex-col gap-3">
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          That deck could not be rebuilt.
        </h2>
        <p className="leading-relaxed text-base-content/70">{loadError}</p>
        <Link href="/review" className="link link-hover text-sm text-base-content/60">
          Back to your drafts →
        </Link>
      </div>
    );
  }
  if (results === undefined) return <p className="text-base-content/60">Tallying up…</p>;

  // The draft is over and the deck is not built, so this screen is the deck
  // builder and nothing else. The score, the suggestion and the missed picks all
  // wait: half of them would answer the exercise, and the other half would turn
  // it into a footnote under a grade.
  if (!results.deck || !results.diff || !results.build) {
    return (
      <div className="flex flex-col gap-5">
        <header className="flex flex-col gap-1.5">
          <p className="eyebrow">Draft complete</p>
          <h2 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">
            Forty-five cards. Forty slots.
          </h2>
          <p className="max-w-prose text-sm text-base-content/60">
            Cut what you are not playing and decide how much land the rest wants. The suggested
            build and your grade are behind the lock.
          </p>
        </header>
        {/* Its own block under the header rather than a line inside it. What it
            says is that somebody is on the other side of this build, which is a
            different order of fact from the instructions for doing it. */}
        <ChallengeAnswered sessionId={sessionId} stage="building" />
        <DeckBuilder
          sessionId={sessionId}
          setCode={results.setCode}
          format={results.format}
          pool={results.pool}
          sideboard={results.sideboard}
          onBuilt={lockedIn}
        />
      </div>
    );
  }

  const { summary, deck, diff, mistakes } = results;
  const agreed = decksAgree(diff);

  // The player's forty, read back out of the pool exactly the way the builder
  // read it. Nothing stores a deck list -- see buildDeck -- and the pool is
  // already on the wire, so both sides of the comparison come from the one
  // answer the player gave.
  const built = buildDeck(
    deckPiles(results.pool, results.sideboard).maindeck.map((p) => p.card),
    results.build.basicLands,
  );
  const rows = alignDecks(built, deck);

  const apart = diff.onlyBuilt.length + diff.onlySuggested.length;

  // Out of forty, so the basics have to be in it. `diff.shared` counts named
  // cards only, and saying "22 of your 40" about two decks that also agree on
  // seventeen Islands understates the agreement by nearly half.
  const shared = diff.shared + Math.min(built.basicLands, deck.basicLands);

  return (
    <div className="flex flex-col gap-5">
      {asking && (
        <AfterDraft sessionId={sessionId} setCode={results.setCode} format={results.format} />
      )}

      {/* Above the grade, because a draft taken off somebody's link ends in two
          verdicts and this is the one they came for. Outside the REVEAL cascade
          on purpose: those four are the verdict landing in order, and this is
          the frame around it rather than a fifth beat of it. */}
      <ChallengeAnswered sessionId={sessionId} stage="built" />

      {/* The verdict and the argument for it, side by side. The score used to sit
          in a 360px rail down the right of the page, which cost the deck itself a
          quarter of the width it now spends on piles -- and a number that small
          does not need a column of its own. */}
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
        {/* Where the challenge banner's spur points, when there is one. The
            offset keeps this heading clear of the masthead rather than tucked
            under it, which is the difference between arriving at your result and
            arriving just past it. */}
        <header id={RESULT_ANCHOR} className={`flex scroll-mt-24 flex-col gap-1.5 ${REVEAL[0]}`}>
          <p className="eyebrow">Deck locked in</p>
          <h2 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">
            {agreed
              ? "The same forty, card for card."
              : `${shared} of your ${DECK.size} match the suggested build.`}
          </h2>
          <p className="max-w-prose text-sm text-base-content/60">
            The suggestion is what the card values and this format&rsquo;s price on a third color
            come to. It is an argument, not an answer — it cannot see that two of your removal
            spells want the same target, and you can.
          </p>
        </header>

        {/* The draft's answer to the per-pick grade, set the same way so the two
            read as the same verdict at two scales. No Colors row: the board below
            names both decks' colours, and this is about the picks.

            The way on sits inside it rather than in a panel of its own further
            down: the moment anyone is most likely to want the walkthrough is the
            moment they have just read the grade it explains, and that moment is
            here. */}
        <Panel
          title="Result"
          bodyClassName="gap-3"
          className={`lg:w-60 lg:shrink-0 ${REVEAL[1]}`}
        >
          <div className="flex items-baseline gap-2">
            <span className="font-display text-5xl font-semibold leading-none tracking-tight">
              {summary.overallScore.toFixed(1)}
            </span>
            <span className="text-sm tabular-nums text-base-content/45">/100</span>
          </div>

          <dl className="flex flex-col border-t border-base-300 pt-2 text-sm">
            {[
              ["Best-pick accuracy", `${(summary.accuracy * 100).toFixed(0)}%`],
              ["Picks", String(summary.pickCount)],
            ].map(([term, value]) => (
              <div key={term} className="flex justify-between gap-4 py-1 tabular-nums">
                <dt className="text-base-content/60">{term}</dt>
                <dd className="font-semibold">{value}</dd>
              </div>
            ))}
          </dl>

          <div className="flex flex-col gap-2 border-t border-base-300 pt-3">
            <Link href={`/review/${sessionId}`} className="btn btn-primary btn-sm w-full">
              Review it pick by pick
            </Link>
            {/* Here rather than on the review index, because this is the moment
                somebody has just finished and has an opinion about the packs.
                A day later, on a list, they have neither. */}
            <ChallengeAFriend sessionId={sessionId} where="results" />
            <Link href="/" className="link link-hover text-sm text-base-content/60">
              Draft another set →
            </Link>
          </div>
        </Panel>
      </div>

      {results.ratedCardCount === 0 && (
        <div role="alert" className="alert alert-warning">
          <span>
            <strong>This set has no 17Lands data.</strong> Cards were valued by rarity alone, so
            the score is inflated — when every card is worth about the same, a &ldquo;wrong&rdquo;
            pick barely costs anything. The missed-picks list is empty for the same reason:
            explaining a miss needs win rates. You still took something other than the top-valued
            card on {Math.round((1 - summary.accuracy) * summary.pickCount)} of{" "}
            {summary.pickCount} picks.
          </span>
        </div>
      )}

      <Panel
        // What a Magic player calls this object. "The two forties" was accurate
        // and was nobody's word for it.
        title="Decklist"
        aside={
          !agreed && (
            <span className="text-xs tabular-nums text-base-content/50">
              {apart} card{apart === 1 ? "" : "s"} apart
            </span>
          )
        }
        bodyClassName="gap-4"
        className={REVEAL[2]}
      >
        <DeckBoard
          rows={rows}
          basics={{ mine: built.basicLands, theirs: deck.basicLands }}
          agreed={agreed}
        />
        <div className="flex flex-wrap items-center gap-x-2.5 border-t border-base-300 pt-2 text-sm text-base-content/55">
          <span>Colors</span>
          <ColorPips colors={colorKey(committedColors(built.spells))} className="text-base" />
          {!agreed && (
            <>
              <span className="text-base-content/30">·</span>
              <ColorPips
                colors={colorKey(committedColors(deck.spells))}
                className="text-base opacity-60"
              />
              <span className="text-base-content/45">suggested</span>
            </>
          )}
        </div>

        {/* The half of a mana base the suggestion never had. "Add 17 basics" is
            not a deck: MANA-01 puts the split behind the colour asked for
            harder, MANA-02 floors a main colour at eight sources, and a readout
            that stops at the total is silent on both.

            Below the colours because it is the same subject one level down --
            which colours, then how many of each. */}
        {Object.keys(deck.basicsByColor).length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2.5 text-sm text-base-content/55">
            <span>Suggested mana</span>
            {Object.entries(deck.basicsByColor).map(([color, n]) => (
              <span key={color} className="flex items-center gap-1">
                <ColorPips colors={color} className="text-base" />
                <span className="tabular-nums">{n}</span>
              </span>
            ))}
            {deck.nonbasicLands.length > 0 && (
              <span className="text-base-content/45">
                + {deck.nonbasicLands.length} drafted
              </span>
            )}
          </div>
        )}

        {deck.uncastable.length > 0 && <Uncastable colors={deck.uncastable.join("")} />}
      </Panel>

      {mistakes.length > 0 && (
        <Panel title="Biggest missed picks" className={REVEAL[3]}>
          <ul className="flex flex-col">
            {mistakes.map((m) => (
              <li
                key={`${m.packNo}-${m.pickNo}`}
                className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-b border-base-300 py-1.5 text-sm last:border-0"
              >
                <span>
                  <span className="mr-1.5 tabular-nums text-base-content/60">
                    P{m.packNo}P{m.pickNo}
                  </span>
                  took <CardName card={m.picked} />
                </span>
                <span className="text-base-content/60">
                  over <CardName card={m.best} />{" "}
                  <span className="tabular-nums">+{(m.cost * 100).toFixed(1)}%</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
