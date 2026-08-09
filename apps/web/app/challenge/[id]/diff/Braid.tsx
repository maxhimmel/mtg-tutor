"use client";

import type { DiffRow, DiffTally, ForkImpact } from "@mtg-tutor/core";
import { Panel } from "../../../components/Panel";

/**
 * Where the two drafts came apart, and what that cost.
 *
 * A BRAID, not a tree, and the shape is forced by the data rather than chosen.
 * A tree fans out and never rejoins; these two drafts run a fixed forty-two
 * picks in parallel and re-converge constantly -- most of the picks still agree
 * long after the pods have drifted. Drawn as a tree, every fork would claim two
 * futures that never happened.
 *
 * THE BRANCH POINT IS NOT WHERE YOU PICKED DIFFERENTLY. It is where the PACKS
 * first differed, and those are at least eight picks apart, because your own
 * pick cannot reach your own packs until the pod passes yours back round. That
 * gap is the one thing this diagram exists to show: a naive drawing puts the
 * fork where the effect is and gets the causation exactly backwards.
 */

const LANE = { top: 20, bottom: 60, mid: 40 };
const H = 80;
const PAD = 14;

// Magic's own colours, which is what a reader already knows how to decode.
// Gold for two or more, the game's convention for multicolour.
const INK: Record<string, string> = {
  W: "#f3efd0",
  U: "#a8cbe4",
  B: "#9c9490",
  R: "#e08d68",
  G: "#8fb694",
};
const ink = (colors: string): string =>
  colors.length === 0 ? "#5a5a5a" : colors.length > 1 ? "#d4af5f" : (INK[colors] ?? "#6b6b6b");

