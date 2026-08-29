import { scaleLog } from "@visx/scale";
import type { DiffRow } from "@mtg-tutor/core";
import { NEUTRAL } from "../../../charts/ink";
import { ringFor } from "../../../lib/cardFrame";
import { COLOR_NAMES } from "../../../lib/format";

/**
 * What a braid is made of, independent of how wide the page is.
 *
 * Everything here is the part of the rope that does not know its own scale --
 * how thick a cord is, what colour it takes, how far it opens at each pick,
 * where the packs divide. The drawing keeps only what depends on the width it
 * was given: how far apart two picks are, and therefore how far the rope is
 * allowed to swing between them.
 *
 * Split out rather than exported from `Braid` because the pack measure and the
 * openness scale are both things a reader can be wrong about, and a file whose
 * only job is to answer "how far, and in what colour" is a file those two
 * answers can be argued in.
 */

// Fat on purpose. The strand was eight units -- four per cord -- and four units
// of colour with another colour pressed against it is not a colour anybody can
// name, it is a hairline that happens to be tinted.
export const CORD = 7;
// A thread of page between a strand's two cords. Butted, a cream cord against a
// blue one is one shape with a colour change in it; parted by a single unit, it
// is two cords, which is the whole claim the pair is making.
export const SEAM = 1;
export const STRAND = CORD * 2 + SEAM;
// Between the two strands' centres where the picks agree. Against a 15-unit
// strand it leaves three units of page -- two ropes lying alongside, not one
// slab and not two unrelated tracks.
export const TOGETHER = 18;

/**
 * A cord's colour, where a cord is half a strand -- AND WHY IT IS NEVER THE
 * ONLY THING SAYING WHICH COLOUR THIS IS.
 *
 * WHICH HUE IS `cardFrame`'S TO SAY, and this file no longer keeps a second
 * opinion. It used to hold five literal hex values of its own -- the only
 * palette in `apps/web` outside `cardFrame` and the theme -- tuned by eye
 * against this panel's ground, which meant Magic's five colours had two
 * definitions in one app and only one of them was the one the placards, the
 * pool counts and the deck rows are drawn from. A blue rope and a blue card
 * being different blues is the kind of drift nobody reports and everybody feels.
 *
 * THE GROUND IS NOT `base-100`, which is where the first measurement of this
 * went wrong. The cords lie in a WELL -- `fill-base-100/70` over the panel's
 * `bg-base-200` -- so the real surface is the composite #1a1613, a little
 * lighter than base-100 and therefore a slightly harder floor for a pale cord
 * than base-100 would be. Every number below is against #1a1613.
 *
 * THE LIFT IS 6% AND IT USED TO BE 45%, and that change is the measurement.
 * Mixing each ring toward `base-content` was doing one job -- putting mono
 * black's #5e5c5a over 3:1 against the floor, where it sits at 2.70 raw -- and
 * it was charging the whole palette for it. Swept against the well:
 *
 *     ring    deutan worst   normal worst   darkest cord vs floor
 *     100%    G-R  4.8       G-B  14.4      2.70   under 3:1
 *      94%    G-R  4.5       G-B  13.6      3.00   PASSES
 *      80%    G-R  3.9       G-B  11.4      pass
 *      70%    G-R  3.4       G-B  10.0      pass
 *      55%    G-R  2.5       G-B   8.0      pass      <- what this was
 *
 * Every column but the last gets worse the further the mix goes, and the last
 * one stops improving the moment it clears its threshold. At 55% the cords were
 * five greys: green against red at 2.5 to a deuteranope, green against black at
 * 8.0 to NORMAL vision, and all five below the chroma floor -- the palette
 * reading grey to everybody, to buy one cord a contrast check it clears at 94%.
 *
 * SO THE RATIO IS DERIVED AND NOT CHOSEN. It is the least lift that puts the
 * darkest ring over 3:1 on this well, which is the one thing the mix was ever
 * for. It is an answer about THIS theme: re-derive it if `base-100`, `base-200`
 * or `base-content` move, because a number tuned to a floor is stale the moment
 * the floor is.
 *
 * AND IT IS STILL NOT A LEGAL PALETTE, which is why `CordPips` exists. 4.5 is
 * below even the 6-8 floor band at which a categorical palette is allowed WITH
 * a second channel behind it, and black is achromatic by definition -- no lift
 * fixes that. WUBRG is not a categorical palette and cannot be made into one.
 * The strand carries its pair as PIPS, the key under the chart prints the same
 * pips beside every colour it names, and the pointer says both leans in words.
 * This function may be read as "make the rope look like the cards"; it may not
 * be read as "this is how a reader tells blue from green".
 */
export const CORD_LIFT = 94;

