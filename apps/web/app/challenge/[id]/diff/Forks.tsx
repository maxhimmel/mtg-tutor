"use client";

import { useState } from "react";
import type { DiffRow, DiffTally, ForkImpact } from "@mtg-tutor/core";
import { Panel } from "../../../components/Panel";
import { ScrollBox } from "../../../components/ScrollBox";
import { gradeColor } from "../../../lib/format";
import { Explain } from "./Explain";
import { FaceName, type Face } from "./faces";
import { Dot } from "./sides";

/**
 * The picks that are actually a comparison, and what each one cost.
 *
 * These used to be two lists in two panels: the hero showed the cards, and the
 * braid showed a ranked bar chart of what each fork changed. They were the same
 * forks. A reader who wanted "which of my calls mattered, and what were they"
 * had to hold a name from one panel while looking at a bar in the other, and the
 * hero's list was worse than that -- it mixed the real forks in with the
 * disagreements that came off different packs, so the grid was a comparison
 * containing rows that are not comparable.
 *
 * One list, forks only, ranked by what the pick went on to change rather than by
 * when it happened. Everything that was not a fork is accounted for in a line at
 * the bottom and left to the shelf, which is the only surface that can show a
 * pick off a pack you never saw honestly.
 *
 * ROWS, NOT CARD PAIRS, which is the change that stopped this being the heaviest
 * thing on the page. Every fork was a tile with two pieces of card art in it --
 * ten forks came to forty card images, and none of them could be compared with
 * any other, because a grid of faces has no axis to compare along. The art was
 * also never the scarce thing here: both of these cards are one click away in
 * the pick-by-pick panel, at size, in the whole pack they came out of, which is
 * the only place the choice can actually be read. So a fork is a few lines -- where
 * it happened, what each of you reached for, how the two graded, and what it
 * went on to change -- and ten of them can be run down with an eye. The full
 * card is still one hover away on either name.
 *
 * THE ORDER IS A CONTROL, because there are exactly three orders and no reason
 * to pick one on the reader's behalf. A fork carries three quantities and
 * nothing else: when it happened, how far apart the two cards scored, and how
 * much of your later draft it went on to change. Each is a question somebody
 * arrives with -- walk me through it, where did they gain on me, which of my
 * calls actually mattered -- and the answer to each is this list in a different
 * order. It defaults to when, because that is the draft as it was played and it
 * is the only ordering that needs no explanation.
 *
 * There is no separate filter, and that is a decision rather than an omission.
 * The subsets worth having are "the ones that changed something" and "the ones
 * they gained on" -- and both are what the top of the corresponding sort already
 * is, on a list of five to fifteen. A filter here would hide forks to save a
 * reader from scrolling past four of them.
 */

