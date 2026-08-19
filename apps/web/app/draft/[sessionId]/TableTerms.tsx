"use client";

import { COACH_THRESHOLDS, PICK_CEREMONIES, useSettings } from "../../lib/useSettings";
import { useDismissable } from "../../lib/useDismissable";

// The ceremony drawn as what it actually asks of you: two cards to be weighed
// against each other, or the one card you are taking. The icon carries the
// difference rather than decorating the word for it.
function CeremonyIcon({ challenge }: { challenge: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden="true">
      {challenge ? (
        <>
          <rect x="1.5" y="2.5" width="5.5" height="11" rx="1.25" />
          <rect x="9" y="2.5" width="5.5" height="11" rx="1.25" />
        </>
      ) : (
        <rect x="5.25" y="2.5" width="5.5" height="11" rx="1.25" />
      )}
    </svg>
  );
}

function StatsIcon({ showing }: { showing: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M1 8s2.6-4.5 7-4.5S15 8 15 8s-2.6 4.5-7 4.5S1 8 1 8Z" />
      <circle cx="8" cy="8" r="1.9" fill="currentColor" stroke="none" />
      {!showing && <path d="M2.5 13.5 13.5 2.5" />}
    </svg>
  );
}

function CoachIcon() {
  return (
    <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor" aria-hidden="true">
      <path d="M3 2.5h10A1.5 1.5 0 0 1 14.5 4v6A1.5 1.5 0 0 1 13 11.5H7.4l-3 2.6A.6.6 0 0 1 3.4 13.7V11.5H3A1.5 1.5 0 0 1 1.5 10V4A1.5 1.5 0 0 1 3 2.5Z" />
    </svg>
  );
}

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
 * One bordered bar with hairline dividers, not three loose chips and not a bare
 * line of text. It shipped as a bare line first, on the theory that terms should
 * read as a sentence at rest -- which is exactly what stopped them reading as
 * controls. Nothing about flat text says "these three are live", so the only
 * affordance left was hover, which announces itself solely to somebody already
 * pointing at it. The border says the whole thing is live, the dividers say the
 * three belong together, and hover lifts one segment rather than the bar.
 *
 * Icons beside the labels rather than instead of them, and the two that have
 * states draw them: a pair of cards to be weighed against each other or the one
 * card you are taking, an open eye or a struck-through one.
 */
export function TableTerms() {
  const { settings, update } = useSettings();
  const ceremony = PICK_CEREMONIES.find((c) => c.id === settings.pickCeremony);
  const other = PICK_CEREMONIES.find((c) => c.id !== settings.pickCeremony);

  return (
    <div className="flex items-stretch rounded-lg border border-base-300 bg-base-200 text-xs">
      {ceremony && other && (
        <Term
          className="rounded-l-[7px]"
          icon={<CeremonyIcon challenge={settings.pickCeremony === "challenge"} />}
          title={`${ceremony.blurb} — click for ${other.label}`}
          label={`Making a pick: ${ceremony.label}. Switch to ${other.label}.`}
          onClick={() => update({ pickCeremony: other.id }, "board")}
        >
          {ceremony.label}
        </Term>
      )}

      <Divider />

      {/* The two states are named asymmetrically on purpose. They are not one
          switch's on and off -- one is the app showing you something, the other
          is you choosing to work without it, which is the harder practice and
          deserves its own name rather than the absence of the first. What a
          click does is in the accessible name, where a flip control's action
          belongs anyway. */}
      <Term
        icon={<StatsIcon showing={settings.showStats} />}
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

      <Divider />

      <CoachTerm />
    </div>
  );
}

function Divider() {
  return <span aria-hidden className="w-px shrink-0 bg-base-300" />;
}

