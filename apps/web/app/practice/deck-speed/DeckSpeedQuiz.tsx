"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
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
import { answerUnrecorded, drillAnswered, drillFinished, drillStarted } from "../../lib/analytics";
import { today } from "../../lib/day";

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

// Off the query rather than off the hook. `useDeal` holds a hand in state, so
// deriving the type from its return value made the alias reference itself the
// moment the subscription was dropped.
type Run = FunctionReturnType<typeof api.drills.deckSpeed.deal>;
type Question = Run["questions"][number];

/**
 * A hand, fetched once.
 *
 * NOT A SUBSCRIPTION, AND THE REASON IS BANDWIDTH. `deal` reads a set's whole
 * statistics document -- 270 to 412KB -- and, since it started reading this
 * player's answers too, that read set includes a table they write to eight times
 * a run. Held open as a `useQuery`, every recorded answer invalidated the
 * subscription and re-executed the query, so a run of eight cost about 3MB
 * instead of 350KB, per drill, per player. This app has already had a plan
 * drained once by a query re-reading a document it did not need.
 *
 * A one-shot read is also the honest shape. The run was already frozen in state
 * the moment it arrived -- a live hand would re-shuffle under somebody
 * mid-answer -- so the subscription was being paid for and then discarded.
 *
 * AND IT WAITS FOR THE WRITES. The answers are fired unawaited so a reveal never
 * waits on a round trip, but the NEXT deal must not be dealt from a history that
 * has not landed: with a subscription the query arguments changed between runs
 * and the stale hand was visible for a frame; without one, re-dealing early
 * would simply hand back the run just played. So the fetch awaits whatever
 * writes are in flight, where the reveal does not.
 */
