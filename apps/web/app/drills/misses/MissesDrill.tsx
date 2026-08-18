"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@mtg-tutor/backend";
import type { Card } from "@mtg-tutor/core";
import { gradeMiss, scoreMissRun, type MissResult } from "@mtg-tutor/core";
import { CardFace, CardTile } from "../../components/CardTile";
import { ColorPips } from "../../components/ColorPips";
import { PageHeading } from "../../components/PageHeading";
import { Panel } from "../../components/Panel";
import { SetIcon } from "../../components/SetIcon";
import { points } from "../../lib/format";
import { drillAnswered, drillFinished, drillStarted } from "../../lib/analytics";

// The misses drill, played.
//
// One pack at a time, exactly as it was dealt the first time, with no sign of
// which card was taken until the pack is answered. That blindness is the whole
// question the feature is asking: a pick you can see your own answer to is a
// memory test, and the thing worth knowing is whether you would choose
// differently now.
//
// NOTHING PERSISTS. A run is state in this component and is gone on reload --
// see convex/drills/misses.ts for why that is the design rather than a stage of
// it. `skip` is how a second run avoids repeating the first, and it resets with
// the page for the same reason.

type Run = NonNullable<ReturnType<typeof useDeal>>;
type Question = Run["questions"][number];

const useDeal = (skip: number) => useQuery(api.drills.misses.deal, { skip });

const DAY = 24 * 60 * 60 * 1000;
const ageInDays = (iso: string) =>
  Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / DAY));

export function MissesDrill() {
  const [skip, setSkip] = useState(0);
  const [step, setStep] = useState(0);
  // Keyed by the question rather than by position, so paging to another run
  // cannot show a previous run's answer against a new pack.
  const [answers, setAnswers] = useState<ReadonlyMap<string, string>>(new Map());

  // FROZEN ON ARRIVAL, and not merely cached. `deal` is a live subscription, so
  // finishing a draft in another tab re-ranks the candidates and would swap the
  // pack out from under somebody mid-question. A run is a hand you were dealt;
  // it does not get re-dealt because the world moved.
  const live = useDeal(skip);
  const [run, setRun] = useState<Run>();
  const sets = useQuery(api.sets.list);

  const questions = useMemo(() => run?.questions ?? [], [run]);
  const current = questions[step];
  const finished = run != null && step >= questions.length;

  const key = (q: Question) => `${q.sessionId}:${q.pickIndex}`;
  const guess = current ? answers.get(key(current)) : undefined;

  const results = useMemo(() => {
    const out: MissResult[] = [];
    for (const q of questions) {
      const answer = answers.get(key(q));
      if (answer) out.push(gradeMiss(q, answer));
    }
    return out;
  }, [questions, answers]);

  // Freezing the hand and counting it are the same moment, so they are one
  // effect: whatever is reported as served is exactly what gets played.
  const dealtFor = useRef<number | null>(null);
  useEffect(() => {
    if (!live || dealtFor.current === skip) return;
    dealtFor.current = skip;
    setRun(live);
    drillStarted({
      drill: "misses",
      served: live.questions.length,
      drafts: live.drafts,
      candidates: live.candidates,
      unavailable: live.unavailable,
      skip,
    });
  }, [live, skip]);

  const reported = useRef<string | null>(null);
  useEffect(() => {
    if (!finished || questions.length === 0) return;
    const id = `${skip}:${questions.length}`;
    if (reported.current === id) return;
    reported.current = id;
    drillFinished({ drill: "misses", served: questions.length, ...scoreMissRun(results) });
  }, [finished, questions.length, results, skip]);

  function answer(question: Question, card: Card) {
    const result = gradeMiss(question, card.name);
    setAnswers((prev) => new Map(prev).set(key(question), card.name));
    drillAnswered({
      drill: "misses",
      outcome: result.outcome,
      tookRawBest: result.tookRawBest,
      gap: question.gap,
      ageDays: ageInDays(question.draftedAt),
      setCode: question.setCode,
      index: step,
    });
  }

  function deal(next: number) {
    setSkip(next);
    setRun(undefined);
    setStep(0);
    setAnswers(new Map());
  }

  if (run === undefined) {
    return <p className="text-base-content/60">Finding the ones you got wrong…</p>;
  }

  if (questions.length === 0) {
    return <Nothing run={run} skip={skip} onRestart={() => deal(0)} />;
  }

  const set = current
    ? (sets ?? []).find((s) => s.code === current.setCode && s.format === current.format)
    : undefined;

  return (
    <>
      <PageHeading
        title={
          finished ? (
            "That's the run"
          ) : (
            <>
              Pack {current.packNo} · Pick {current.pickNo}
              <span className="ml-2.5 font-sans text-sm font-normal text-base-content/50">
                {set?.name ?? current.setCode.toUpperCase()} ·{" "}
                {ageInDays(current.draftedAt) === 0
                  ? "today"
                  : `${ageInDays(current.draftedAt)} days ago`}
              </span>
            </>
          )
        }
        icon={
          finished ? undefined : (
            <SetIcon uri={set?.iconUri} name={set?.name} className="size-6 text-base-content/50" />
          )
        }
        controls={
          <span className="text-sm tabular-nums text-base-content/50">
            {Math.min(step + 1, questions.length)} / {questions.length}
          </span>
        }
      />

      {finished ? (
        <Scoreboard
          results={results}
          served={questions.length}
          onAgain={() => deal(run.nextSkip)}
        />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <Panel
            title={guess ? "What you did" : "Which card was this deck's pick?"}
            aside={
              <span className="text-xs tabular-nums text-base-content/50">
                {current.pack.length} cards
              </span>
            }
            bodyClassName="gap-4"
            footer={
              <nav className="flex items-center justify-end">
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={!guess}
                  onClick={() => setStep((s) => s + 1)}
                >
                  {step === questions.length - 1 ? "Finish" : "Next →"}
                </button>
              </nav>
            }
          >
            {guess ? (
              <Reveal question={current} result={gradeMiss(current, guess)} guess={guess} />
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3.5">
                {current.pack.map((card) => (
                  <CardTile
                    key={card.name}
                    card={card}
                    // The hover panel leads with the win rate, which is most of
                    // the answer -- the same reason the review quiz hides it.
                    showStats={false}
                    label={`Take ${card.name}`}
                    onPick={(picked) => answer(current, picked)}
                  />
                ))}
              </div>
            )}
          </Panel>

          <Deck cards={current.pool} />
        </div>
      )}
    </>
  );
}

