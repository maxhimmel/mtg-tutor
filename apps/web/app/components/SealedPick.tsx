"use client";

import type { Card } from "@mtg-tutor/core";
import { CardFace } from "./CardTile";
import { MARK, TOOK } from "./PickMarks";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The date the pick was made, short. Read off the string rather than through
// Date, which takes a bare ISO date as UTC midnight and renders the day before
// for anyone west of Greenwich -- the same reason `releaseDate` does.
export function stamp(iso: string): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!parts) return "";
  const [, , month, day] = parts;
  return `${Number(day)} ${MONTHS[Number(month) - 1]}`;
}

const DAY = 24 * 60 * 60 * 1000;
export const ageInDays = (iso: string): number =>
  Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / DAY));

/**
 * The pick you made last time, face-down until you have made this one.
 *
 * The misses drill's premise is that the answer already exists -- it is not a
 * verdict being computed, it is a decision you made on a Tuesday in August. So
 * it sits on the table the whole time rather than appearing at the reveal, and
 * the only thing printed on the back is the date, because that is the one true
 * thing about a sealed card: when it was sealed.
 *
 * Both faces occupy one box and the box turns, so nothing around it moves while
 * it does. See card-turn in globals.css for why this is on the app's very short
 * list of things allowed to animate.
 *
 * `card` is optional and its absence is not an error: a pack whose cards this
 * screen could not hydrate would already have been left out of the run, but the
 * name is what the drill is certain of and the face is what it looks up.
 */
export function SealedPick({
  name,
  card,
  draftedAt,
  turned,
}: {
  name: string;
  card?: Card;
  draftedAt: string;
  turned: boolean;
}) {
  const days = ageInDays(draftedAt);

  return (
    <section className="flex flex-col gap-2">
      <span className={`${MARK} ${turned ? TOOK.tone : "text-base-content/45"}`}>
        {turned ? TOOK.label : "sealed"}
      </span>

      <div className="[perspective:1200px]">
        <div className={`card-turn relative ${turned ? "[transform:rotateY(180deg)]" : ""}`}>
          <div
            className="card-aspect flex flex-col items-center justify-center gap-2 rounded-xl border border-base-300 bg-base-200"
            aria-hidden={turned}
          >
            <span className="font-display text-2xl font-semibold tracking-tight text-base-content/70">
              {stamp(draftedAt)}
            </span>
            <span className="h-px w-8 bg-primary/40" />
            {/* The date and how long ago it was, and nothing else. Both are
                facts about the seal rather than about the card under it, which
                is the whole of what a face-down card is allowed to say -- and
                the eyebrow above already says what it is. */}
            <span className="text-[0.6875rem] tabular-nums text-base-content/40">
              {days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`}
            </span>
          </div>

          {/* Rotated a half turn so the pair swap through 180deg and this face
              lands square rather than mirrored. */}
          <div className="absolute inset-0 [transform:rotateY(180deg)]" aria-hidden={!turned}>
            {card ? (
              <CardFace card={card} className="ring-2 ring-info/70" />
            ) : (
              <div className="card-aspect flex items-center justify-center rounded-xl border border-base-300 bg-base-200 p-3 text-center text-sm">
                {name}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
