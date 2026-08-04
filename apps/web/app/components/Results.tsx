"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useConvex, useConvexAuth } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { type Card, CURVE_TOP } from "@mtg-tutor/core";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import { pct } from "../lib/format";
import { CardPlacardList } from "./CardPlacard";
import { CardName } from "./CardText";
import { DeckBuilder } from "./DeckBuilder";
import { PageNotice } from "./PageShell";
import { Panel } from "./Panel";

type ResultsData = FunctionReturnType<typeof api.draft.results>;

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
      <div className="flex flex-col gap-4">
        <Panel bodyClassName="gap-1">
          <h2 className="font-display text-2xl font-semibold leading-tight">Build your forty.</h2>
          <p className="text-sm text-base-content/60">
            Forty-five cards, forty slots. Cut what you are not playing, decide how much land it
            wants, and lock it in — the grade and the suggested build are on the other side.
          </p>
        </Panel>
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

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-4">
        <Panel
          title="Where you and the numbers disagree"
          aside={
            <span className="text-xs tabular-nums text-base-content/50">
              {diff.shared} cards in common
            </span>
          }
          bodyClassName="gap-4"
        >
          {diff.onlyBuilt.length === 0 && diff.onlySuggested.length === 0 ? (
            <p className="text-sm text-base-content/60">
              The same forty, card for card.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <DiffSide
                title="You played"
                caption="and it left out"
                cards={diff.onlyBuilt}
              />
              <DiffSide
                title="It played"
                caption="and you left out"
                cards={diff.onlySuggested}
              />
            </div>
          )}

          <CurveDiff built={diff.curve.built} suggested={diff.curve.suggested} />

          <dl className="grid grid-cols-2 gap-x-4 border-t border-base-300 pt-2 text-sm">
            <Row term="Your lands" value={String(diff.lands.built)} />
            <Row term="Its lands" value={String(diff.lands.suggested)} />
            <Row term="Your colors" value={diff.colors.built.join("") || "—"} />
            <Row term="Its colors" value={diff.colors.suggested.join("") || "—"} />
          </dl>
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
        >
          <CardPlacardList
            cards={[...deck.spells, ...deck.nonbasicLands]}
            trailing={(c) => pct(c.gihWinRate)}
          />
        </Panel>

        {mistakes.length > 0 && (
          <Panel title="Biggest missed picks">
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
              <strong>This set has no 17Lands data.</strong> Cards were valued by rarity
              alone, so the score is inflated — when every card is worth about the same, a
              &ldquo;wrong&rdquo; pick barely costs anything. The missed-picks list is
              empty for the same reason: explaining a miss needs win rates. You still took
              something other than the top-valued card on{" "}
              {Math.round((1 - summary.accuracy) * summary.pickCount)} of {summary.pickCount}{" "}
              picks.
            </span>
          </div>
        )}

        {/* The draft's answer to the per-pick grade, set the same way so the two
            read as the same verdict at two scales. */}
        <Panel title="Result" bodyClassName="gap-3">
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

        <Panel>
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
  );
}

// Neither list is the right answer, so neither is styled as one. The suggestion
// is what the card values and the format's width price come to; it cannot see
// that your two removal spells want the same target and you can.
function DiffSide({
  title,
  caption,
  cards,
}: {
  title: string;
  caption: string;
  cards: Card[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="eyebrow">
        {title} <span className="text-base-content/40">{caption}</span>
      </div>
      {cards.length === 0 ? (
        <p className="text-sm text-base-content/50">Nothing.</p>
      ) : (
        <CardPlacardList cards={cards} trailing={(c) => pct(c.gihWinRate)} />
      )}
    </div>
  );
}

// Two curves on one axis, scaled together so the taller deck is visibly taller.
// Bucketed by the turn the spell comes down on — the same buckets ManaCurve
// draws during the draft.
function CurveDiff({ built, suggested }: { built: number[]; suggested: number[] }) {
  const top = Math.max(1, ...built, ...suggested);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="eyebrow">Curve</div>
      <div className="flex items-end gap-2">
        {built.map((n, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-16 w-full items-end justify-center gap-0.5">
              <Bar height={n / top} className="bg-primary" title={`You: ${n}`} />
              <Bar
                height={suggested[i] / top}
                className="bg-base-content/25"
                title={`Suggested: ${suggested[i]}`}
              />
            </div>
            <span className="text-xs tabular-nums text-base-content/45">
              {i + 1 === CURVE_TOP ? `${CURVE_TOP}+` : i + 1}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const Bar = ({
  height,
  className,
  title,
}: {
  height: number;
  className: string;
  title: string;
}) => (
  <div
    title={title}
    className={`w-1/2 rounded-t-sm ${className}`}
    style={{ height: `${Math.max(height * 100, height > 0 ? 4 : 0)}%` }}
  />
);

const Row = ({ term, value }: { term: string; value: string }) => (
  <div className="flex justify-between gap-4 py-1 tabular-nums">
    <dt className="text-base-content/60">{term}</dt>
    <dd className="font-semibold">{value}</dd>
  </div>
);
