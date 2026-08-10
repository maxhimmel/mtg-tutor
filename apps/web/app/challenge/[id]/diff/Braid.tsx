"use client";

import type { DiffRow, DiffTally } from "@mtg-tutor/core";
import { COLOR_NAMES } from "../../../lib/format";
import { Panel } from "../../../components/Panel";

/**
 * The two drafts as two strands, running together and splaying where they part.
 *
 * WHY THE FIRST BRAID DID NOT READ, which is worth writing down because the
 * shape was right and the drawing was wrong. The two strands sat at the SAME y
 * wherever the picks agreed, so one was painted directly over the other and what
 * you actually saw was a single line, in whichever colour was drawn last. Every
 * part of the caption was then describing something invisible.
 *
 * So the strands never merge. They run ADJACENT where you agreed -- close enough
 * to read as one rope, two cords visible in it -- and open where you did not.
 * Both colours are on screen at every pick, which is what makes the colour worth
 * drawing at all.
 *
 * Each strand is itself TWO CORDS, one per colour of the pair that side was
 * drafting, which is what finally makes the colour say something. It used to
 * collapse any two colours to gold -- the game's mark for a multicolour CARD,
 * and no answer at all to which deck somebody was building. The colour stays
 * exact through the curves: four paths, each painted with a hard-stop gradient
 * built from the pick-by-pick leans, so the geometry smooths without the colour
 * being blended into shades neither of you ever played.
 *
 * WHY IT STILL DID NOT READ, second pass, which is the amplitude. Every pick you
 * differed on opened the rope by the same sixteen units, and on a real pair of
 * drafts most of those are single picks with agreement either side. Twenty-five
 * identical humps across a panel is a waveform: one loud note repeated, with no
 * way to tell a blip from a parting that held for six picks and actually built
 * two different decks. So the excursion is now the RUN's own length -- see
 * `opennessOf`. The rope barely kinks for one pick and yawns for a sustained
 * one, and the shape of the draft is finally in the shape of the drawing.
 *
 * AND THE DRIFT IS GROUND, NOT ROPE. The track at the top of this page draws
 * three states and this drew two, so an opening with no gold tick in it had
 * nothing anywhere saying why -- while the summary above spends a paragraph on
 * exactly that. Packs coming apart is not something either of you DID, so it is
 * not on the strands: it is a shaded stretch of the floor the strands run over,
 * in the warning tone this feature already says drift in. Its leading edge is
 * the first drift, which is why the dashed rule that used to mark it is gone --
 * one boundary drawn once, and the arc lands on it.
 *
 * THE DELAY IS STILL THE CLAIM. Your own pick cannot reach your own packs until
 * the pod passes yours back round, at least eight picks later, and a diagram
 * that puts the branch where you picked differently gets the causation exactly
 * backwards. So the arc survives -- cause on the left, a long span of nothing
 * visible, effect on the right -- and it is now given clear air above the wells
 * to be seen in, because it is the one mark here carrying an argument.
 *
 * Curves, settled. The control that offered corners instead was a comparison
 * aid, and it has done its job: a rope has no corners, and a straight cut to a
 * new lane draws the parting as instantaneous when the whole point of the panel
 * is that it was not.
 */

// Fat on purpose. The strand was eight units -- four per cord -- and four units
// of colour with another colour pressed against it is not a colour anybody can
// name, it is a hairline that happens to be tinted.
const CORD = 7;
// A thread of page between a strand's two cords. Butted, a cream cord against a
// blue one is one shape with a colour change in it; parted by a single unit, it
// is two cords, which is the whole claim the pair is making.
const SEAM = 1;
const STRAND = CORD * 2 + SEAM;
// Between the two strands' centres where the picks agree. Against a 15-unit
// strand it leaves three units of page -- two ropes lying alongside, not one
// slab and not two unrelated tracks.
const TOGETHER = 18;
// The widest either side climbs. Forty-two picks across a panel is about 16px
// each, so a strand that went much further would be moving faster than 45
// degrees, and a rope this thick at that angle reads as a chunk rather than as
// an opening. Fifty units between the centres is already unmistakably apart.
const OPEN = 16;
// The strands' own room, inside a well.
const WELL_H = 86;
const PAD = 14;
// Page showing between one pack's well and the next. Enough to read as a break
// at any panel width, small enough that no pick loses its place over it.
const WELL_GAP = 5;
// Clear air above the wells, for the causal arc and only when there is one.
const CHANNEL = 22;

