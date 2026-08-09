"use client";

import type { DiffRow, DiffTally } from "@mtg-tutor/core";
import { CardFace } from "../../../components/CardTile";
import { Panel } from "../../../components/Panel";
import { gradeColor } from "../../../lib/format";
import type { Face } from "./faces";

/**
 * The whole comparison in one line, then only the places you differed.
 *
 * A chronological list of all forty-two rows was tried in the lab and rejected:
 * it is the obvious shape and the least useful one, because forty of those rows
 * say "you both took the same card" and bury the two that do not. What is left
 * here is the answer and the disagreements.
 */
export function Hero({
  rows,
  tally,
  faceOf,
  onOpenFork,
}: {
  rows: DiffRow[];
  tally: DiffTally;
  faceOf: (name: string, colors: readonly string[]) => Face;
  onOpenFork: (pickIndex: number) => void;
}) {
  const lead = tally.yourAverage - tally.theirAverage;
  const splits = rows.filter((r) => !r.agree);

  return (
    <div className="flex flex-col gap-4">
      <Panel title="The short version">
        <p className="font-display text-2xl font-semibold leading-snug tracking-tight">
          {lead === 0
            ? "A dead heat."
            : lead > 0
              ? `You came out ${lead} points ahead.`
              : `They came out ${Math.abs(lead)} points ahead.`}
        </p>

        <p className="text-base-content/70">
          Same card on {tally.agreed} of {tally.rows} picks, apart on {tally.apart}.
        </p>

        {/* The honesty clause, and the reason this feature is not just a
            side-by-side. Prose rather than a control, because it is a fact
            about the comparison and not something to switch off. */}
        <p className="mt-1 border-l-2 border-warning/50 pl-3 text-sm leading-relaxed text-base-content/70">
          {tally.firstDrift === undefined ? (
            <>
              Both pods stayed in step the whole way — all {tally.rows} packs were the same
              cards, so every row here is the two of you answering one question.
            </>
          ) : (
            <>
              The first {tally.guaranteedThrough + 1} picks came off identical packs. After
              that their pod had drifted from yours — your earlier pick changed what the
              bots passed on, and it came back round at pick {tally.firstDrift + 1}. Packs
              still match here and there past that point, and each row below says which.{" "}
              <strong className="font-semibold text-base-content/85">
                {tally.comparable} of {tally.rows}
              </strong>{" "}
              were the same question.
            </>
          )}
        </p>

        <div className="mt-2 flex flex-wrap items-end gap-x-8 gap-y-3 border-t border-base-300 pt-3">
          <Stat label="You" value={tally.yourAverage} />
          <Stat label="Them" value={tally.theirAverage} />

          {tally.widest && (
            <button
              className="btn btn-sm btn-ghost ml-auto"
              onClick={() => tally.widest && onOpenFork(tally.widest.pickIndex)}
            >
              Biggest gap: P{tally.widest.packNo}P{tally.widest.pickNo} →
            </button>
          )}
        </div>
      </Panel>

      <Panel
        title="Where you split"
        aside={
          <span className="text-xs text-base-content/50">
            {splits.length === 0 ? "nowhere" : `${splits.length} — open one below`}
          </span>
        }
      >
        {splits.length === 0 ? (
          <p className="text-base-content/70">
            The same {tally.rows} picks, card for card.
          </p>
        ) : (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(21rem,1fr))]">
            {splits.map((row) => (
              <Fork key={row.pickIndex} row={row} faceOf={faceOf} onOpen={onOpenFork} />
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col">
      <span className="eyebrow">{label}</span>
      <span className="font-display text-2xl font-semibold tabular-nums leading-none">
        {value}
      </span>
    </div>
  );
}

function Fork({
  row,
  faceOf,
  onOpen,
}: {
  row: DiffRow;
  faceOf: (name: string, colors: readonly string[]) => Face;
  onOpen: (pickIndex: number) => void;
}) {
  // Colours off the pack each card was taken from -- their card is in THEIR
  // pack, which past the drift is not one you ever saw.
  const colorsOf = (pack: DiffRow["yours"]["pack"], name: string) =>
    pack.find((c) => c.name === name)?.colors ?? [];

  const yours = faceOf(row.yours.pickedName, colorsOf(row.yours.pack, row.yours.pickedName));
  const theirs = faceOf(row.theirs.pickedName, colorsOf(row.theirs.pack, row.theirs.pickedName));
  const gap = row.theirs.score - row.yours.score;

  return (
    <button
      className="card-focus flex w-full flex-col gap-3 rounded-box border border-base-300 bg-base-100 p-3 text-left transition-colors hover:border-base-content/25"
      onClick={() => onOpen(row.pickIndex)}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="eyebrow">
          Pack {row.packNo}, pick {row.pickNo}
        </span>
        {/* The distinction the whole screen turns on. A disagreement on
            different packs is not two answers to one question. */}
        {row.offShelf && (
          <span className="badge badge-xs badge-warning">different packs</span>
        )}
      </span>

      <span className="grid grid-cols-2 gap-3">
        <Held face={yours} label="You took" grade={row.yours.grade} />
        <Held face={theirs} label="They took" grade={row.theirs.grade} />
      </span>

      <span className="text-xs leading-relaxed text-base-content/60">
        {row.offShelf
          ? "Their card was never in your pack — these two were not the same decision."
          : gap === 0
            ? "The data cannot separate these two."
            : gap > 0
              ? `Their card graded ${gap} points higher.`
              : `Your card graded ${Math.abs(gap)} points higher.`}
      </span>
    </button>
  );
}

/**
 * One card face under a caption.
 *
 * Mirrors `Held` on the commitment stage, which is the app's existing way of
 * putting two cards to somebody and asking them to look. Narrower here because
 * there are several of these on a page rather than one filling a modal.
 */
function Held({ face, label, grade }: { face: Face; label: string; grade: string }) {
  return (
    <span className="flex min-w-0 flex-col gap-1.5">
      {face.card ? (
        <CardFace card={face.card} />
      ) : (
        // A card the set no longer has. Its name is still the truth about what
        // was taken, and saying so beats a blank frame.
        <span className="card-aspect flex w-full items-center justify-center rounded-xl border border-dashed border-base-content/25 bg-base-200 p-3 text-center text-sm">
          {face.name}
        </span>
      )}
      <span className="flex items-baseline justify-between gap-2">
        <span className="eyebrow">{label}</span>
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
