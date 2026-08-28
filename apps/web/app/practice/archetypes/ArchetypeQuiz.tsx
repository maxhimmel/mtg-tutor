"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@mtg-tutor/backend";
import {
  ARCHETYPE_QUIZ,
  DECK_NAMES,
  SAME,
  decisionBand,
  gradeArchetypeGuess,
  rangeThreshold,
  scoreArchetypeRun,
  type ArchetypeResult,
} from "@mtg-tutor/core";
import { scaleLinear } from "@visx/scale";
import { Plot, Reference, TICK_TEXT, ValueAxisBottom } from "../../charts/Plot";
import { INK, MARK } from "../../charts/ink";
import { CardFace } from "../../components/CardTile";
import { useCardHover } from "../../components/CardPreview";
import { ColorPips } from "../../components/ColorPips";
import { useCursorTip } from "../../components/CursorTip";
import { PageHeading } from "../../components/PageHeading";
import { Panel } from "../../components/Panel";
import { PickTrack, type Tick } from "../../components/PickTrack";
import { drillAnswered, drillFinished, drillStarted } from "../../lib/analytics";
import { points } from "../../lib/format";

/**
 * The archetype quiz: one card, two decks, which one wants it.
 *
 * WHY THE QUESTION IS NOT THE ONE THAT WAS ASKED FOR. Ideas #1 wanted the deck a
 * mono-coloured card belongs to, named. For all but a few per cent of cards the
 * decks in a colour are inside each other's error bars, so that quiz is a quiz
 * whose answers are noise. Narrowed to two decks, and gated against the null of
 * the widest-gap-among-k rather than a flat width, 335 cards across 25 sets have
 * one. `core/drills/archetypes.ts` carries the argument and
 * `pnpm diagnose-archetype-quiz` prints the table.
 *
 * THERE ARE THREE ANSWERS AND THE THIRD IS THE POINT. About 90% of mono-coloured
 * cards have no deck that genuinely wants them more, so a drill that only asked
 * about the ones that did would teach the opposite of what Limited is like --
 * and gating on significance still left a bank about a third noise, because a
 * 5% rate over everything tested is a much larger share of what gets served.
 * "These two want it the same" is the right answer for most cards in a colour,
 * it is the most useful thing a drafter can know about their own reads, and it
 * turns the statistical weakness into the lesson. Half of every run is those.
 *
 * The two decks are the extremes rather than a random pair, because the extremes
 * are the only pair that CAN be separable -- and because "the deck that wants it
 * least" is a lesson in itself. The reveal shows every deck either way.
 *
 * THE DECKS SAY NOTHING ABOUT THEMSELVES UNTIL THE REVEAL. No win rate, no
 * record, just pips and a name. The trap this drill is for is answering "which
 * of these decks is better" when the question is "which of these wants this
 * card" -- and putting each deck's own rate on the button would hand that
 * mistake to everyone who takes it. `tookStrongerDeck` counts the people who
 * make it anyway, which is how we find out whether the reveal is teaching.
 */

type Run = NonNullable<ReturnType<typeof useDeal>>;
type Question = Run["questions"][number];

/**
 * The half of a question the reveal draws.
 *
 * Named apart from `Question` so the dev stage can hand these two components a
 * set of real numbers without also having to build a hydrated card around them
 * -- the panel is about the numbers, and a fixture that had to carry art to be
 * looked at would not get looked at.
 */
export type RevealQuestion = Pick<
  Question,
  "decks" | "wants" | "spurns" | "sigmas" | "separated"
>;

function useDeal(setCode: string | undefined, skip: number) {
  return useQuery(api.drills.archetypes.deal, setCode ? { setCode, skip } : "skip");
}

const deckName = (colors: string) => DECK_NAMES[colors] ?? colors;

/**
 * Which set to open on: the one you drafted last.
 *
 * Off `draft.recentSets`, which the home page already built for its own strip --
 * so this costs the sessions read and no new query. Falling back to the newest
 * set rather than to nothing, because a person who has never drafted is exactly
 * who this drill is for: it reads a set's statistics and none of your history,
 * which makes it the one thing here playable on day one.
 */
function useDefaultSet(sets: { code: string }[] | undefined) {
  const recent = useQuery(api.draft.recentSets, {});
  if (!sets || sets.length === 0) return undefined;
  const known = new Set(sets.map((s) => s.code));
  return recent?.find((r) => known.has(r.setCode))?.setCode ?? sets[0].code;
}