/**
 * The deck the question is about.
 *
 * Not context, but half the question: the answer is the card that best served
 * THIS deck, so a pack shown without the pool beside it is asking which card is
 * strongest -- a different question, with a different answer, and the gap
 * between the two is the thing the drill is made of.
 */
function Deck({ cards }: { cards: { name: string; colors: string[] }[] }) {
  return (
    <Panel
      title="Your deck at this point"
      aside={<span className="text-xs tabular-nums text-base-content/50">{cards.length}</span>}
    >
      {cards.length === 0 ? (
        <p className="text-sm text-base-content/60">
          Nothing yet — this was your first pick of the draft.
        </p>
      ) : (
        <ul className="flex flex-col text-sm">
          {cards.map((card, i) => (
            // Two copies of one card is normal and both belong on the list.
            <li
              key={`${i}-${card.name}`}
              className="flex items-center justify-between gap-3 border-b border-base-300 py-1 last:border-0"
            >
              <span className="truncate">{card.name}</span>
              <ColorPips colors={card.colors.join("")} className="shrink-0 text-xs" />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/**
 * What happened, in the order it matters.
 *
 * The answer first, then what they just did, then what they did the first time
 * -- because the last of those is the only part they cannot get from the draft
 * screen, and putting it last is what makes the screen read as a comparison
 * rather than as a grade.
 */
function Reveal({
  question,
  result,
  guess,
}: {
  question: Question;
  result: MissResult;
  guess: string;
}) {
  const card = (name: string) => question.pack.find((c) => c.name === name);
  const answer = card(question.gradedName);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-6">
        <Named label="The pick" card={answer} name={question.gradedName} highlight />
        {!result.correct && <Named label="You took" card={card(guess)} name={guess} />}
        {!result.repeated && (
          <Named label="You took then" card={card(question.tookName)} name={question.tookName} />
        )}
      </div>

      <p className="text-base-content/80">
        {result.outcome === "fixed" ? (
          <>
            <span className="font-semibold text-success">You would take it now.</span> First time
            through you took {question.tookName}, and it cost{" "}
            <span className="tabular-nums">{points(question.gap)}</span> against the deck you were
            building.
          </>
        ) : result.outcome === "stood" ? (
          <>
            <span className="font-semibold">Same call, twice.</span> {question.gradedName} was
            worth <span className="tabular-nums">{points(question.gap)}</span> more to this deck.
            Standing by a pick the grade docked is worth something on its own — it is a
            disagreement with the data rather than a slip.
          </>
        ) : (
          <>
            <span className="font-semibold">Different card, same miss.</span> You took{" "}
            {question.tookName} first time and {guess} now; the deck wanted{" "}
            {question.gradedName}, by <span className="tabular-nums">{points(question.gap)}</span>.
          </>
        )}
        {result.tookRawBest && (
          <>
            {" "}
            {guess} is the strongest card in the pack on raw win rate — this is the gap between
            the best card and the best card <em>for you</em>.
          </>
        )}
      </p>
    </div>
  );
}

function Named({
  label,
  card,
  name,
  highlight,
}: {
  label: string;
  card?: Card;
  name: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="eyebrow">{label}</span>
      {/* Through CardFace rather than an <img>, so a card with no art renders as
          the named placeholder the rest of the app draws instead of a gap. */}
      <div className="w-[132px]">
        {card ? (
          <CardFace card={card} className={highlight ? "ring-2 ring-primary" : ""} />
        ) : (
          <span className="text-sm">{name}</span>
        )}
      </div>
      <span className="max-w-[132px] text-sm leading-snug">{name}</span>
    </div>
  );
}

function Scoreboard({
  results,
  served,
  onAgain,
}: {
  results: MissResult[];
  served: number;
  onAgain: () => void;
}) {
  const score = scoreMissRun(results);

  return (
    <Panel title="This run" bodyClassName="gap-4">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-5xl font-semibold leading-none tracking-tight">
          {score.fixed}
        </span>
        <span className="text-sm tabular-nums text-base-content/45">
          / {score.answered} you would now take back
        </span>
      </div>

      <dl className="flex flex-col text-sm">
        {[
          ["Fixed", score.fixed, "took the card the deck wanted"],
          ["Stood by it", score.stood, "made the same call again"],
          ["Missed again", score.missed, "changed your mind, still not it"],
        ].map(([term, value, hint]) => (
          <div
            key={String(term)}
            className="flex items-baseline justify-between gap-4 border-b border-base-300 py-1.5 last:border-0"
          >
            <dt>
              {term} <span className="text-base-content/50">— {hint}</span>
            </dt>
            <dd className="font-semibold tabular-nums">{String(value)}</dd>
          </div>
        ))}
      </dl>

      {/* No claim about improvement over time, because nothing here can support
          one: a run is not recorded, so this number is about this sitting and
          says so. */}
      <div className="flex flex-wrap gap-2 border-t border-base-300 pt-3">
        <button type="button" className="btn btn-sm btn-primary" onClick={onAgain}>
          Another {served}
        </button>
        <Link href="/stats" className="btn btn-sm btn-ghost">
          See the whole picture
        </Link>
      </div>
    </Panel>
  );
}

/**
 * An empty run, which has four different meanings.
 *
 * A screen that says "nothing here" to all of them is telling somebody who has
 * done everything right that the app is broken. Ordered from the most common
 * arrival -- a new account -- down to the rarest.
 */
function Nothing({ run, skip, onRestart }: { run: Run; skip: number; onRestart: () => void }) {
  if (skip > 0) {
    return (
      <Empty title="That is all of them">
        <p>
          You have worked through every miss the last {run.drafts} drafts recorded. Take another
          draft and this fills back up.
        </p>
        <button type="button" className="btn btn-sm btn-primary mt-4" onClick={onRestart}>
          Start again from the worst
        </button>
      </Empty>
    );
  }

  if (run.drafts === 0) {
    return (
      <Empty title="Nothing to take back yet">
        <p>
          This deals back the packs you got wrong, and it needs a finished draft to get them
          from — all forty-five picks made.
        </p>
        <Link href="/" className="btn btn-sm btn-primary mt-4">
          Draft a set
        </Link>
      </Empty>
    );
  }

  if (run.unavailable > 0) {
    return (
      <Empty title="Those packs have moved on">
        <p>
          {run.unavailable === 1 ? "The one miss" : `All ${run.unavailable} misses`} worth asking
          about {run.unavailable === 1 ? "comes" : "come"} from a set that has been re-ingested
          since, and {run.unavailable === 1 ? "its pack holds a card" : "their packs hold cards"}{" "}
          the set no longer has. Newer drafts will fill this.
        </p>
      </Empty>
    );
  }

  return (
    <Empty title="Nothing worth asking about">
      <p>
        Your last {run.drafts} {run.drafts === 1 ? "draft" : "drafts"} have no pick that both
        cost real win rate and had a pack worth thinking about. That is the good version of an
        empty screen.
      </p>
      <Link href="/stats" className="btn btn-sm btn-ghost mt-4">
        See the whole picture
      </Link>
    </Empty>
  );
}

function Empty({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="max-w-2xl py-6">
      <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="mt-3 text-base-content/70">{children}</div>
    </section>
  );
}