type SortKey = "order" | "gap" | "changed";
export function Forks({
  rows,
  tally,
  impacts,
  impactsUnavailable,
  them,
  faceOf,
  onOpen,
  className,
}: {
  rows: DiffRow[];
  tally: DiffTally;
  impacts: Map<number, ForkImpact>;
  impactsUnavailable: boolean;
  them: string;
  faceOf: (name: string, colors: readonly string[]) => Face;
  onOpen: (pickIndex: number) => void;
  className?: string;
}) {
  const [sort, setSort] = useState<SortKey>("order");

  const byIndex = new Map(rows.map((r) => [r.pickIndex, r]));
  const forkRows = tally.forks
    .map((f) => byIndex.get(f.pickIndex))
    .filter((r): r is DiffRow => Boolean(r));

  const reachOf = (row: DiffRow) => impacts.get(row.pickIndex)?.reach ?? 0;
  // Signed and descending, so the list runs from their best call to yours rather
  // than from "the biggest disagreement" -- which is a magnitude, and a magnitude
  // cannot tell a reader hunting for where they went wrong from one admiring
  // their own picks. Every row prints its own direction, so the gradient down
  // the list is legible without a second label.
  const gapOf = (row: DiffRow) => row.theirs.score - row.yours.score;

  const ranked = [...forkRows].sort(
    // Stable, which is what lets every ordering fall back to draft order on a
    // tie instead of to whatever the engine happened to do.
    sort === "gap"
      ? (a, b) => gapOf(b) - gapOf(a)
      : sort === "changed"
        ? (a, b) => reachOf(b) - reachOf(a)
        : (a, b) => a.pickIndex - b.pickIndex,
  );

  // Whether the counterfactual found anything at all. Usually it does not: your
  // own pick cannot reach your own packs for at least eight picks, and by then
  // the card you would have taken instead is often gone anyway -- so most forks
  // changed nothing you ever saw. A row of empty progress bars is that fact
  // rendered as a chart, which reads as a broken chart rather than as a finding.
  // So the bars are gone and the number appears only where there IS one.
  const anyReached = forkRows.some((r) => (impacts.get(r.pickIndex)?.reach ?? 0) > 0);

  const apartAndDiffered = rows.filter((r) => !r.samePack && !r.agree).length;

  if (forkRows.length === 0) {
    return (
      <Panel title="Where you chose differently" className={className}>
        <p className="text-base-content/70">
          {tally.comparable === 0
            ? "Nowhere the two of you can be compared — no pick in this draft put the same cards in front of both of you."
            : `Nowhere. On all ${tally.comparable} picks where you were looking at the same cards, you took the same card.`}
        </p>
        {/* "More" would be a lie with no forks above it to be more than. */}
        {apartAndDiffered > 0 && tally.comparable > 0 && (
          <Apart count={apartAndDiffered} them={them} />
        )}
      </Panel>
    );
  }

  // What the reach number was measured by.
  const impactNote = (
    <>
      &ldquo;Changed N of your later packs&rdquo; is measured by dealing this pod again with
      that one pick swapped and nothing else changed. It assumes you would have gone on
      drafting the same way.
    </>
  );
  // Only where a number was actually printed. A failed replay is a different
  // fact and gets its own paragraph below, because it explains a column the
  // reader can see is missing.
  const noteImpact = anyReached && !impactsUnavailable;

  return (
    <Panel
      title="Where you chose differently"
      className={className}
      aside={
        (forkRows.length > 1 || noteImpact) && (
          <span className="flex items-center gap-2.5">
            {forkRows.length > 1 && (
              <Sort
                value={sort}
                onChange={setSort}
                // Offered only where the quantity exists. Sorting by what each
                // fork changed, on a draft where no fork changed anything, is a
                // control that does nothing when pressed -- and most drafts are
                // that draft, because your own pick cannot reach your own packs
                // for eight picks and the card you would have taken is usually
                // gone by then.
                changed={anyReached}
              />
            )}
            {/* ON THE HEADER RULE, WHICH IS WHERE THE MARK BELONGS AND THE
                PARAGRAPH DOES NOT. A footnote sits under the thing it qualifies
                because that is the only place a reader will meet it in order. A
                question mark is the opposite: it is looked for, not met, and
                the place a reader looks for what a panel means is the rule with
                the panel's name on it -- next to the control that is already
                there. Under a scroll box it was a mark you had to scroll past
                fifteen forks to find. */}
            {noteImpact && (
              <Explain subject="what a fork changed" align="end">
                {impactNote}
              </Explain>
            )}
          </span>
        )
      }
      bodyClassName="gap-3"
    >
      {/* CAPPED, because the number of forks is the one thing on this screen
          that varies by an order of magnitude between two drafts of the same
          set. Two forks is a short panel; fifteen was a panel that pushed the
          drawing of the whole draft below the fold, so how much of this page a
          reader ever found depended on how much they and their friend happened
          to disagree. No label on the box: every fork in it is a button, so a
          keyboard already walks the list and scrolls it on the way.

          Laid out by the width a fork needs rather than in one column, so a wide
          screen fills with three or four abreast instead of running one row
          across a metre of page with a card name at one end and a grade at the
          other. The sort reads left to right and wraps, which is how a ranked
          grid reads. */}
      <ScrollBox maxHeight="max-h-[30rem]">
        <ul className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(21rem,1fr))]">
          {ranked.map((row) => (
            <Fork
              key={row.pickIndex}
              row={row}
              them={them}
              impact={impacts.get(row.pickIndex)}
              faceOf={faceOf}
              onOpen={onOpen}
            />
          ))}
        </ul>
      </ScrollBox>

      {/* A failed replay stays a paragraph whatever the page has been told about
          notes: it is not a caveat on a number, it is the reason a column the
          reader can see is missing. */}
      {impactsUnavailable && (
        <p className="text-xs leading-relaxed text-base-content/60">
          Measuring what a fork changed means dealing this pod again with that one pick
          swapped, and this set has been re-ingested since — so the packs it would deal now
          are not the packs you drafted. Everything above is unaffected: it reads what each
          pick saw at the time and never replays.
        </p>
      )}

      {apartAndDiffered > 0 && <Apart count={apartAndDiffered} them={them} />}
    </Panel>
  );
}

