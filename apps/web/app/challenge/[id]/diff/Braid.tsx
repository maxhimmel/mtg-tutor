"use client";

import { useRef, type CSSProperties, type MouseEvent } from "react";
import { useParentSize } from "@visx/responsive";
import { Text } from "@visx/text";
import type { DiffRow, DiffTally } from "@mtg-tutor/core";
import { Panel } from "../../../components/Panel";
import { ScrollBox } from "../../../components/ScrollBox";
import { ManaCost } from "../../../components/ManaCost";
import { ColorPips } from "../../../components/ColorPips";
import { useCursorTip } from "../../../components/CursorTip";
import { Key } from "../../../charts/Key";
import { manaMark } from "../../../charts/marks";
import { Plot, TICK_TEXT } from "../../../charts/Plot";
import { INK, NEUTRAL } from "../../../charts/ink";
import { COLOR_NAMES } from "../../../lib/format";
import {
  CORD,
  OPEN_FLOOR,
  SEAM,
  STRAND,
  THREAD,
  THREAD_DASH,
  THREAD_W,
  TOGETHER,
  cordInk,
  isFork,
  leanRuns,
  opennessOf,
  pickAxis,
  spans,
  spoken,
  titleOf,
  undecided,
  type PickAxis,
} from "./braidGeometry";
import { Explain } from "./Explain";
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
 * exact through the curves: each cord is painted with a hard-stop gradient built
 * from the pick-by-pick leans, so the geometry smooths without the colour being
 * blended into shades neither of you ever played.
 *
 * WHY IT STILL DID NOT READ, second pass, which is the amplitude. Every pick you
 * differed on opened the rope by the same sixteen units, and on a real pair of
 * drafts most of those are single picks with agreement either side. Twenty-five
 * identical humps across a panel is a waveform: one loud note repeated, with no
 * way to tell a blip from a parting that held for six picks and actually built
 * two different decks. So the excursion is the RUN's own length -- and it took
 * two goes to get a scale that keeps its promise, because the first one
 * saturated at three picks and drew a twelve-pick parting exactly like a
 * three-pick one. See `opennessOf`, which now carries the argument for a log
 * scale over the whole draft.
 *
 * AND THE DRIFT IS GROUND, NOT ROPE. The track draws three states and this drew
 * two, so an opening with no gold tick in it had nothing anywhere saying why --
 * while the summary above spends a paragraph on exactly that. Packs coming apart
 * is not something either of you DID, so it is not on the strands: it is a
 * shaded stretch of the floor the strands run over, in the warning tone this
 * feature already says drift in, ruled along its foot so the stretch has an edge
 * a reader can find rather than a wash they have to notice.
 *
 * THE DELAY IS STILL THE CLAIM. Your own pick cannot reach your own packs until
 * the pod passes yours back round, at least eight picks later, and a diagram
 * that puts the branch where you picked differently gets the causation exactly
 * backwards. So the arc survives -- cause on the left, a long span of nothing
 * visible, effect on the right -- and it is given clear air above the wells to
 * be seen in, at full strength and with a head on it, because it is the one mark
 * here carrying an argument and it spent three revisions as the faintest ink on
 * the panel.
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
 * THE NAMES ARE THE CHART'S OWN MARGIN NOW, and that is a width fix rather than
 * a typographic one. They were a `w-28` column in a flex row, repeated on the
 * track's row and again on the ruler's -- so a phone spent 112 of its 310
 * usable pixels, three times over, on an empty gutter beside a drawing that had
 * already been squeezed to a hairline. Inside the plot they are `margin.left`,
 * which means they exist exactly when the drawing does and cost nothing when it
 * does not.
 *
 * THE TWO ENTRANCES ARE ONE ENTRANCE, MIRRORED. Both anchors are measured from
 * `MID` by the same distance -- the floor's own half-height, so each name sits
 * exactly level with the top or bottom edge of the floor its rope is about to
 * run along -- and the arc's channel is matched below. The two curves are
 * congruent by construction.
 *
 * That also retires the two-bar colour chip. A chip beside a name is a legend
 * entry, and the moment a rope emerges from under that name in a DIFFERENT
 * colour -- which it does, because the chip showed what a side finished on and
 * the rope starts with no colours at all -- the legend is actively misleading.
 * The colours are keyed under the chart instead, where a key says what the five
 * hues mean without claiming either of them is anybody's.
 *
 * THE PACKS ARE MEASURED, NOT BOXED. Three dark rectangles with a five-unit gap
 * between them is a weak delineation at any width and a nearly invisible one in
 * this theme, and the boundary was then drawn a second time by the labels
 * underneath. So the well keeps only what a well is for, which is being a floor
 * for the rope and for the drift shading, and the boundary moves to the ruler
 * beneath.
 *
 * AND THE RULER NUMBERS THE PICKS, which it did not, for as long as the caption
 * has been talking in pick numbers. "Pack 1", "Pack 2", "Pack 3" is a division
 * of the draft and not a scale: a reader told the drift starts at pack 2 pick 5
 * had three named regions and no way to find a pick inside one. It now marks
 * the first pick of every pack and every fifth after it, in the pack-and-pick
 * coordinate the rest of this screen speaks -- so every number in the caption
 * has a place on the drawing.
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
 * and beside the point once the track became navigation over all forty-two. So
 * the whole band under every pick takes the click, and the fork keeps only what
 * it always was: the gold tick that says a decision happened here.
 *
 * THE TICK IS A FIXED LENGTH, which is the correction to a second scale nobody
 * declared. It used to reach across whatever the opening happened to be, so its
 * length encoded run length exactly as the amplitude did -- a redundant channel,
 * saturating in the same place, and named by no caption. It is now the width of
 * a one-pick parting, everywhere: long enough to fit in the narrowest opening
 * the chart can draw, and carrying no quantity of its own. What a fork means is
 * "a decision happened here", and that is a mark, not a measurement.
 *
 * The hover mark is `base-content` and not gold, which is the same choice the
 * track makes and for the same reason recorded there: gold is how this app says
 * WHERE YOU ARE, and a hover that borrows it says that forty-two times a second.
 *
 * IT IS DRAWN AT ITS REAL SIZE, which it was not. The SVG was a fixed
 * thousand-unit box stretched to fill with `preserveAspectRatio="none"`, so the
 * horizontal scale changed with the panel and the vertical one never did: at a
 * metre wide a lane change eased over twelve pixels of band against thirty-two
 * of travel, and on a phone over three -- the same rope drawn as a square wave,
 * with nothing on screen saying the shape had stopped being true. The rotated
 * form was parked over the same fault, in stronger terms -- see the last section
 * of this header.
 *
 * So the plot is measured and the geometry answers to the measurement. The
 * amplitude is capped at the width of one pick's band, which holds every lane
 * change at or under forty-five degrees at EVERY width -- the rope opens less on
 * a narrow panel rather than opening the same amount faster, which is the
 * degradation a reader can read. And below the width where a pick's band is
 * eleven pixels, the drawing stops: forty-two bands narrower than that are a
 * comb, not a chart, and their click targets are a hairline. What shows instead
 * is the same finding without the geometry -- the partition of all forty-two
 * picks, and every parting listed with how long it held.
 *
 * WHY THE MEASUREMENT IS TAKEN OUT HERE AND NOT LEFT TO `Plot`. The braid is
 * not one SVG: it is the SVG, the ruler that numbers it, and the key that says
 * what the cords mean, and all three stop being true at the same width. So the
 * width is measured once for the whole instrument and `Plot` is handed the same
 * `needs`, which makes its own guard belt-and-braces rather than a second
 * opinion. The track below is the exception and stays at every width -- it is
 * the only keyboard path to a pick on this page.
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
 * the tick you are on directly below the band that is lit.
 *
 * WHAT `Spine.tsx` LEARNT, KEPT HERE BECAUSE THE FILE IS GONE. The same rope was
 * built stood on end, as a full-height rail that never leaves the screen, wired
 * into two layouts and rejected on sight. The idea it was testing survived --
 * `console` pins this drawing across the top of the reading column for exactly
 * that reason -- but the rotation did not, and these are the reasons, so the
 * next attempt starts from a diagnosis rather than a blank file:
 *
 * - The cross-axis is starved and the long axis is not. Forty-two picks down a
 *   viewport is generous; a hundred and sixteen units of width for two ropes
 *   that must open and still read as two cords each is not. Laid across a page
 *   the rope has a foot of room to open into and the eye reads the OPENING;
 *   stood up it has a thumb's width, and the eye reads a stripe with wobble in
 *   it.
 * - Which means widening the amplitude was the wrong lever. It made the
 *   openings bigger in a box already too narrow for them, so the strands spent
 *   the draft near the walls and "together" stopped being the resting state a
 *   parting departs from.
 * - The entrance curve does not survive either. Across a page the run-up is a
 *   long shallow easing under a name; down a rail it is a hook in the top two
 *   inches, with both names nearly touching above a narrow chart.
 *
 * The honest next move is not "rotate it better" but "draw a different thing for
 * a rail" -- a rail's real job is where-am-I plus what-kind-of-pick, and the
 * two-cords-per-strand colour story may simply not be a rail's to tell. That is
 * a design question rather than a geometry one, which is why nothing was tuned.
 */

