"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@mtg-tutor/backend";
import {
  BUCKET_LABELS,
  DECK_SPEED_BUCKETS,
  type DeckSpeedBucket,
  type DeckSpeedResult,
  gradeDeckSpeedGuess,
  scoreDeckSpeedRun,
} from "@mtg-tutor/core";
import { SpeedRuler } from "../../charts/SpeedRuler";
import { CardFace } from "../../components/CardTile";
import { PageHeading } from "../../components/PageHeading";
import { Panel } from "../../components/Panel";
import { PickTrack, type Tick } from "../../components/PickTrack";
import { drillAnswered, drillFinished, drillStarted } from "../../lib/analytics";

/**
 * The deck-speed drill: one card, and what kind of deck wants it.
 *
 * Ideas #1 asked what TYPE of deck a card belongs in, and observed that nothing
 * in the app knows. The honest axis turned out to be how fast the deck wants the
 * game to go, which is measurable from `num_turns` in the game dataset the
 * pipeline already streams -- and the drill grades against a residual, a card's
 * mean game length minus the mean for the colors it was played in, so the
 * format and the color pair are both divided out.
 *
 * THE THREE ANSWERS ARE NOT AGGRO, MIDRANGE AND CONTROL. Those name a deck's
 * whole plan; this measures one thing about it, which is when the game ends.
 * Printing the stronger word would claim the rest of the plan on the strength of
 * a turn count.
 *
 * AND THE MIDDLE ANSWER IS THE COMMONEST ONE -- 103 of fdn's 246 askable cards.
 * That is the drill's whole subject. The standing error in Limited is reading an
 * opinion into a card that has none, and a run that never offered the flat
 * answer would train exactly that. `saw-difference` counts the people who make
 * it anyway, which is how we find out whether the reveal teaches.
 *
 * NOTHING ON THE CARD ANSWERS THE QUESTION. No win rate, no turn count, no
 * color cue beyond the card itself. The rules text is the whole of what a
 * person reasons from, because "this is a wrath, wraths go long" is the skill.
 */

type Run = NonNullable<ReturnType<typeof useDeal>>;
type Question = Run["questions"][number];

function useDeal(setCode: string | undefined, skip: number) {
  return useQuery(api.drills.deckSpeed.deal, setCode ? { setCode, skip } : "skip");
}

/**
 * Which set to open on: the one you drafted last, else the newest.
 *
 * Off `draft.recentSets`, which the home page already built, so this costs no
 * new query. Falling back to the newest rather than to nothing, because this
 * drill reads a set's statistics and none of your history -- it is playable on
 * day one, and a default that needed a draft would hide that.
 */
function useDefaultSet(sets: { code: string }[] | undefined) {
  const recent = useQuery(api.draft.recentSets, {});
  if (!sets || sets.length === 0) return undefined;
  const known = new Set(sets.map((s) => s.code));
  return recent?.find((r) => known.has(r.setCode))?.setCode ?? sets[0].code;
}