function useDeal(setCode: string | undefined, runNo: number, settled: () => Promise<unknown>) {
  const convex = useConvex();
  const [run, setRun] = useState<Run>();

  useEffect(() => {
    if (!setCode) return;
    let live = true;
    // Cleared first, so the screen shows its loading state rather than the hand
    // it just finished -- which is what the query arguments used to do for free.
    setRun(undefined);
    void settled()
      .then(() =>
        convex.query(api.drills.deckSpeed.deal, {
          setCode,
          // Read once per RUN. A date recomputed every render would move the day
          // under a sitting; asking again per run is what lets somebody drilling
          // past midnight be dealt against the day they are actually in.
          today: today(),
        }),
      )
      .then((dealt) => {
        if (live) setRun(dealt);
      });
    return () => {
      live = false;
    };
    // `settled` is a ref-backed callback and never changes identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convex, setCode, runNo]);

  return run;
}


/**
 * What this hand is made of, said before it is played.
 *
 * THE BUTTON USED TO PROMISE A COUNT IT COULD NOT KEEP. "Another 8" is right
 * until a set runs short of cards nobody has seen, and then it is a number the
 * next run will not honour -- and every rule about how many slots a repeat may
 * take was really an attempt to make the deal fit that label. Naming the hand
 * instead means the deal can be whatever is honest and the screen still says so
 * up front: the run that is all cards you got wrong is announced rather than
 * noticed.
 *
 * It also names the case nobody would otherwise see coming. Somebody with three
 * cards they keep misreading gets those three back, day after day, until they
 * read them -- which is the drill working, and reads as a treadmill if the
 * screen never says it is happening.
 */
function madeOf(questions: readonly { repeat: boolean }[]): string {
  const back = questions.filter((q) => q.repeat).length;
  const fresh = questions.length - back;
  const cards = (n: number) => `${n} ${n === 1 ? "card" : "cards"}`;
  if (back === 0) return `${cards(fresh)} you have not seen.`;
  if (fresh === 0) return `${cards(back)} you missed before, back again.`;
  return `${cards(fresh)} you have not seen, and ${back} you missed before.`;
}

/**
 * Every answer still on its way to the server.
 *
 * The writes are deliberately not awaited at the point of answering -- see
 * `record` below -- so something has to hold them for the one caller that does
 * care, which is the next deal. Settled rather than resolved: a write that
 * failed has already reported itself to `answer_unrecorded`, and blocking the
 * next hand on it would turn a lost row into a stuck screen.
 */
function useInFlight() {
  const writes = useRef<Promise<unknown>[]>([]);
  const track = (p: Promise<unknown>) => {
    writes.current.push(p);
  };
  const settled = async () => {
    const pending = writes.current;
    writes.current = [];
    await Promise.allSettled(pending);
  };
  return { track, settled };
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

  // Which run of this sitting. Not a cursor -- the server deals from what you
  // have answered now, so this only exists to ask for another hand.
  const [runNo, setRunNo] = useState(0);
  // WHAT MAKES AN ATTEMPT ID UNIQUE, and the reason it is not the set and the
  // run number. `runNo` resets to zero on every page load, so a card answered at
  // step 0 of run 0 today and re-served at step 0 of run 0 tomorrow minted the
  // same id -- and `answers.record` refuses a row whose id matches the newest
  // one for that card, silently, with no rejection for `answer_unrecorded` to
  // report. The card's latest answer stayed the old misread, so it stayed due
  // every day forever, on exactly the repeat path this feature adds.
  //
  // Minted once per mount, which is the sitting. The CLI has always done this
  // (`cli:${Date.now()}`); the browser had a counter that looked like an id.
  const [sitting] = useState(() => `web:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<ReadonlyMap<string, DeckSpeedBucket>>(new Map());

  const inFlight = useInFlight();
  const run = useDeal(setCode, runNo, inFlight.settled);
  const record = useMutation(api.drills.answers.record);

  // Reported once per hand. `useDeal` clears the run before it fetches, so a
  // hand arriving is the edge -- there is no live value to guard against and no
  // freeze to keep, which is what dropping the subscription bought.
  const reported = useRef<string | undefined>(undefined);
  useEffect(() => {
    const token = `${setCode}:${runNo}`;
    if (!run || !setCode || reported.current === token) return;
    reported.current = token;
    setStep(0);
    drillStarted({
      drill: "deckSpeed",
      served: run.questions.length,
      // The misses drill's three counts in this drill's terms: no drafts behind
      // a question, the set's whole bank as candidates, and a mute set as the
      // only way a question becomes unservable.
      drafts: 0,
      candidates: run.quizzable,
      unavailable: run.mute ? 1 : 0,
      // How much of the set has an end rather than the flat answer, so a run out
      // of a mostly-middle set is not pooled with one that is mostly ends.
      ends: run.ends ?? 0,
      // WHY A RUN WAS EMPTY, which `served: 0` cannot say. On the deploy that
      // introduces this drill every set is `untimed`; if this does not fall to
      // zero as sets are re-ingested, the re-ingest did not happen and nothing
      // else would report it.
      mute: run.mute ?? undefined,
      // Whether the reserved slot was filled. Each set holds hundreds of cards
      // nobody has seen, so if this stays at zero across real play then nobody
      // is coming back inside a bank's depth.
      repeats: run.questions.filter((q) => q.repeat).length,
      asked: run.asked,
    });
  }, [run, setCode, runNo]);

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

  const finished = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!run || questions.length === 0 || step < questions.length) return;
    const token = `${setCode}:${runNo}:${questions.length}`;
    if (finished.current === token) return;
    finished.current = token;
    drillFinished({
      drill: "deckSpeed",
      served: questions.length,
      answered: score.answered,
      read: score.read,
      misread: score.misread,
      repeats: questions.filter((q) => q.repeat).length,
    });
  }, [run, questions.length, step, score, setCode, runNo]);

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
      // A first answer is the half memory of a reveal cannot reach. Pooling it
      // with a later one is how memory gets reported as a read.
      repeat: question.repeat,
      setCode: setCode ?? "",
      index: step,
    });

    // Fired and not awaited, and a rejection reported rather than shown. The
    // reveal is already on screen; making it wait on a round trip, or blanking
    // it when the round trip fails, would be a worse drill than one that
    // forgets. What a silent failure costs is the measurement AND the next run
    // -- an unwritten answer is a card dealt back tomorrow -- which is why
    // `answer_unrecorded` is the only thing that can say the store went lossy.
    inFlight.track(
      record({
      drill: "deckSpeed",
      setCode: setCode ?? "",
      name: question.card.name,
      answered: guess,
      correct: question.answer,
      sigmas: question.sigmas,
      // How far past its gate the question sat, which is what a band is drawn
      // on. `sigmas` cannot stand in for it -- each drill's bar moves, and
      // neither the deck count nor the set's spread is on a stored answer.
      margin: question.margin,
      attemptId: `${sitting}:${runNo}:${step}`,
      }).catch((e: unknown) => answerUnrecorded({ asked: "deckSpeed", reason: String(e) })),
    );
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
              setRunNo(0);
              setAnswers(new Map());
            }}
          />
        }
      />

      {run.mute != null || questions.length === 0 ? (
        <Nothing run={run} />
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
                asked={run.asked + questions.length}
                quizzable={run.quizzable}
                onMore={() => {
                  setRunNo((n) => n + 1);
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
                {/* What the hand is, said before it is played rather than
                    discovered on the third card. */}
                <p className="mt-4 text-sm leading-relaxed text-base-content/70">
                  {score.answered === 0
                    ? madeOf(questions)
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
              n={question.n}
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
/**
 * Why there is nothing to play, in the words each cause actually earns.
 *
 * `answered` IS THE ONE THAT IS NOT BAD NEWS and it must not borrow a sentence
 * from the four above it. "There is nothing here to ask" and "you have been
 * through all of it" read the same on a screen and are opposite things to be
 * told, so this one names what you did, says what is left, and points at the
 * other sets rather than leaving somebody standing in a room with no door.
 */
function Nothing({ run }: { run: Run }) {
  const played = run.mute === "answered";
  const said = played
    ? `You have been through all ${run.quizzable} of this set's cards, and there is nothing waiting to come back.`
    : run.mute === "unbuilt"
      ? "This set has no statistics yet, so there is nothing to ask about."
      : run.mute === "unrated"
        ? "17Lands never recorded what colours this set's decks were, so there is nothing to measure a card against here. That will not change."
        : run.mute === "untimed"
          ? "This set's statistics were built before game length was measured. It comes back the next time this set's data is refreshed."
          : run.mute === "unmeasured"
            ? "No card in this set has enough games behind it to say which way it pulls. That is the set rather than a fault."
            : "Nothing to ask about here.";

  return (
    <section className="max-w-xl py-6">
      <p className="text-lg leading-relaxed text-base-content/70">{said}</p>
      {played && (
        <p className="mt-3 text-base-content/70">
          Pick another set above. Anything you misread comes back a day later.
        </p>
      )}
    </section>
  );
}

function Finish({
  score,
  asked,
  quizzable,
  onMore,
}: {
  score: { answered: number; read: number; misread: number };
  /** Cards of this set behind them, this run included. */
  asked: number;
  /** Cards this set can ask about at all. */
  quizzable: number;
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
      {/* Coverage, which is the one progress reading that is true whatever the
          difficulty mix is doing -- it counts questions asked rather than
          questions read. The deal's own count is from BEFORE this run, so this
          run is added back here rather than the sentence hedging with "so far". */}
      <p className="mt-2 text-sm text-base-content/55">
        {asked} of this set&apos;s {quizzable} cards behind you.
      </p>
      {/* NAMES NO COUNT, which is the point. It used to say "Another 8" and that
          is a promise the next deal cannot keep once a set runs short -- and if
          there is nothing left at all, the next hand is the played-out screen,
          which is a better place to be told than a button that quietly
          disappeared. */}
      <button type="button" className="btn btn-primary mt-5" onClick={onMore}>
        Keep going
      </button>
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