// The widest either side climbs, before the width has its say. Capped to one
// pick's band below, so this is the ceiling rather than the amplitude.
const OPEN_MAX = 16;
// The strands' own room, inside a well.
const WELL_H = 86;
// The narrowest a pick's band may be and still be a band: a mark you can see
// and a target you can hit. Below it the drawing gives up rather than shrinks.
const MIN_BAND = 11;
// The names' column, as the plot's left margin.
const NAMES_W = 96;
// The right inset, and the run-up on the left: the distance a strand has to come
// down from its name to its lane. Long enough that the arrival is a shallow
// curve rather than a hook. Fractions of the drawn width, so the run-up is a
// proportion of the drawing rather than a number that means one thing on a
// phone and another on a desk.
const PAD_F = 0.014;
const LEAD_F = 0.056;
// Page between one pack and the next, allocated by the layout and owned by no
// pick. Taken out of the picks instead, it made two bands in every six narrower
// than their neighbours -- see the header.
const GAP_F = 0.012;
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

type Side = "yours" | "theirs";
const SIDES: Side[] = ["yours", "theirs"];
const CORDS = [0, 1] as const;

/**
 * How far a strand may leave its lane, which is a question about the width.
 *
 * The ease from one lane to the next spans a single band, so a swing bigger
 * than that band is a corner however smoothly it is specified -- which is
 * exactly what the fixed sixteen units became once the box stopped being a
 * fixed size. Capping the swing at one band holds every lane change at or
 * under forty-five degrees at every width the chart is drawn at, and what
 * gives way on a narrow panel is the SIZE of the openings rather than their
 * shape. A shallower rope is still a rope; a square wave is not.
 *
 * Out here rather than inside `Rope` because the pips are drawn in HTML over
 * the same box -- see `CordPips` -- and two definitions of where a strand is
 * would be a label floating off the thing it labels the day either moved.
 */
const swingFor = (step: number) => Math.min(OPEN_MAX, step);

/** A strand's centreline at one pick: the line its two cords ride either side of. */
const strandY = (open: number, swing: number, side: Side) =>
  side === "yours" ? MID - TOGETHER / 2 - swing * open : MID + TOGETHER / 2 + swing * open;

