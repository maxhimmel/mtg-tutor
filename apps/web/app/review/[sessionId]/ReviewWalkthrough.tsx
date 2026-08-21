"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import { REVIEW, isCorrectGuess, isDecisionPick } from "@mtg-tutor/core";
import { PageNotice, PageShell } from "../../components/PageShell";
import { PageHeading } from "../../components/PageHeading";
import { PickTrack, type Tick } from "../../components/PickTrack";
import { CardTile } from "../../components/CardTile";
import { ColorPips } from "../../components/ColorPips";
import { Panel } from "../../components/Panel";
import { SetIcon } from "../../components/SetIcon";
import { pct } from "../../lib/format";
import { PickReveal } from "../PickReveal";
import { useLines } from "../useLines";
import { PickMarksKey } from "../../components/PickMarks";
import { ReviewFrame } from "../ReviewFrame";
import { ReviewViews } from "../ReviewViews";
import type { ReviewPick } from "../types";
import { useVerdicts } from "../useVerdicts";

const decisionPick = (pick: ReviewPick) =>
  isDecisionPick(pick.pack.length, REVIEW.decisionPickMinCards);

export function ReviewWalkthrough({ sessionId }: { sessionId: string }) {
  const id = sessionId as Id<"draftSessions">;
  const draft = useQuery(api.review.load, { sessionId: id });
  const sets = useQuery(api.sets.list);

  const [quiz, setQuiz] = useState(true);
  const [step, setStep] = useState(0);
  // pickIndex -> the card name guessed. Session-only: the CLI shows a score and
  // forgets it, and persisting judgment over time is its own feature.
  const [guesses, setGuesses] = useState<ReadonlyMap<number, string>>(new Map());

  const picks = draft?.picks;
  const { get, request, refused } = useVerdicts(id, picks);
  const lines = useLines(id);

  // The verdicts and the two frames can all be refused by the same thing, and
  // the first of them to hear about it is whichever mounted first -- so they
  // feed one line here instead of each rendering their own copy of it.
  const [frameRefused, setFrameRefused] = useState<string | null>(null);
  const notice = refused ?? frameRefused;

  // Same reuse the verdict cache guards against: one component serves both ids
  // when the router moves between two drafts, and a position kept from a longer
  // draft opens the shorter one on its own results screen.
  useEffect(() => {
    setStep(0);
    setGuesses(new Map());
  }, [sessionId]);

  // Only decision picks are steps. A pick with three cards left teaches
  // nothing, so the CLI flashes those past and so does this.
  const decisions = useMemo(() => (picks ?? []).filter(decisionPick), [picks]);

  const current = decisions[step];
  const guess = current ? guesses.get(current.pickIndex) : undefined;
  const answered = !quiz || guess != null;
  const finished = picks != null && step >= decisions.length;

  // The forced picks taken since the previous decision -- not worth a step, but
  // still part of what happened. On the last step this runs to the end of the
  // draft, which is where the tail of forced picks lives.
  const skipped = useMemo(() => {
    if (!picks) return [];
    const previous = decisions[step - 1];
    const from = previous ? previous.pickIndex + 1 : 0;
    const to = current ? current.pickIndex : picks.length;
    return picks.slice(from, to).filter((p) => !decisionPick(p));
  }, [picks, decisions, current, step]);

  // Ask for the pick on screen, and warm the next one so stepping forward is
  // usually instant rather than another wait on the model.
  useEffect(() => {
    if (!answered || !current) return;
    void request(current.pickIndex);
    const next = decisions[step + 1];
    if (next) void request(next.pickIndex);
  }, [answered, current, decisions, step, request]);

  const pool = useMemo(() => (picks ?? []).map((p) => p.picked), [picks]);

  // Graded only once the verdict has settled: correctness is lenient on either
  // the raw-power best or the coach's context-best, and the second one is not
  // known until the action answers.
  const score = useMemo(() => {
    let graded = 0;
    let correct = 0;
    for (const pick of decisions) {
      const guessed = guesses.get(pick.pickIndex);
      if (!guessed) continue;
      const verdict = get(pick.pickIndex);
      if (verdict === undefined) continue;
      graded++;
      if (isCorrectGuess(guessed, pick.bestName, verdict?.contextBestName ?? pick.bestName)) {
        correct++;
      }
    }
    return { graded, correct };
  }, [decisions, guesses, get]);

  if (draft === undefined) {
    return <PageNotice>Rebuilding the draft…</PageNotice>;
  }

  const set = (sets ?? []).find((s) => s.code === draft.setCode && s.format === draft.format);
  const verdict = current ? get(current.pickIndex) : undefined;
  const correct =
    current && guess && verdict !== undefined
      ? isCorrectGuess(guess, current.bestName, verdict?.contextBestName ?? current.bestName)
      : null;

  // The draft as a run of decisions, with how each one went. Position alone
  // would be the stepper at the foot of the page said twice; what this adds is
  // the shape of the session -- where the misses cluster, how much is left --
  // and somewhere to click, which the ±1 stepper never gave anyone.
  const track: Tick[] = decisions.map((pick, i) => {
    const guessed = guesses.get(pick.pickIndex);
    const answer = get(pick.pickIndex);
    const graded =
      guessed != null && answer !== undefined
        ? isCorrectGuess(guessed, pick.bestName, answer?.contextBestName ?? pick.bestName)
        : undefined;

    return {
      state:
        i === step && !finished
          ? "current"
          : graded === true
            ? "hit"
            : graded === false
              ? "miss"
              : i < step
                ? "past"
                : "ahead",
      label:
        `Go to pack ${pick.packNo}, pick ${pick.pickNo}` +
        (graded === undefined ? "" : graded ? " — you read it right" : " — you missed it"),
    };
  });

  return (
    <PageShell>
      <PageHeading
        icon={<SetIcon uri={set?.iconUri} name={set?.name} className="size-6 text-base-content/50" />}
        title={
          <>
            {set?.name ?? draft.setCode.toUpperCase()}
            {draft.colorPair && <ColorPips colors={draft.colorPair} className="ml-2.5" />}
          </>
        }
        controls={
          <div className="flex flex-wrap items-center gap-4">
            {/* Says what it does rather than naming a mode: with this on, the
                pack comes up before the answer does. */}
            <label className="flex cursor-pointer items-center gap-2 text-sm text-base-content/70">
              <input
                type="checkbox"
                className="toggle toggle-primary toggle-sm"
                checked={quiz}
                onChange={(e) => setQuiz(e.target.checked)}
              />
              Guess first
            </label>
            <ReviewViews sessionId={sessionId} current="walkthrough" />
          </div>
        }
      >
        <PickTrack
          groups={[track]}
          label={
            finished
              ? `Review complete: ${decisions.length} decision picks.`
              : `Pick ${step + 1} of ${decisions.length}. Select one to go to it.`
          }
          onSelect={setStep}
        />
      </PageHeading>

      {/* The review still renders under this: every pick keeps its data-only
          reveal, which is the same degradation a deployment with no model key
          already gets. Only the prose is missing. */}
      {notice && (
        <div role="alert" className="alert alert-warning my-4">
          <span>{notice}</span>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex flex-col gap-4">
          {skipped.length > 0 && (
            <ul className="flex flex-col gap-0.5 text-xs text-base-content/45">
              {skipped.map((pick) => (
                <li key={pick.pickIndex} className="tabular-nums">
                  P{pick.packNo}P{pick.pickNo}: took {pick.picked.name} · forced pick
                </li>
              ))}
            </ul>
          )}

          {finished ? (
            <>
              <ReviewFrame sessionId={id} phase="close" cards={pool} onError={setFrameRefused} />
              <Panel title="Session score" bodyClassName="gap-3">
                {score.graded === 0 ? (
                  <p className="text-base-content/60">
                    No guesses this time — turn Quiz on to test your reads.
                  </p>
                ) : (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span className="font-display text-5xl font-semibold leading-none tracking-tight">
                        {score.correct}
                      </span>
                      <span className="text-sm tabular-nums text-base-content/45">
                        / {score.graded}
                      </span>
                    </div>
                    <p className="text-base-content/70">
                      You identified the better pick on{" "}
                      {((score.correct / score.graded) * 100).toFixed(0)}% of the decision
                      picks you answered.
                    </p>
                  </>
                )}
                <div className="flex flex-wrap gap-2 border-t border-base-300 pt-3">
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => setStep(0)}
                  >
                    Step through again
                  </button>
                  <Link href="/review" className="btn btn-sm btn-ghost">
                    Another draft
                  </Link>
                </div>
              </Panel>
            </>
          ) : (
            current && (
              <Panel
                title={
                  answered
                    ? `Pack ${current.packNo} · Pick ${current.pickNo}`
                    : `Pack ${current.packNo} · Pick ${current.pickNo} — which was the better pick?`
                }
                aside={
                  <span className="text-xs tabular-nums text-base-content/50">
                    {current.pack.length} cards
                  </span>
                }
                bodyClassName="gap-4"
              >
                {answered ? (
                  <>
                    {/* Inside the pick, above the cards it explains. This screen
                        shows one shortlist at a time, so the key can sit with it
                        instead of in the stats panel across the page. */}
                    <div className="border-b border-base-300 pb-3">
                      <PickMarksKey quiz={quiz} />
                    </div>
                    <PickReveal
                      pick={current}
                      verdict={verdict}
                      // Revealing always asks, so an absent verdict here is
                      // always one in flight.
                      pending
                      guess={guess}
                      correct={correct}
                      draft={{ sessionId: id, setCode: draft.setCode, format: draft.format }}
                      line={lines.lineFor(current.pickIndex)}
                      onAskLine={(card, which) => lines.ask(current.pickIndex, card, which)}
                    />
                  </>
                ) : (
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3.5">
                    {current.pack.map((card) => (
                      <CardTile
                        key={card.name}
                        card={card}
                        // The hover panel leads with the win rate, which is the answer.
                        showStats={false}
                        label={`Guess ${card.name}`}
                        onPick={(picked) =>
                          setGuesses((prev) =>
                            new Map(prev).set(current.pickIndex, picked.name),
                          )
                        }
                      />
                    ))}
                  </div>
                )}
              </Panel>
            )
          )}

          {!finished && (
            <nav className="flex items-center justify-between gap-3">
              <button
                type="button"
                className="btn btn-sm btn-ghost"
                disabled={step === 0}
                onClick={() => setStep((s) => s - 1)}
              >
                ← Previous
              </button>
              <span className="text-sm tabular-nums text-base-content/50">
                {step + 1} / {decisions.length}
              </span>
              <button
                type="button"
                className="btn btn-sm btn-primary"
                disabled={!answered}
                onClick={() => setStep((s) => s + 1)}
              >
                {step === decisions.length - 1 ? "Finish" : "Next →"}
              </button>
            </nav>
          )}
        </div>

        <aside className="flex flex-col gap-4">
          <ReviewFrame sessionId={id} phase="open" cards={pool} onError={setFrameRefused} />

          <Panel title="This draft" bodyClassName="gap-2">
            <dl className="flex flex-col text-sm">
              <div className="flex items-center justify-between gap-4 py-1">
                <dt className="text-base-content/60">Colors</dt>
                <dd>
                  <ColorPips colors={draft.colorPair} className="text-base" />
                </dd>
              </div>
              {[
                ["Decision picks", String(decisions.length)],
                ["Picks", String(draft.picks.length)],
              ].map(([term, value]) => (
                <div key={term} className="flex justify-between gap-4 py-1 tabular-nums">
                  <dt className="text-base-content/60">{term}</dt>
                  <dd className="font-semibold">{value}</dd>
                </div>
              ))}
            </dl>

            {score.graded > 0 && (
              <div className="flex justify-between gap-4 border-t border-base-300 pt-2 text-sm tabular-nums">
                <span className="text-base-content/60">Reads so far</span>
                <span className="font-semibold">
                  {score.correct}/{score.graded} · {pct(score.correct / score.graded)}
                </span>
              </div>
            )}
          </Panel>
        </aside>
      </div>
    </PageShell>
  );
}
