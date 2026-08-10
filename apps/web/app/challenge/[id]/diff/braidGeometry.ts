import type { DiffRow } from "@mtg-tutor/core";
import { COLOR_NAMES } from "../../../lib/format";

/**
 * What a braid is made of, independent of which way it runs.
 *
 * The comparison now draws the same rope twice: across a panel, and on end as a
 * rail that never leaves the screen. They are one instrument in two
 * orientations, and everything in here is the part that does not know about
 * orientation -- how thick a cord is, what colour it takes, how far the rope
 * opens at each pick, where the packs divide. The two drawings keep only their
 * own geometry: which axis is the draft, how much room the cross-axis has, where
 * the names come in.
 *
 * Split out rather than exported from `Braid`, so neither drawing is the other's
 * parent and a change to the rope is a change to the rope.
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

// Magic's own colours, which is what a reader already knows how to decode. White
// is pulled back off the top of the range: at #f3efd0 against this near-black
// panel it was the brightest thing on the page by some way, and a strand whose
// second colour is white read as a white rope with a tint at one edge.
export const INK: Record<string, string> = {
  W: "#e9dcb4",
  U: "#a8cbe4",
  B: "#9c9490",
  R: "#e08d68",
  G: "#8fb694",
};
export const UNDECIDED = "#55504c";

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
export const cordInk = (lean: string, cord: 0 | 1): string => {
  if (lean.length === 0) return UNDECIDED;
  return INK[lean[lean.length === 1 ? 0 : cord]] ?? UNDECIDED;
};

export const spoken = (colors: string): string =>
  colors.length === 0
    ? "no colours yet"
    : [...colors].map((c) => COLOR_NAMES[c] ?? c).join("-");

/** Same pack, different card: the one disagreement that was a decision. */
export const isFork = (row: DiffRow) => row.samePack && !row.agree;

/** What a pick was, for the pointer that is hovering it. */
export function titleOf(row: DiffRow): string {
  const where = `P${row.packNo}P${row.pickNo}`;
  if (row.agree) return `${where}: you both took ${row.yours.pickedName}`;
  if (row.samePack) return `${where}: ${row.yours.pickedName} vs ${row.theirs.pickedName}`;
  return `${where}: different packs — ${row.yours.pickedName} vs ${row.theirs.pickedName}`;
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
export function opennessOf(rows: DiffRow[]): number[] {
  const out = rows.map(() => 0);
  for (const run of spans(rows, (r) => !r.agree)) {
    const amount = 0.55 + 0.45 * Math.min(1, (run.to - run.from - 1) / 2);
    for (let i = run.from; i < run.to; i++) out[i] = amount;
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
 * The lay of the packs along whichever axis the draft runs on.
 *
 * Both drawings need exactly this and got it by writing the same six lines: one
 * length per pick, the page between packs taken off the top rather than out of
 * the picks either side of it, and each pack's own run measured off that. The
 * band a pick owns is `[at(i), at(i) + step]` on the draft axis, wherever that
 * axis happens to point.
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
