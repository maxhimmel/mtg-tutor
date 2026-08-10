"use client";

import { useRef, type CSSProperties } from "react";
import type { DiffRow, DiffTally } from "@mtg-tutor/core";
import { COLOR_NAMES } from "../../../lib/format";
import { Panel } from "../../../components/Panel";
import { DiffTrack } from "./track";

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
 * AND THE DRIFT IS GROUND, NOT ROPE. The track draws three states and this drew
 * two, so an opening with no gold tick in it had
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
 * the frame at its own name's height and eases into its lane over the run-up
 * before the first pack, in the same smooth step it uses for every lane change
 * inside the chart -- so the name and the rope are one continuous object and
 * there is nothing left to infer. Nothing in the run-up is a pick, and the wells
 * make that plain by starting after it.
 *
 * THE TWO ENTRANCES ARE ONE ENTRANCE, MIRRORED, which took a second attempt.
 * The names were first anchored to the top and bottom of the BOX, which is
 * symmetric about the box's middle -- and the box's middle is not the chart's,
 * because the causal arc's channel sits above the wells and nothing balanced it
 * below. So yours fell forty-one units into its lane and theirs rose twenty-one,
 * at visibly different steepnesses, and the pair read as two unrelated arrivals.
 * Both anchors are now measured from `MID` and by the same distance -- the
 * floor's own half-height, so each name sits exactly level with the top or
 * bottom edge of the floor its rope is about to run along -- and the channel is
 * matched below. The two curves are congruent by construction.
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
 * underneath. So the well keeps only what a well is for, which is being a floor
 * for the rope and for the drift shading, and the boundary moves to the ruler
 * beneath. A pack is a measured length of the draft, and that is what a
 * dimension line says.
 *
 * THE PAGE BETWEEN PACKS BELONGS TO NOBODY, which is the second thing that
 * ruler taught. The gap was first taken OUT of the packs -- each floor inset by
 * half of it at both ends -- so the first and last pick of every pack had a
 * sliver of band hanging outside its own floor, and the fix for that was to clip
 * those bands, which made two picks in six narrower than the rest for a reason
 * no reader could ever recover. Both were wrong. The gap is now space the layout
 * allocates BETWEEN packs and no pick owns any of it: every band is exactly one
 * `step`, every floor starts and ends on a band edge, and nothing anywhere needs
 * clipping. The measurement was never the problem; the coordinate system was.
 *
 * EVERY PICK IS A PLACE TO GO, not only the forks. The forks were the only
 * clickable thing here on the theory that they are the only DECISIONS -- true,
 * and beside the point once the track became navigation over all forty-two. A
 * reader who has learnt that a pick is something you click does not carry an
 * exception between two drawings of the same draft, they carry a dead chart --
 * least of all now that the two drawings are one object with the ticks directly
 * under the bands. So the whole band under every pick takes the click, and the fork keeps
 * only what it always was: the gold tick that says a decision happened here.
 *
 * The hover mark is `base-content` and not gold, which is the same choice the
 * track makes and for the same reason recorded there: gold is how this app says
 * WHERE YOU ARE, and a hover that borrows it says that forty-two times a second.
 *
 * Curves, settled. The control that offered corners instead was a comparison
 * aid, and it has done its job: a rope has no corners, and a straight cut to a
 * new lane draws the parting as instantaneous when the whole point of the panel
 * is that it was not.
 *
 * AND THE TRACK CAME DOWN HERE, which is what turned a drawing into an
 * instrument. Forty-two picks were drawn three times on this screen -- beside
 * the score, as this rope, and again in the shelf's stepper -- with two legends
 * between them, and the reader had to work out for themselves that they were all
 * the same draft. This panel says strictly more than a bare track can: the same
 * three states, plus what each side was drafting, plus how long every parting
 * held, plus the arc. The one thing it cannot be is a set of places to go from a
 * keyboard. So the track stops being a second picture and becomes this chart's
 * axis: same measure, same pack widths, same gaps, drawn under the wells, with
 * the tick you are on directly below the band that is lit. See the comment on it
 * below for how the two are held to one measure without a number being copied.
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
// Page between one pack and the next, allocated by the layout and owned by no
// pick. Taken out of the picks instead, it made two bands in every six narrower
// than their neighbours -- see the header.
const PACK_GAP = 12;
// Clear air above the wells for the causal arc, and the same again below so the
// drawing is symmetric about its own middle. The bottom half is not spare page:
// it is what lets the two names sit at equal distances from their lanes, which
// is the only way the two entrances can be the same curve.
const CHANNEL = 22;
const H = CHANNEL * 2 + WELL_H;
const MID = H / 2;
// Where a name sits, and therefore where its rope comes in: exactly level with
// the top or bottom edge of the floor its rope is about to run along.
const NAME_Y = { yours: MID - WELL_H / 2, theirs: MID + WELL_H / 2 };

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