/**
 * Which order the list is in, as the three buttons rather than a caption.
 *
 * It replaces a line of small grey text that reported the order the code had
 * chosen -- "ranked by what each changed" -- which is the shape a setting takes
 * when nobody can change it. The three options are not a menu of views somebody
 * thought up; they are the three quantities a fork has, so the list is exhaustive
 * by construction and cannot grow a fourth entry without the data growing one.
 *
 * In the header rule, which is where this app's panels already put a control
 * that belongs to the panel. The word "Sort" goes at the first breakpoint that
 * cannot hold it: three buttons whose labels are all orderings do not need to be
 * told what they are, and on a phone the header has room for one thing.
 */
function Sort({
  value,
  onChange,
  changed,
}: {
  value: SortKey;
  onChange: (key: SortKey) => void;
  changed: boolean;
}) {
  const options: { key: SortKey; label: string }[] = [
    { key: "order", label: "Pick order" },
    { key: "gap", label: "Score gap" },
    ...(changed ? [{ key: "changed" as const, label: "What it changed" }] : []),
  ];

  return (
    <span className="flex items-center gap-2">
      <span className="eyebrow hidden sm:inline">Sort</span>
      <span className="join" role="group" aria-label="Sort the forks">
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            // Gold for the one that is on, which is what gold means everywhere
            // else in this app -- the card you are holding, the tick you are on,
            // the badge naming your selection. A sort control a reader has to
            // squint at to see the state of is worse than no sort control.
            className={`btn btn-xs join-item border-base-300 font-normal ${
              value === option.key ? "btn-primary" : "btn-ghost"
            }`}
            aria-pressed={value === option.key}
            onClick={() => onChange(option.key)}
          >
            {option.label}
          </button>
        ))}
      </span>
    </span>
  );
}

/**
 * The disagreements that are not comparisons, counted rather than drawn.
 *
 * Drawing them as card pairs is the tempting thing and the wrong one: two cards
 * side by side is the app's way of putting a choice to somebody, and there was
 * no choice here -- their card was never on your shelf. The count belongs in the
 * accounting; the explanation belongs on the shelf, which can show the pack the
 * card is missing from.
 */
function Apart({ count, them }: { count: number; them: string }) {
  // THE COUNT NEVER GOES BEHIND THE MARK. It is the accounting -- the picks this
  // panel is not showing you -- and a list that silently omits rows unless you
  // hover something is a list that is wrong. Only the reason they are omitted
  // is worth a mark.
  const why = (
    <>
      {them} took {count === 1 ? "a card" : "cards"} you were never offered, so there is no
      call of yours to set against {count === 1 ? "it" : "them"}. Those are the shaded
      stretches on the braid.
    </>
  );

  return (
    <p className="flex flex-wrap items-center gap-x-2 border-t border-base-300 pt-3 text-sm leading-relaxed text-base-content/60">
      <span>
        {count} more pick{count === 1 ? "" : "s"} went differently off packs that had already
        drifted apart.
      </span>
      <Explain subject="picks off packs that had drifted" align="start">
        {why}
      </Explain>
    </p>
  );
}