const leanFor = (side: Side) => (row: DiffRow) =>
  side === "yours" ? row.yourLean : row.theirLean;

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

  /**
   * The instrument's own width, measured once for all of it.
   *
   * `useParentSize` and not the `ParentSize` component, for the reason `Plot`
   * records: that component lays its children out absolutely inside a box of the
   * height you gave it, which silently clips anything that is not an SVG of
   * exactly that height -- and half of what hangs off this measurement is prose.
   */
  const { parentRef, width } = useParentSize({ debounceTime: 0 });

  /**
   * What is under the pointer, which on this chart is a POSITION and not an
   * element -- the case `useCursorTip` exists for.
   *
   * It replaces a bare SVG `<title>` on each band. That was a hover-only
   * affordance that does not exist on a touch screen, it named the two cards
   * and said nothing about the two PAIRS -- which is the encoding on this chart
   * that colour cannot carry alone -- and it sat inside a `role="img"` subtree
   * where a screen reader will not reach it anyway. The chart's own label and
   * the track beneath carry the accessible reading; this is the longer form for
   * somebody who can point.
   *
   * Wired to the whole plot rather than to each band because the bands are
   * inside an SVG the pointer already passes through: one handler on the box,
   * and the x it lands at is read back through the same `axis` the rope is
   * drawn from. The pack gaps and the margins belong to no pick and say
   * nothing, which is the honest answer there.
   */
  const tip = useCursorTip();

  if (rows.length === 0) return null;

  // The fork the first drift is attributable to: the last one before it. Only
  // this one gets an arc, because with several forks upstream the causes are
  // tangled and drawing them all would assert an attribution nobody measured.
  const causingFork =
    tally.firstDrift === undefined
      ? undefined
      : [...tally.forks].reverse().find((f) => f.pickIndex < (tally.firstDrift ?? 0));

  // The draft laid along x, in fractions of whatever the chart turns out to be
  // wide. Multiplied by the measured width inside the SVG and read as
  // percentages by the ruler and the track underneath it, so the three of them
  // are held to one measure without a number being copied between them.
  const axis = pickAxis(rows, { span: 1, lead: LEAD_F, pad: PAD_F, gap: GAP_F });

  // The width below which a band is narrower than `MIN_BAND`, derived rather
  // than picked: `axis.step` is already a pick's share of the chart, so this is
  // the same threshold for a draft of forty-two picks and one of thirty.
  const needs = NAMES_W + MIN_BAND / axis.step;

  const drawn = width >= needs;
  const open = opennessOf(rows);
  const here = Math.min(at, rows.length - 1);
  const last = rows[rows.length - 1];

  const fallback = <Fallback rows={rows} tally={tally} them={them} />;

  const sayPick = (e: MouseEvent<Element>): string | null => {
    const box = e.currentTarget.getBoundingClientRect();
    const span = box.width - NAMES_W;
    if (span <= 0) return null;
    const f = (e.clientX - box.left - NAMES_W) / span;
    for (let i = 0; i < rows.length; i++) {
      if (f >= axis.at(i) && f < axis.end(i)) return titleOf(rows[i], them);
    }
    return null;
  };

  const label =
    `Two strands over ${rows.length} picks, running together where you took the same card ` +
    `and opening where you did not. A one-pick parting opens to about a third of the full ` +
    `swing and a parting that held the whole draft to all of it. You finished ` +
    `${spoken(last.yourLean)}; ${them} finished ${spoken(last.theirLean)}. ` +
    `${tally.forks.length} of the partings were on the same pack, marked with a gold tick; ` +
    `the shaded stretches are the ${tally.rows - tally.comparable} picks where you were not ` +
    `looking at the same cards at all.`;

  return (
    <Panel
      className={className}
      title="How the two drafts came apart"
      aside={
        <Explain subject="how to read the braid" align="end">
          <BraidCaption rows={rows} tally={tally} causingFork={causingFork} />
        </Explain>
      }
      // Tight, because three of the four things in this body are one object:
      // the chart, the track that scrubs it and the ruler that measures it. The
      // caption takes its own margin back, so the one visible gap in the panel
      // falls between the instrument and the sentence about it.
      bodyClassName="gap-1.5"
    >
      {/* The instrument's own box, and the thing the measurement above is
          taken from. Nothing is drawn until it has been measured: rendering the
          narrow form for one frame would flash the phone version at everybody,
          and the panel's own height holds the space either way. */}
      <div ref={parentRef} style={{ width: "100%" }}>
        {width > 0 && (
          <div className="flex flex-col gap-1.5">
            {drawn ? (
              // The pips ride over the SVG rather than inside it: mana-font is a
              // font, and `ManaCost` is the app's one renderer of it. A second
              // one written against `<foreignObject>` would drift the day a
              // hybrid or a snow symbol turns up, which is the argument that put
              // every other pip in this app through the same component.
              <div className="relative" {...tip.follow(sayPick)}>
                <Plot
                  height={H}
                  // The same threshold the branch above already applied, so the
                  // SVG's own guard and the instrument's agree by construction.
                  needs={needs}
                  instead={fallback}
                  label={label}
                  legend={{
                    none: "Drawn at the foot of the whole instrument by `ColorKey`, below the track and the pack ruler. Those two are this chart's axis -- same measure, same pack widths -- and a key set between a drawing and its own axis parts them.",
                  }}
                  tip={tip.node}
                  margin={{ left: NAMES_W }}
                >
                  {(box) => (
                    <Rope
                      rows={rows}
                      tally={tally}
                      them={them}
                      axis={axis}
                      open={open}
                      here={here}
                      causingFork={causingFork}
                      width={box.width}
                      onSelect={onSelect}
                    />
                  )}
                </Plot>
                <CordPips rows={rows} axis={axis} open={open} width={width - NAMES_W} />
              </div>
            ) : (
              fallback
            )}

            {/* The track and the ruler stand in the chart's own coordinate
                space: the plot's left margin as padding, and everything
                inside measured as a percentage of what is left -- which is
                exactly the box `axis` is expressed in. */}
            <div style={{ paddingLeft: drawn ? NAMES_W : 0 }}>
              <div
                style={
                  {
                    // Only where there is a chart to line up with. The run-up
                    // and the right margin are seven per cent of the row, and
                    // spending them on nothing is spending them where they
                    // are scarcest.
                    paddingLeft: drawn ? `${LEAD_F * 100}%` : 0,
                    paddingRight: drawn ? `${PAD_F * 100}%` : 0,
                    // Against the track's OWN box, which is the drafted span
                    // rather than the whole chart -- a percentage gap resolves
                    // against the flex container's content width, and the
                    // inset above has already taken the run-up and the right
                    // margin off it.
                    "--pick-track-gap": drawn
                      ? `${(GAP_F / (1 - LEAD_F - PAD_F)) * 100}%`
                      : undefined,
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
                  label="Every pick in both drafts, in order. Select one opens it in the pick-by-pick panel."
                  // The ruler names the packs where the chart is drawn. Where
                  // it is not, the track is the only thing on screen that can,
                  // so it takes the job back.
                  packLabels={!drawn}
                />
              </div>

              {drawn && <PackRuler rows={rows} axis={axis} />}
            </div>

            {drawn && <ColorKey rows={rows} />}
          </div>
        )}
      </div>
    </Panel>
  );
}

/**
 * The rope itself, at the width it was measured at.
 *
 * Everything in here is in pixels, which is the change that made the drawing
 * honest: the amplitude, the tick and the curve all answer to how wide a pick's
 * band actually came out, rather than to a thousand-unit box that meant a
 * different thing on every screen.
 */
function Rope({
  rows,
  tally,
  them,
  axis,
  open,
  here,
  causingFork,
  width,
  onSelect,
}: {
  rows: DiffRow[];
  tally: DiffTally;
  them: string;
  axis: PickAxis;
  open: number[];
  here: number;
  causingFork?: { pickIndex: number };
  width: number;
  onSelect: (pickIndex: number, from: "braid" | "track", scroll: boolean) => void;
}) {
  const bandL = (i: number) => axis.at(i) * width;
  const bandR = (i: number) => axis.end(i) * width;
  const cx = (i: number) => axis.mid(i) * width;
  const step = axis.step * width;

  const swing = swingFor(step);

  const laneY = (i: number, side: Side) => strandY(open[i], swing, side);

  const leanOf = (row: DiffRow, side: Side) => leanFor(side)(row);

  /**
   * One stretch of one cord, as a path: a point per pick, eased between them.
   *
   * The control points sit half a pick either side of the turn and horizontally
   * level with the point they belong to -- the standard smooth step, which makes
   * a lane change read as the rope easing open. `head` puts the same curve over
   * a longer run at the left edge, which is what lets a name and a rope read as
   * one object without the join ever being drawn as a join.
   */
  const segment = (side: Side, off: number, from: number, to: number) => {
    const y = (i: number) => laneY(i, side) + off;

    // A stretch one pick long has no curve in it, and a path of a single MOVETO
    // paints nothing at all -- so it is drawn as its own band instead. It
    // happens when a side commits to a colour on the very last pick of the
    // draft, which is rare and would otherwise be a cord that silently is not
    // there.
    if (from === to && from !== 0) {
      return `M ${bandL(from)} ${y(from)} L ${bandR(from)} ${y(from)}`;
    }

    const head =
      from === 0
        ? `M 0 ${NAME_Y[side] + off} C ${bandL(0) / 2} ${NAME_Y[side] + off} ${
            bandL(0) / 2
          } ${y(0)} ${bandL(0)} ${y(0)} L ${cx(0)} ${y(0)}`
        : `M ${cx(from)} ${y(from)}`;

    let d = head;
    for (let i = from + 1; i <= to; i++) {
      const mx = (cx(i - 1) + cx(i)) / 2;
      d +=
        y(i - 1) === y(i)
          ? ` L ${cx(i)} ${y(i)}`
          : ` C ${mx} ${y(i - 1)} ${mx} ${y(i)} ${cx(i)} ${y(i)}`;
    }
    return d;
  };

  /**
   * The colour timeline, as hard gradient stops.
   *
   * Two stops per pick at the same offsets its band spans, so each pick's colour
   * ends exactly where the next begins. A soft gradient would paint the blend
   * between "blue" and "blue-black" as a colour neither deck ever was.
   *
   * Offsets come off the axis rather than off `i / rows.length`, which is what
   * they used to be -- an even division of a span that is not evenly divided,
   * because the page between packs belongs to no pick. The error was small and
   * it was still a colour boundary standing a little way from the band edge it
   * claimed to be.
   */
  const span0 = bandL(0);
  const spanW = bandR(rows.length - 1) - span0;
  const stops = (side: Side, cord: 0 | 1) =>
    rows.flatMap((row, i) => {
      const lean = leanOf(row, side);
      const color = undecided(lean) ? THREAD : cordInk(lean, cord);
      return [
        { key: `${i}a`, offset: (bandL(i) - span0) / spanW, color },
        { key: `${i}b`, offset: (bandR(i) - span0) / spanW, color },
      ];
    });

  // Each pack as a floor the strands run over: something for the rope to be
  // legible against and for the drift shading to sit in. Where one pack ends is
  // said once, on the ruler beneath.
  const wells = axis.wells.map((well) => ({
    ...well,
    x: well.at * width,
    width: well.length * width,
  }));

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

  // The tick a fork gets, sized to the narrowest opening the chart can draw --
  // a one-pick parting. Constant across the drawing on purpose: its length used
  // to be a second, undeclared encoding of the same run length the amplitude
  // already carries.
  const tick = (TOGETHER + 2 * swing * OPEN_FLOOR - STRAND) / 2;

  return (
    <>
      <defs>
        {SIDES.flatMap((side) =>
          CORDS.map((cord) => (
            <linearGradient
              key={`${side}-${cord}`}
              id={`braid-${side}-${cord}`}
              gradientUnits="userSpaceOnUse"
              x1={span0}
              x2={span0 + spanW}
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

      {/* NOT a legend, and no longer a column either. Each name is simply where
          its own rope comes in, set in the plot's left margin so it exists
          exactly when the drawing does. `Text` rather than `<text>` because the
          other drafter is called "Your challenger" whenever they have not been
          named, and a name that exists to say whose half this is must wrap
          rather than truncate to "YOUR CHALLE…". */}
      {SIDES.map((side) => (
        <Text
          key={side}
          x={-10}
          y={NAME_Y[side]}
          width={NAMES_W - 14}
          textAnchor="end"
          verticalAnchor="middle"
          {...TICK_TEXT}
          fill={NEUTRAL.plain}
        >
          {side === "yours" ? "You" : them}
        </Text>
      ))}

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
          hairline. It stands directly over the lit tick on the track below --
          the same claim in the two notations this panel has -- and a column is
          what the halo becomes at this scale: a 1px rule among forty-two picks
          is not findable, and one drawn over the rope would read as a scratch on
          it. Under the strands, so the rope stays the brightest thing. */}
      <rect
        x={bandL(here)}
        y={CHANNEL}
        width={step}
        height={WELL_H}
        className="fill-base-content/[0.08] stroke-base-content/25"
        strokeWidth={1}
      />

      {/* THE SHADING IS NOT THE WHOLE CLAIM ANY MORE. It was thirteen per cent
          of `warning` over a `base-100/70` well -- about a one-and-a-half to one
          contrast against its own floor, which is a wash you notice only once
          somebody tells you it is there, carrying the second of the two things
          this panel exists to say. It is raised, and it is ruled along its foot:
          a stretch of floor with an edge can be found, measured and pointed at,
          and the edge survives being drawn eight pixels wide on a laptop. */}
      {drifted.map((band) => (
        <g key={band.key}>
          <rect
            x={band.x}
            y={CHANNEL}
            width={band.width}
            height={WELL_H}
            className="fill-warning/[0.18]"
          />
          <rect
            x={band.x}
            y={CHANNEL + WELL_H - 2}
            width={band.width}
            height={2}
            className="fill-warning/70"
          />
        </g>
      ))}

      {tally.firstDrift !== undefined && (
        <>
          {/* The shaded region's own leading edge, which is the moment the
              caption names. Not a second notation for the drift -- the same one,
              drawn where it starts. */}
          <line
            x1={bandL(tally.firstDrift)}
            y1={CHANNEL}
            x2={bandL(tally.firstDrift)}
            y2={CHANNEL + WELL_H}
            stroke="currentColor"
            strokeWidth={1.5}
            className="text-warning"
          />
          {causingFork && (
            <CausalArc
              from={cx(causingFork.pickIndex)}
              to={bandL(tally.firstDrift)}
            />
          )}
        </>
      )}

      {/* One target per pick, the whole floor-height band under it, and the
          fork's gold tick riding along in the same group. Every one of them is
          exactly one `step` wide, everywhere, including at the seams -- a target
          that quietly narrows because of where it sits in a pack is a target
          that behaves differently for no reason a reader could recover.

          BENEATH THE STRANDS, with the strands made transparent to the pointer.
          Above them the hover wash fell across the rope and dulled it, and below
          them without that the rope swallowed every click that landed on it --
          which on a wide opening is most of the target. The rope carries no
          interaction of its own, so it has nothing to lose by not taking the
          click.

          Keyboard reaches these picks through the track directly beneath, which
          takes one tab stop for the whole draft and arrows within it -- and
          which is drawn to this chart's own measure, so the tick a key lands on
          is under the band it names. */}
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
            <line
              x1={cx(i)}
              y1={MID - tick}
              x2={cx(i)}
              y2={MID + tick}
              strokeLinecap="round"
              className="stroke-primary [stroke-width:3] transition-[stroke-width] group-hover:[stroke-width:5]"
            />
          )}
        </g>
      ))}

      {/* THE THREAD FIRST, so the cords lie over the pick they share with it.
          Before either of you had two cards of a colour there is no pair to
          draw, and this is that stretch: one hairline on the strand's own
          centreline, which forks into two cords at the pick the colours arrive.
          It used to be a second grey cord, three shades off mono-black, in
          exactly the stretch of the draft where telling those two apart matters
          most -- see `THREAD` for why lightness was the wrong channel. */}
      {SIDES.flatMap((side) =>
        spans(rows, (r) => undecided(leanOf(r, side))).map((run) => (
          <path
            key={`${side}-thread-${run.from}`}
            d={segment(side, 0, run.from, Math.min(rows.length - 1, run.to))}
            fill="none"
            stroke={THREAD}
            strokeWidth={THREAD_W}
            strokeDasharray={THREAD_DASH}
            pointerEvents="none"
          />
        )),
      )}

      {SIDES.flatMap((side) =>
        CORDS.flatMap((cord) =>
          spans(rows, (r) => !undecided(leanOf(r, side))).map((run) => (
            <path
              key={`${side}-${cord}-${run.from}`}
              // The two cords ride half a seam's width either side of the
              // strand's own line, so together they occupy exactly one strand.
              d={segment(side, (cord === 0 ? -1 : 1) * ((CORD + SEAM) / 2), run.from, run.to - 1)}
              fill="none"
              stroke={`url(#braid-${side}-${cord})`}
              strokeWidth={CORD}
              // Butt, not round: two cords lying against each other want a flat
              // seam between them, and rounded caps on a 7-unit cord would round
              // the strand's own ends into a lozenge.
              strokeLinecap="butt"
              strokeLinejoin="round"
              pointerEvents="none"
            />
          )),
        ),
      )}
    </>
  );
}

