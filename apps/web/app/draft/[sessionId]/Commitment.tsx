"use client";

import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Card, Challenge } from "@mtg-tutor/core";
import {
  CONFIDENCE,
  type Confidence,
  REASON_LIMIT,
  REASON_STARTERS,
  challengeFor,
  isDecisionPick,
  resolveChallenge,
} from "@mtg-tutor/core";
import { CardFace } from "../../components/CardTile";
import { ceremonyAbandoned } from "../../lib/analytics";
import { useSettings } from "../../lib/useSettings";
import type { Ceremony, CeremonyBoard, Defense, Proposal } from "./ceremony";

// The two screens between choosing a card and being told how it went, and the
// ceremony that drives them.
//
// Everything here is deliberately statistics-free. A drafter at a table has the
// cards and their own pool and nothing else, so that is what these show -- the
// printed card, which already carries its name, cost, types and rules text, and
// nothing 17Lands knows. Turning the numbers back on is what the reveal is FOR,
// and showing them here would turn the challenge into a reading comprehension
// exercise: the higher win rate would simply be the answer.

// Where a pick is between being chosen and being made. Two screens, in the order
// the argument has to happen in: you say what you think, and only then are you
// argued with. Turning those round would be a quiz with the answer on the card.
type Pending =
  | { stage: "reason"; proposal: Proposal }
  | {
      stage: "challenge";
      proposal: Proposal;
      reason: string;
      confidence: Confidence;
      challenge: Challenge;
    };

/**
 * State a reason and a confidence, get one card put up against yours, stand or
 * switch, and only then see the grade.
 *
 * The gate is `isDecisionPick`, the same threshold that decides whether the
 * coach is worth spending tokens on, and for the same reason rather than a
 * matching one: a pack down to its last few cards is picking for you, and being
 * asked to defend a forced pick is a chore that teaches nothing. It lives here
 * rather than on the board because it is a claim about arguing, not about
 * picking -- which is what makes the bottom of a pack play identically under
 * both ceremonies: neither of them has anything to say there.
 */
export function useChallenge({
  pack,
  scoring,
  busy,
  error,
  clearError,
  commit,
}: CeremonyBoard): Ceremony {
  const { settings } = useSettings();
  const [pending, setPending] = useState<Pending | null>(null);

  // The stage comes down only when the pick actually landed. A commit that fails
  // leaves it standing, so the sentence the player typed survives a network
  // blink -- retyping it is the worst thing this flow could ask for, and the
  // message goes onto the stage itself, which is also where the way out of it
  // is.
  const spend = async (proposal: Proposal, defense?: Defense) => {
    if (await commit(proposal, defense)) setPending(null);
  };

  // Back to the pack with nothing spent. Reachable from the first screen at any
  // time and from the challenge only after a pick has failed to go through --
  // being argued with is the point, so it is not a thing you can simply decline.
  const abandon = () => {
    if (pending) {
      ceremonyAbandoned({
        stage: pending.stage,
        ...(pending.stage === "challenge" ? { confidence: pending.confidence } : {}),
      });
    }
    setPending(null);
    clearError();
  };

  // The case is made; now it gets argued with. The challenger is the best
  // remaining card in the pack for this deck, which when the player has already
  // taken that card is the runner-up -- see challengeFor for why that rule is
  // what keeps the screen from being its own answer.
  const argue = (proposal: Proposal, reason: string, confidence: Confidence) => {
    const challenge = scoring ? challengeFor(pack, proposal.card, scoring) : undefined;

    // Nothing to argue with -- a pack of one, or a context we could not read.
    // The defense still stands and still reaches the coach; only the second
    // screen is skipped.
    if (!challenge) {
      void spend(proposal, { reason, confidence });
      return;
    }
    setPending({ stage: "challenge", proposal, reason, confidence, challenge });
  };

  // Standing and switching are the same act with a different answer, so they are
  // one function: the card taken is whichever one they named, and everything
  // else about the pick is unchanged. `switched` is not sent -- `draft.pick`
  // derives it from the card proposed against the card taken, so the stored row
  // cannot claim a change of mind that did not happen.
  const resolve = (open: Extract<Pending, { stage: "challenge" }>, take: Card) => {
    const { proposal, reason, confidence, challenge } = open;
    const stood = take.name === proposal.card.name;
    const outcome = resolveChallenge(challenge, stood);
    void spend(
      {
        ...proposal,
        card: take,
        // "I am taking this but will not play it" was said about the OTHER card.
        // A switch cannot inherit it, so the new card goes to the deck and the
        // picks column is there if they want it set aside after all.
        bench: stood ? proposal.bench : false,
        // Nor can it inherit having been lifted out of the pack by hand. The
        // card they carried is going back with the pack; naming no card as kept
        // would sweep the whole thing while the card they actually took was
        // never picked up at all.
        carried: stood ? proposal.carried : false,
      },
      {
        reason,
        confidence,
        challengedName: challenge.challenger.name,
        proposedName: proposal.card.name,
        outcome,
        // The better of the pair by the browser's own ranking, which is what the
        // whole pack's context-best must be: the challenger was the best card
        // that was not the proposed one.
        expectedBestName: outcome.edge > 0 ? proposal.card.name : challenge.challenger.name,
      },
    );
  };

  return {
    begin: (proposal) => {
      if (!isDecisionPick(pack.length, settings.coachMinPackCards)) {
        void spend(proposal);
        return;
      }
      setPending({ stage: "reason", proposal });
    },
    open: pending !== null,
    invitation: "Take a card and say why. Nothing is graded until you have.",
    stage:
      pending === null ? null : pending.stage === "reason" ? (
        <StateYourCase
          card={pending.proposal.card}
          busy={busy}
          error={error}
          onBack={abandon}
          onCommit={(reason, confidence) => argue(pending.proposal, reason, confidence)}
        />
      ) : (
        <TheChallenge
          yours={pending.proposal.card}
          challenger={pending.challenge.challenger}
          reason={pending.reason}
          busy={busy}
          error={error}
          onAbandon={abandon}
          onStand={() => resolve(pending, pending.proposal.card)}
          onSwitch={() => resolve(pending, pending.challenge.challenger)}
        />
      ),
  };
}

