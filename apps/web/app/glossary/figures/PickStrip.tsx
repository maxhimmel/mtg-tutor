"use client";

import type { ReactNode } from "react";
import { scaleLinear } from "@visx/scale";
import { Plot, Reference } from "../../charts/Plot";
import { Dot } from "../../charts/marks";
import { INK, MARK } from "../../charts/ink";
import type { KeyEntry } from "../../charts/Key";
import type { Guide } from "../../charts/guides";
import { Figure, Term, FIG_LABEL } from "./Figure";

// ATA and ALSA are the only pair on the panel where neither number means much
// alone and the DISTANCE between them means everything. So they are drawn the
// way a draft actually works: a pack of fourteen, one slot per pick, and a span
// from where the field first sees a card to where somebody finally takes it.
//
// The dashed rule is the whole reason that distance matters. Eight players pass
// in a circle, so the pack you send away on your first pick is the pack that
// reaches you again on your ninth -- and a card whose span crosses that line is
// a card you can pass and still expect to get back. "The wheel" is the field's
// own word for it, which is why the marker needs no other label.
//
// Deliberately NOT numbered 1 to 14. The stored figures are 17Lands' raw
// pick_number, which counts a fresh pack as pick 0 -- see build-set-stats, where
// a fresh pack is detected as pick_number === "0" -- and the hover panel prints
// them raw. Numbering the slots here would either contradict the panel or assert
// an index this page has no business asserting, so the strip is labelled by its
// ends and the marks carry the app's own numbers.
//
// THE TWO DOTS NEEDED A KEY AND DID NOT HAVE ONE. Gold against neutral was the
// only thing saying which end was which, on a figure whose whole subject is the
// distance BETWEEN them -- so a reader who could not separate the hues had two
// marks and no way to tell the seeing from the taking. The key below the strip
// names both, and the neutral dot is now hollow as well as neutral, so the pair
// differs by fill and not only by colour.

interface Row {
  card: string;
  seen: number;
  taken: number;
}

// Verified against packages/backend/data/tdm.TradDraft.json -- alsa and ata.
const ROWS: Row[] = [
  { card: "Marang River Regent", seen: 0.47, taken: 0.45 },
  { card: "Highspire Bell-Ringer", seen: 5.33, taken: 10.95 },
];

const PACK = 14;
const SEATS = 8;

const COLUMNS = "sm:grid-cols-[minmax(0,11rem)_1fr]";

// The row of slots, the row a card's marks sit on, and the row the wheel is
// named in.
const SLOT_H = 8;
const TRACK_H = 36;
const WHEEL_H = 18;

// A pick has to be a place, not a hairline, or the strip is fourteen ticks
// rather than a pack: the smallest a slot can be and still hold the mark that
// lands in it is the mark's own width. Everything narrower is a drawing where a
// two-pick span and a five-pick span look the same.
const NEEDS = PACK * MARK.dot;

// The span between the two marks. Thinner than the dots it joins, so the ends
// stay the marks and the span stays a relation between them.
const SPAN_H = 3;

// The disc a mark sits on, painted in the figure's own surface so it reads as a
// gap rather than as a third colour. Measured off the mark rather than assumed:
// visx sizes a glyph by AREA, so the kit's 8px dot is a circle of radius 4.5.
const DOT_R = Math.sqrt((MARK.dot * MARK.dot) / Math.PI);
const RING = DOT_R + 2;

/** The shared scale, as `Strip` hands it to whatever is being drawn on it. */
type Scale = ReturnType<typeof scaleLinear<number>>;

// The pack in pick units, so a span is read in picks rather than in pixels.
// Slot centres sit at pick + 0.5, which puts a mark inside a pick rather than on
// the seam between two; the wheel sits on the seam itself, because it is the
// moment between two picks and not a pick of its own.
const DOMAIN: [number, number] = [0, PACK];

/**
 * ALSA and ATA, named -- with the marks they are actually drawn as.
 *
 * `shape` rather than colour alone, because that is the failure this key was
 * added to fix: filled against hollow survives a reader who cannot separate the
 * gold from the neutral, and `Key`'s own docblock refuses to let a key be the
 * thing that makes hue load-bearing.
 *
 * The `means` lines are the glossary's own words for the two halves, sitting
 * three inches above the entry they come from.
 */
const KEY: KeyEntry[] = [
  {
    label: "ALSA",
    ink: INK.theirs,
    shape: "hollow",
    means: "The pick the field first sees it at",
  },
  {
    label: "ATA",
    ink: INK.yours,
    shape: "dot",
    means: "The pick somebody finally takes it at",
  },
];

/**
 * One card's track, or one of the strip's own shared rows.
 *
 * Every caller gets the same domain and the same minimum, so the slots, the two
 * cards and the wheel label cannot disagree about where pick eight is -- they
 * are separate `Plot`s only because they are separate cells of a grid that
 * reflows.
 */
function Strip({
  label,
  height,
  instead,
  legend = {
    none: "Both dots are named in the key under the strip, once rather than per row.",
  },
  children,
}: {
  label: string;
  height: number;
  instead: ReactNode;
  legend?: Guide<KeyEntry[]>;
  children: (x: Scale) => ReactNode;
}) {
  return (
    <Plot
      height={height}
      needs={NEEDS}
      instead={instead}
      label={label}
      legend={legend}
      // Both of a card's numbers are printed beside its name, and the figure has
      // two fixed rows -- a hover would hand back the line already on screen.
      tip={{ none: "Both of a card's pick numbers are printed beside its name." }}
    >
      {({ width }) => children(scaleLinear<number>({ domain: DOMAIN, range: [0, width] }))}
    </Plot>
  );
}

