"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useState } from "react";
import { useConvex, useConvexAuth } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { type Card, CURVE_TOP, DECK, decksAgree } from "@mtg-tutor/core";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import { pct } from "../lib/format";
import { CardPlacardList } from "./CardPlacard";
import { CardName } from "./CardText";
import { DeckBuilder } from "./DeckBuilder";
import { PageNotice } from "./PageShell";
import { Panel } from "./Panel";

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
  "motion-safe:animate-verdict [animation-delay:280ms]",
];

export function Results({ sessionId }: { sessionId: Id<"draftSessions"> }) {
  const convex = useConvex();
  const { isAuthenticated } = useConvexAuth();

  // Read once and re-read on purpose, not held open as a subscription. Answering
  // this query replays the draft and reads the whole pool, and the deck builder
  // below writes to the session on every card it moves -- so a live query would
  // pay for that replay again on each one. The only write that changes what this
  // screen says is locking the deck in, and that one asks for the reload itself.
  const [results, setResults] = useState<ResultsData | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setResults(await convex.query(api.draft.results, { sessionId }));
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [convex, sessionId]);

  // Ownership is checked server-side, so this waits for the token.
  useEffect(() => {
    if (!isAuthenticated) return;
    void load();
  }, [isAuthenticated, load]);

  if (loadError) return <PageNotice tone="error">{loadError}</PageNotice>;
  if (results === undefined) return <p className="text-base-content/60">Tallying up…</p>;

  // The draft is over and the deck is not built, so this screen is the deck
  // builder and nothing else. The score, the suggestion and the missed picks all
  // wait: half of them would answer the exercise, and the other half would turn
  // it into a footnote under a grade.
  if (!results.deck || !results.diff) {
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
        <DeckBuilder
          sessionId={sessionId}
          pool={results.pool}
          sideboard={results.sideboard}
          onBuilt={load}
        />
      </div>
    );
  }

  const { summary, deck, diff, mistakes } = results;
  const agreed = decksAgree(diff);

  return (
    <div className="flex flex-col gap-5">
      <header className={`flex flex-col gap-1.5 ${REVEAL[0]}`}>
        <p className="eyebrow">Deck locked in</p>
        <h2 className="font-display text-3xl font-semibold leading-tight sm:text-4xl">
          {agreed
            ? "The same forty, card for card."
            : `${diff.shared} of your ${DECK.size} match the suggested build.`}
        </h2>
        <p className="max-w-prose text-sm text-base-content/60">
          The suggestion is what the card values and this format&rsquo;s price on a third color
          come to. It is an argument, not an answer — it cannot see that two of your removal
          spells want the same target, and you can.
        </p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          {!agreed && (
            <Panel
              title={`${diff.onlyBuilt.length + diff.onlySuggested.length} cards apart`}
              className={REVEAL[1]}
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <DiffSide title="Only in your build" cards={diff.onlyBuilt} />
                <DiffSide title="Only in the suggestion" cards={diff.onlySuggested} />
              </div>
            </Panel>
          )}

          <Panel title="Shape" bodyClassName="gap-4" className={REVEAL[2]}>
            <CurveDiff built={diff.curve.built} suggested={diff.curve.suggested} />
            <div className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-6 border-t border-base-300 pt-2 text-sm">
              <span />
              <span className="eyebrow justify-self-end">Yours</span>
              <span className="eyebrow justify-self-end">Suggested</span>
              {[
                ["Lands", String(diff.lands.built), String(diff.lands.suggested)],
                [
                  "Colors",
                  diff.colors.built.join("") || "—",
                  diff.colors.suggested.join("") || "—",
                ],
              ].map(([term, mine, theirs]) => (
                <Fragment key={term}>
                  <span className="py-1 text-base-content/60">{term}</span>
                  <span className="justify-self-end py-1 font-semibold tabular-nums">{mine}</span>
                  <span className="justify-self-end py-1 tabular-nums text-base-content/50">
                    {theirs}
                  </span>
                </Fragment>
              ))}
            </div>
          </Panel>

          <Panel
            title={`The suggested build — ${deck.colors.join("") || "splashy"}`}
            aside={
              <span className="text-xs tabular-nums text-base-content/50">
                {deck.spells.length} spells
                {deck.nonbasicLands.length > 0 && ` + ${deck.nonbasicLands.length} lands`} +{" "}
                {deck.basicLands} basics
              </span>
            }
            className={REVEAL[3]}
          >
            <CardPlacardList
              cards={[...deck.spells, ...deck.nonbasicLands]}
              trailing={(c) => pct(c.gihWinRate)}
            />
          </Panel>

          {mistakes.length > 0 && (
            <Panel title="Biggest missed picks" className={REVEAL[4]}>
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

        <aside className="flex flex-col gap-4">
          {results.ratedCardCount === 0 && (
            <div role="alert" className="alert alert-warning">
              <span>
                <strong>This set has no 17Lands data.</strong> Cards were valued by rarity alone,
                so the score is inflated — when every card is worth about the same, a
                &ldquo;wrong&rdquo; pick barely costs anything. The missed-picks list is empty
                for the same reason: explaining a miss needs win rates. You still took something
                other than the top-valued card on{" "}
                {Math.round((1 - summary.accuracy) * summary.pickCount)} of {summary.pickCount}{" "}
                picks.
              </span>
            </div>
          )}

          {/* The draft's answer to the per-pick grade, set the same way so the
              two read as the same verdict at two scales. */}
          <Panel title="Result" bodyClassName="gap-3" className={REVEAL[1]}>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-5xl font-semibold leading-none tracking-tight">
                {summary.overallScore.toFixed(1)}
              </span>
              <span className="text-sm tabular-nums text-base-content/45">/100</span>
            </div>

            <dl className="flex flex-col border-t border-base-300 pt-2 text-sm">
              {[
                ["Best-pick accuracy", `${(summary.accuracy * 100).toFixed(0)}%`],
                ["Colors", summary.colorPair || "—"],
                ["Picks", String(summary.pickCount)],
              ].map(([term, value]) => (
                <div key={term} className="flex justify-between gap-4 py-1 tabular-nums">
                  <dt className="text-base-content/60">{term}</dt>
                  <dd className="font-semibold">{value}</dd>
                </div>
              ))}
            </dl>
          </Panel>

          <Panel className={REVEAL[2]}>
            {/* The moment anyone is most likely to want the walkthrough is the
                moment they have just seen the grade it explains. */}
            <Link href={`/review/${sessionId}`} className="btn btn-primary w-full">
              Review it pick by pick
            </Link>
            <Link href="/" className="link link-hover text-sm text-base-content/60">
              Draft another set →
            </Link>
          </Panel>
        </aside>
      </div>
    </div>
  );
}

// Neither list is the right answer, so neither is styled as one -- same weight,
// same trailing win rate, no arrow between them.
function DiffSide({ title, cards }: { title: string; cards: Card[] }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="eyebrow">{title}</div>
      {cards.length === 0 ? (
        <p className="text-sm text-base-content/50">Nothing.</p>
      ) : (
        <CardPlacardList cards={cards} trailing={(c) => pct(c.gihWinRate)} />
      )}
    </div>
  );
}

