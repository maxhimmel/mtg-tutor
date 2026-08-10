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
 * two different decks. So the excursion is the RUN's own length -- see
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
 * visible, effect on the right -- and it is given clear air above the wells to
 * be seen in, because it is the one mark here carrying an argument.
 *
 * WHOSE HALF IS WHOSE, WHICH THE GUTTER KEPT FAILING TO SAY. It has now been
 * three notations, and the first two were both a mark standing BESIDE a band
 * rather than anything attached to it: a dot that keyed nothing, then a bracket
 * with the name at its outside edge. Both left a reader to infer that this word
 * goes with that rope, and the inference is exactly the work a label exists to
 * remove.
 *
 * So the rope is named where it ENTERS. Each strand arrives from off the left of
 * the frame at its own name's height and eases down into its lane over the
 * run-up before the first pack, in the same smooth step it uses for every lane
 * change inside the chart -- so the name and the rope are one continuous object
 * and there is nothing left to infer. Nothing in the run-up is a pick, and the
 * wells make that plain by starting after it: left of the first well is the rope
 * arriving, not data.
 *
 * That also retires the two-bar colour chip. A chip beside a name is a legend
 * entry, and the moment a rope emerges from under that name in a DIFFERENT
 * colour -- which it does, because the chip showed what a side finished on and
 * the rope starts undecided grey -- the legend is actively misleading. Where
 * each of you arrived is legible at the other end of its own rope, and the decks
 * panel below says it in words.
 *
 * THE PACKS ARE MEASURED, NOT BOXED. Three dark rectangles with a five-unit gap
 * between them is a weak delineation at any width and a nearly invisible one in
 * this theme, and the boundary was then drawn a second time by the labels
 * underneath -- the two-notations-for-one-fact this file has been trying to
 * avoid since it started drawing wells. So the well keeps only what a well is
 * for, which is being a floor for the rope and for the drift shading, and the
 * boundary moves entirely to the ruler beneath: one span per pack, ticked at
 * both ends, with the pack's name sitting in a break in its own rule. A pack is
 * a measured length of the draft, and that is what a dimension line says.
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
// The right inset, and the run-up on the left: the distance a strand has to come
// down from its name to its lane. Long enough that the arrival is a shallow
// curve rather than a hook, and drawn as the same smooth step the lane changes
// use, so the entrance is in the chart's own hand.
const PAD = 14;
const LEAD = 56;
// Page showing between one pack's well and the next. It was five, which is a gap
// you can find once you know it is there; the packs are delineated by the ruler
// underneath now, and this is the break agreeing with it rather than carrying it
// alone.
const WELL_GAP = 12;
// Clear air above the wells, for the causal arc and only when there is one.
const CHANNEL = 22;
// Where a name sits, and therefore where its rope comes in. Far enough from the
// lanes that the two names are unmistakably a top half and a bottom half.
const NAME_INSET = 15;

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

  // Where each name sits, and where its rope therefore enters the frame. One
  // number, read by the SVG and by the HTML label beside it, so a name and the
  // strand leaving it cannot drift apart.
  const nameY = { yours: NAME_INSET, theirs: H - NAME_INSET };

  const step = (1000 - LEAD - PAD) / rows.length;
  // A pick's own band, and its centre. The turn happens over the pick it belongs
  // to rather than between two of them.
  const bandL = (i: number) => LEAD + i * step;
  const bandR = (i: number) => LEAD + (i + 1) * step;
  const cx = (i: number) => bandL(i) + step / 2;
  // Where the first well starts, which is where the run-up ends: the rope is in
  // its lane by the time it is over anything that counts as a pick.
  const mouth = LEAD + WELL_GAP / 2;

  const open = opennessOf(rows);

  const laneY = (i: number, side: "yours" | "theirs") =>
    side === "yours"
      ? mid - TOGETHER / 2 - OPEN * open[i]
      : mid + TOGETHER / 2 + OPEN * open[i];

  const leanOf = (row: DiffRow, side: "yours" | "theirs") =>
    side === "yours" ? row.yourLean : row.theirLean;

  /**
   * One cord, as a path: in from under its name, then a point per pick.
   *
   * The control points sit half a pick either side of the turn and horizontally
   * level with the point they belong to -- the standard smooth step, which makes
   * a lane change read as the rope easing open. The entrance is that same curve
   * over a longer run, which is what lets a name and a rope read as one object
   * without the join ever being drawn as a join.
   */
  const strandPath = (side: "yours" | "theirs", cord: 0 | 1) => {
    // The two cords ride half a seam's width either side of the strand's own
    // line, so together they occupy exactly one strand.
    const off = (cord === 0 ? -1 : 1) * ((CORD + SEAM) / 2);
    const y0 = laneY(0, side) + off;
    const ny = nameY[side] + off;

    const head = `M 0 ${ny} C ${mouth / 2} ${ny} ${mouth / 2} ${y0} ${mouth} ${y0}`;

    const body = rows
      .map((_, i) => {
        const x = cx(i);
        const y = laneY(i, side) + off;
        if (i === 0) return `L ${x} ${y}`;
        const px = cx(i - 1);
        const py = laneY(i - 1, side) + off;
        const mx = (px + x) / 2;
        return py === y ? `L ${x} ${y}` : `C ${mx} ${py} ${mx} ${y} ${x} ${y}`;
      })
      .join(" ");

    return `${head} ${body}`;
  };

  /**
   * The colour timeline, as hard gradient stops.
   *
   * Two stops per pick at the same offsets its band spans, so each pick's colour
   * ends exactly where the next begins. A soft gradient would paint the blend
   * between "blue" and "blue-black" as a colour neither deck ever was.
   *
   * It spans the picks and not the box, so the run-up left of the first pack
   * takes the first stop's colour by padding -- the rope arrives in the colour
   * it starts in, which for the first few picks is undecided grey.
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
   * Each pack as a floor the strands run over, with the span itself named below.
   *
   * The well used to carry the boundary as well -- a bordered rectangle with a
   * hairline gap to the next -- and it was never strong enough to read while
   * being just strong enough to make the labels underneath a second drawing of
   * the same fact. It is a surface now: something for the rope to be legible
   * against and for the drift shading to sit in. Where one pack ends is said
   * once, on the ruler.
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
      <div className="flex items-stretch gap-2">
        {/* NOT a legend, and no longer a bracket either. Each name is simply
            where its own rope comes in, and the run-up does the joining -- so
            there is nothing here to look up and nothing to map. The positions
            come from the same `nameY` the paths are drawn from. */}
        <div className="relative w-28 shrink-0" style={{ height: H }} aria-hidden>
          <LaneLabel y={nameY.yours} label="You" />
          <LaneLabel y={nameY.theirs} label={them} />
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
                  x1={LEAD}
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
              className="fill-base-100/70"
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
            className="fill-base-content/[0.08] stroke-base-content/25"
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
              className="fill-warning/[0.13]"
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

      <div className="flex gap-2">
        {/* Matches the gutter above, so the ruler starts where the chart does. */}
        <span className="w-28 shrink-0" />
        <PackRuler wells={wells} />
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
 * A name, at the height its own rope comes in at.
 *
 * Right-aligned and hard against the chart, so the word and the strand leaving
 * it are as close as the layout allows and the run-up reads as continuing the
 * line rather than as reaching across a gap.
 *
 * It wraps rather than truncating. It was in a fixed 6rem column with `truncate`
 * on it, and the other drafter is called "Your challenger" whenever they have
 * not been named -- so the label that exists to say whose half this is rendered
 * as "A FIXT…".
 */
