"use client";

import { PICK_CEREMONIES, useSettings } from "../../lib/useSettings";
import { useDismissable } from "../../lib/useDismissable";

// 2 is "coach everything except the literally forced last card"; 9 stops at the
// halfway point of a Play Booster pack.
const COACH_THRESHOLDS = [2, 3, 5, 7, 9];

/**
 * The terms this draft is being played under, said out loud on the board.
 *
 * These three used to be settings behind the avatar, which was wrong twice over.
 * They are not app settings -- none of them does anything anywhere except on
 * this screen, and two of them only matter in the second between choosing a card
 * and the pick landing. And behind a menu their state is unreadable: whether the
 * stats are showing and whether the coach is going to speak are things a player
 * needs to know while looking at a pack, not things to go and check.
 *
 * So they are stated the way a table agrees its rules before it sits down: one
 * quiet line of what is true, where each term is the control that changes it.
 * The set picker already does this with its view toggle; this is the rest of it.
 *
 * Flat rather than pilled. Three bordered chips beside the pick counter is a
 * toolbar, and a toolbar is a menu with the lid off -- the point is that this
 * reads as a sentence at rest. The caret is the one piece of decoration and it
 * is load-bearing: two of these flip when clicked and the third opens something,
 * so only the third gets one.
 */
export function TableTerms() {
  const { settings, update } = useSettings();
  const ceremony = PICK_CEREMONIES.find((c) => c.id === settings.pickCeremony);
  const other = PICK_CEREMONIES.find((c) => c.id !== settings.pickCeremony);

  return (
    <div className="eyebrow flex flex-wrap items-center gap-y-1">
      {ceremony && other && (
        <Term
          title={`${ceremony.blurb} — click for ${other.label}`}
          label={`Making a pick: ${ceremony.label}. Switch to ${other.label}.`}
          onClick={() => update({ pickCeremony: other.id }, "board")}
        >
          {ceremony.label}
        </Term>
      )}

      <Dot />

      {/* The two states are named asymmetrically on purpose. They are not one
          switch's on and off -- one is the app showing you something, the other
          is you choosing to work without it, which is the harder practice and
          deserves to be called by its own name rather than by the absence of the
          first. What a click does is in the accessible name, where a flip
          control's action belongs anyway. */}
      <Term
        title={
          settings.showStats
            ? "Hovering a card shows what 17Lands knows about it — click to draft blind"
            : "A card is just a card; the numbers wait for the review — click to show stats"
        }
        label={
          settings.showStats
            ? "Stats showing. Hide them and draft blind."
            : "Drafting blind. Show a card's stats when you hover it."
        }
        onClick={() => update({ showStats: !settings.showStats }, "board")}
      >
        {settings.showStats ? "Stats showing" : "Drafting blind"}
      </Term>

      <Dot />

      <CoachTerm />
    </div>
  );
}

function Dot() {
  return (
    <span aria-hidden className="px-0.5 text-base-content/25">
      ·
    </span>
  );
}

// The accessible name is the whole sentence, so the visible text is free to be
// the shorthand a player reads at a glance -- and free to be a symbol, which
// "≥" is and which screen readers do not agree on how to say.
function Term({
  title,
  label,
  onClick,
  children,
  ...rest
}: {
  title: string;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
} & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      title={title}
      aria-label={label}
      onClick={onClick}
      className="cursor-pointer rounded px-1.5 py-0.5 transition-colors hover:bg-base-300 hover:text-base-content focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
      {...rest}
    >
      {children}
    </button>
  );
}

// The only one of the three with more than two answers, so the only one that
// opens anything. Kept as a segmented control rather than a <select>: every
// option stays visible, and a native select opens an OS popup that takes focus
// out of the document -- which is what would dismiss the panel holding it.
function CoachTerm() {
  const { settings, update } = useSettings();
  const { open, setOpen, ref } = useDismissable<HTMLDivElement>();

  return (
    <div ref={ref} className="relative">
      <Term
        title={`The coach stays quiet on picks with fewer than ${settings.coachMinPackCards} cards left — click to change`}
        label={`Coach skips picks with fewer than ${settings.coachMinPackCards} cards left. Change the threshold.`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        Coach ≥{settings.coachMinPackCards}
        <span aria-hidden className="ml-1 text-base-content/40">
          ▾
        </span>
      </Term>

      {open && (
        // Right-aligned: this is the last term before the pick counter, at the
        // right edge of the header, so a panel opening leftward is the only one
        // that stays on the page.
        //
        // z-30 rather than the 50 the account menu uses, and the difference
        // matters: the commitment stage dims the board from z-40, and a panel
        // above that would leave the coach threshold floating clear of a modal
        // that is mid-question. 30 still clears the whole board -- the confirm
        // bar's z-20 is inside the board's own `isolate`, which composites as
        // one block below anything in the header.
        <div className="popup-surface absolute right-0 top-full z-30 mt-2 w-64 p-3">
          <div className="mb-2 flex flex-col gap-0.5">
            <span className="text-sm font-normal normal-case tracking-normal text-base-content">
              Smallest pack the coach comments on
            </span>
            <span className="text-xs font-normal normal-case tracking-normal text-base-content/60">
              Below it the pick is forced, and you get the plain explanation
              instead.
            </span>
          </div>
          <div
            className="flex rounded-lg bg-base-300 p-0.5"
            role="group"
            aria-label="Smallest pack the AI coach comments on"
          >
            {COACH_THRESHOLDS.map((n) => {
              const selected = settings.coachMinPackCards === n;
              return (
                <button
                  key={n}
                  type="button"
                  className={`flex-1 cursor-pointer rounded-md py-1 text-xs font-normal normal-case tracking-normal tabular-nums transition-colors ${
                    selected
                      ? "bg-primary font-semibold text-primary-content"
                      : "text-base-content/50 hover:bg-base-100 hover:text-base-content"
                  }`}
                  aria-pressed={selected}
                  onClick={() => update({ coachMinPackCards: n }, "board")}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
