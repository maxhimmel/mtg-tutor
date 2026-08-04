"use client";

import { type ReactNode, useState } from "react";
import type { Card } from "@mtg-tutor/core";
import { CONFIDENCE, type Confidence } from "@mtg-tutor/core";
import { CardFace } from "../../components/CardTile";

// The two screens between choosing a card and being told how it went.
//
// Everything here is deliberately statistics-free. A drafter at a table has the
// cards and their own pool and nothing else, so that is what these show -- the
// printed card, which already carries its name, cost, types and rules text, and
// nothing 17Lands knows. Turning the numbers back on is what the reveal is FOR,
// and showing them here would turn the challenge into a reading comprehension
// exercise: the higher win rate would simply be the answer.

// Long enough for a real reason, short enough that it has to be the actual one.
// It also bounds what the flow adds to the coach prompt -- 140 characters is
// about 35 tokens on a call that already sends thousands.
const REASON_LIMIT = 140;

// The board is still behind this, dimmed. It is not decoration: the pack you
// were looking at is the thing you are being asked about, and replacing the
// screen outright would make this feel like a different exercise instead of the
// same one, one beat later.
function Stage({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-base-100/85 p-4 backdrop-blur-sm">
      <div className="popup-surface w-full max-w-3xl p-6 motion-safe:animate-verdict">
        <div className="mb-4">
          <h2 className="font-display text-2xl leading-tight">{title}</h2>
          <p className="mt-1 text-sm text-base-content/60">{hint}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

// A card at the size you would hold one, with nothing attached. Capped rather
// than stretched so two of them sit side by side on a laptop without either
// running off the bottom of the stage.
function Held({ card, label }: { card: Card; label: string }) {
  return (
    <figure className="flex min-w-0 flex-col items-center gap-2">
      <span className="w-full max-w-[230px]">
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
  onBack,
  onCommit,
}: {
  card: Card;
  onBack: () => void;
  onCommit: (reason: string, confidence: Confidence) => void;
}) {
  const [reason, setReason] = useState("");
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const ready = reason.trim().length > 0 && confidence !== null;

  const commit = () => {
    if (ready) onCommit(reason.trim(), confidence);
  };

  return (
    <Stage
      title={`Why ${card.name}?`}
      hint="Nothing is graded until you have said it. One line is enough."
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
        <Held card={card} label="Taking" />

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="eyebrow">Your reason</span>
            <textarea
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
              placeholder="Best removal in the pack, and I have none yet"
              className="textarea w-full resize-none"
            />
            <span className="self-end text-xs tabular-nums text-base-content/45">
              {REASON_LIMIT - reason.length}
            </span>
          </label>

          <div className="flex flex-col gap-1.5">
            <span className="eyebrow">How clear is this call?</span>
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
                : "Each answer is a claim about how far apart the top cards here really are."}
            </p>
          </div>

          <div className="flex items-center justify-end gap-2">
            <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
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
  onStand,
  onSwitch,
}: {
  yours: Card;
  challenger: Card;
  reason: string;
  busy: boolean;
  onStand: () => void;
  onSwitch: () => void;
}) {
  return (
    <Stage
      title="One more card before you commit"
      hint="Either of these could be the better card for your deck, or the data may not be able to separate them. You find out after you choose."
    >
      <blockquote className="mb-5 border-l-2 border-base-content/20 pl-3 text-sm italic text-base-content/70">
        {reason}
      </blockquote>

      <div className="grid grid-cols-2 gap-6">
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