/** Same pack, different card: the one disagreement that was a decision. */
const isFork = (row: DiffRow) => row.samePack && !row.agree;

export function Braid({
  rows,
  tally,
  them,
  at,
  onSelect,
  className,
}: {
  rows: DiffRow[];
  tally: DiffTally;
  them: string;
  at: number;
  // Where the selection came from, because the two surfaces in this panel are
  // reported separately: the bands are the drawing being read, the track under
  // them is the draft being stepped through. `scroll` travels with it because
  // only this panel knows whether a hand or a keyboard moved the selection.
  onSelect: (pickIndex: number, from: "braid" | "track", scroll: boolean) => void;
  className?: string;
}) {
  /**
   * Whether the selection came from a pointer, which decides whether the page
   * moves to the pick you chose.
   *
   * A click has to take you to what you clicked or it reads as dead. An ARROW
   * KEY must not: the track keeps focus while it moves, so scrolling on every
   * press would carry the focus ring off the top of the screen and leave a
   * keyboard reader stepping through something they can no longer see.
   */
  const byPointer = useRef(false);

  if (rows.length === 0) return null;

  // The fork the first drift is attributable to: the last one before it. Only
  // this one gets an arc, because with several forks upstream the causes are
  // tangled and drawing them all would assert an attribution nobody measured.
  const causingFork =
    tally.firstDrift === undefined
      ? undefined
      : [...tally.forks].reverse().find((f) => f.pickIndex < (tally.firstDrift ?? 0));

  const packs = packSpans(rows);

  // One width for every pick, with the page between packs taken off the top
  // rather than out of the picks either side of it.
  const step = (1000 - LEAD - PAD - (packs.length - 1) * PACK_GAP) / rows.length;
  const shift = packs.flatMap((pack, p) => Array<number>(pack.count).fill(p * PACK_GAP));

  // A pick's own band, and its centre. The turn happens over the pick it belongs
  // to rather than between two of them.
  const bandL = (i: number) => LEAD + i * step + shift[i];
  const bandR = (i: number) => bandL(i) + step;
  const cx = (i: number) => bandL(i) + step / 2;

  const open = opennessOf(rows);

  const laneY = (i: number, side: "yours" | "theirs") =>
    side === "yours"
      ? MID - TOGETHER / 2 - OPEN * open[i]
      : MID + TOGETHER / 2 + OPEN * open[i];

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
    const ny = NAME_Y[side] + off;

    // The run-up ends where the first floor begins: the rope is in its lane by
    // the time it is over anything that counts as a pick.
    const head = `M 0 ${ny} C ${LEAD / 2} ${ny} ${LEAD / 2} ${y0} ${LEAD} ${y0}`;

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
   *
   * It starts and ends on a band edge, exactly, because the gap between packs is
   * space of its own rather than something borrowed from the picks at the seam.
   */
  let seen = 0;
  const wells = packs.map((pack) => {
    const from = seen;
    seen += pack.count;
    return {
      packNo: pack.packNo,
      count: pack.count,
      from,
      to: seen,
      x: bandL(from),
      width: pack.count * step,
    };
  });

  // Where the packs stopped being guaranteed to match, drawn as the stretch of
  // floor it is. Cut at the pack breaks, so the shading never crosses the page
  // showing between one floor and the next: it is a floor being marked, and
  // there is no floor in the gap.
  const drifted = wells.flatMap((well) =>
    spans(rows, (r) => !r.samePack, well.from, well.to).map((run) => ({
      key: `${run.from}`,
      x: bandL(run.from),
      width: bandR(run.to - 1) - bandL(run.from),
    })),
  );

  const here = Math.min(at, rows.length - 1);
  const last = rows[rows.length - 1];

  return (
    <Panel
      className={className}
      title="How the two drafts came apart"
      aside={
        <span className="hidden text-xs text-base-content/50 sm:inline">
          each strand is the two colours that side was drafting most
        </span>
      }
      // Tight, because three of the four things in this body are one object:
      // the chart, the track that scrubs it and the ruler that measures it. The
      // caption takes its own margin back, so the one visible gap in the panel
      // falls between the instrument and the sentence about it.
      bodyClassName="gap-1.5"
    >
      <div className="flex items-stretch gap-2">
        {/* NOT a legend, and no longer a bracket either. Each name is simply
            where its own rope comes in, and the run-up does the joining -- so
            there is nothing here to look up and nothing to map. The positions
            come from the same `NAME_Y` the paths are drawn from. */}
        <div className="relative w-28 shrink-0" style={{ height: H }} aria-hidden>
          <LaneLabel y={NAME_Y.yours} label="You" />
          <LaneLabel y={NAME_Y.theirs} label={them} />
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
              y={CHANNEL}
              width={well.width}
              height={WELL_H}
              rx={2}
              className="fill-base-100/70"
            />
          ))}

          {/* Where you are on the page, as the pick's own band rather than as a
              hairline. It stands directly over the lit tick on the track below
              -- the same claim in the two notations this panel has -- and a
              column is what the halo becomes at this scale: a 1px rule among
              forty-two picks is not findable, and one drawn over the rope would
              read as a scratch on it. Under the strands, so the rope stays the
              brightest thing. */}
          <rect
            x={bandL(here)}
            y={CHANNEL}
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
              y={CHANNEL}
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
                y1={CHANNEL}
                x2={bandL(tally.firstDrift)}
                y2={CHANNEL + WELL_H}
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
                  d={`M ${cx(causingFork.pickIndex)} ${CHANNEL - 1} C ${cx(
                    causingFork.pickIndex,
                  )} 1 ${bandL(tally.firstDrift)} 1 ${bandL(tally.firstDrift)} ${CHANNEL - 1}`}
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

          {/* One target per pick, the whole floor-height band under it, and the
              fork's gold tick riding along in the same group. Every one of them
              is exactly one `step` wide, everywhere, including at the seams --
              a target that quietly narrows because of where it sits in a pack is
              a target that behaves differently for no reason a reader could
              recover.

              BENEATH THE STRANDS, with the strands made transparent to the
              pointer. Above them the hover wash fell across the rope and dulled
              it, and below them without that the rope swallowed every click that
              landed on it -- which on a wide opening is most of the target. The
              rope carries no interaction of its own, so it has nothing to lose
              by not taking the click.

              Keyboard reaches these picks through the track directly beneath,
              which takes one tab stop for the whole draft and arrows within it
              -- and which is drawn to this chart's own measure, so the tick a
              key lands on is under the band it names. Forty-two more focus stops
              up here would be the same draft offered twice. */}
          {rows.map((row, i) => (
            <g key={i} className="group cursor-pointer" onClick={() => onSelect(i, "braid", true)}>
              <rect
                x={bandL(i)}
                y={CHANNEL}
                width={step}
                height={WELL_H}
                className="fill-transparent transition-colors group-hover:fill-base-content/[0.12]"
              />
              {isFork(row) && (
                // In the opening the strands have just made, which is the one
                // place on this diagram it can sit and mean something -- and
                // drawn as a tick, which is what a fork looks like on the track
                // below. It reaches to whatever the opening happens to be, so a
                // blip gets a short tick and a sustained parting a long one.
                <line
                  x1={cx(i)}
                  y1={laneY(i, "yours") + STRAND / 2 + 3}
                  x2={cx(i)}
                  y2={laneY(i, "theirs") - STRAND / 2 - 3}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                  className="stroke-primary [stroke-width:3] transition-[stroke-width] group-hover:[stroke-width:5]"
                />
              )}
              <title>{titleOf(row)}</title>
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

      {/* THE TRACK IS THIS CHART'S AXIS, which is the whole reason it is down
          here and not up in the summary where it lived.

          It was drawn three times on this page -- once beside the score, once as
          the braid, once in the shelf's stepper -- with two legends between them,
          and the braid says strictly more than the summary's copy did: the same
          three states, plus each side's colours, plus how long every parting
          held, plus the arc. What the ticks alone can do and the drawing cannot
          is be a set of places to go from a keyboard. So the track keeps exactly
          that job and gives up being a second picture of the draft: it sits
          under the chart it drives, on the chart's own measure, and the tick you
          are on is directly below the band that is lit.

          The measure is shared rather than approximated. The SVG is a 1000-unit
          box stretched to fill, so the track is inset by the same LEAD and PAD in
          percent, its packs grow by their own pick counts exactly as the wells
          do, and the page between packs is PACK_GAP expressed as a fraction of
          the drafted span -- which is the width the track's own flex box spans.
          Nothing here is a number that has to be kept in sync by hand.

          No pack labels: the ruler under it already names them, and the wells
          that come with labels carry an inset, which is precisely what would
          stop a tick landing under its own pick. */}
      <div className="flex gap-2">
        <span className="w-28 shrink-0" />
        <div className="min-w-0 flex-1">
          <div
            style={
              {
                paddingLeft: `${(LEAD / 1000) * 100}%`,
                paddingRight: `${(PAD / 1000) * 100}%`,
                // Against the track's OWN box, which is the drafted span rather
                // than the whole chart -- a percentage gap resolves against the
                // flex container's content width, and the inset above has
                // already taken the run-up and the right margin off it.
                "--pick-track-gap": `${(PACK_GAP / (1000 - LEAD - PAD)) * 100}%`,
              } as CSSProperties
            }
            onPointerDown={() => {
              byPointer.current = true;
            }}
            onKeyDown={() => {
              byPointer.current = false;
            }}
          >
            <DiffTrack
              rows={rows}
              them={them}
              at={here}
              onAt={(i) => onSelect(i, "track", byPointer.current)}
              label="Every pick in both drafts, in order. Select one to read it pick by pick below."
              packLabels={false}
            />
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        {/* Matches the gutter above, so the ruler starts where the chart does. */}
        <span className="w-28 shrink-0" />
        <PackRuler wells={wells} />
      </div>

      {/* One caption for the whole instrument, which is what it can be now that
          the drift is drawn in one place instead of three. The summary used to
          carry a warning-ruled paragraph explaining that the pods come apart and
          why, ten inches above the panel that SHADES the stretches where they
          did -- so the reader met the explanation before there was anything to
          explain and had forgotten it by the time there was. The rule is gone
          with the paragraph: emphasis in warning ink is what the shading is
          already doing, right above this line. */}
      <p className="mt-1.5 border-t border-base-300 pt-2.5 text-sm leading-relaxed text-base-content/65">
        The two strands run together while you were taking the same card and open where you
        were not — wider the longer the parting held. A gold tick in the opening means you
        were both looking at the same pack.{" "}
        {tally.firstDrift === undefined ? (
          <>
            The packs themselves never came apart — the two pods stayed in step for all{" "}
            {rows.length} picks, so every opening above is a decision.
          </>
        ) : (
          <>
            The first {tally.guaranteedThrough + 1} picks came off identical packs; after
            that your pods drift in and out of step, because your own earlier pick changed
            what the bots passed on. The shaded stretches are the{" "}
            {tally.rows - tally.comparable} picks where you were not looking at the same
            cards at all.{" "}
            {causingFork ? (
              <>
                Your call at{" "}
                <strong className="font-semibold text-base-content/85">
                  pack {causingFork.packNo}, pick {causingFork.pickNo}
                </strong>{" "}
                came back round to you {tally.firstDrift - causingFork.pickIndex} picks
                later, where the shading starts. The arc is that delay: nothing you could
                see happened in between.
              </>
            ) : (
              <>
                They begin at pick {tally.firstDrift + 1}. No single fork before that
                accounts for the drift, so none is drawn as its cause.
              </>
            )}
          </>
        )}
      </p>
    </Panel>
  );
}

/** What a pick was, for the pointer that is hovering it. */
function titleOf(row: DiffRow): string {
  const where = `P${row.packNo}P${row.pickNo}`;
  if (row.agree) return `${where}: you both took ${row.yours.pickedName}`;
  if (row.samePack) return `${where}: ${row.yours.pickedName} vs ${row.theirs.pickedName}`;
  return `${where}: different packs — ${row.yours.pickedName} vs ${row.theirs.pickedName}`;
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
 * The draft as one measured length, divided where the packs divide.
 *
 * ONE RULE, not three. The first version drew a separate dimension line per
 * pack -- tick, rule, name, rule, tick -- which put two ticks and a gap at every
 * seam to say the single fact that one pack ended and the next began. Three
 * measurements laid end to end is also the wrong claim: a draft is not three
 * things that happen to be adjacent, it is forty-two picks in order, and the
 * pack breaks are divisions of it. So the rule runs the whole drafted span, from
 * the first band's left edge to the last band's right, and a single tick stands
 * at each boundary. Nothing marks the two outer ends, because the rule simply
 * stopping is already where the draft stops.
 *
 * Positioned from the same `wells` the SVG draws, as percentages of the same
 * box: the chart is a 1000-unit viewBox stretched to fill, so one unit is a
 * tenth of a percent and every tick lands exactly on the seam above it.
 *
 * The names sit ON the rule with the panel's own colour behind them, which is
 * how a break in a rule is drawn when the thing breaking it is set in type of
 * an unknown width.
 */
function PackRuler({ wells }: { wells: { packNo: number; x: number; width: number }[] }) {
  const seams = wells
    .slice(0, -1)
    .map((well, i) => (well.x + well.width + wells[i + 1].x) / 2);

  return (
    <div className="relative h-4 min-w-0 flex-1">
      <span
        className="absolute top-1/2 h-px -translate-y-1/2 bg-base-content/20"
        style={{ left: `${LEAD / 10}%`, right: `${PAD / 10}%` }}
      />
      {seams.map((x) => (
        <span
          key={x}
          className="absolute top-1/2 h-2.5 w-px -translate-x-1/2 -translate-y-1/2 bg-base-content/45"
          style={{ left: `${x / 10}%` }}
        />
      ))}
      {wells.map((well) => (
        <span
          key={well.packNo}
          className="eyebrow absolute top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap bg-base-200 px-2"
          style={{ left: `${(well.x + well.width / 2) / 10}%` }}
        >
          Pack {well.packNo}
        </span>
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

// Where one pack ends and the next begins. The gap between them is allocated
// from the width before the picks are laid out, so this is a count of picks and
// nothing more.
function packSpans(rows: DiffRow[]): { packNo: number; count: number }[] {
  return rows.reduce<{ packNo: number; count: number }[]>((acc, row) => {
    const last = acc[acc.length - 1];
    if (last && last.packNo === row.packNo) last.count++;
    else acc.push({ packNo: row.packNo, count: 1 });
    return acc;
  }, []);
}