export function Braid({
  rows,
  tally,
  impacts,
  impactsUnavailable,
  at,
  onOpenFork,
}: {
  rows: DiffRow[];
  tally: DiffTally;
  impacts: Map<number, ForkImpact>;
  impactsUnavailable: boolean;
  at: number;
  onOpenFork: (pickIndex: number) => void;
}) {
  if (rows.length === 0) return null;

  const x = (i: number) => PAD + i * ((1000 - PAD * 2) / Math.max(1, rows.length - 1));

  // A strand sits on the centre line while the two of you agree and pulls out
  // to its own lane where you do not. Segment by segment so each can carry the
  // colour that side's deck had committed to by then.
  const laneY = (row: DiffRow, side: "yours" | "theirs") =>
    row.agree ? LANE.mid : side === "yours" ? LANE.top : LANE.bottom;

  const segments = (side: "yours" | "theirs") =>
    rows.slice(0, -1).map((row, i) => ({
      key: `${side}-${i}`,
      x1: x(i),
      y1: laneY(row, side),
      x2: x(i + 1),
      y2: laneY(rows[i + 1], side),
      stroke: ink(side === "yours" ? row.yourColors : row.theirColors),
    }));

  const ranked = [...tally.forks].sort(
    (a, b) => (impacts.get(b.pickIndex)?.reach ?? 0) - (impacts.get(a.pickIndex)?.reach ?? 0),
  );

  // The fork the first drift is attributable to: the last one before it. Only
  // this one gets an arc, because with several forks upstream the causes are
  // tangled and drawing them all would assert an attribution nobody measured.
  const causingFork =
    tally.firstDrift === undefined
      ? undefined
      : [...tally.forks].reverse().find((f) => f.pickIndex < (tally.firstDrift ?? 0));

  return (
    <Panel
      className="mt-4"
      title="How the two drafts came apart"
      aside={
        <span className="text-xs text-base-content/50">
          strand colour is the deck each of you was becoming
        </span>
      }
    >
      <svg
        viewBox={`0 0 1000 ${H}`}
        className="h-[80px] w-full"
        role="img"
        aria-label={`A braid of ${rows.length} picks. ${tally.apart} disagreements, ${tally.forks.length} of them on the same pack.`}
      >
        {/* Where the packs stop being guaranteed to match. Not "permanently
            separated" -- they re-converge by coincidence, and each row says so
            for itself. */}
        {tally.firstDrift !== undefined && (
          <>
            <line
              x1={x(tally.firstDrift)}
              y1={6}
              x2={x(tally.firstDrift)}
              y2={H - 6}
              stroke="currentColor"
              strokeWidth={1}
              strokeDasharray="3 3"
              className="text-warning/70"
            />
            {causingFork && (
              // The delayed causal link, drawn as the arc it is: cause on the
              // left, eight-or-more picks of nothing visible, effect on the
              // right. This is the claim a tree cannot make.
              <path
                d={`M ${x(causingFork.pickIndex)} ${LANE.top - 8} Q ${
                  (x(causingFork.pickIndex) + x(tally.firstDrift)) / 2
                } 2 ${x(tally.firstDrift)} ${LANE.top - 8}`}
                fill="none"
                stroke="currentColor"
                strokeWidth={1}
                strokeDasharray="2 3"
                className="text-warning/60"
              />
            )}
          </>
        )}

        {(["yours", "theirs"] as const).flatMap((side) =>
          segments(side).map((s) => (
            <line
              key={s.key}
              x1={s.x1}
              y1={s.y1}
              x2={s.x2}
              y2={s.y2}
              stroke={s.stroke}
              strokeWidth={2.5}
              strokeLinecap="round"
              opacity={0.9}
            />
          )),
        )}

        {/* Where you were both asked the same question and answered it
            differently. The only clickable thing here, because it is the only
            thing on this diagram that is a decision. */}
        {tally.forks.map((f) => (
          <g key={f.pickIndex} className="cursor-pointer" onClick={() => onOpenFork(f.pickIndex)}>
            <circle cx={x(f.pickIndex)} cy={LANE.mid} r={9} fill="transparent" />
            <circle
              cx={x(f.pickIndex)}
              cy={LANE.mid}
              r={4}
              className="fill-primary"
              stroke="currentColor"
              strokeWidth={1.5}
            />
            <title>{`P${f.packNo}P${f.pickNo}: ${f.yours} vs ${f.theirs}`}</title>
          </g>
        ))}

        {/* Where the stepper is looking. */}
        <line
          x1={x(Math.min(at, rows.length - 1))}
          y1={4}
          x2={x(Math.min(at, rows.length - 1))}
          y2={H - 4}
          stroke="currentColor"
          strokeWidth={1}
          className="text-base-content/30"
        />
      </svg>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-xs text-base-content/50">
        <span>You above · them below · joined where you agreed</span>
        {tally.firstDrift !== undefined && causingFork && (
          <span className="text-warning/80">
            P{causingFork.packNo}P{causingFork.pickNo} changed the pack you saw{" "}
            {tally.firstDrift - causingFork.pickIndex} picks later
          </span>
        )}
      </div>

      {ranked.length > 0 && (
        <div className="mt-3 flex flex-col gap-2 border-t border-base-300 pt-3">
          <p className="eyebrow">Forks by what they changed</p>

          {impactsUnavailable ? (
            <p className="text-xs leading-relaxed text-base-content/60">
              Measuring what a fork changed means dealing this pod again with that one pick
              swapped, and this set has been re-ingested since — so the packs it would deal
              now are not the packs you drafted. The comparison above is unaffected: it
              reads what each pick saw at the time and never replays.
            </p>
          ) : (
            <>
              {ranked.map((f) => {
                const impact = impacts.get(f.pickIndex);
                const of = impact?.of ?? 0;
                const reach = impact?.reach ?? 0;
                const width = of === 0 ? 0 : Math.round((reach / of) * 100);

                return (
                  <button
                    key={f.pickIndex}
                    onClick={() => onOpenFork(f.pickIndex)}
                    className="card-focus flex flex-col gap-1 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-base-300/40"
                  >
                    <span className="flex flex-wrap items-baseline gap-x-2 text-sm">
                      <span className="eyebrow">
                        P{f.packNo}P{f.pickNo}
                      </span>
                      <span className="font-semibold">{f.yours}</span>
                      <span className="text-base-content/45">vs</span>
                      <span className="font-semibold">{f.theirs}</span>
                    </span>

                    <span className="flex items-center gap-2">
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-base-300">
                        <span
                          className="block h-full rounded-full bg-primary"
                          style={{ width: `${width}%` }}
                        />
                      </span>
                      <span className="whitespace-nowrap text-xs tabular-nums text-base-content/60">
                        {reach} of {of} later packs
                      </span>
                    </span>

                    <span className="text-xs text-base-content/50">
                      {impact?.delay === undefined
                        ? "Taking the other card would have changed nothing you saw afterwards."
                        : `First showed up ${impact.delay} picks later.`}
                    </span>
                  </button>
                );
              })}

              {/* The caveat that has to travel with the number. `delay` is
                  exact; `reach` is not, and this repo does not print a figure
                  without saying what it assumed. */}
              <p className="text-xs leading-relaxed text-base-content/45">
                Measured by dealing this pod again with that one pick swapped and nothing
                else changed — counting how many of your later packs came out different. It
                assumes you would have gone on drafting the same way.
              </p>
            </>
          )}
        </div>
      )}
    </Panel>
  );
}
