"use client";

import type { DiffRow, DiffTally, ForkImpact } from "@mtg-tutor/core";
import { Panel } from "../../../components/Panel";
import { gradeColor } from "../../../lib/format";
import { FaceCard, type Face } from "./faces";
import { Who } from "./sides";

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
 */
export function Forks({
  rows,
  tally,
  impacts,
  impactsUnavailable,
  them,
  faceOf,
  onOpen,
}: {
  rows: DiffRow[];
  tally: DiffTally;
  impacts: Map<number, ForkImpact>;
  impactsUnavailable: boolean;
  them: string;
  faceOf: (name: string, colors: readonly string[]) => Face;
  onOpen: (pickIndex: number) => void;
}) {
  const byIndex = new Map(rows.map((r) => [r.pickIndex, r]));
  const forkRows = tally.forks
    .map((f) => byIndex.get(f.pickIndex))
    .filter((r): r is DiffRow => Boolean(r));

  // By what the pick changed, not by when it happened. Chronological order is
  // the order they are already in on the track above; this list exists to answer
  // a different question, and ordering it the same way would make it a repeat.
  const ranked = [...forkRows].sort(
    (a, b) => (impacts.get(b.pickIndex)?.reach ?? 0) - (impacts.get(a.pickIndex)?.reach ?? 0),
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
      <Panel title="Where you chose differently">
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

  return (
    <Panel
      title="Where you chose differently"
      aside={
        <span className="text-xs text-base-content/50">
          same pack, {forkRows.length} time{forkRows.length === 1 ? "" : "s"}
        </span>
      }
      bodyClassName="gap-4"
    >
      <p className="text-sm text-base-content/70">
        The only picks that are one question answered twice — the same cards were in front
        of both of you and you reached for different ones.
      </p>

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(21rem,1fr))]">
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
      </div>

      {impactsUnavailable ? (
        <p className="text-xs leading-relaxed text-base-content/60">
          Measuring what a fork changed means dealing this pod again with that one pick
          swapped, and this set has been re-ingested since — so the packs it would deal now
          are not the packs you drafted. Everything above is unaffected: it reads what each
          pick saw at the time and never replays.
        </p>
      ) : (
        // The caveat travels with the number, and only when a number was
        // printed. It used to sit under every fork list including the ones where
        // nothing reached anything, explaining the assumptions behind a row of
        // empty bars.
        anyReached && (
          <p className="text-xs leading-relaxed text-base-content/45">
            &ldquo;Changed N of your later packs&rdquo; is measured by dealing this pod again
            with that one pick swapped and nothing else changed. It assumes you would have
            gone on drafting the same way.
          </p>
        )
      )}

      {apartAndDiffered > 0 && <Apart count={apartAndDiffered} them={them} />}
    </Panel>
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
  return (
    <p className="border-t border-base-300 pt-3 text-sm text-base-content/60">
      {count} more pick{count === 1 ? "" : "s"} went differently, but off packs that had
      already drifted apart — {them} took {count === 1 ? "a card" : "cards"} you were never
      offered, so there is no call of yours to set against{" "}
      {count === 1 ? "it" : "them"}. Those are the orange marks on the track above, and each
      one is laid out pick by pick below.
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
    <button
      className="card-focus flex w-full flex-col gap-3 rounded-box border border-base-300 bg-base-100 p-3 text-left transition-colors hover:border-base-content/25"
      onClick={() => onOpen(row.pickIndex)}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="eyebrow">
          Pack {row.packNo}, pick {row.pickNo}
        </span>
        <span className="text-xs text-base-content/45">
          {gap === 0
            ? "level on score"
            : gap > 0
              ? `theirs +${gap}`
              : `yours +${Math.abs(gap)}`}
        </span>
      </span>

      <span className="grid grid-cols-2 gap-3">
        <Held face={yours} label="You took" grade={row.yours.grade} mine />
        <Held face={theirs} label={`${them} took`} grade={row.theirs.grade} />
      </span>

      {/* What the pick went on to do, when it did anything. A line, not a chart:
          the answer is usually "nothing", and the shape that says nothing
          loudest is an empty bar. Kept because the one fork in ten that DID
          reroute the draft is the most interesting thing on this page. */}
      {reach > 0 && (
        <span className="flex items-center gap-2 border-t border-base-300 pt-2.5 text-xs leading-relaxed text-primary/85">
          <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />
          Changed {reach} of your {impact?.of ?? 0} later packs, from {impact?.delay} picks on.
        </span>
      )}
    </button>
  );
}

/**
 * One card face under a caption.
 *
 * Mirrors `Held` on the commitment stage, which is the app's existing way of
 * putting two cards to somebody and asking them to look. The dot beside the
 * caption is the whole identity system: filled is yours, hollow is theirs, and
 * it is the same mark the scoreboard and the braid use.
 */
function Held({
  face,
  label,
  grade,
  mine,
}: {
  face: Face;
  label: string;
  grade: string;
  mine?: boolean;
}) {
  return (
    <span className="flex min-w-0 flex-col gap-1.5">
      <FaceCard face={face} />
      <span className="flex min-w-0 items-baseline justify-between gap-2">
        <Who mine={mine}>{label}</Who>
        <span
          className="font-display text-sm font-semibold tabular-nums"
          style={{ color: gradeColor(grade) }}
        >
          {grade}
        </span>
      </span>
    </span>
  );
}