/**
 * THE SECOND CHANNEL ON THE CORDS, and the reason there has to be one.
 *
 * The cords are painted from `cordInk`, and that function's own header carries
 * the measurement: on this panel's floor the five mixed cords come out dE 2.5
 * apart at the closest pair under deuteranopia and dE 8.0 apart at the closest
 * pair under NORMAL vision. No mix ratio fixes it -- the sweep is in that
 * header too. WUBRG is not a categorical palette and cannot be made into one,
 * so the hue on this chart is a second reading of something else and never the
 * encoding.
 *
 * PIPS RATHER THAN A DASH PATTERN, which was the other candidate. Three
 * reasons, in order of weight. A dash is already spoken for on this drawing:
 * `THREAD` is a dashed hairline and it means "nobody has committed to anything
 * yet", so a dashed cord would put two meanings on one texture in the one panel
 * where that distinction is the point. A cord's side is a PAIR, and a dash
 * pattern can encode one thing where two pips print two. And this app settled
 * the question already -- `ManaCurve`, `ColorPips` and `manaMark` all say a
 * colour with the game's own symbol, and a second vocabulary on the same screen
 * is the drift the kit exists to stop.
 *
 * A PIP PER RUN, not per pick. A strand's colour is a timeline: it is a pair
 * from the pick that pair arrived until it changes, so the thing to name is the
 * run and the place to name it is where the run starts. `leanRuns` is that
 * unit. In a normal draft each side takes two or three pairs across
 * forty-two picks, so this is a handful of marks and not a rash of them.
 *
 * AND IT DRAWS NOTHING WHERE IT WOULD NOT FIT, which is `manaMark`'s own
 * ruling rather than a number invented here: below eleven pixels a colour the
 * pips are a smudge, and a smudge is worse than the key. That is also what
 * keeps two short runs from colliding -- a run that has no room for its own
 * pips has no room to overlap its neighbour's either.
 *
 * Set on the strand's centreline, so the mark covers both cords: it is naming
 * the PAIR, which is what a strand is, not one half of it.
 */