export const cordInk = (lean: string, cord: 0 | 1): string => {
  const color = lean[lean.length === 1 ? 0 : cord];
  return `color-mix(in oklab, ${ringFor(color)} ${CORD_LIFT}%, var(--color-base-content))`;
};

/**
 * The rope before either of you had colours, which is not a colour.
 *
 * IT WAS A SECOND GREY, and that is the defect worth writing down. Undecided
 * was `#55504c` and mono-black was `#9c9490`: two neutrals separated by
 * lightness alone, drawn at the same width, in the stretch of the draft -- the
 * first six picks -- where a reader most needs to tell "they are on black" from
 * "nobody has committed to anything yet". Lightness is also the channel this
 * panel spends on everything else, so the two were competing with the drift
 * shading and the hover wash for the same dimension.
 *
 * A THREAD IS NOT A THIN CORD, it is the absence of one, and that is the honest
 * picture: `leanColors` returns nothing until two cards of a colour are in the
 * pool, so before that there is no pair to draw. So the rope is not painted
 * there at all -- it is a dashed hairline holding the path until the cords
 * start. Weight, texture and colour all differ from mono-black at once, and
 * none of them is a shade of grey a reader has to name.
 */
// `quiet` and not `rule`: this is a mark a reader has to read, not a gridline
// under one. It is the state the rope is in for the first several picks of every
// draft, which is the part of the drawing anybody looks at first.
export const THREAD = NEUTRAL.quiet;
export const THREAD_W = 2;
export const THREAD_DASH = "2 3";

export const undecided = (lean: string) => lean.length === 0;

export const spoken = (colors: string): string =>
  colors.length === 0
    ? "no colours yet"
    : [...colors].map((c) => COLOR_NAMES[c] ?? c).join("-");

/**
 * The same pair as a cost string, for a surface that can draw the game's symbol.
 *
 * BESIDE `spoken` RATHER THAN REPLACING IT, and the split is the point. `spoken`
 * feeds the plot's accessible NAME, where a screen reader needs the words and a
 * row of pips is nothing at all; this feeds the cursor tip, which is explicitly
 * not an accessible name and is read by somebody pointing at a cord that is
 * already painted in these colours. The same fact, in the notation each surface
 * can carry.
 */
export const pipped = (colors: string): string =>
  colors.length === 0 ? "no colours yet" : [...colors].map((c) => `{${c}}`).join("");

/** Same pack, different card: the one disagreement that was a decision. */
export const isFork = (row: DiffRow) => row.samePack && !row.agree;

/**
 * What a pick was, for the pointer that is hovering it.
 *
 * IT NAMES BOTH PAIRS, which is the half it used to leave to the cords. The
 * cords are the one encoding on this chart that hue cannot carry alone -- see
 * `cordInk` for the numbers -- so the reading a pointer is owed at this spot is
 * not only which two cards, but which two decks. In words, because this is read
 * by `textContent` and a pip is a font.
 */
export function titleOf(row: DiffRow, them: string): string {
  const where = `P${row.packNo}P${row.pickNo}`;
  const cards = row.agree
    ? `you both took ${row.yours.pickedName}`
    : row.samePack
      ? `${row.yours.pickedName} vs ${row.theirs.pickedName}`
      : `different packs — ${row.yours.pickedName} vs ${row.theirs.pickedName}`;
  return `${where}: ${cards}. You on ${pipped(row.yourLean)}, ${them} on ${pipped(row.theirLean)}.`;
}

/**
 * Consecutive picks over which one side's pair did not change.
 *
 * The unit the pips are drawn in: a strand's colour is a timeline, so "where
 * does this cord start being blue-black" is a run and not a pick. Undecided
 * stretches are dropped rather than returned empty -- there is no pair there to
 * name, which is the whole meaning of the thread.
 */
export function leanRuns(
  rows: DiffRow[],
  leanOf: (row: DiffRow) => string,
): { from: number; to: number; lean: string }[] {
  const out: { from: number; to: number; lean: string }[] = [];
  let i = 0;
  while (i < rows.length) {
    const lean = leanOf(rows[i]);
    let j = i + 1;
    while (j < rows.length && leanOf(rows[j]) === lean) j++;
    if (!undecided(lean)) out.push({ from: i, to: j, lean });
    i = j;
  }
  return out;
}

/**
 * How far the rope never closes, as a fraction of the full excursion.
 *
 * A parting has to be visibly open or it is not drawn at all: together, the two
 * strands leave three units of page between them, and at this floor they leave
 * four times that. It used to be more than half the excursion, because the
 * fork's gold tick was stretched across the opening and needed somewhere to
 * sit. The tick is a fixed length now (see `Braid`), which hands the floor back
 * to the scale -- and the scale is what actually needed it.
 */