function LaneLabel({ y, label }: { y: number; label: string }) {
  return (
    <span
      className="eyebrow absolute right-0 w-full -translate-y-1/2 text-right leading-tight"
      style={{ top: y }}
    >
      {label}
    </span>
  );
}

/**
 * The packs, as measured spans rather than as boxes.
 *
 * A dimension line: one rule per pack running its exact width, ticked at both
 * ends, with the pack's name sitting in a break in the rule. That is what a pack
 * IS on this chart -- a measured length of the draft -- and saying it this way
 * is what lets the wells stop trying to carry the boundary, which they were bad
 * at: three dark rectangles a shade off the panel behind them.
 *
 * Positioned from the same `wells` the SVG draws, as percentages of the same
 * box: the chart is a 1000-unit viewBox stretched to fill, so one unit is a
 * tenth of a percent and every tick lands exactly on the floor above it. The
 * flex row this replaces could not do that -- it grew each label by its pick
 * count and knew nothing about the gap between one well and the next.
 */
function PackRuler({ wells }: { wells: { packNo: number; x: number; width: number }[] }) {
  return (
    <div className="relative h-4 min-w-0 flex-1">
      {wells.map((well) => (
        <div
          key={well.packNo}
          className="absolute inset-y-0 flex items-center gap-2"
          style={{ left: `${well.x / 10}%`, width: `${well.width / 10}%` }}
        >
          <span className="h-2.5 w-px shrink-0 bg-base-content/40" />
          <span className="h-px min-w-0 flex-1 bg-base-content/20" />
          <span className="eyebrow shrink-0 whitespace-nowrap">Pack {well.packNo}</span>
          <span className="h-px min-w-0 flex-1 bg-base-content/20" />
          <span className="h-2.5 w-px shrink-0 bg-base-content/40" />
        </div>
      ))}
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
// the SVG because the picks are evenly spaced and both insets are known.
function packSpans(rows: DiffRow[]): { packNo: number; count: number }[] {
  return rows.reduce<{ packNo: number; count: number }[]>((acc, row) => {
    const last = acc[acc.length - 1];
    if (last && last.packNo === row.packNo) last.count++;
    else acc.push({ packNo: row.packNo, count: 1 });
    return acc;
  }, []);
}