export function DeckSpeedQuiz() {
  const sets = useQuery(api.sets.list);
  const suggested = useDefaultSet(sets);
  const [chosen, setChosen] = useState<string>();
  const setCode = chosen ?? suggested;

  const [skip, setSkip] = useState(0);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<ReadonlyMap<string, DeckSpeedBucket>>(new Map());

  const live = useDeal(setCode, skip);
  const [run, setRun] = useState<Run>();

  // A run is a hand you were dealt. `deal` is a live subscription, so without
  // the freeze the questions would re-shuffle under somebody mid-answer the
  // moment a set was re-ingested. Frozen and reported in one place so the two
  // cannot disagree about which run was served.
  const dealt = useRef<string | undefined>(undefined);
  useEffect(() => {
    const token = `${setCode}:${skip}`;
    if (!live || !setCode || dealt.current === token) return;
    dealt.current = token;
    setRun(live);
    setStep(0);
    drillStarted({
      drill: "deckSpeed",
      served: live.questions.length,
      // The misses drill's three counts in this drill's terms: no drafts behind
      // a question, the set's whole bank as candidates, and a mute set as the
      // only way a question becomes unservable.
      drafts: 0,
      candidates: live.quizzable,
      unavailable: live.mute ? 1 : 0,
      // How much of the set has an end rather than the flat answer, so a run out
      // of a mostly-middle set is not pooled with one that is mostly ends.
      ends: live.ends ?? 0,
      // WHY A RUN WAS EMPTY, which `served: 0` cannot say. On the deploy that
      // introduces this drill every set is `untimed`; if this does not fall to
      // zero as sets are re-ingested, the re-ingest did not happen and nothing
      // else would report it.
      mute: live.mute ?? undefined,
      skip,
    });
  }, [live, setCode, skip]);

  const questions = run?.questions ?? [];
  const key = (q: Question) => `${setCode}:${q.card.name}`;

  const graded = useMemo(() => {
    const out = new Map<string, DeckSpeedResult>();
    for (const q of questions) {
      const guess = answers.get(key(q));
      if (guess) out.set(key(q), gradeDeckSpeedGuess(q, guess));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, answers, setCode]);

  const score = useMemo(() => scoreDeckSpeedRun([...graded.values()]), [graded]);

  const reported = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!run || questions.length === 0 || step < questions.length) return;
    const token = `${setCode}:${skip}:${questions.length}`;
    if (reported.current === token) return;
    reported.current = token;
    drillFinished({
      drill: "deckSpeed",
      served: questions.length,
      answered: score.answered,
      read: score.read,
      misread: score.misread,
    });
  }, [run, questions.length, step, score, setCode, skip]);

  function answer(question: Question, guess: DeckSpeedBucket) {
    const k = key(question);
    if (answers.has(k)) return;
    const result = gradeDeckSpeedGuess(question, guess);
    setAnswers((prev) => new Map(prev).set(k, guess));
    drillAnswered({
      drill: "deckSpeed",
      outcome: result.outcome,
      // The mistake both drills share one level up: answering about raw power
      // when the question was about fit. Nothing here is about power, so this
      // drill can never make it, and `false` says that rather than leaving a
      // hole a breakdown would read as missing data.
      tookRawBest: false,
      // `saw-difference` against `saw-none` is the pair that says whether the
      // flat answer is pitched right. Same words the archetype quiz uses, for
      // the same errors, so a breakdown pools them without a mapping.
      mistake: result.mistake ?? undefined,
      // Error bars from flat, which is this drill's "how obvious was it". Same
      // property the archetype quiz uses and the same units; never `gap`, which
      // is win-rate points and would put two scales on one column.
      sigmas: question.sigmas,
      setCode: setCode ?? "",
      index: step,
    });
  }

  if (!setCode || run === undefined) {
    return <p className="py-6 text-base-content/60">Reading how long the games ran…</p>;
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
        title="How fast is this card's deck?"
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
                formatTurns={run.formatTurns}
                worthSaying={run.worthSaying}
                guess={answers.get(key(current))}
                onAnswer={(bucket) => answer(current, bucket)}
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
 * One card, three answers, and the ruler once you have said.
 *
 * The buttons are always in axis order -- sooner, neither, longer -- and never
 * shuffled. Three answers that sit on a line are a scale, and shuffling a scale
 * makes the drill about reading the options rather than about reading the card.
 * That is the opposite of the archetype quiz, whose two decks ARE shuffled
 * precisely because they do not sit on anything.
 */
function Question({
  question,
  formatTurns,
  worthSaying,
  guess,
  onAnswer,
  onNext,
  last,
}: {
  question: Question;
  formatTurns?: number;
  worthSaying: number;
  guess?: DeckSpeedBucket;
  onAnswer: (bucket: DeckSpeedBucket) => void;
  onNext: () => void;
  last: boolean;
}) {
  const result = guess ? gradeDeckSpeedGuess(question, guess) : undefined;

  return (
    <div className="grid gap-6 sm:grid-cols-[13rem_minmax(0,1fr)]">
      <div className="mx-auto w-full max-w-[13rem]">
        <CardFace card={question.card} />
      </div>

      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          What kind of deck plays this?
        </h2>

        <div className="mt-4 flex flex-col gap-2">
          {DECK_SPEED_BUCKETS.map((bucket) => {
            const chosen = guess === bucket;
            const isAnswer = question.answer === bucket;
            return (
              <button
                key={bucket}
                type="button"
                disabled={guess != null}
                onClick={() => onAnswer(bucket)}
                aria-current={result && isAnswer ? "true" : undefined}
                className={[
                  "btn justify-start",
                  // After the answer, the right one is outlined and the wrong
                  // pick is marked -- position and a word, never hue alone.
                  result
                    ? isAnswer
                      ? "btn-success"
                      : chosen
                        ? "btn-error"
                        : "btn-ghost"
                    : "btn-outline",
                ].join(" ")}
              >
                {BUCKET_LABELS[bucket]}
                {result && isAnswer && <span className="ml-auto text-xs">the answer</span>}
                {result && chosen && !isAnswer && (
                  <span className="ml-auto text-xs">you said</span>
                )}
              </button>
            );
          })}
        </div>

        {result && (
          <div className="mt-6">
            <SpeedRuler
              resid={question.resid}
              se={question.se}
              worthSaying={worthSaying}
            />
            <p className="mt-3 text-sm leading-relaxed text-base-content/70">
              Decks that ran it played games {Math.abs(question.resid).toFixed(2)} turns{" "}
              {question.resid >= 0 ? "longer" : "shorter"} than other decks in the same
              colors, give or take {question.se.toFixed(2)}, over{" "}
              {question.n.toLocaleString()} games.
              {formatTurns != null && ` A game in this set runs ${formatTurns.toFixed(1)} turns.`}
            </p>
            {question.answer === "middle" && (
              <p className="mt-2 text-sm leading-relaxed text-base-content/70">
                Too close to flat for this set to call — the largest group of cards
                is here. It does not mean the deck was midrange: it means this card
                pulls the game neither way.
              </p>
            )}
            <button type="button" className="btn btn-primary mt-5" onClick={onNext}>
              {last ? "Finish" : "Next card"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Why there is nothing to ask, in the set's own terms.
 *
 * Three causes and three sentences, because a named cause on a screen is worth
 * printing only when it is the right one. `untimed` is a re-ingest we owe the
 * player and `unmeasured` is a fact about the set nobody can fix, and telling
 * somebody the second when the first is true would send them away for good.
 */
function Nothing({
  run,
  skip,
  onRestart,
}: {
  run: Run;
  skip: number;
  onRestart: () => void;
}) {
  const said =
    run.mute === "unbuilt"
      ? "This set has no statistics yet, so there is nothing to ask about."
      : run.mute === "untimed"
        ? "This set's statistics were built before game length was measured. It comes back the next time this set's data is refreshed."
        : run.mute === "unmeasured"
          ? "No card in this set has enough games behind it to say which way it pulls. That is the set rather than a fault."
          : skip > 0
            ? "That is every card this set can be asked about."
            : "Nothing to ask about here.";

  return (
    <section className="max-w-xl py-6">
      <p className="text-lg leading-relaxed text-base-content/70">{said}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        {skip > 0 && (
          <button type="button" className="btn btn-primary" onClick={onRestart}>
            Start again
          </button>
        )}
      </div>
    </section>
  );
}

function Finish({
  score,
  served,
  more,
  onMore,
}: {
  score: { answered: number; read: number; misread: number };
  /** What this run actually dealt, which near the end of a set is not eight. */
  served: number;
  more: boolean;
  onMore: () => void;
}) {
  return (
    <section className="max-w-xl py-6">
      <h2 className="font-display text-3xl font-semibold tracking-tight">
        That is the run.
      </h2>
      <p className="mt-3 text-lg leading-relaxed text-base-content/70">
        You read {score.read} of {score.answered} right.
      </p>
      {more && (
        <button type="button" className="btn btn-primary mt-5" onClick={onMore}>
          Another {served}
        </button>
      )}
    </section>
  );
}

/**
 * Which set to be quizzed on.
 *
 * A plain select for the reason the archetype quiz gives: the set is a parameter
 * of the run rather than the thing being chosen. Every set is offered, including
 * the ones that turn out to have nothing to ask, because finding out costs a
 * 270KB read per set -- so a set says so when you open it.
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
    <select
      className="select select-sm select-bordered"
      value={value}
      aria-label="Set"
      onChange={(e) => onChange(e.target.value)}
    >
      {sets.map((s) => (
        <option key={s.code} value={s.code}>
          {s.name ?? s.code.toUpperCase()}
        </option>
      ))}
    </select>
  );
}