/**
 * Two curves on one axis.
 *
 * Bucketed by the turn a spell comes down on -- the same buckets ManaCurve draws
 * during the draft, so the shape you were watching build is the shape being
 * compared. Yours is drawn in the page's own parchment and the suggestion's
 * behind it in outline, because the deck you built is the subject and the other
 * one is the ruler held up against it.
 */
function CurveDiff({ built, suggested }: { built: number[]; suggested: number[] }) {
  const top = Math.max(1, ...built, ...suggested);
  const height = (n: number) => `${(n / top) * 100}%`;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="eyebrow">Curve</span>
        <span className="flex items-center gap-1.5 text-xs text-base-content/50">
          <span aria-hidden className="h-2.5 w-2 rounded-t-sm bg-base-content/70" />
          Yours
        </span>
        <span className="flex items-center gap-1.5 text-xs text-base-content/50">
          <span
            aria-hidden
            className="h-2.5 w-3 rounded-t-sm border border-dashed border-base-content/35"
          />
          Suggested
        </span>
      </div>
      <div className="flex items-end gap-1.5">
        {built.map((n, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div className="relative flex h-20 w-full items-end justify-center">
              <div
                aria-hidden
                className="absolute inset-x-0 bottom-0 rounded-t-sm border border-dashed border-base-content/35"
                style={{ height: height(suggested[i]) }}
              />
              <div
                aria-hidden
                className="relative w-3/5 rounded-t-sm bg-base-content/70"
                style={{ height: height(n) }}
              />
            </div>
            <span className="text-xs tabular-nums text-base-content/45">
              {i + 1 === CURVE_TOP ? `${CURVE_TOP}+` : i + 1}
            </span>
            <span className="sr-only">
              Turn {i + 1}: you {n}, suggested {suggested[i]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