export function ArchetypeQuiz() {
  const sets = useQuery(api.sets.list);
  const suggested = useDefaultSet(sets);
  const [chosen, setChosen] = useState<string>();
  const setCode = chosen ?? suggested;

  const [skip, setSkip] = useState(0);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<ReadonlyMap<string, string>>(new Map());

  const live = useDeal(setCode, skip);
  const [run, setRun] = useState<Run>();

  // A run is a hand you were dealt. `deal` is a live subscription, so without
  // this the questions would re-shuffle under somebody mid-answer the moment a
  // set was re-ingested -- the same freeze the misses drill takes, for the same
  // reason. Frozen and reported in one place, so the two cannot disagree about
  // which run was served.
  const dealt = useRef<string | undefined>(undefined);
  useEffect(() => {
    const token = `${setCode}:${skip}`;
    if (!live || !setCode || dealt.current === token) return;
    dealt.current = token;
    setRun(live);
    setStep(0);
    drillStarted({
      drill: "archetypes",
      served: live.questions.length,
      // The misses drill's three counts, in this drill's terms: there are no
      // drafts behind a question here, `candidates` is the set's whole bank, and
      // a mute set is the only way a question becomes unservable.
      drafts: 0,
      candidates: live.quizzable,
      unavailable: live.mute ? 1 : 0,
      // How much of this set has an answer at all. A run out of a set with four
      // separable cards is a different run from one out of blb's thirty-six,
      // and pooling their completion rates would hide that.
      separable: live.separable ?? 0,
      skip,
    });
  }, [live, setCode, skip]);

  const questions = run?.questions ?? [];
  const key = (q: Question) => `${setCode}:${q.card.name}`;

  const graded = useMemo(() => {
    const out = new Map<string, ArchetypeResult>();
    for (const q of questions) {
      const guess = answers.get(key(q));
      if (guess) out.set(key(q), gradeArchetypeGuess(q, guess));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, answers, setCode]);

  const score = useMemo(() => scoreArchetypeRun([...graded.values()]), [graded]);

  const reported = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!run || questions.length === 0 || step < questions.length) return;
    const token = `${setCode}:${skip}:${questions.length}`;
    if (reported.current === token) return;
    reported.current = token;
    drillFinished({
      drill: "archetypes",
      served: questions.length,
      answered: score.answered,
      read: score.read,
      misread: score.misread,
    });
  }, [run, questions.length, step, score, setCode, skip]);

  function answer(question: Question, guess: string) {
    const k = key(question);
    if (answers.has(k)) return;
    const result = gradeArchetypeGuess(question, guess);
    setAnswers((prev) => new Map(prev).set(k, guess));
    drillAnswered({
      drill: "archetypes",
      outcome: result.outcome,
      tookRawBest: result.mistake === "stronger-deck",
      // Which of the four ways it went wrong, because they are four different
      // lessons -- and `saw-difference` against `saw-none` is the one number
      // that says whether the third answer is pitched right. If people mostly
      // call real gaps coin flips, it is too tempting and the run's split is
      // doing harm.
      mistake: result.mistake ?? undefined,
      // `sigmas` and not `gap`. It answers the same question the misses drill's
      // `gap` does, in different units -- and one property carrying two units
      // with nothing on the row to say which is a chart that is wrong from the
      // first day and cannot be repaired.
      sigmas: question.sigmas,
      setCode: setCode ?? "",
      index: step,
    });
  }

  if (!setCode || run === undefined) {
    return <p className="py-6 text-base-content/60">Reading what the decks did…</p>;
  }

  const current = questions[step];
  const ticks: Tick[][] = [
    questions.map((q, i) => {
      const result = graded.get(key(q));
      return {
        state: result ? (result.correct ? "hit" : "miss") : i === step ? "current" : "ahead",
        label: `Question ${i + 1}: ${q.card.name}`,
      };
    }),
  ];

  return (
    <>
      <PageHeading
        title="Which deck wants it?"
        controls={
          <SetPicker
            sets={sets ?? []}
            value={setCode}
            onChange={(code) => {
              setChosen(code);
              setSkip(0);
              setAnswers(new Map());
            }}
          />
        }
      />

      {run.mute != null || questions.length === 0 ? (
        <Nothing run={run} skip={skip} onRestart={() => setSkip(0)} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19.5rem]">
          <div>
            {current ? (
              <Question
                question={current}
                guess={answers.get(key(current))}
                onAnswer={(deck) => answer(current, deck)}
                onNext={() => setStep((s) => s + 1)}
                last={step === questions.length - 1}
              />
            ) : (
              <Finish
                score={score}
                served={questions.length}
                more={run.quizzable > run.nextSkip}
                onMore={() => {
                  setSkip(run.nextSkip);
                  setAnswers(new Map());
                }}
              />
            )}
          </div>

          <aside className="lg:sticky lg:top-4 lg:self-start">
            <Panel title="This run" aside={<span className="eyebrow">{questions.length}</span>}>
              <div className="px-4 py-3">
                <PickTrack
                  groups={ticks}
                  label="Questions in this run"
                  here={step}
                  onSelect={(i) => setStep(i)}
                />
                {/* The tally in a sentence rather than a fraction, the same call
                    the misses drill makes: "6/12" invites a person to read a
                    drill as a test, and a run is twelve cards you have now seen
                    the numbers on either way. */}
                <p className="mt-4 text-sm leading-relaxed text-base-content/70">
                  {score.answered === 0
                    ? "Nothing answered yet."
                    : `You read ${score.read} of ${score.answered} right so far.`}
                </p>
              </div>
            </Panel>
          </aside>
        </div>
      )}
    </>
  );
}