export const OPEN_FLOOR = 0.3;

/**
 * How far the rope opens at each pick, as a fraction of the full excursion.
 *
 * A single pick where you differed and were back in step immediately is not the
 * same event as six picks of building different decks, and the braid drew both
 * at full amplitude -- which is how a diagram of two drafts became a waveform.
 * The run's own length is the measure already in the data, so it is the one the
 * drawing uses.
 *
 * IT USED TO SATURATE AT THREE, which made the caption a false promise. The
 * scale was `0.55 + 0.45 * min(1, (n - 1) / 2)`: one pick opened a little over
 * half a lane, two picks most of it, and every parting from three picks to
 * forty-two drew EXACTLY THE SAME. "Wider the longer the parting held" was true
 * of the first two picks of a run and of nothing after them, and the two
 * partings a reader most wants told apart -- a blip, and the six picks where
 * two decks actually diverged -- were the two the drawing could not separate.
 *
 * SO THE SCALE IS LOGARITHMIC AND ITS DOMAIN IS THE WHOLE DRAFT. Log rather
 * than linear because the run lengths are not spread evenly: two drafters on
 * one seed agree on nearly everything (43 of 45 picks after a P1P1 divergence,
 * measured -- see `core/draft/diff.ts`), so almost every run is one or two
 * picks and a long one is rare and interesting. A linear scale would spend its
 * whole range on the tail and draw the common case as a flat rope; log gives
 * one, two and three picks a third of the excursion between them and still has
 * room left for twelve.
 *
 * The far end is `rows.length` and not the longest run in THIS draft, which is
 * the tempting mistake: a per-draft domain would draw a two-pick parting at
 * full amplitude on a draft where nothing longer happened, and two comparisons
 * of the same set would then be drawn to different scales with nothing on
 * either saying so. The honest extreme is the one the draft itself bounds --
 * you parted and never came back -- and it is what the chart's label states.
 */
export function opennessOf(rows: DiffRow[]): number[] {
  const amplitude = scaleLog({
    domain: [1, Math.max(2, rows.length)],
    range: [OPEN_FLOOR, 1],
    clamp: true,
  });

  const out = rows.map(() => 0);
  for (const run of spans(rows, (r) => !r.agree)) {
    const held = amplitude(run.to - run.from);
    for (let i = run.from; i < run.to; i++) out[i] = held;
  }
  return out;
}

/** Consecutive runs where something holds, as half-open row ranges. */
export function spans(
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
export function packSpans(rows: DiffRow[]): { packNo: number; count: number }[] {
  return rows.reduce<{ packNo: number; count: number }[]>((acc, row) => {
    const last = acc[acc.length - 1];
    if (last && last.packNo === row.packNo) last.count++;
    else acc.push({ packNo: row.packNo, count: 1 });
    return acc;
  }, []);
}

/**
 * The lay of the packs along the draft axis, in whatever unit the caller
 * measures that axis in.
 *
 * `span` is the length of the whole axis and everything comes back in the same
 * unit, which is what lets the chart ask in pixels and the ruler and the track
 * beneath it ask in fractions of their own box -- ONE call, two coordinate
 * systems, and no percentage anywhere that has to be kept in step with a pixel
 * by hand. The panel does exactly that: `pickAxis(rows, { span: 1, ... })`
 * multiplied by the measured width inside the SVG, and read as percentages
 * outside it.
 *
 * The band a pick owns is `[at(i), at(i) + step]`, and the page between packs
 * is taken off the top rather than out of the picks either side of it -- so
 * every band is exactly one `step` wide, including the two at every seam.
 */
export function pickAxis(
  rows: DiffRow[],
  { span, lead, pad, gap }: { span: number; lead: number; pad: number; gap: number },
) {
  const packs = packSpans(rows);
  const step = (span - lead - pad - (packs.length - 1) * gap) / rows.length;
  const shift = packs.flatMap((pack, p) => Array<number>(pack.count).fill(p * gap));

  // A pick's own band, and its centre. The turn happens over the pick it belongs
  // to rather than between two of them.
  const at = (i: number) => lead + i * step + shift[i];
  const end = (i: number) => at(i) + step;
  const mid = (i: number) => at(i) + step / 2;

  // Each pack as a floor the strands run over. It starts and ends on a band
  // edge, exactly, because the gap between packs is space of its own rather than
  // something borrowed from the picks at the seam.
  let seen = 0;
  const wells = packs.map((pack) => {
    const from = seen;
    seen += pack.count;
    return {
      packNo: pack.packNo,
      count: pack.count,
      from,
      to: seen,
      at: at(from),
      length: pack.count * step,
    };
  });

  return { packs, step, at, end, mid, wells };
}

export type PickAxis = ReturnType<typeof pickAxis>;