// The accessible name is the whole sentence, so the visible text is free to be
// the shorthand a player reads at a glance -- and free to be a symbol, which
// "≥" is and which screen readers do not agree on how to say.
//
// `-outline-offset-2` rather than the usual outward ring: a segment's focus
// outline sits inside the bar it belongs to, so it cannot be clipped by the
// neighbour beside it or straddle the border.
function Term({
  icon,
  title,
  label,
  onClick,
  className,
  children,
  ...rest
}: {
  icon: React.ReactNode;
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
      className={`flex cursor-pointer items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 text-base-content/70 transition-colors hover:bg-base-300 hover:text-base-content focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary ${className ?? ""}`}
      {...rest}
    >
      <span className="text-base-content/50">{icon}</span>
      {children}
    </button>
  );
}

// The only one of the three with more than two answers, so the only one that
// opens anything -- which is why the caret is structure rather than decoration.
// Kept as a segmented control rather than a <select>: every option stays
// visible, and a native select opens an OS popup that takes focus out of the
// document, which is what would dismiss the panel holding it.
function CoachTerm() {
  const { settings, update } = useSettings();
  const { open, setOpen, ref } = useDismissable<HTMLDivElement>();

  return (
    <div ref={ref} className="relative flex">
      <Term
        // Held lit while its panel is open, so the segment and the panel read as
        // one thing rather than as a box that happens to be nearby.
        className={`rounded-r-[7px] ${open ? "bg-base-300 text-base-content" : ""}`}
        icon={<CoachIcon />}
        title={`The coach stays quiet on picks with fewer than ${settings.coachMinPackCards} cards left — click to change`}
        label={`Coach skips picks with fewer than ${settings.coachMinPackCards} cards left. Change the threshold.`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        Coach ≥{settings.coachMinPackCards}
        <span aria-hidden className="text-base-content/40">
          ▾
        </span>
      </Term>

      {open && (
        // Right-aligned: this is the last segment before the pick counter, at
        // the right edge of the header, so a panel opening leftward is the only
        // one that stays on the page.
        //
        // z-30 rather than the 50 the account menu uses, and the difference
        // matters: the commitment stage dims the board from z-40, and a panel
        // above that would leave the coach threshold floating clear of a modal
        // that is mid-question. 30 still clears the whole board -- the confirm
        // bar's z-20 is inside the board's own `isolate`, which composites as
        // one block below anything in the header.
        <div className="popup-surface absolute right-0 top-full z-30 mt-2 w-64 p-3">
          <div className="mb-2 flex flex-col gap-0.5">
            <span className="text-sm text-base-content">
              Smallest pack the coach comments on
            </span>
            <span className="text-xs text-base-content/60">
              Below it the pick is forced, and you get the plain explanation
              instead.
            </span>
          </div>
          <div
            className="flex rounded-lg bg-base-300 p-0.5"
            role="group"
            aria-label="Smallest pack the AI coach comments on"
          >
            {COACH_THRESHOLDS.map((rung) => {
              const selected = settings.coachMinPackCards === rung.id;
              return (
                <button
                  key={rung.id}
                  type="button"
                  title={rung.blurb}
                  className={`flex-1 cursor-pointer rounded-md py-1 text-xs tabular-nums transition-colors ${
                    selected
                      ? "bg-primary font-semibold text-primary-content"
                      : "text-base-content/50 hover:bg-base-100 hover:text-base-content"
                  }`}
                  aria-pressed={selected}
                  onClick={() => update({ coachMinPackCards: rung.id }, "board")}
                >
                  {rung.label}
                </button>
              );
            })}
          </div>
          {/* What the pressed rung actually buys, under the control that sets
              it. The numbers alone are a scale with no units -- "5" says
              nothing about whether that is a lot of coaching or a little -- and
              the one line above the group describes the SETTING rather than the
              choice within it. Reserved height so choosing does not shift the
              panel under the cursor that is choosing. */}
          <p className="mt-2 min-h-[2.5rem] text-xs leading-relaxed text-base-content/50">
            {COACH_THRESHOLDS.find((rung) => rung.id === settings.coachMinPackCards)?.blurb}
          </p>
        </div>
      )}
    </div>
  );
}