export function PickStrip() {
  return (
    <Figure
      title="One of these comes back to you. The other never leaves the table."
      lede={
        <>
          A pack is fourteen cards passed around eight players. The hollow dot is the pick the
          field first sees a card at; the gold dot is the pick somebody finally takes it at. What
          is worth reading is the distance between them.
        </>
      }
      coda={
        <>
          Eight seats means the pack you pass on your first pick is the one that reaches you again
          on your ninth. The Bell-Ringer&apos;s span crosses that line, so you can take something
          else now and still expect it back. The Regent has no span at all — it is gone the moment
          anyone sees it. That is what <Term id="pick-order" /> is for, and neither number claims the
          Bell-Ringer is the worse card. Only that it is the cheaper one to wait for.
        </>
      }
    >
      <div className="flex flex-col gap-6 sm:gap-4">
        <div className={`grid gap-1 sm:gap-4 ${COLUMNS}`}>
          <span className="hidden sm:block" />
          <div>
            <div className={`flex justify-between ${FIG_LABEL} text-base-content/55`}>
              <span>First pick</span>
              <span>Last card</span>
            </div>
            {/* The pack drawn at its own resolution: fourteen slots, so the axis
                has a unit and the spans below are read in picks. */}
            <div className="mt-2">
              <Strip
                height={SLOT_H}
                label={`A pack of ${PACK} picks, first to last.`}
                instead={
                  <p className={`${FIG_LABEL} text-base-content/55`}>
                    {PACK} picks, first to last
                  </p>
                }
              >
                {(x) =>
                  Array.from({ length: PACK }, (_, i) => (
                    <line
                      key={i}
                      x1={x(i + 0.5)}
                      x2={x(i + 0.5)}
                      y1={0}
                      y2={SLOT_H}
                      stroke={INK.rule}
                      strokeWidth={MARK.axis}
                    />
                  ))
                }
              </Strip>
            </div>
          </div>
        </div>

        {ROWS.map((row) => (
          <div key={row.card} className={`grid grid-cols-[1fr] gap-1 ${COLUMNS} sm:items-center sm:gap-4`}>
            <div className="sm:text-right">
              <p className="font-display text-base leading-tight text-base-content">{row.card}</p>
              <p className="mt-0.5 text-xs leading-snug text-base-content/50">
                seen <span className="tabular-nums">{row.seen.toFixed(1)}</span> · taken{" "}
                <span className="tabular-nums">{row.taken.toFixed(1)}</span>
              </p>
            </div>

            <Strip
              height={TRACK_H}
              label={`${row.card}: first seen at pick ${row.seen.toFixed(1)} of ${PACK}, taken at pick ${row.taken.toFixed(1)}. The wheel is at pick ${SEATS}.`}
              instead={
                <p className="text-sm text-base-content/70">
                  Seen at <span className="tabular-nums">{row.seen.toFixed(1)}</span>, taken at{" "}
                  <span className="tabular-nums">{row.taken.toFixed(1)}</span> — the wheel is at{" "}
                  {SEATS}.
                </p>
              }
            >
              {(x) => {
                const mid = TRACK_H / 2;
                // A card taken the instant it is seen can post an ATA a
                // hundredth BELOW its ALSA -- the Regent does -- which as a raw
                // subtraction is a negative width the browser discards, leaving
                // a full-bleed bar across the track. Floored at zero, so "no
                // span at all" draws as no span at all, which is what it means.
                const span = Math.max(0, x(row.taken) - x(row.seen));

                return (
                  <>
                    <line
                      x1={0}
                      x2={x(PACK)}
                      y1={mid}
                      y2={mid}
                      stroke={INK.rule}
                      strokeWidth={MARK.axis}
                    />
                    {/* Unlabelled here on purpose. The wheel is named once,
                        under the rule it belongs to, rather than four times. */}
                    <Reference at={x(SEATS)} height={TRACK_H} dashed />

                    <rect
                      x={x(row.seen)}
                      y={mid - SPAN_H / 2}
                      width={span}
                      height={SPAN_H}
                      rx={SPAN_H / 2}
                      fill={INK.yours}
                    />

                    {/* The disc under each mark is the figure's own surface, so
                        two marks that nearly coincide -- which is what the
                        Regent is -- still read as two. */}
                    <circle
                      cx={x(row.seen)}
                      cy={mid}
                      r={RING}
                      fill="var(--color-base-200)"
                    />
                    <Dot cx={x(row.seen)} cy={mid} ink={INK.theirs} hollow />
                    <circle
                      cx={x(row.taken)}
                      cy={mid}
                      r={RING}
                      fill="var(--color-base-200)"
                    />
                    <Dot cx={x(row.taken)} cy={mid} ink={INK.yours} />
                  </>
                );
              }}
            </Strip>
          </div>
        ))}

        {/* Named once, under the rule it belongs to, rather than repeated in
            every row -- and carrying the figure's key with it, for the same
            reason: this is the row that belongs to the whole strip. */}
        <div className={`grid gap-1 sm:gap-4 ${COLUMNS}`}>
          <span className="hidden sm:block" />
          <Strip
            height={WHEEL_H}
            label={`The wheel: the seam between pick ${SEATS} and pick ${SEATS + 1}, where a pack passed on your first pick comes back around.`}
            legend={KEY}
            instead={
              <p className="text-sm text-base-content/70">
                The wheel is the seam after pick {SEATS} — ALSA and ATA are read against it.
              </p>
            }
          >
            {(x) => <Reference at={x(SEATS)} height={0} label="The wheel" dashed />}
          </Strip>
        </div>
      </div>
    </Figure>
  );
}