function CordPips({
  rows,
  axis,
  open,
  width,
}: {
  rows: DiffRow[];
  axis: PickAxis;
  open: number[];
  /** The drawn width inside the plot's margins -- the same box `Rope` gets. */
  width: number;
}) {
  const swing = swingFor(axis.step * width);

  const marks = SIDES.flatMap((side) =>
    leanRuns(rows, leanFor(side)).flatMap((run) => {
      const mark = manaMark(run.lean);
      // From the first band's CENTRE, which is where the rope is actually at
      // the lane this mark is placed on -- at the band's edge it is still
      // halfway through the turn.
      const from = axis.mid(run.from) * width;
      const to = axis.end(run.to - 1) * width;
      if (!mark.fits(to - from, STRAND)) return [];
      return [
        {
          key: `${side}-${run.from}`,
          left: from,
          top: strandY(open[run.from], swing, side),
          pips: mark.pips,
        },
      ];
    }),
  );

  return (
    // `aria-hidden`, because every one of these is already in the chart's label
    // and in the key below it. This is the drawing's second channel, not a
    // second announcement of it.
    <div
      aria-hidden
      className="pointer-events-none absolute inset-y-0"
      style={{ left: NAMES_W, right: 0 }}
    >
      {marks.map((mark) => (
        <span
          key={mark.key}
          className="absolute -translate-y-1/2 leading-none"
          style={{ left: mark.left, top: mark.top }}
        >
          {/* `shadow` because these land on a cord rather than on the page, and
              the mana font's own disc against a cord of nearly its own
              lightness is exactly the edge the shadow exists for. */}
          <ManaCost cost={mark.pips} className="text-[9px]" shadow />
        </span>
      ))}
    </div>
  );
}