/**
 * How far the stage stops short of the right-hand edge.
 *
 * The dim covers the PACK, which is the thing being asked about. It must not
 * cover the deck: "is this better than what I have" is the whole question on the
 * second screen, and a player who has to dismiss the question to look at their
 * pool cannot answer it. So the overlay stops where the hover preview already
 * stops -- `[data-preview-edge]`, the one place this app names that edge, marked
 * on the board's side rail for exactly this reason.
 *
 * Zero when the rail is not beside the board. Below `lg` it stacks under the
 * pack, where covering it costs nothing and stopping short would leave a band of
 * undimmed page above the fold.
 */
function useRailEdge(): number {
  const [inset, setInset] = useState(0);
  // Layout, not effect: measured before paint, so the stage never opens
  // full-bleed for a frame and then snaps in.
  useLayoutEffect(() => {
    const measure = () => {
      const box = document.querySelector("[data-preview-edge]")?.getBoundingClientRect();
      setInset(box && box.left > window.innerWidth / 2 ? window.innerWidth - box.left : 0);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return inset;
}

// The board is still behind this, dimmed. It is not decoration: the pack you
// were looking at is the thing you are being asked about, and replacing the
// screen outright would make this feel like a different exercise instead of the
// same one, one beat later.
//
// A real dialog, not a div that looks like one: the board behind it is inert, so
// a screen reader that cannot see the dim has to be told the same thing the dim
// says. That is unaffected by the deck staying visible beside it -- readable and
// reachable are different things, and the rail is only the first.
function Stage({
  title,
  hint,
  error,
  onEscape,
  children,
}: {
  title: string;
  hint: string;
  // A failed pick. Shown here rather than in an alert() so the way out is on the
  // same surface as the thing that failed.
  error?: string | null;
  // Only ever passed once a commit has failed. The challenge is a real decision
  // point and deliberately has no cancel -- but a mutation that will not go
  // through must not leave the player sealed inside a modal with no exit.
  onEscape?: () => void;
  children: ReactNode;
}) {
  const railEdge = useRailEdge();

  useEffect(() => {
    if (!onEscape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onEscape]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      style={{ right: railEdge }}
      className="fixed top-0 bottom-0 left-0 z-40 flex items-center justify-center overflow-y-auto bg-base-100/85 p-4 backdrop-blur-sm"
    >
      {/* No `max-w-3xl` any more. The stage is now the pack column's width, and
          the cards are the reason it is open -- a 230px card you have to lean
          in to read is not a fair thing to be asked to decide between. */}
      <div className="popup-surface w-full max-w-5xl p-6 motion-safe:animate-verdict">
        <div className="mb-4">
          <h2 className="font-display text-2xl leading-tight">{title}</h2>
          <p className="mt-1 text-sm text-base-content/60">{hint}</p>
        </div>
        {children}
        {error != null && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-base-300 pt-3">
            <p className="text-sm text-error">{error}</p>
            {onEscape && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={onEscape}>
                Back to the pack
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// A card at the size you would hold one, with nothing attached. Capped rather
// than stretched so two of them sit side by side on a laptop without either
// running off the bottom of the stage.
//
// 360px, not the 230 it opened at. These screens ask the player to decide
// between two cards from their rules text alone -- no win rates, no grade, see
// the note at the top of this file -- so the text has to be readable without
// leaning in, or the exercise is a memory test on cards they half-saw.
function Held({ card, label }: { card: Card; label: string }) {
  return (
    <figure className="flex min-w-0 flex-col items-center gap-2">
      <span className="w-full max-w-[360px]">
        <CardFace card={card} />
      </span>
      <figcaption className="eyebrow text-center">{label}</figcaption>
    </figure>
  );
}

/**
 * Say what you are taking and why, before anything is graded.
 *
 * The reason is required. A flow whose whole premise is that you commit to a
 * position first does not have an "I'd rather not" branch -- and the sentence is
 * the one piece of evidence in this app that only a model can read, so a blank
 * one costs the reveal the only thing it could have told you that the numbers
 * could not.
 */
export function StateYourCase({
  card,
  busy,
  error,
  onBack,
  onCommit,
}: {
  card: Card;
  // A pick with no challenger commits straight from this screen, so this one
  // spends the mutation too and has to say so.
  busy: boolean;
  error?: string | null;
  onBack: () => void;
  onCommit: (reason: string, confidence: Confidence) => void;
}) {
  const [reason, setReason] = useState("");
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const ready = reason.trim().length > 0 && confidence !== null && !busy;

  const commit = () => {
    if (ready) onCommit(reason.trim(), confidence);
  };

  // A starter fills the box; it never commits on its own. The whole sentence is
  // then sitting in an editable field with the caret at the end of it, so taking
  // one as it stands and making it yours are the same gesture with a different
  // amount of typing after it. Clicking the one already in the box takes it back
  // out, which is the only undo a single click needs.
  const takeStarter = (text: string) => {
    const el = field.current;
    setReason((prev) => (prev === text ? "" : text));
    // After the commit, so the caret lands past the text React is about to
    // write rather than in the middle of the text it is replacing.
    if (el) {
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      });
    }
  };

  return (
    <Stage
      title={`Why ${card.name}?`}
      hint="Nothing is graded until you have said it. One line is enough."
      error={error}
      // This screen always has a way back, so the error only needs the message.
      onEscape={busy ? undefined : onBack}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <Held card={card} label="Taking" />

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {/* The grounds come first and the box is what they produce.
              Recognition, then recall: a blank field is the slowest thing you
              can put in front of someone who has already decided, and the ten
              grounds are the same decision as a list of words to point at.

              One group, not two. They are not a shortcut BESIDE the reason --
              they write the reason, and the field below is that sentence, still
              editable. Two labelled sections would claim the player has two
              things to fill in when they have one.

              The label is `htmlFor` rather than wrapped: a click inside a label
              is swallowed as "focus the field", and these have to fill it. */}
          <div className="flex flex-col gap-1.5">
            <label className="eyebrow" htmlFor="pick-reason">
              Your reason
            </label>

            {/* Five across, so the ten read as one block of grounds rather than
                a ragged wrap -- and two even rows are quicker to scan than four
                lines of different lengths. Three across where the stage stacks
                and the column is half as wide. */}
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
              {REASON_STARTERS.map((starter) => {
                const taken = reason === starter.text;
                return (
                  <button
                    key={starter.label}
                    type="button"
                    // The sentence, not the word on the button. A player
                    // deciding between "Curve" and "Bodies" is choosing between
                    // two claims they cannot see, and the box only shows them
                    // one at a time.
                    title={starter.text}
                    aria-pressed={taken}
                    onClick={() => takeStarter(starter.text)}
                    className={`btn btn-xs w-full font-normal ${
                      taken ? "btn-primary" : "btn-outline border-base-300 text-base-content/70"
                    }`}
                  >
                    {starter.label}
                  </button>
                );
              })}
            </div>

            <textarea
              id="pick-reason"
              ref={field}
              autoFocus
              rows={2}
              maxLength={REASON_LIMIT}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              // No newlines to lose: the field is one sentence long, so Enter is
              // free to mean "done" and the flow stays a keyboard away.
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  commit();
                }
              }}
              // Not one of the grounds above. A placeholder that matched one
              // would read as a chip that had gone missing, and this is doing
              // the other job: it is the specificity none of the ten general
              // grounds can carry, which is what the box is still here for.
              placeholder="Cheap flier, and I'm the aggro deck at this table"
              className="textarea w-full resize-none"
            />
            <span className="self-end text-xs tabular-nums text-base-content/45">
              {REASON_LIMIT - reason.length}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            {/* Not "how clear is this call?", which is a question about the
                player. This one names the thing being claimed, because the
                answer is graded against the data's margin of error and nothing
                on this screen used to say what the subject of the claim was
                until after a button had been pressed. */}
            <span className="eyebrow">How big is the gap to the next-best card?</span>
            <div className="join">
              {CONFIDENCE.map((level) => (
                <button
                  key={level.id}
                  type="button"
                  className={`btn join-item btn-sm ${confidence === level.id ? "btn-primary" : "btn-outline"}`}
                  onClick={() => setConfidence(level.id)}
                  aria-pressed={confidence === level.id}
                >
                  {level.label}
                </button>
              ))}
            </div>
            {/* The claim, spelled out under the control that makes it. Being
                graded on a statement nobody showed you is not a lesson, and
                each of these is a statement about the error bars the reveal
                will hold you to. */}
            <p className="min-h-[2.5rem] text-xs leading-relaxed text-base-content/60">
              {confidence
                ? `You are claiming ${CONFIDENCE.find((c) => c.id === confidence)?.claim}.`
                : "A claim about the cards, not about you — how sure you feel is not something the data can grade."}
            </p>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              disabled={busy}
              onClick={onBack}
            >
              Back to the pack
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!ready}
              onClick={commit}
            >
              Lock it in
            </button>
          </div>
        </div>
      </div>
    </Stage>
  );
}

/**
 * The other card, with its verdict withheld.
 *
 * `challenger` is always the best remaining card in the pack for this deck, so
 * when the player has already taken that card this is the runner-up. That is
 * what stops the screen from being its own answer: if it only appeared on a
 * miss, switching every time would be free. The three outcomes are named out
 * loud below for the same reason -- one of them wins, and which one is not
 * something the fact of being here can tell you.
 */
export function TheChallenge({
  yours,
  challenger,
  reason,
  busy,
  error,
  onAbandon,
  onStand,
  onSwitch,
}: {
  yours: Card;
  challenger: Card;
  reason: string;
  busy: boolean;
  error?: string | null;
  // Only reachable once a pick has actually failed to go through. There is no
  // cancel in the happy path on purpose -- being argued with is the point, and
  // an escape hatch would make it optional.
  onAbandon: () => void;
  onStand: () => void;
  onSwitch: () => void;
}) {
  return (
    <Stage
      title="One more card before you commit"
      hint="Either of these could be the better card for your deck, or the data may not be able to separate them. You find out after you choose."
      error={error}
      onEscape={error != null && !busy ? onAbandon : undefined}
    >
      <blockquote className="mb-5 border-l-2 border-base-content/20 pl-3 text-sm italic text-base-content/70">
        {reason}
      </blockquote>

      <div className="grid grid-cols-2 justify-items-center gap-6">
        <Held card={yours} label="Your pick" />
        <Held card={challenger} label="Also in this pack" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={onStand}
        >
          Stay with {yours.name}
        </button>
        <button
          type="button"
          className="btn btn-outline"
          disabled={busy}
          onClick={onSwitch}
        >
          Take {challenger.name} instead
        </button>
      </div>
    </Stage>
  );
}
