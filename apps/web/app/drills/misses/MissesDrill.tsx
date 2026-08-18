"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@mtg-tutor/backend";
import type { Card, DisplayCard } from "@mtg-tutor/core";
import { gradeMiss, scoreMissRun, tally, type MissResult } from "@mtg-tutor/core";
import { CardPlacardList } from "../../components/CardPlacard";
import { CardFace, CardTile } from "../../components/CardTile";
import { ColorTally } from "../../components/ColorPips";
import { DeckShape } from "../../components/DeckShape";
import { PageHeading } from "../../components/PageHeading";
import { Panel } from "../../components/Panel";
import { PickTrack, type Tick } from "../../components/PickTrack";
import {
  CONTEXT_BEST,
  MARK,
  type Mark,
  MarkRail,
  RAW_BEST,
  TOOK,
} from "../../components/PickMarks";
import { SealedPick, ageInDays, stamp } from "../../components/SealedPick";
import { SetIcon } from "../../components/SetIcon";
import { points } from "../../lib/format";
import { drillAnswered, drillFinished, drillStarted } from "../../lib/analytics";

// The misses drill, played.
//
// One pack at a time, exactly as it was dealt, with no sign of which card was
// taken until the pack is answered. That blindness is the question the feature
// asks: a pick you can see your own answer to is a memory test, and what is
// worth knowing is whether you would choose differently now.
//
// THE ANSWER YOU GAVE LAST TIME IS ON THE TABLE THE WHOLE TIME, face-down and
// stamped with the date you gave it. It is the one thing this screen has that no
// other screen in the app does -- a piece of information that already exists and
// is deliberately withheld -- and a card turned over is how the game itself says
// that. Everything else is the app's existing vocabulary: the marks and their
// colours come from PickMarks, which the review argues over a pack with, and the
// gold ring is the same "card you are holding" the draft board lights a
// selection with.
//
// NOTHING PERSISTS. A run is state in this component and is gone on reload --
// see convex/drills/misses.ts for why that is the design rather than a stage of
// it. `skip` is how a second run avoids repeating the first, and it resets with
// the page for the same reason.

type Run = NonNullable<ReturnType<typeof useDeal>>;
type Question = Run["questions"][number];

const useDeal = (skip: number) => useQuery(api.drills.misses.deal, { skip });

const TICK: Record<MissResult["outcome"], Tick["state"]> = {
  fixed: "hit",
  stood: "stood",
  missed: "miss",
};

export function MissesDrill() {
  const [skip, setSkip] = useState(0);
  const [step, setStep] = useState(0);
  // A run opens on the table rather than on its first question. The count and
  // where the packs came from are worth a beat, and this is also the one place
  // the sealed cards can be seen as a stack -- which is what the drill is: a
  // pile of decisions you have already made, face-down.
  const [begun, setBegun] = useState(false);
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

  const graded = useMemo(
    () =>
      questions.map((q) => {
        const answer = answers.get(key(q));
        return answer ? gradeMiss(q, answer) : undefined;
      }),
    [questions, answers],
  );
  const results = useMemo(() => graded.filter((r): r is MissResult => r != null), [graded]);

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
    setBegun(false);
    setAnswers(new Map());
  }

  if (run === undefined) {
    return <p className="text-base-content/60">Finding the ones you got wrong…</p>;
  }

  if (questions.length === 0) {
    return <Nothing run={run} skip={skip} onRestart={() => deal(0)} />;
  }

  if (!begun) {
    return <Table run={run} sets={sets ?? []} onBegin={() => setBegun(true)} />;
  }

  const set = current
    ? (sets ?? []).find((s) => s.code === current.setCode && s.format === current.format)
    : undefined;

  // The run, drawn as what it is. The ticks carry how each pack went, so the
  // track fills in AS the score -- which is why nothing at the end restates it
  // as a fraction in large type.
  const track: Tick[] = questions.map((question, i) => {
    const result = graded[i];
    return {
      state: !result ? (i === step && !finished ? "current" : "ahead") : TICK[result.outcome],
      label:
        `Go to pack ${question.packNo}, pick ${question.pickNo}` +
        (!result
          ? ""
          : result.outcome === "fixed"
            ? " — you took it back"
            : result.outcome === "stood"
              ? " — you stood by it"
              : " — missed again"),
    };
  });

  return (
    <>
      <PageHeading
        icon={
          finished ? undefined : (
            <SetIcon uri={set?.iconUri} name={set?.name} className="size-6 text-base-content/50" />
          )
        }
        title={
          finished ? (
            "That is the run"
          ) : (
            <>
              P{current.packNo}P{current.pickNo}
              <span className="ml-3 font-sans text-sm font-normal text-base-content/50">
                {set?.name ?? current.setCode.toUpperCase()}
              </span>
            </>
          )
        }
      >
        <PickTrack
          groups={[track]}
          here={finished ? undefined : step}
          label={
            finished
              ? `Run complete: ${questions.length} packs.`
              : `Pack ${step + 1} of ${questions.length}. Select one to go back to it.`
          }
          onSelect={setStep}
        />
      </PageHeading>

      {finished ? (
        <Finish
          questions={questions}
          graded={graded}
          onAgain={() => deal(run.nextSkip)}
          onBack={() => setStep(0)}
        />
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Panel
            title={guess ? "What you did, both times" : "Which card did this deck want?"}
            aside={
              <span className="text-xs tabular-nums text-base-content/50">
                {current.pack.length} cards
              </span>
            }
            bodyClassName="gap-4"
            footer={
              <nav className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs text-base-content/45">
                  {guess ? "" : "You already picked one of these once."}
                </span>
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

          <aside className="flex flex-col gap-4">
            <SealedPick
              name={current.tookName}
              card={current.pack.find((c) => c.name === current.tookName)}
              draftedAt={current.draftedAt}
              turned={guess != null}
            />
            <Deck cards={current.pool} />
          </aside>
        </div>
      )}
    </>
  );
}