/**
 * Which set to be quizzed on.
 *
 * A plain select, not the home page's grid: this is a control on a screen about
 * something else, and the set is a parameter of the run rather than the thing
 * being chosen. Every set is offered including the ones that turn out to have
 * nothing to ask -- knowing which is a 270KB read per set, so the honest cheap
 * answer is to let a set say so when you open it. See `deal`, which explains
 * why there is no list of quizzable sets.
 */
function SetPicker({
  sets,
  value,
  onChange,
}: {
  sets: { code: string; name?: string }[];
  value: string;
  onChange: (code: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="eyebrow">Set</span>
      <select
        className="select select-sm select-bordered font-display font-semibold"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {sets.map((s) => (
          <option key={s.code} value={s.code}>
            {s.name ?? s.code.toUpperCase()}
          </option>
        ))}
      </select>
    </label>
  );
}

function Question({
  question,
  guess,
  onAnswer,
  onNext,
  last,
}: {
  question: Question;
  guess?: string;
  onAnswer: (deck: string) => void;
  onNext: () => void;
  last: boolean;
}) {
  // True only after the answer is in. Before that the hover panel leads with a
  // win rate, which is most of the answer -- the same reason the misses drill
  // draws its pack with stats off and its reveal with them on.
  const hover = useCardHover(question.card, guess != null);

  return (
    <Panel>
      <div className="flex flex-col gap-6 p-4 sm:flex-row sm:items-start">
        <div className="w-[15rem] shrink-0" {...hover}>
          <CardFace card={question.card} className="w-full rounded-box" />
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl font-semibold leading-tight tracking-tight">
            {question.card.name}
          </h2>
          <p className="eyebrow mt-1">{question.card.typeLine}</p>

          {guess == null ? (
            <>
              <p className="mt-5 max-w-prose leading-relaxed text-base-content/70">
                Two decks played this card. Did one of them get more out of it — or
                is it the same card in both?
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                {/* The wanted deck is not always drawn first: the answer would
                    be in the DOM order otherwise, and a drill whose answer is
                    always on the left is a drill about noticing that. Ordered by
                    colour string, which is stable per question and carries no
                    information about which one is right. */}
                {[question.wants, question.spurns]
                  .sort((a, b) => a.localeCompare(b))
                  .map((deck) => (
                    <button
                      key={deck}
                      type="button"
                      onClick={() => onAnswer(deck)}
                      className="group flex min-w-[9rem] cursor-pointer flex-col gap-1 rounded-box border border-base-300 bg-base-100 px-4 py-3 text-left transition-colors hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    >
                      <ColorPips colors={deck} className="text-lg" />
                      <span className="font-display font-semibold leading-tight transition-colors group-hover:text-primary">
                        {deckName(deck)}
                      </span>
                    </button>
                  ))}

                {/* Set apart from the two decks rather than lined up as a third
                    option, because it is a different KIND of answer -- not a
                    deck, a claim about the other two. It is also the right
                    answer most of the time, and a person who never reaches for
                    it is the person this drill has something to teach. */}
                <button
                  type="button"
                  onClick={() => onAnswer(SAME)}
                  className="group flex min-w-[9rem] cursor-pointer flex-col justify-center gap-1 rounded-box border border-dashed border-base-300 bg-base-100 px-4 py-3 text-left transition-colors hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <span className="font-display font-semibold leading-tight transition-colors group-hover:text-primary">
                    Neither
                  </span>
                  <span className="text-xs leading-tight text-base-content/55">
                    same card in both
                  </span>
                </button>
              </div>
            </>
          ) : (
            <Reveal question={question} guess={guess} onNext={onNext} last={last} />
          )}
        </div>
      </div>
    </Panel>
  );
}

/**
 * What the decks actually did, all of them.
 *
 * The grade used two and this draws every deck the card has a measured rate in,
 * which is the honest shape of the screen: the middle rows are real numbers the
 * data cannot rank, and hiding them would leave a person believing the answer
 * was a ranking rather than a comparison of the ends.
 */
function Reveal({
  question,
  guess,
  onNext,
  last,
}: {
  question: Question;
  guess: string;
  onNext: () => void;
  last: boolean;
}) {
  const result = gradeArchetypeGuess(question, guess);

  return (
    <div className="mt-5">
      <p className="font-display text-lg font-semibold leading-tight">
        {result.correct ? (
          <span className="text-success">You read it right.</span>
        ) : question.separated ? (
          <span className="text-error">{deckName(question.wants)} wanted it more.</span>
        ) : (
          <span className="text-error">Neither — it is the same card in both.</span>
        )}
      </p>

      {/* One sentence per kind of wrong, because they are different lessons and
          a single "not quite" would teach none of them. */}
      {result.mistake === "stronger-deck" && (
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-base-content/70">
          {deckName(guess)} wins more games than {deckName(question.wants)} does — but
          not because of this card. What a deck wants and what a deck wins are two
          different questions, and this one is the first.
        </p>
      )}
      {result.mistake === "saw-difference" && (
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-base-content/70">
          Most cards in a colour are like this, which is worth knowing on its own:
          it means the colour is the read and the pair usually is not.
        </p>
      )}
      {result.mistake === "saw-none" && (
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-base-content/70">
          This one is real. {deckName(question.wants)} got {points(question.decks[0].lift)}{" "}
          out of it against {deckName(question.spurns)}&apos;s{" "}
          {points(question.decks[question.decks.length - 1].lift)}, and that is
          further apart than the data&apos;s own margin.
        </p>
      )}

      <DeckBands question={question} guess={guess} />

      <Verdict question={question} />

      <button type="button" className="btn btn-primary mt-5" onClick={onNext}>
        {last ? "See how it went" : "Next card"}
      </button>
    </div>
  );
}

/**
 * The zero line, and the reason it is the loudest thing on the chart.
 *
 * It was a one-pixel tick at 25% opacity, and a screenshot made the case
 * against that better than an argument could: it is the line every other mark
 * on the row is measured FROM, and on a card where the decks are level it is
 * the only thing on screen carrying the answer -- six dots scattered around one
 * rule is what "these all want it the same" looks like.
 *
 * DRAWN AS ONE RULE THROUGH THE WHOLE CHART rather than six ticks. Six
 * disconnected marks read as decoration on each row; one continuous line reads
 * as the axis it is, which is what it has to read as before anybody trusts a
 * dot's distance from it. It is one element rather than one per row for the
 * same reason -- a rule with gaps in it is six ticks again.
 */
function ZeroLine({ left, className }: { left: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-y-0 z-0 w-px bg-base-content/45 ${className ?? ""}`}
      style={{ left: `${left}%` }}
    />
  );
}

/**
 * Where a label sitting at a point on the scale is allowed to hang from.
 *
 * Centred is right in the middle of a chart and wrong at either end, and this
 * chart's zero is almost always near an end: a lift is usually positive, so the
 * scale starts a hair below zero and the label that names the zero was centred
 * on 5% of the width -- which hung sixty pixels off the left of the panel, on
 * every card whose decks all wanted it a bit.
 */
const anchorAt = (percent: number) =>
  percent < 25 ? "translate-x-0" : percent > 75 ? "-translate-x-full" : "-translate-x-1/2";

// The columns the desktop row is laid out on, for the two SPACER rails that
// have to land on the track's own box -- the zero rule through the list, and the
// axis under it. Written out again in the row itself rather than shared with it,
// because the row's copies carry `sm:` variants and Tailwind only generates a
// class it can see written down: a prefix pasted on at runtime produces a class
// name that exists in the DOM and in no stylesheet.
const COL = {
  pips: "w-14 shrink-0",
  name: "min-w-[5.5rem] shrink-0",
  lift: "w-16 shrink-0",
  games: "w-20 shrink-0",
} as const;

// A tick number on this chart is a difference between two win rates, so it is
// points and never per cent -- and zero is written as zero, because "+0.0pp" is
// four characters of noise on the one tick whose meaning is already named under
// it.
const axisTick = (v: number) => (Math.abs(v) < 1e-9 ? "0" : points(v));

// Four tick labels at ~44px each, plus air. Under this the axis is numbers
// sitting on top of each other, and the domain is better said in a sentence.
const AXIS_NEEDS = 200;

// The rule, its ticks, and a line of 10px numbers under them: visx puts a tick
// label a font-size below the tick's end, so an 8px tick wants 26 to sit in
// without its descenders cut off. No margins, deliberately -- the axis has to
// share the track's own left and right edge to the pixel, and a margin is
// exactly the amount by which it would not.
const AXIS_H = 26;

/**
 * Every deck's appetite for the card, drawn to one scale.
 *
 * THE PICTURE IS THE EXPLANATION AND THE NUMBERS WERE NOT. This list used to be
 * five rows of "+9.8pp / 678 games" under a sentence saying the two ends were
 * too close to call, and a player looking at +9.8 against +2.9 had no way to
 * see why -- the thing that makes those two numbers the same claim is that one
 * rests on 678 games and the other on 759, and a column of counts does not say
 * that. A band does, at a glance, and it was a real person hitting exactly this
 * on SOS's Stock Up that produced it.
 *
 * `decisionBand` says why the bands are the width they are: they touch exactly
 * when the gap clears the bar, so the picture cannot disagree with the grade.
 *
 * AND IT SAYS SO, because it does not look like that. A band beside a point
 * estimate is a 95% interval everywhere else a reader has ever seen one, and a
 * 95% interval is precisely the object `decisionBand`'s docblock refuses to draw
 * -- two of those stop overlapping at about 2.8 error bars, which is past what
 * five decks need and short of what ten do, so a reader would meet a card whose
 * bands clearly miss and be told the decks are level. The caption now names what
 * the band is instead of describing what it feels like.
 *
 * AND IT STATES ITS DOMAIN. It had no axis at all: band WIDTH is the whole
 * argument on this panel and there was no way to read one as a number without a
 * pointer. The scale is a real `scaleLinear` now, and the axis under the chart
 * is drawn from the same domain the marks are placed on, so the two cannot
 * drift.
 *
 * ON A PHONE IT STACKS, and that is the defect that made this the worst of the
 * three overflows. The row was 352px of non-shrinkable columns in 263px of
 * panel: the track is the only thing in it that can give, so it was squeezed to
 * nothing and the numbers hung ninety pixels off the edge. There is nothing to
 * fall back TO here -- the picture IS the explanation, and the sentence above it
 * says a gap of 9.8 against 2.9 is not a gap -- so the phone form keeps the
 * chart and gives the track a line of its own under the name.
 *
 * AND IT CAN BE ASKED. The band, the dot and the zero line each carry a
 * different claim, and the caption explains all three at once in a paragraph
 * that has to be read and remembered -- which is not how anybody reads a chart.
 * `useCursorTip` is the surface that lets a reader point at a mark instead; its
 * docblock carries what was learned making it smooth, which was most of the
 * work.
 */
export function DeckBands({ question, guess }: { question: RevealQuestion; guess: string }) {
  const tip = useCursorTip();

  const k = question.decks.length;
  const band = (sd: number) => decisionBand(sd, k, ARCHETYPE_QUIZ.falsePositive);

  // One scale for every row, wide enough to hold the widest band, and always
  // containing zero -- a lift is a claim about doing better than that deck does
  // anyway, so the line it is measured from has to be on the chart.
  const lo = Math.min(0, ...question.decks.map((d) => d.lift - band(d.sd)));
  const hi = Math.max(0, ...question.decks.map((d) => d.lift + band(d.sd)));
  // A card whose decks are all at zero on no games would collapse the domain to
  // a point, and every mark would land on top of every other one at NaN.
  const domain: [number, number] = hi > lo ? [lo, hi] : [lo, lo + 1];

  // IN PER CENT RATHER THAN PIXELS, which is the one thing that keeps the marks
  // as HTML. The rows carry mana pips and a deck name, neither of which belongs
  // in an SVG, so the bands and dots are absolutely positioned spans -- and a
  // span cannot be placed in pixels by a parent that has not been measured.
  // `scaleLinear` maps onto 0..100 and the browser does the measuring, which is
  // also what lets the same domain drive the axis below at whatever width it
  // turns out to have.
  const x = scaleLinear({ domain, range: [0, 100] });
  const zero = x(0);

  /**
   * Which mark the pointer is nearest, and what that mark claims.
   *
   * Measured in pixels off the track's own box rather than in lift units,
   * because "am I on the dot" is a question about the drawing: the dot is a
   * fixed size whatever the scale, and a reader aiming at it is aiming at what
   * they can see.
   */
  function describe(
    deck: RevealQuestion["decks"][number],
    e: { clientX: number; currentTarget: HTMLElement },
  ): string {
    const box = e.currentTarget.getBoundingClientRect();
    const at = e.clientX - box.left;
    const value = x.invert((at / box.width) * 100);
    const half = band(deck.sd);
    const near = (v: number) => Math.abs(at - (x(v) / 100) * box.width) < 8;
    const name = deckName(deck.colors);
    const games = deck.n.toLocaleString();

    return near(deck.lift)
      ? `${name} won ${points(deck.lift)} more with this card in hand than it did in general, over ${games} games.`
      : near(0)
        ? `What ${name} wins anyway. Every bar is measured from this line, so a deck that wins a lot gets no credit for winning a lot.`
        : Math.abs(value - deck.lift) <= half
          ? `The slack ${games} games leave. Not a margin of error — it is sized so that two bands touching is exactly two decks the data cannot tell apart.`
          : `${points(value)}, which is outside what ${name}'s ${games} games can support.`;
  }

  return (
    <div className="mt-4">
      <ul className="relative flex flex-col gap-2 sm:gap-1">
        {question.decks.map((deck) => {
          // Nothing is marked as the answer when there is no answer: colouring
          // the top row on a card whose decks are level would draw the ranking
          // the sentence above just said was not there.
          const isAnswer = question.separated && deck.colors === question.wants;
          const isGuess = deck.colors === guess;
          const isEnd = deck.colors === question.wants || deck.colors === question.spurns;
          const half = band(deck.sd);
          const games = deck.n.toLocaleString();

          return (
            <li
              key={deck.colors}
              // Wrapping below `sm`, in one row above it. The track is the item
              // that carries `w-full`, so it is the item that drops to a line of
              // its own -- everything else keeps its place, and the desktop
              // rendering is the same row it always was.
              className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-field px-2 py-1.5 text-sm sm:flex-nowrap ${
                isAnswer ? "bg-success/10" : isGuess ? "bg-error/10" : ""
              }`}
            >
              {/* Fixed width, wide enough for three pips. A wedge is a symbol
                  wider than a guild, so left to size itself this column moves
                  the track's left edge between rows -- and a scale whose zero
                  sits at a different x on every row is not a shared scale.
                  Below `sm` the track is on its own line and owes nothing to
                  this column, so the pips take the room they need. */}
              <ColorPips colors={deck.colors} className="shrink-0 sm:w-14" />
              <span
                className={`shrink-0 font-display font-semibold sm:min-w-[5.5rem] ${
                  isAnswer ? "text-success" : ""
                }`}
              >
                {deckName(deck.colors)}
              </span>

              {/* The two numbers, gathered to the end of the name line on a
                  phone and split back into their own columns above `sm`. They
                  are one object at this size -- "+9.8pp over 678 games" is a
                  single fact -- and two columns of it would be two more things
                  the track has to be narrower than. */}
              <span className="ml-auto flex shrink-0 items-baseline gap-1.5 sm:hidden">
                <span
                  className={`tabular-nums ${isEnd ? "text-base-content/80" : "text-base-content/50"}`}
                >
                  {points(deck.lift)}
                </span>
                <span className="text-xs tabular-nums text-base-content/45">{games} games</span>
              </span>

              {/* The whole track takes the pointer, not the marks: the dot and
                  the band are a few pixels each, and a reader aiming at either
                  would spend the hover missing. `describe` works out which one
                  they meant from where they landed. */}
              <span
                className="relative order-last h-4 w-full min-w-0 sm:order-none sm:w-auto sm:flex-1"
                role="img"
                aria-label={`${deckName(deck.colors)}: ${points(deck.lift)} over ${games} games, on a band ${points(half).replace("+", "")} either side — two decks whose bands touch are level.`}
                {...tip.follow((e) => describe(deck, e))}
              >
                {/* The zero, per row, only where the list has stopped being a
                    stack of tracks. One unbroken rule is the right drawing above
                    `sm` and the argument for it is below; on a phone there is a
                    name and two numbers on the line between every pair of
                    tracks, so the same rule would run through the deck names. A
                    segment per track is what is left, and the axis under the
                    chart -- which the phone form now has -- is what carries the
                    domain instead. */}
                <ZeroLine left={zero} className="sm:hidden" />

                {/* The two decks the question was about are drawn solid and the
                    rest are dimmed. They are the only two the grade looked at,
                    and a chart that gave all of them the same weight would
                    invite reading a ranking off the middle rows. */}
                <span
                  aria-hidden
                  className={`absolute top-1/2 z-10 h-1.5 -translate-y-1/2 rounded-full ${
                    isAnswer ? "bg-success/40" : isEnd ? "bg-base-content/30" : "bg-base-content/15"
                  }`}
                  style={{
                    left: `${x(deck.lift - half)}%`,
                    width: `${x(deck.lift + half) - x(deck.lift - half)}%`,
                  }}
                />
                <span
                  aria-hidden
                  className={`absolute top-1/2 z-10 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ${
                    isAnswer ? "bg-success" : isEnd ? "bg-base-content/80" : "bg-base-content/40"
                  }`}
                  style={{ left: `${x(deck.lift)}%` }}
                />
              </span>

              <span
                className={`hidden w-16 shrink-0 text-right tabular-nums sm:block ${
                  isEnd ? "text-base-content/80" : "text-base-content/50"
                }`}
              >
                {points(deck.lift)}
              </span>
              <span className="hidden w-20 shrink-0 text-right text-xs tabular-nums text-base-content/45 sm:block">
                {games} games
              </span>
            </li>
          );
        })}

        {/* The rule runs the height of the list, inside a spacer laid out to the
            same columns as a row -- so it lands on the tracks' own zero without
            anything having to know what those columns add up to. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 hidden items-stretch gap-3 px-2 sm:flex"
        >
          <span className={COL.pips} />
          <span className={COL.name} />
          <span className="relative min-w-0 flex-1">
            <ZeroLine left={zero} />
          </span>
          <span className={COL.lift} />
          <span className={COL.games} />
        </span>
      </ul>

      {/* The scale, said in numbers, on the track's own box.
          A band's WIDTH is the whole argument this panel makes, and until now
          there was no way to read one as a number without a pointer -- the zero
          rule was the only thing on the chart carrying a value, and it carries
          the one value everybody could already guess.

          The spacer columns are the same trick the rule above uses, and they
          collapse below `sm` where the tracks are full width. `ParentSize`
          inside `Plot` then measures whichever of the two boxes it ended up in,
          so the axis is drawn at the width it is aligned to rather than at a
          width anything here had to work out. */}
      <div className="flex items-start gap-3 px-2 pt-1">
        <span className={`hidden sm:block ${COL.pips}`} />
        <span className={`hidden sm:block ${COL.name}`} />
        <div className="min-w-0 flex-1">
          <Plot
            height={AXIS_H}
            needs={AXIS_NEEDS}
            instead={
              <p className="eyebrow pt-1">
                {axisTick(lo)} to {axisTick(hi)}
              </p>
            }
            label={`How much more each deck won with this card in hand, from ${axisTick(lo)} to ${axisTick(hi)}. Zero is what the deck wins anyway.`}
          >
            {({ width }) => (
              // The same domain the marks are placed on, at this box's own
              // width. Two scales rather than one because the marks are HTML in
              // per cent and the axis is SVG in pixels; the domain is the thing
              // that must not be duplicated, and it is not.
              <ValueAxisBottom
                scale={scaleLinear({ domain, range: [0, width] })}
                top={1}
                numTicks={4}
                format={axisTick}
              />
            )}
          </Plot>

          {/* The zero named under its own tick. An axis tick says "0" and a
              reader has to supply what the zero IS -- which on this chart is the
              one thing nobody guesses, because every other chart's zero is
              nothing at all rather than a whole deck's win rate. */}
          <div className="relative h-3">
            <span
              className={`absolute top-0 whitespace-nowrap text-[0.6875rem] uppercase tracking-[0.14em] text-base-content/45 ${anchorAt(zero)}`}
              style={{ left: `${zero}%` }}
            >
              what the deck wins anyway
            </span>
          </div>
        </div>
        <span className={`hidden sm:block ${COL.lift}`} />
        <span className={`hidden sm:block ${COL.games}`} />
      </div>

      <p className="mt-6 pl-2 text-xs leading-relaxed text-base-content/50">
        The bar is how much better each deck did with this card in hand than it did
        in general, measured from that line — so a deck that wins a lot is not
        credited for winning a lot. The band beside it is not a margin of error,
        which is the thing it looks like. It is drawn to do one job: two bands
        touching is exactly the line between a difference and none for a card with
        this many decks in it. So a wide band is a deck with few games behind it,
        and the picture can never disagree with the verdict below. Point at any of
        it to be told which is which.
      </p>

      {tip.node}
    </div>
  );
}

/**
 * What the gap needed to be, and why it was that.
 *
 * The sentence this replaced said "2.6 error bars apart, which is not far enough
 * to call a difference at all", which is true and unanswerable -- not far enough
 * than WHAT. The bar is not a constant: it is set by how many decks were in the
 * running, because the widest gap among five noisy numbers is wide even when
 * every deck wants the card the same. That is the single most surprising thing
 * on this screen and it was not on it.
 *
 * AND THE COMPARISON IS DRAWN, because "2.6 against a bar of 2.7" is a
 * subtraction the reader was being asked to do. Two numbers side by side in
 * type say nothing about how close they are until you work it out; a bar that
 * stops a hair short of a line says it before you have read either of them --
 * and it is the same picture whether the miss is by a tenth or by a mile, which
 * the type is not.
 */

// The bullet's parts, top to bottom: the threshold's own label, the bar, and the
// axis under it. `Reference` prints its label BELOW the line, which is where the
// axis numbers are, so this one is labelled above by hand.
const GAP_H = { label: 16, bar: 12, axis: 26 };

// The threshold's label is the widest thing on the mark at about 60px, and four
// tick numbers want 120. Below that the numbers are already in the line above.
const GAP_NEEDS = 200;

/**
 * How much of the scale is left beyond the further of the two marks.
 *
 * Enough that a bar which clears the bar comfortably still ends inside the
 * drawing -- a mark that runs to the right edge reads as "off the scale", which
 * is a claim about the measurement rather than about this card.
 */
const GAP_HEADROOM = 1.25;

function GapAgainstBar({ sigmas, needed }: { sigmas: number; needed: number }) {
  const top = Math.max(sigmas, needed) * GAP_HEADROOM;
  const clears = sigmas >= needed;

  return (
    <Plot
      className="mt-3"
      height={GAP_H.label + GAP_H.bar + GAP_H.axis}
      needs={GAP_NEEDS}
      instead={
        <p className="eyebrow mt-2">
          on a scale of 0 to {top.toFixed(1)} error bars
        </p>
      }
      label={`The widest gap between two decks was ${sigmas.toFixed(1)} error bars against the ${needed.toFixed(1)} this card needed, on a scale from 0 to ${top.toFixed(1)}.`}
      margin={{ top: GAP_H.label, bottom: GAP_H.axis }}
    >
      {({ width, height }) => {
        const x = scaleLinear({ domain: [0, top], range: [0, width] });
        const mid = height / 2;

        return (
          <>
            {/* Measured from zero and drawn as a bar rather than as a dot,
                which is the opposite call `ScorePlot` makes and right for the
                opposite reason: this axis genuinely starts at zero -- no gap at
                all is a real, common answer here -- so length means what it
                looks like it means. */}
            <line
              x1={x(0)}
              x2={x(sigmas)}
              y1={mid}
              y2={mid}
              stroke={clears ? INK.up : INK.value}
              strokeWidth={MARK.band}
              strokeLinecap="round"
            />
            <Reference at={x(needed)} height={height} />
            <text x={x(needed)} y={-5} textAnchor="middle" {...TICK_TEXT}>
              needs {needed.toFixed(1)}
            </text>
            <ValueAxisBottom
              scale={x}
              top={height}
              numTicks={4}
              format={(v) => v.toFixed(1)}
            />
          </>
        );
      }}
    </Plot>
  );
}

export function Verdict({ question }: { question: RevealQuestion }) {
  const k = question.decks.length;
  const needed = rangeThreshold(k, ARCHETYPE_QUIZ.falsePositive);
  const pair = rangeThreshold(2, ARCHETYPE_QUIZ.falsePositive);

  return (
    <div className="mt-4 rounded-box border border-base-300 bg-base-100 px-4 py-3">
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
        <span className="eyebrow">Widest gap</span>
        <span className="font-display text-base font-semibold tabular-nums">
          {question.sigmas.toFixed(1)}
        </span>
        <span className="text-base-content/55">error bars</span>
        <span className="text-base-content/30">·</span>
        <span className="eyebrow">Needed</span>
        <span
          className={`font-display text-base font-semibold tabular-nums ${
            question.separated ? "text-success" : "text-base-content"
          }`}
        >
          {needed.toFixed(1)}
        </span>
      </p>

      <GapAgainstBar sigmas={question.sigmas} needed={needed} />

      <p className="mt-2 max-w-prose text-sm leading-relaxed text-base-content/70">
        {/* The count is what sets the bar, so the count is what the sentence is
            about. Two decks would need 1.96; this needed more, and by how much
            is the whole of why a gap this size can come to nothing. */}
        {deckName(question.wants)} did not just beat {deckName(question.spurns)} — it
        came out top of {k}. Pick the best and worst of {k} figures this noisy and
        they land about {needed.toFixed(1)} error bars apart{" "}
        <em>even when every deck wants the card the same</em>, so that is the bar.
        Head to head it would only have needed {pair.toFixed(1)}.
      </p>
    </div>
  );
}

function Finish({
  score,
  served,
  more,
  onMore,
}: {
  score: { answered: number; read: number; misread: number };
  served: number;
  more: boolean;
  onMore: () => void;
}) {
  return (
    <Panel>
      <div className="p-6">
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          {score.read === score.answered
            ? "Every one of them."
            : `You read ${score.read} of ${score.answered}.`}
        </h2>
        <p className="mt-3 max-w-prose leading-relaxed text-base-content/70">
          {score.misread === 0
            ? "Nothing left to say — you knew which deck wanted every card."
            : `The ${score.misread === 1 ? "one you missed is" : `${score.misread} you missed are`} still on the track above, with the numbers on them.`}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {more && (
            <button type="button" className="btn btn-primary" onClick={onMore}>
              Another {served}
            </button>
          )}
          <Link href="/practice" className="btn btn-outline">
            Back to practice
          </Link>
        </div>
      </div>
    </Panel>
  );
}

/**
 * The three ways a set has nothing to ask, told apart.
 *
 * They are genuinely different and a screen that said "nothing here" to all
 * three would be wrong twice. `mute` is a set with no archetype data at all,
 * which is STX and only STX -- notes issue #8, and the first time the app says
 * it out loud. A set with a bank and no questions left is somebody who has
 * played it out. A set with a bank of zero never had decks that disagreed.
 */
function Nothing({
  run,
  skip,
  onRestart,
}: {
  run: { mute: "unrated" | "unbuilt" | null; quizzable: number };
  skip: number;
  onRestart: () => void;
}) {
  if (run.mute === "unrated") {
    return (
      <Panel>
        <div className="p-6">
          <h2 className="font-display text-xl font-semibold">
            This set never recorded what its decks were.
          </h2>
          <p className="mt-3 max-w-prose leading-relaxed text-base-content/70">
            17Lands' data for it does not say which colours a deck was playing, so
            there is no way to know which deck wanted a card. It is the only set
            with that hole. Pick another above.
          </p>
        </div>
      </Panel>
    );
  }

  // Not a fact about the set, so it does not get the sentence above. Somebody
  // reading "17Lands never recorded it" about a set whose statistics simply
  // have not been built would go and check 17Lands.
  if (run.mute === "unbuilt") {
    return (
      <Panel>
        <div className="p-6">
          <h2 className="font-display text-xl font-semibold">
            This set has no statistics stored yet.
          </h2>
          <p className="mt-3 max-w-prose leading-relaxed text-base-content/70">
            Nothing is wrong with the set — the numbers this drill reads have not
            been built for it. Pick another above.
          </p>
        </div>
      </Panel>
    );
  }

  if (skip > 0) {
    return (
      <Panel>
        <div className="p-6">
          <h2 className="font-display text-xl font-semibold">That is all of them.</h2>
          <p className="mt-3 max-w-prose leading-relaxed text-base-content/70">
            You have been through every card in this set whose decks disagree by
            enough to be worth asking about — {run.quizzable} of them.
          </p>
          <button type="button" className="btn btn-outline mt-5" onClick={onRestart}>
            Start again
          </button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel>
      <div className="p-6">
        <h2 className="font-display text-xl font-semibold">
          Nothing in this set to ask about.
        </h2>
        <p className="mt-3 max-w-prose leading-relaxed text-base-content/70">
          A question is only worth asking when two decks disagree about a card by
          more than the data's own margin, and no card here clears that. Pick
          another above.
        </p>
      </div>
    </Panel>
  );
}