/**
 * The delay, drawn: cause on the left, eight or more picks of nothing visible,
 * effect on the right.
 *
 * IT HAS A HEAD ON IT NOW, and that is the fix for the one thing the arc could
 * never say. A dashed curve between two points is symmetric -- it asserts that
 * these two moments are related and leaves which caused which to the caption --
 * and the whole argument of this panel is the direction. So it points, and it is
 * drawn at full strength: it was `warning/75` at a pixel and a half, the
 * faintest ink on a panel whose loudest mark is a floor shading nobody has to
 * read.
 */
function CausalArc({ from, to }: { from: number; to: number }) {
  const head = 4;

  return (
    <g className="text-warning">
      <path
        d={`M ${from} ${CHANNEL - 1} C ${from} 1 ${to} 1 ${to} ${CHANNEL - head - 2}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeDasharray="4 4"
      />
      <path
        d={`M ${to - head} ${CHANNEL - head - 3} L ${to} ${CHANNEL - 1} L ${to + head} ${
          CHANNEL - head - 3
        } Z`}
        fill="currentColor"
      />
    </g>
  );
}

/**
 * The draft as one measured length, divided where the packs divide and numbered
 * where the caption points.
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
 * AND IT NUMBERS THE PICKS, which is the part it was missing for as long as it
 * has existed. Naming three regions is a division, not a scale: a reader told
 * the drift begins at pack 2 pick 5, or that a fork came back round eleven picks
 * later, had nowhere on the drawing to put either number. The marks are the
 * first pick of every pack and every fifth after it, in the pack-and-pick
 * coordinate the rest of this screen speaks, at the same 10px the app sets every
 * other axis label in.
 *
 * Positioned from the same `axis` the SVG draws, read as percentages of the same
 * box: `pickAxis` was asked for fractions, so one unit here is one per cent and
 * every tick lands exactly on the band above it.
 *
 * The pack names sit ON the rule with the panel's own colour behind them, which
 * is how a break in a rule is drawn when the thing breaking it is set in type of
 * an unknown width.
 */
function PackRuler({ rows, axis }: { rows: DiffRow[]; axis: PickAxis }) {
  const seams = axis.wells
    .slice(0, -1)
    .map((well, i) => ((well.at + well.length + axis.wells[i + 1].at) / 2) * 100);

  // Every fifth pick, and the first of every pack so a pack's own scale starts
  // where the pack does. Fourteen picks to a pack gives 1, 5 and 10 -- three
  // numbers across a hand's width, which is a scale rather than a ruler face.
  const marks = rows.flatMap((row, i) =>
    row.pickNo === 1 || row.pickNo % 5 === 0
      ? [{ key: i, at: axis.mid(i) * 100, n: row.pickNo }]
      : [],
  );

  return (
    <div className="relative h-9">
      <span
        className="absolute top-2 h-px -translate-y-1/2"
        style={{
          left: `${axis.at(0) * 100}%`,
          right: `${(1 - axis.end(rows.length - 1)) * 100}%`,
          backgroundColor: INK.rule,
        }}
      />
      {seams.map((x) => (
        <span
          key={x}
          className="absolute top-2 h-2.5 w-px -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${x}%`, backgroundColor: INK.zero }}
        />
      ))}
      {axis.wells.map((well) => (
        <span
          key={well.packNo}
          className="eyebrow absolute top-2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap bg-base-200 px-2"
          style={{ left: `${(well.at + well.length / 2) * 100}%` }}
        >
          Pack {well.packNo}
        </span>
      ))}
      {marks.map((mark) => (
        <span
          key={mark.key}
          aria-hidden
          // Clear of the pack names, which sit ON the rule and are as tall as
          // their own type. Two rows: the pack a pick belongs to, and where in
          // that pack it is.
          className="absolute top-4 flex -translate-x-1/2 flex-col items-center gap-px tabular-nums"
          style={{ left: `${mark.at}%` }}
        >
          <span className="h-1 w-px" style={{ backgroundColor: INK.rule }} />
          <span
            style={{
              fontSize: TICK_TEXT.fontSize,
              letterSpacing: TICK_TEXT.letterSpacing,
              color: NEUTRAL.quiet,
            }}
          >
            {mark.n}
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * What the cords are, in the colours the cords are drawn in.
 *
 * THE BRAID'S HEADLINE ENCODING HAD NO KEY BELOW 640px, which is the defect
 * this closes. The two-bar colour chip beside each name was retired for a good
 * reason -- it showed what a side FINISHED on while the rope beside it starts
 * with no colours at all -- and what replaced it was one sentence in the panel's
 * header rule, marked `hidden sm:inline`. So the drawing whose whole point is
 * which two colours each of you was on explained itself on a laptop and said
 * nothing on a phone.
 *
 * A KEY IS NOT A CHIP, and the difference is whose colour it claims to be. The
 * chip said "this is your pair"; this says "this hue is blue", which stays true
 * at every pick of the draft including the ones where nobody was blue. Only the
 * colours actually in this comparison are listed -- a key naming five colours on
 * a draft with two in it is a legend for a chart somebody else read.
 *
 * The thread is in it too, because "no colours yet" is a state of the rope and
 * the one a reader meets first.
 */
function ColorKey({ rows }: { rows: DiffRow[] }) {
  const present = new Set<string>();
  let anyUndecided = false;
  for (const row of rows) {
    for (const lean of [row.yourLean, row.theirLean]) {
      if (undecided(lean)) anyUndecided = true;
      for (const c of lean) present.add(c);
    }
  }

  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 pt-0.5">
      <span className="text-xs text-base-content/50">
        each strand is the two colours that side was drafting most
      </span>
      <Key
        entries={[
          ...["W", "U", "B", "R", "G"]
            .filter((c) => present.has(c))
            .map((c) => ({
              label: COLOR_NAMES[c],
              ink: cordInk(c, 0),
              // The pip, not a chip of the cord's colour, and for the same
              // reason the cords carry pips at all: a chip would explain the
              // hue with the hue. `Key` takes a `swatch` for exactly this --
              // where the app already has a better mark for a thing than a
              // rectangle of its colour -- and it makes the key a smaller copy
              // of what is drawn above rather than a second vocabulary.
              swatch: (
                <span aria-hidden className="leading-none">
                  <ManaCost cost={`{${c}}`} className="text-[11px]" />
                </span>
              ),
            })),
          ...(anyUndecided
            ? [
                {
                  label: "no colors yet",
                  ink: THREAD,
                  shape: "hollow" as const,
                  means: "drawn as a thread, before two cards of a color are in the pool",
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}

/**
 * The same finding without the geometry, for a screen the rope cannot be drawn
 * on honestly.
 *
 * It is not a smaller braid and it does not try to be. What the rope says and
 * nothing else on this page prints is HOW LONG EACH PARTING HELD -- the quantity
 * the amplitude encodes -- so that is what is listed: where every parting
 * started and how many picks it ran for, with the decisions inside it marked.
 *
 * IT DOES NOT REPEAT THE PARTITION, which was the obvious thing to put here and
 * would have been a fourth drawing of forty-two picks on one screen. `PickSplit`
 * is on the summary panel at every width, including the widths this fallback
 * appears at, and this screen has spent three revisions taking duplicate
 * pictures of the same draft OFF it.
 *
 * The forks are marked on their runs rather than counted separately: a parting
 * that contains a decision and one that is two people looking at different
 * packs are different events, which is the whole distinction this screen is
 * shaped around.
 */
function Fallback({
  rows,
  tally,
  them,
}: {
  rows: DiffRow[];
  tally: DiffTally;
  them: string;
}) {
  const last = rows[rows.length - 1];

  const partings = spans(rows, (r) => !r.agree).map((run) => ({
    key: run.from,
    from: rows[run.from],
    held: run.to - run.from,
    forks: rows.slice(run.from, run.to).filter(isFork).length,
  }));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs leading-relaxed text-base-content/60">
        Too narrow to draw the two drafts as strands — the picks would be closer together
        than a mark you could see. Every parting, in order:
      </p>

      {/* WHICH TWO COLOURS EACH OF YOU ENDED ON, which this fallback did not
          say and the rope it replaces says at every pick. The list below is the
          quantity the AMPLITUDE encodes -- how long each parting held -- and
          that was the right thing to rescue first; but the cords encode a
          second thing, and dropping it meant a reader on a phone got the shape
          of the disagreement with no idea what either of you was drafting.

          In pips, because that is how the game writes a colour and how the key
          under the drawn form writes it two paragraphs up. A word here and a
          symbol there would be one screen with two vocabularies for one fact. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <Finish who="You" lean={last.yourLean} />
        <Finish who={them} lean={last.theirLean} />
      </div>

      {partings.length === 0 ? (
        <p className="text-sm text-base-content/70">
          There were none. You took the same card on all {rows.length} picks.
        </p>
      ) : (
        <ScrollBox maxHeight="max-h-[18rem]">
          <ul className="flex flex-col gap-1 text-sm">
            {partings.map((parting) => (
              <li key={parting.key} className="flex flex-wrap items-baseline gap-x-2">
                <span className="eyebrow w-16 shrink-0">
                  P{parting.from.packNo}P{parting.from.pickNo}
                </span>
                <span className="text-base-content/70">
                  apart for {parting.held} pick{parting.held === 1 ? "" : "s"}
                </span>
                {parting.forks > 0 && (
                  <span className="flex items-center gap-1.5 text-xs text-primary/85">
                    <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-primary" />
                    {parting.forks} off the same pack
                  </span>
                )}
              </li>
            ))}
          </ul>
        </ScrollBox>
      )}

      {tally.firstDrift !== undefined && (
        <p className="text-xs leading-relaxed text-base-content/60">
          From pack {rows[tally.firstDrift].packNo}, pick {rows[tally.firstDrift].pickNo} on,
          your pods drift in and out of step: {tally.rows - tally.comparable} of the picks put
          different cards in front of you and {them}.
        </p>
      )}
    </div>
  );
}

/**
 * One side's pair at the end of the draft, in the game's own symbols.
 *
 * `spoken` is what the chart's accessible label uses and it is right there --
 * read aloud, "Blue-Black" is a name and two pips are not. On the page it is
 * the other way round, which is `ColorPips`' standing argument: a reader who
 * has seen one card knows what the blue drop means, and the deck rows, the
 * placards and the pool counts on this same screen all print the symbol.
 */
function Finish({ who, lean }: { who: string; lean: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-base-content/60">{who} finished</span>
      {undecided(lean) ? (
        // Not an em dash: "no colours" is a thing that happened, and a dash is
        // how this app writes a value it does not have.
        <span className="text-base-content/45">on no pair</span>
      ) : (
        <ColorPips colors={lean} className="text-base" />
      )}
    </span>
  );
}

/**
 * How to read the braid, written once.
 *
 * It hangs off the mark on the panel's header rule rather than sitting under the
 * chart, because it is load-bearing the first time and furniture the fifth.
 *
 * EVERY NUMBER IN IT IS A PLACE ON THE DRAWING, which took a change at both
 * ends. It used to say "they begin at pick 19" -- a running count of the whole
 * draft, in a screen that speaks in pack-and-pick everywhere else and now
 * NUMBERS the drawing that way. A caption whose coordinate the ruler underneath
 * it does not use is a caption a reader cannot follow with a finger.
 */
export function BraidCaption({
  rows,
  tally,
  causingFork,
}: {
  rows: DiffRow[];
  tally: DiffTally;
  causingFork?: { packNo: number; pickNo: number; pickIndex: number };
}) {
  const driftAt = tally.firstDrift === undefined ? undefined : rows[tally.firstDrift];

  return (
    <>
      The two strands run together while you were taking the same card and open where you
      were not — wider the longer the parting held, from about a third of the swing for a
      single pick to all of it for a parting that never closed. A gold tick in the opening
      means you were both looking at the same pack. Either rope runs as a dashed thread
      until that side had two cards of a colour, because until then there is no pair to
      draw.{" "}
      {driftAt === undefined ? (
        <>
          The packs themselves never came apart — the two pods stayed in step for all{" "}
          {rows.length} picks, so every opening is a decision.
        </>
      ) : (
        <>
          The first {tally.guaranteedThrough + 1} picks came off identical packs; after that
          your pods drift in and out of step, because your own earlier pick changed what the
          bots passed on. The shaded stretches are the {tally.rows - tally.comparable} picks
          where you were not looking at the same cards at all.{" "}
          {causingFork ? (
            <>
              Your call at{" "}
              <strong className="font-semibold text-base-content/90">
                pack {causingFork.packNo}, pick {causingFork.pickNo}
              </strong>{" "}
              came back round to you {tally.firstDrift! - causingFork.pickIndex} picks later,
              at pack {driftAt.packNo}, pick {driftAt.pickNo}, where the shading starts. The
              arc is that delay: nothing you could see happened in between.
            </>
          ) : (
            <>
              They begin at pack {driftAt.packNo}, pick {driftAt.pickNo}. No single fork
              before that accounts for the drift, so none is drawn as its cause.
            </>
          )}
        </>
      )}
    </>
  );
}