/**
 * The table the run is dealt onto.
 *
 * A drill that drops you straight into question one has no occasion, and the
 * count is worth a beat: ten sealed picks, from three drafts, worst first. It
 * is also the only place the sealed cards can be seen as a STACK, which is what
 * the drill actually is -- a pile of decisions you have already made, turned
 * over.
 *
 * The stack is real rather than illustrative. Each card is one of the questions
 * about to be dealt and carries the date that pick was made, so the fan says
 * how far back the run reaches without a sentence about it.
 */
function Table({
  run,
  sets,
  onBegin,
}: {
  run: Run;
  sets: { code: string; format: string; name?: string; iconUri?: string }[];
  onBegin: () => void;
}) {
  const questions = run.questions;
  // Five is what fans legibly at this size; the rest are behind them anyway,
  // which is true of a stack.
  const fanned = questions.slice(0, 5);
  const codes = [...new Set(questions.map((q) => q.setCode))];
  const oldest = questions.reduce(
    (days, q) => Math.max(days, ageInDays(q.draftedAt)),
    0,
  );

  return (
    <section className="grid items-center gap-10 py-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div>
        <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight">
          {questions.length} picks you would
          <br />
          probably take back.
        </h1>
        <p className="mt-4 leading-relaxed text-base-content/70">
          Each one comes back as the pack it came from — the same cards, the deck you had at
          the time, and no sign of what you took. Answer, and the card you took that day turns
          over beside it.
        </p>

        <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
          {[
            ["Drafted", oldest === 0 ? "today" : `over the last ${oldest} days`],
            ["From", `${codes.length} ${codes.length === 1 ? "set" : "sets"} — ${codes
              .map((c) => c.toUpperCase())
              .join(", ")}`],
            ["Order", "worst first"],
          ].map(([term, value]) => (
            <div key={term}>
              <dt className="eyebrow">{term}</dt>
              <dd className="mt-0.5 text-sm text-base-content/80">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <button type="button" className="btn btn-primary" onClick={onBegin}>
            Deal the first pack
          </button>
          <span className="text-sm text-base-content/50">Nothing is saved either way.</span>
        </div>

        {run.unavailable > 0 && (
          <p className="mt-4 text-sm text-base-content/45">
            {run.unavailable} more {run.unavailable === 1 ? "is" : "are"} being held back: their
            sets have been re-ingested since, and the packs hold cards those sets no longer have.
          </p>
        )}
      </div>

      {/* The stack, fanned. Rotated about a point below the cards so they splay
          from a single hinge the way a held hand does, rather than sliding along
          a rail. */}
      <ul aria-hidden className="relative mx-auto flex h-[19rem] w-full max-w-md items-center justify-center">
        {fanned.map((question, i) => {
          const spread = i - (fanned.length - 1) / 2;
          const set = sets.find((s) => s.code === question.setCode);
          return (
            <li
              key={`${question.sessionId}-${question.pickIndex}`}
              className="absolute w-[10.5rem] origin-[50%_140%]"
              style={{
                transform: `rotate(${spread * 7}deg)`,
                zIndex: fanned.length - Math.abs(spread),
              }}
            >
              <div className="card-aspect flex flex-col items-center justify-center gap-2 rounded-xl border border-base-300 bg-base-200">
                <SetIcon
                  uri={set?.iconUri}
                  name={set?.name}
                  className="size-5 text-base-content/30"
                />
                <span className="font-display text-xl font-semibold tracking-tight text-base-content/70">
                  {stamp(question.draftedAt)}
                </span>
                <span className="h-px w-7 bg-primary/40" />
                <span className="text-[0.6875rem] tabular-nums text-base-content/35">
                  P{question.packNo}P{question.pickNo}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The deck the question is about.
 *
 * Half the question rather than context: the answer is the card that best
 * served THIS deck, so a pack shown without it is asking which card is
 * strongest -- a different question with a different answer.
 *
 * It is the draft board's own picks column, minus the parts that would lie. The
 * curve, the colour tally, the type and creature-type counts and the placards
 * are the same components reading the same cards, because a player who has
 * learned to read their pool mid-draft should not have to learn a second
 * shorthand to read it here. What is deliberately absent is everything that
 * offers to CHANGE the pile -- the drop zones, the bench buttons, the sideboard
 * -- because this deck is a fact about a draft that is over.
 *
 * The sideboard is applied before it gets here, at that pick's own clock, so
 * this is what the player was actually building rather than everything they had
 * taken.
 */
function Deck({ cards }: { cards: DisplayCard[] }) {
  return (
    <Panel
      title="Your deck then"
      aside={<ColorTally colors={tally(cards, (c) => c.colors)} />}
    >
      {cards.length === 0 ? (
        <p className="text-sm text-base-content/60">
          Nothing yet — this was your first pick of the draft, so every colour was still open.
        </p>
      ) : (
        <>
          <DeckShape cards={cards} />
          <div className="flex flex-col gap-1.5">
            <div className="eyebrow">Maindeck ({cards.length})</div>
            <CardPlacardList cards={cards} className="max-h-[45vh] overflow-y-auto pr-1" />
          </div>
        </>
      )}
    </Panel>
  );
}

/**
 * What happened, said in the app's own marks.
 *
 * The words and their colours are the review's, out of PickMarks: green for the
 * card the deck wanted, blue for the card you took at the time, orange for the
 * strongest card in the pack. The gold ring is deliberately not one of them --
 * it is the same "card you are holding" the draft board lights a selection with,
 * and here it marks the choice you just made. So the marks say what the data
 * says and the gold says what you did, which is the division the app already
 * runs on.
 *
 * The pleasing case is `stood`, where one card wears both. That is exactly true:
 * you answered with the card you took.
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

  // One entry per card worth showing, in the order the sentence reads them. A
  // card that is two things at once appears once, wearing both marks.
  const shown = [...new Set([question.gradedName, guess, question.tookName])];

  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-wrap gap-x-5 gap-y-4">
        {shown.map((name) => {
          const marks: Mark[] = [
            name === question.gradedName && CONTEXT_BEST,
            name === question.tookName && TOOK,
            name === question.rawBestName && RAW_BEST,
          ].filter((m): m is Mark => Boolean(m));
          const held = name === guess;
          const face = card(name);

          return (
            <li key={name} className="flex items-stretch gap-2">
              <MarkRail marks={marks} />
              <div className="w-[9rem]">
                <div className="mb-1 flex min-h-[1.25rem] flex-wrap items-baseline gap-x-1.5">
                  {marks.map((mark, i) => (
                    <span key={mark.label} className={`${MARK} ${mark.tone}`}>
                      {i > 0 && <span className="mr-1.5 text-base-content/25">·</span>}
                      {mark.label}
                    </span>
                  ))}
                </div>
                {/* A still gold ring rather than `card-lit`. Gold is right --
                    it is the card you are holding -- but card-lit TURNS, and
                    globals.css is explicit that the turning is what marks a
                    choice held open, waiting on you. This choice is made. */}
                {face ? (
                  <CardFace
                    card={face}
                    className={held ? "ring-2 ring-primary" : ""}
                  />
                ) : (
                  <span className="text-sm">{name}</span>
                )}
                <p
                  className={`mt-1.5 text-xs leading-snug ${
                    held ? "text-primary" : "text-base-content/45"
                  }`}
                >
                  {held ? "you took this just now" : name}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="max-w-prose leading-relaxed text-base-content/80">
        {result.outcome === "fixed" ? (
          <>
            <span className="font-semibold text-success">You took it back.</span> The first time
            through, that pick cost you{" "}
            <span className="tabular-nums">{points(question.gap)}</span> against the deck you were
            building.
          </>
        ) : result.outcome === "stood" ? (
          <>
            <span className="font-semibold text-info">Same call, twice.</span> The gap is{" "}
            <span className="tabular-nums">{points(question.gap)}</span>. Standing by a pick the
            grade docked is not the same as missing it — it is a disagreement with the data, and
            it is worth knowing which of you is right.
          </>
        ) : (
          <>
            <span className="font-semibold text-error">Different card, same miss.</span> You
            changed your mind and landed somewhere else again, still{" "}
            <span className="tabular-nums">{points(question.gap)}</span> short of what the deck
            wanted.
          </>
        )}
        {result.tookRawBest && (
          <>
            {" "}
            You took the strongest card in the pack on raw win rate, which is the most
            interesting way to be wrong here: this is the gap between the best card and the best
            card <em>for this deck</em>.
          </>
        )}
      </p>
    </div>
  );
}

/**
 * The end of a run, which names cards rather than scoring you.
 *
 * The track above has already said how it went, tick by tick, so a panel
 * restating that as a fraction in large type would be the same sentence twice --
 * and the number is the less useful half. The stats screen makes the same call
 * about the same data: an average says you are a B+ drafter, and a list of cards
 * says which one you keep passing.
 */
function Finish({
  questions,
  graded,
  onAgain,
  onBack,
}: {
  questions: Question[];
  graded: (MissResult | undefined)[];
  onAgain: () => void;
  onBack: () => void;
}) {
  const rows = questions
    .map((question, i) => ({ question, result: graded[i] }))
    .filter((row): row is { question: Question; result: MissResult } => row.result != null);

  const score = scoreMissRun(rows.map((r) => r.result));
  // The same three colours the ticks above use, for the same three things.
  const tone: Record<MissResult["outcome"], Mark> = {
    fixed: CONTEXT_BEST,
    stood: TOOK,
    missed: { ...RAW_BEST, label: "missed again", tone: "text-error", rail: "bg-error/60" },
  };
  const said: Record<MissResult["outcome"], string> = {
    fixed: "took it back",
    stood: "stood by it",
    missed: "missed again",
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Panel title="Every pack you took again" bodyClassName="gap-0">
        {rows.length === 0 ? (
          <p className="text-base-content/60">
            You stepped through without answering any of them. Nothing is recorded either way.
          </p>
        ) : (
          <ul className="flex flex-col">
            {rows.map(({ question, result }, i) => {
              const mark = tone[result.outcome];
              return (
                <li
                  key={`${question.sessionId}-${question.pickIndex}-${i}`}
                  className="flex items-stretch gap-2.5 border-b border-base-300 py-2 last:border-0"
                >
                  <MarkRail marks={[mark]} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="text-sm">
                        <span className="mr-1.5 tabular-nums text-base-content/45">
                          {question.setCode.toUpperCase()} P{question.packNo}P{question.pickNo}
                        </span>
                        {result.outcome === "fixed" ? question.gradedName : question.tookName}
                      </span>
                      <span className={`${MARK} ${mark.tone}`}>{said[result.outcome]}</span>
                    </div>
                    {result.outcome !== "fixed" && (
                      <p className="text-xs text-base-content/45">
                        the deck wanted {question.gradedName}, by{" "}
                        <span className="tabular-nums">{points(question.gap)}</span>
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <aside className="flex flex-col gap-4">
        <Panel title="This run" bodyClassName="gap-3">
          <p className="leading-relaxed text-base-content/80">
            {score.answered === 0 ? (
              <>Nothing answered this time.</>
            ) : score.fixed === 0 ? (
              <>
                You stood by or re-missed all {score.answered} of them — which is its own answer
                about the grader.
              </>
            ) : (
              <>
                <span className="font-semibold text-success">{score.fixed}</span> of{" "}
                {score.answered} you would now take back.
              </>
            )}
          </p>
          {/* No trend, no streak, no claim about getting better: nothing is
              recorded, so this is a sentence about one sitting and says so. */}
          <p className="text-xs leading-snug text-base-content/45">
            Nothing here is saved, so this is today only. Play the same packs again whenever you
            like.
          </p>
          <div className="flex flex-wrap gap-2 border-t border-base-300 pt-3">
            <button type="button" className="btn btn-sm btn-primary" onClick={onAgain}>
              Another {questions.length}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={onBack}>
              Read them back
            </button>
          </div>
        </Panel>
      </aside>
    </div>
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
          This deals back the packs you got wrong, and it needs a finished draft to get them from
          — all forty-five picks made.
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
        Your last {run.drafts} {run.drafts === 1 ? "draft" : "drafts"} have no pick that both cost
        real win rate and had a pack worth thinking about. That is the good version of an empty
        screen.
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