// Magic's own colours, which is what a reader already knows how to decode. White
// is pulled back off the top of the range: at #f3efd0 against this near-black
// panel it was the brightest thing on the page by some way, and a strand whose
// second colour is white read as a white rope with a tint at one edge.
const INK: Record<string, string> = {
  W: "#e9dcb4",
  U: "#a8cbe4",
  B: "#9c9490",
  R: "#e08d68",
  G: "#8fb694",
};
const UNDECIDED = "#55504c";

/**
 * A cord's colour, where a cord is half a strand.
 *
 * Each strand is drawn as two cords, and that is what lets it say a PAIR. The
 * previous drawing collapsed anything with more than one colour to a single
 * gold, which is the game's convention for a multicolour card and says nothing
 * whatever about which two colours a deck is -- so a blue-black drafter and a
 * red-green one were painted identically for most of the draft.
 *
 * One colour fills both cords, so a mono-colour lean reads as a solid strand
 * rather than as a pair that happens to match. Nothing yet fills both with the
 * undecided grey, which is the honest picture of the first few picks.
 */
const cordInk = (lean: string, cord: 0 | 1): string => {
  if (lean.length === 0) return UNDECIDED;
  return INK[lean[lean.length === 1 ? 0 : cord]] ?? UNDECIDED;
};

const spoken = (colors: string): string =>
  colors.length === 0
    ? "no colours yet"
    : [...colors].map((c) => COLOR_NAMES[c] ?? c).join("-");