function Fork({
  row,
  them,
  impact,
  faceOf,
  onOpen,
}: {
  row: DiffRow;
  them: string;
  // Absent while the replay is in flight, and for good when the set has moved.
  // Both read the same way here -- there is no number, so no line is drawn.
  impact?: ForkImpact;
  faceOf: (name: string, colors: readonly string[]) => Face;
  onOpen: (pickIndex: number) => void;
}) {
  const colorsOf = (pack: DiffRow["yours"]["pack"], name: string) =>
    pack.find((c) => c.name === name)?.colors ?? [];

  const yours = faceOf(row.yours.pickedName, colorsOf(row.yours.pack, row.yours.pickedName));
  // A fork is same-pack by definition, so their card is on your shelf and its
  // colours come off the one pack both of you were dealt.
  const theirs = faceOf(row.theirs.pickedName, colorsOf(row.yours.pack, row.theirs.pickedName));
  const gap = row.theirs.score - row.yours.score;

  const reach = impact?.reach ?? 0;

  return (
    <li>
      {/* Every line spans the row, which is what a card name needs and a column
          layout could not give it. Set in four columns -- coordinate, name,
          grade, score gap -- the name was the only elastic one, so on a phone it
          truncated to about eight characters while three short numbers kept
          their full width. A card is the subject of this row; it does not lose
          its name to a figure. */}
      {/* Panel weight, not page weight. These used to be base-100 cards sunk
          into a base-200 panel; the box they now sit in is the recess, so a
          fork lying in it has to be the thing on top or the two are one flat
          surface with a border drawn on it. */}
      <button
        className="card-focus flex w-full flex-col gap-2 rounded-lg border border-base-300 bg-base-200 px-3 py-2.5 text-left transition-colors hover:border-base-content/25"
        aria-label={`Pack ${row.packNo}, pick ${row.pickNo} — you took ${row.yours.pickedName}, ${row.yours.grade}; ${them} took ${row.theirs.pickedName}, ${row.theirs.grade}.${
          reach > 0
            ? ` It changed ${reach} of your ${impact?.of ?? 0} later packs, from ${impact?.delay} picks on.`
            : ""
        }`}
        onClick={() => onOpen(row.pickIndex)}
      >
        <span aria-hidden className="flex items-baseline justify-between gap-2">
          <span className="eyebrow">
            Pack {row.packNo}, pick {row.pickNo}
          </span>
          <span className="shrink-0 text-xs text-base-content/45">
            {gap === 0
              ? "level on score"
              : gap > 0
                ? `theirs +${gap}`
                : `yours +${Math.abs(gap)}`}
          </span>
        </span>

        <span aria-hidden className="flex flex-col gap-1">
          <Took face={yours} grade={row.yours.grade} mine />
          <Took face={theirs} grade={row.theirs.grade} />
        </span>

        {/* What the pick went on to do, when it did anything. A line, not a
            chart: the answer is usually "nothing", and the shape that says
            nothing loudest is an empty bar. Kept because the one fork in ten
            that DID reroute the draft is the most interesting thing on this
            page -- and it is why the list is ordered the way it is, so the rows
            carrying one rise to the top of it. */}
        {reach > 0 && (
          <span
            aria-hidden
            className="flex items-center gap-2 border-t border-base-300 pt-2 text-xs leading-relaxed text-primary/85"
          >
            <span className="size-1.5 shrink-0 rounded-full bg-primary" />
            Changed {reach} of your {impact?.of ?? 0} later packs, from {impact?.delay} picks
            on.
          </span>
        )}
      </button>
    </li>
  );
}

/**
 * One card as a line: whose it is, what it was, how it graded.
 *
 * The dot is the whole identity system -- filled is yours, hollow is theirs --
 * and it is the same mark the scoreboard, the braid and the shelf use. With the
 * art gone the grade is the only judgement on the row, so it keeps the app's
 * grade colour rather than settling into body text.
 */
function Took({ face, grade, mine }: { face: Face; grade: string; mine?: boolean }) {
  return (
    <span className="flex min-w-0 items-baseline gap-2">
      <span className="flex self-center">
        <Dot mine={mine} />
      </span>
      <FaceName face={face} className="min-w-0 flex-1 text-sm" />
      <span
        className="shrink-0 font-display text-sm font-semibold tabular-nums"
        style={{ color: gradeColor(grade) }}
      >
        {grade}
      </span>
    </span>
  );
}