export function Braid({
  rows,
  tally,
  them,
  at,
  onOpenFork,
}: {
  rows: DiffRow[];
  tally: DiffTally;
  them: string;
  at: number;
  onOpenFork: (pickIndex: number) => void;
}) {
  if (rows.length === 0) return null;

  // The fork the first drift is attributable to: the last one before it. Only
  // this one gets an arc, because with several forks upstream the causes are
  // tangled and drawing them all would assert an attribution nobody measured.
  const causingFork =
    tally.firstDrift === undefined
      ? undefined
      : [...tally.forks].reverse().find((f) => f.pickIndex < (tally.firstDrift ?? 0));

  // Height follows what there is to draw. With no arc there is no argument to
  // give air to, and twenty-two units of empty panel would be a channel for
  // nothing.
  const channel = causingFork ? CHANNEL : 2;
  const H = channel + WELL_H + 2;
  const mid = channel + WELL_H / 2;

  const step = (1000 - PAD * 2) / rows.length;
  // A pick's own band, and its centre. The turn happens over the pick it belongs
  // to rather than between two of them.
  const bandL = (i: number) => PAD + i * step;
  const bandR = (i: number) => PAD + (i + 1) * step;
  const cx = (i: number) => bandL(i) + step / 2;

  const open = opennessOf(rows);

  const laneY = (i: number, side: "yours" | "theirs") =>
    side === "yours"
      ? mid - TOGETHER / 2 - OPEN * open[i]
      : mid + TOGETHER / 2 + OPEN * open[i];

  const leanOf = (row: DiffRow, side: "yours" | "theirs") =>
    side === "yours" ? row.yourLean : row.theirLean;

  /**
   * One cord, as a path.
   *
   * The control points sit half a pick either side of the turn and horizontally
   * level with the point they belong to -- the standard smooth step, which makes
   * a lane change read as the rope easing open.
   */
  const strandPath = (side: "yours" | "theirs", cord: 0 | 1) => {
    // The two cords ride half a seam's width either side of the strand's own
    // line, so together they occupy exactly one strand.
    const off = (cord === 0 ? -1 : 1) * ((CORD + SEAM) / 2);
    return rows
      .map((_, i) => {
        const x = cx(i);
        const y = laneY(i, side) + off;
        if (i === 0) return `M ${x} ${y}`;
        const px = cx(i - 1);
        const py = laneY(i - 1, side) + off;
        const mx = (px + x) / 2;
        return py === y ? `L ${x} ${y}` : `C ${mx} ${py} ${mx} ${y} ${x} ${y}`;
      })
      .join(" ");
  };

  /**
   * The colour timeline, as hard gradient stops.
   *
   * Two stops per pick at the same offsets its band spans, so each pick's colour
   * ends exactly where the next begins. A soft gradient would paint the blend
   * between "blue" and "blue-black" as a colour neither deck ever was.
   */
  const stops = (side: "yours" | "theirs", cord: 0 | 1) =>
    rows.flatMap((row, i) => {
      const color = cordInk(leanOf(row, side), cord);
      return [
        { key: `${i}a`, offset: i / rows.length, color },
        { key: `${i}b`, offset: (i + 1) / rows.length, color },
      ];
    });

  const cords = [0, 1] as const;

  /**
   * Each pack as a well the strands run through.
   *
   * The boundary was a hairline under the chart and a gap between two labels,
   * which is not a delineation -- it is a thing you can find if you already know
   * where to look. A pack is a container in this game and the pick track above
   * already draws it as one, so the braid draws it the same way: a shallow well
   * with page showing between it and the next.
   */
  let seen = 0;
  const wells = packSpans(rows).map((pack) => {
    const from = seen;
    seen += pack.count;
    return {
      packNo: pack.packNo,
      count: pack.count,
      from,
      to: seen,
      x: bandL(from) + WELL_GAP / 2,
      width: pack.count * step - WELL_GAP,
    };
  });

  // Where the packs stopped being guaranteed to match, drawn as the stretch of
  // floor it is. Cut at the pack breaks and clamped to the wells, so the shading
  // never bleeds across the page showing between one well and the next -- it is
  // the floor of a pack being marked, and there is no floor in the gap.
  const drifted = wells.flatMap((well) =>
    spans(rows, (r) => !r.samePack, well.from, well.to).map((run) => ({
      key: `${run.from}`,
      x: Math.max(bandL(run.from), well.x),
      width: Math.min(bandR(run.to - 1), well.x + well.width) - Math.max(bandL(run.from), well.x),
    })),
  );

  const here = Math.min(at, rows.length - 1);
  const last = rows[rows.length - 1];

  return (
    <Panel
      className="mt-4"
      title="How the two drafts came apart"
      aside={
        <span className="hidden text-xs text-base-content/50 sm:inline">
          each strand is the two colours that side was drafting most
        </span>
      }
      bodyClassName="gap-3"
    >
      <div className="flex items-stretch gap-3">
        {/* NOT a legend. A legend is a list of marks you look up, and there were
            only ever two rows here to tell apart -- so the honest thing is to
            say what is already true of the picture: the top half of this chart
            is yours and the bottom half is theirs.

            So the gutter is the two halves themselves, bracketed, each name
            pushed to its own outside edge. Nothing to map and nothing to
            memorise; the label is where the thing it names lives. */}
        <div className="flex w-28 shrink-0 flex-col" style={{ height: H }} aria-hidden>
          <LaneLabel lean={last.yourLean} label="You" edge="top" />
          <LaneLabel lean={last.theirLean} label={them} edge="bottom" />
        </div>

        <svg
          viewBox={`0 0 1000 ${H}`}
          preserveAspectRatio="none"
          className="min-w-0 flex-1"
          style={{ height: H }}
          role="img"
          aria-label={`Two strands over ${rows.length} picks, running together where you took the same card and opening where you did not — wider the longer the parting held. You finished ${spoken(
            last.yourLean,
          )}; ${them} finished ${spoken(last.theirLean)}. ${tally.forks.length} of the partings were on the same pack; the shaded stretches are the ${
            tally.rows - tally.comparable
          } picks where you were not looking at the same cards at all.`}
        >
          <defs>
            {(["yours", "theirs"] as const).flatMap((side) =>
              cords.map((cord) => (
                <linearGradient
                  key={`${side}-${cord}`}
                  id={`braid-${side}-${cord}`}
                  gradientUnits="userSpaceOnUse"
                  x1={PAD}
                  x2={1000 - PAD}
                  y1={0}
                  y2={0}
                >
                  {stops(side, cord).map((s) => (
                    <stop key={s.key} offset={s.offset} stopColor={s.color} />
                  ))}
                </linearGradient>
              )),
            )}
          </defs>

          {/* First, so everything else is inside them. */}
          {wells.map((well) => (
            <rect
              key={well.packNo}
              x={well.x}
              y={channel}
              width={well.width}
              height={WELL_H}
              rx={2}
              className="fill-base-100/50 stroke-base-content/15"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {/* Where you are on the page, as the pick's own band rather than as a
              hairline. It matches the lit tick on the track above, and a column
              is what that idea becomes here: a 1px rule among forty-two picks is
              not findable, and one drawn over the rope would read as a scratch
              on it. Under the strands, so the rope stays the brightest thing. */}
          <rect
            x={bandL(here)}
            y={channel}
            width={step}
            height={WELL_H}
            className="fill-base-content/[0.07] stroke-base-content/25"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />

          {drifted.map((band) => (
            <rect
              key={band.key}
              x={band.x}
              y={channel}
              width={band.width}
              height={WELL_H}
              className="fill-warning/[0.11]"
            />
          ))}

          {tally.firstDrift !== undefined && (
            <>
              {/* The shaded region's own leading edge, which is the moment the
                  caption names. Not a second notation for the drift -- the same
                  one, drawn where it starts. */}
              <line
                x1={bandL(tally.firstDrift)}
                y1={channel}
                x2={bandL(tally.firstDrift)}
                y2={channel + WELL_H}
                stroke="currentColor"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
                className="text-warning/60"
              />
              {causingFork && (
                // The delayed causal link, drawn as the arc it is: cause on the
                // left, eight-or-more picks of nothing visible, effect on the
                // right, landing exactly on the edge of the region it caused.
                // In its own channel above the wells, because this is the claim
                // the diagram exists to make and it spent two revisions as the
                // faintest ink on the panel.
                <path
                  d={`M ${cx(causingFork.pickIndex)} ${channel - 1} C ${cx(
                    causingFork.pickIndex,
                  )} 1 ${bandL(tally.firstDrift)} 1 ${bandL(tally.firstDrift)} ${channel - 1}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeDasharray="3 4"
                  vectorEffect="non-scaling-stroke"
                  className="text-warning/75"
                />
              )}
            </>
          )}

          {/* Where you were both asked the same question and answered it
              differently. In the opening the strands have just made, which is
              the one place on this diagram it can sit and mean something -- and
              drawn as a tick, which is what a fork looks like on the track at the
              top of this page. It reaches to whatever the opening happens to be,
              so a blip gets a short tick and a sustained parting a long one.

              The hover mark is the pick's whole band and not the tick, for the
              reason the track gives: it says the true thing about where the
              click will land, and it works on a mark too small to grow.

              BENEATH THE STRANDS, with the strands made transparent to the
              pointer. Above them the gold wash fell across the rope and turned a
              cream cord muddy, and below them without that the rope swallowed
              every click that landed on it -- which on a wide opening is most of
              the target. The rope carries no interaction of its own, so it has
              nothing to lose by not taking the click. */}
          {tally.forks.map((f) => (
            <g
              key={f.pickIndex}
              className="group cursor-pointer"
              onClick={() => onOpenFork(f.pickIndex)}
            >
              <rect
                x={bandL(f.pickIndex)}
                y={channel}
                width={step}
                height={WELL_H}
                className="fill-transparent transition-colors group-hover:fill-primary/15"
              />
              <line
                x1={cx(f.pickIndex)}
                y1={laneY(f.pickIndex, "yours") + STRAND / 2 + 3}
                x2={cx(f.pickIndex)}
                y2={laneY(f.pickIndex, "theirs") - STRAND / 2 - 3}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                className="stroke-primary [stroke-width:3] transition-[stroke-width] group-hover:[stroke-width:5]"
              />
              <title>{`P${f.packNo}P${f.pickNo}: ${f.yours} vs ${f.theirs}`}</title>
            </g>
          ))}

          {(["yours", "theirs"] as const).flatMap((side) =>
            cords.map((cord) => (
              <path
                key={`${side}-${cord}`}
                d={strandPath(side, cord)}
                fill="none"
                stroke={`url(#braid-${side}-${cord})`}
                strokeWidth={CORD}
                // Butt, not round: two cords lying against each other want a
                // flat seam between them, and rounded caps on a 7-unit cord
                // would round the strand's own ends into a lozenge.
                strokeLinecap="butt"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )),
          )}
        </svg>
      </div>

      <div className="flex gap-3">
        {/* Matches the key gutter, so the labels start where the SVG does. */}
        <span className="w-28 shrink-0" />
        {/* The drawing's own PAD applied as a percentage: the strands start 14
            units in from each edge of a 1000-unit box, so without it every label
            sat about one and a half percent of the width left of its pack. */}
        <div
          className="flex flex-1"
          style={{ paddingLeft: `${(PAD / 1000) * 100}%`, paddingRight: `${(PAD / 1000) * 100}%` }}
        >
          {/* No dividers any more. The wells behind the strands are the break
              now, and a second set of rules under them would be the boundary
              drawn twice in two different notations. */}
          {wells.map((well) => (
            <span
              key={well.packNo}
              className="eyebrow text-center"
              style={{ flexGrow: well.count, flexBasis: 0 }}
            >
              Pack {well.packNo}
            </span>
          ))}
        </div>
      </div>

      <p className="border-t border-base-300 pt-2.5 text-sm leading-relaxed text-base-content/65">
        The two strands run together while you were taking the same card and open where you
        were not — wider the longer the parting held. A gold tick in the opening means you
        were both looking at the same pack.{" "}
        {tally.firstDrift === undefined ? (
          <>
            The packs themselves never came apart — the two pods stayed in step for all{" "}
            {rows.length} picks, so every opening above is a decision.
          </>
        ) : causingFork ? (
          <>
            The shaded stretches are the picks where you were not. Your call at{" "}
            <strong className="font-semibold text-base-content/85">
              pack {causingFork.packNo}, pick {causingFork.pickNo}
            </strong>{" "}
            changed what the bots passed on, and it came back round to you{" "}
            {tally.firstDrift - causingFork.pickIndex} picks later, where the shading starts.
            The arc is that delay: nothing you could see happened in between.
          </>
        ) : (
          <>
            The shaded stretches are the picks where you were not — they begin at pick{" "}
            {tally.firstDrift + 1}. No single fork before that accounts for the drift, so
            none is drawn as its cause.
          </>
        )}
      </p>
    </Panel>
  );
}

/**
 * One half of the chart, named at its own outside edge.
 *
 * The bracket is the claim: this band, top to bottom, is that person's. Its rule
 * stops short of the midline on both sides, so the two read as two brackets
 * rather than as one rule running the height of the panel.
 *
 * The colours are what that side FINISHED on, kept because the chart shows them
 * arriving and a reader wants somewhere to see where they arrived. Drawn as the
 * strand's own cross-section -- two bars with the same seam between them the
 * rope has -- so it is the same object the chart is drawing rather than a second
 * notation for it.
 *
 * The name wraps rather than truncating. It was in a fixed 6rem column with
 * `truncate` on it, and the other drafter is called "Your challenger" whenever
 * they have not been named -- so the label that exists to say whose half this is
 * rendered as "A FIXT…".
 */
function LaneLabel({
  lean,
  label,
  edge,
}: {
  lean: string;
  label: string;
  edge: "top" | "bottom";
}) {
  return (
    <div
      className={`flex min-h-0 flex-1 border-l-2 border-base-content/20 pl-2 ${
        edge === "top" ? "mb-1 items-start" : "mt-1 items-end"
      }`}
    >
      <span className="flex min-w-0 items-start gap-2">
        <span className="mt-px flex h-4 w-4 shrink-0 flex-col gap-px overflow-hidden rounded-[3px]">
          <span className="flex-1" style={{ background: cordInk(lean, 0) }} />
          <span className="flex-1" style={{ background: cordInk(lean, 1) }} />
        </span>
        <span className="eyebrow leading-tight">{label}</span>
      </span>
    </div>
  );
}

/**
 * How far the rope opens at each pick, as a fraction of the full excursion.
 *
 * A single pick where you differed and were back in step immediately is not the
 * same event as six picks of building different decks, and the braid drew both
 * at full amplitude -- which is how a diagram of two drafts became a waveform.
 * The run's own length is the measure already in the data, so it is the one the
 * drawing uses: a little over half a lane for one pick, the whole of it at three
 * or more, held flat across the run so a parting reads as a plateau rather than
 * as a lens that implies a growing distance nobody measured.
 *
 * It never reaches zero inside a run. A pick you disagreed on has to be visibly
 * open or the gold tick in it has nowhere to sit.
 */
function opennessOf(rows: DiffRow[]): number[] {
  const out = rows.map(() => 0);
  for (const run of spans(rows, (r) => !r.agree)) {
    const amount = 0.55 + 0.45 * Math.min(1, (run.to - run.from - 1) / 2);
    for (let i = run.from; i < run.to; i++) out[i] = amount;
  }
  return out;
}

/** Consecutive runs where something holds, as half-open row ranges. */
function spans(
  rows: DiffRow[],
  holds: (row: DiffRow) => boolean,
  from = 0,
  to = rows.length,
): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  let i = from;
  while (i < to) {
    if (!holds(rows[i])) {
      i++;
      continue;
    }
    let j = i;
    while (j < to && holds(rows[j])) j++;
    out.push({ from: i, to: j });
    i = j;
  }
  return out;
}

// Where one pack ends and the next begins. Proportional, and it lines up with
// the SVG because the picks are evenly spaced and the padding is symmetric.
function packSpans(rows: DiffRow[]): { packNo: number; count: number }[] {
  return rows.reduce<{ packNo: number; count: number }[]>((acc, row) => {
    const last = acc[acc.length - 1];
    if (last && last.packNo === row.packNo) last.count++;
    else acc.push({ packNo: row.packNo, count: 1 });
    return acc;
  }, []);
}
