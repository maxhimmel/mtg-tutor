"use client";

import type { DisplayCard } from "@mtg-tutor/core";
import { CARD_STAT_GLOSSARY } from "@mtg-tutor/core";
import { INK, MARK, NEUTRAL } from "../charts/ink";
import type { KeyEntry } from "../charts/Key";
import { Plot, Reference, TICK_TEXT } from "../charts/Plot";
import { pct, points } from "../lib/format";

// The draft data for one card, as the hover panel shows it. Deliberately more
// than the win rate: GIH alone is confounded by the quality of the decks that
// played the card, and the rows under it are what make it readable -- IWD
// isolates the card's own contribution, and the maindeck rate says how
// self-selected the sample behind GIH was.
//
// Labels and explanations come from CARD_STAT_GLOSSARY, the same corpus behind
// the coach's system prompt and /glossary, so the three cannot drift.

const byId = new Map(CARD_STAT_GLOSSARY.map((s) => [s.id, s]));

interface StatRow {
  /** The glossary entry this row is explained by. Two rows may share one. */
  id: string;
  /** What the row is called. Usually the glossary's label, see `pickOrderRows`. */
  label: string;
  value: string;
}

/**
 * ATA and ALSA, as two rows.
 *
 * THEY WERE ONE CELL: "3.2 / 5.1" under the single label "ATA / ALSA", which
 * asks the reader to pair two numbers with two acronyms across a slash and get
 * the order right, on a panel that disappears when the pointer moves. Two
 * quantities under one label is the oldest way to make a readout unreadable,
 * and these two are not even the same claim -- one is when the field TAKES the
 * card and one is when the field SEES it.
 *
 * Split off the glossary's own label rather than out of a second list of names
 * here, because the whole reason that corpus exists is that three copies of
 * these words stop agreeing. If the entry is ever reworded past a slash the
 * split stops firing and both rows fall back to the full label -- wrong-looking
 * and legible, which is the right way round for a fallback.
 */
function pickOrderRows(card: DisplayCard, label: string): StatRow[] {
  const [taken, seen] = label.split(" / ");
  // Both rows keep the one glossary id, because there is one entry and it
  // explains the pair -- the sentence people need is about the GAP between
  // them. It is printed once, under the second row, where both numbers are
  // already on screen to read it against.
  return [
    { id: "pick-order", label: taken ?? label, value: card.avgPick?.toFixed(1) ?? "—" },
    { id: "pick-order", label: seen ?? label, value: card.alsa?.toFixed(1) ?? "—" },
  ];
}

// Which stats this card actually has, in glossary order. Returned as a list so
// the caller can ask "is there anything to draw?" without rendering.
function rowsFor(card: DisplayCard): StatRow[] {
  const rows: StatRow[] = [];
  const named = (id: string) => byId.get(id)?.label ?? id;

  if (card.gihWinRate != null) {
    rows.push({
      id: "gih",
      label: named("gih"),
      value:
        card.gihGames != null
          ? `${pct(card.gihWinRate)} (n ${card.gihGames.toLocaleString()})`
          : pct(card.gihWinRate),
    });
  }
  if (card.iwd != null) rows.push({ id: "iih", label: named("iih"), value: points(card.iwd) });
  if (card.avgPick != null || card.alsa != null) {
    rows.push(...pickOrderRows(card, named("pick-order")));
  }
  if (card.maindeckRate != null) {
    rows.push({ id: "maindeck", label: named("maindeck"), value: pct(card.maindeckRate) });
  }
  if (card.winRate != null) rows.push({ id: "gpwr", label: named("gpwr"), value: pct(card.winRate) });

  return rows;
}

export const hasStats = (card: DisplayCard): boolean => rowsFor(card).length > 0;

/**
 * How far either side of the baseline the win-rate scale reaches.
 *
 * Measured rather than picked. Across all twenty-six ingested formats, taking
 * every card with at least 500 games in hand and its distance from its own
 * set's median, 99% of them land inside ten points and the whole range is
 * -14.6 to +14.1. So a ten-point arm holds essentially every card in the game
 * at a width where one point is still a visible distance -- and the handful
 * outside it are drawn as a mark at the edge rather than quietly clamped, which
 * is the difference between a truncated scale and a lying one.
 */
const ARM = 0.1;

const RANKED = new Set(["common", "uncommon", "rare", "mythic"]);

// The Mana font's expansion symbol. A codepoint rather than the `ms-rarity`
// class because this is drawn inside an SVG `<text>`, which cannot reach a CSS
// `::before` -- the class is what every HTML caller uses.
const RARITY_GLYPH = "\ue96c";

/**
 * The one number on this panel with a reference point, and where it comes from.
 *
 * "56.2%" ANSWERS NOTHING ON ITS OWN. A Limited win rate is meaningful only
 * against the format it was measured in: 56% is a fine common in one set and
 * below the median in another, and this panel is the primary card evaluation
 * surface in the app -- the place a pick is actually decided.
 *
 * The baseline is `rarityBaseline`, which the card is already carrying. It is
 * the median GIH win rate of the set's own rated cards AT THIS RARITY, measured
 * at ingest (`observedRarityBaselines`) because the fixed constants it replaced
 * were off by about seven points on real formats. Per rarity rather than per
 * set, which is the right comparison here: nobody wants to know whether a
 * common beats the mythics.
 *
 * The band is one standard error on the card's own rate, sqrt(p(1-p)/n) over
 * `gihGames`. It is the same margin `gapMargin` grades a pick with, and it is
 * usually about a point -- which is to say, comparable to the gaps people read
 * off these numbers. A dot with no band invites a reading the sample cannot
 * support, and this is the panel that reading is made on.
 *
 * Nothing here is a query. Both numbers ride on the card the panel is already
 * holding, which is what keeps a hover free.
 */
function WinRateScale({ card, expanded }: { card: DisplayCard; expanded: boolean }) {
  const { gihWinRate: rate, gihGames: games, rarityBaseline: baseline, rarity } = card;
  if (rate == null || baseline == null) return null;

  const lo = baseline - ARM;
  const hi = baseline + ARM;
  // Named by rarity, because that is what the baseline is measured over -- and
  // only for the four rarities a drafter names a card by: a bonus-sheet card
  // has a baseline too, and "median bonus" is not a thing anybody says.
  //
  // `observedRarityBaselines` falls back to the set's overall median where a
  // rarity has fewer than five rated cards, which would make this label a shade
  // too specific. No ingested format has come close to that floor.
  const ranked = RANKED.has(rarity ?? "");
  const norm = ranked ? `median ${rarity}` : "median card";
  const se = games != null && games > 0 ? Math.sqrt((rate * (1 - rate)) / games) : null;

  // `points` for the margin because it is a distance between two rates and not
  // a rate, with its leading sign dropped: a standard error is unsigned, and
  // "± +1.1pp" is two claims about a sign in three characters.
  const margin = se != null ? ` ± ${points(se).slice(1)}` : "";
  const caption = `${pct(rate)}${margin} against ${pct(baseline)} for the ${norm} in this set`;

  return (
    <Plot
      height={36}
      /* TWO CONSTRAINTS, AND THIS IS THE LARGER OF THEM.

         The axis: the baseline is always dead centre -- `lo` and `hi` are the
         arm either side of it -- so its label is centred while the two end
         labels are pinned to the edges. "62.3% median uncommon" with its glyph
         is about 122px at this size and an end is about 30px, so the centre
         label clears them once (W − 122) / 2 exceeds 38px of end plus air:
         W > 198.

         The legend: "This card" and "Margin ± 1.3pp" with their swatches and the
         gap between them come to about 198px, and they have to sit on ONE row --
         two entries that wrap are what this block looked like before, and the
         wrap is what made it unreadable rather than the entries.

         Both land near 200, so 210 clears each with a little air. Below it the
         caption says the whole thing in a sentence, which is what a panel that
         narrow wanted anyway. */
      needs={210}
      instead={<p className="text-[11px] text-base-content/60">{caption}</p>}
      /* TWO ENTRIES, AND THE THIRD IS THE ONE THAT WAS WRONG.

         This chart is one series -- one card's win rate -- so it does not get a
         legend the way a chart of several would. What it gets is a name for the
         marks a reader cannot otherwise tell apart, and there are exactly two:
         the dot and the band are drawn at the same spot, the band centred on the
         dot, so neither can be labelled in place without its label landing on
         the other's.

         The rule was the third entry and it was the one making this list wrap
         onto a second line in a 260px panel. It has clear space under it and
         takes a direct label with its value, which beats a key entry on every
         count -- it sits with the mark rather than below the chart, and it is
         the only mark here whose meaning a reader could not guess.

         (Naming all three in a key cost four lines under a chart 36px tall, and
         putting that key in two columns only halved the width they had to wrap
         in. Both are in the history; neither is worth repeating.) */
      legend={legendFor({ se, expanded })}
      /* NO TIP, and the reason is the surface rather than the chart. This rides
         in the card hover panel, which is `pointer-events: none` -- it has to
         be, because it opens under the cursor and would otherwise take the
         hover that summoned it. There is no pointer here to answer: the panel
         IS what a hover produced. Everything a tip would say is printed --
         both ends of the scale sit under the rule, the rate is in the row
         above, and the baseline and margin are in the key. */
      tip={{
        none: "The panel this chart rides in is pointer-events:none — it is itself what a hover opened, so there is no pointer over the marks. Both ends of the scale, the card's rate, its margin and the baseline are all printed.",
      }}
      // Named in full, because a chart's accessible name has to stand on its
      // own: read after the row above it the acronym is obvious, and read on
      // its own out of a list of images it is a number with no subject.
      label={`${byId.get("gih")?.label ?? "Win rate"}: ${caption}. The scale runs ${pct(
        lo,
      )} to ${pct(hi)}.`}
      margin={{ left: MARK.dot / 2, right: MARK.dot / 2, bottom: 16 }}
    >
      {({ width, height }) => {
        const at = (v: number) => ((v - lo) / (hi - lo)) * width;
        const mid = height / 2;
        // Off the end rather than clamped in silence: 1% of rated cards land
        // outside a ten-point arm, and a dot parked on the edge would read as a
        // card sitting exactly at the extreme of the scale.
        const beyond = rate < lo ? -1 : rate > hi ? 1 : 0;
        const x = Math.min(Math.max(at(rate), 0), width);

        return (
          <>
            <line x1={0} x2={width} y1={mid} y2={mid} stroke={INK.rule} strokeWidth={MARK.axis} />

            {/* The rule, labelled where it stands, with its value.

                A direct label rather than a key entry, because it is one mark
                and not a series -- and because a reference line a reader cannot
                name is the one thing on this chart that is genuinely
                ambiguous. The value rides with the name for the same reason:
                62.3% appears nowhere else on the panel, so leaving it off would
                make the rule a position with no number.

                The expansion symbol carries "rarity" and the word carries which
                one. The font ships ONE rarity glyph, not four -- on a printed
                card the shape is the set and the COLOUR is the rarity, and
                colour is the channel this app is least willing to hand a claim
                to. Drawn in the label's own ink rather than tinted, because a
                tint would say the same thing again in the one channel
                greyscale takes away. */}
            <Reference at={at(baseline)} height={height} />
            <text x={at(baseline)} y={height + 12} textAnchor="middle" {...TICK_TEXT}>
              {ranked && <tspan fontFamily="Mana">{RARITY_GLYPH}</tspan>}
              <tspan dx={ranked ? "0.3em" : 0}>{`${pct(baseline)} ${norm}`}</tspan>
            </text>

            {se != null && beyond === 0 && (
              <rect
                x={Math.max(0, at(rate - se))}
                y={mid - MARK.band / 2}
                width={Math.min(width, at(rate + se)) - Math.max(0, at(rate - se))}
                height={MARK.band}
                rx={MARK.band / 2}
                fill={NEUTRAL.hollow}
              />
            )}

            {beyond === 0 ? (
              <circle cx={x} cy={mid} r={MARK.dot / 2} fill={INK.yours} />
            ) : (
              // A triangle pointing the way the card went. Same weight as the
              // dot, unmistakably not a position, and drawn back INTO the plot
              // from the edge so the mark for a card off the scale is not
              // itself off the scale.
              <polygon
                points={`${x},${mid} ${x - beyond * MARK.dot},${mid - MARK.dot / 2} ${
                  x - beyond * MARK.dot
                },${mid + MARK.dot / 2}`}
                fill={INK.yours}
              />
            )}

            <text x={0} y={height + 12} textAnchor="start" {...TICK_TEXT}>
              {pct(lo)}
            </text>
            <text x={width} y={height + 12} textAnchor="end" {...TICK_TEXT}>
              {pct(hi)}
            </text>
          </>
        );
      }}
    </Plot>
  );
}

/**
 * One entry per mark on the scale, in the order the eye meets them.
 *
 * THE DEFAULT SWATCH IS ALREADY THE RIGHT MARK FOR TWO OF THE THREE, which is
 * worth saying because it is why they take no `swatch`: `Key`'s dot is drawn at
 * `MARK.dot` and its bar at `MARK.band`, the same two numbers the chart draws
 * the point estimate and the error band at. The key is a smaller copy of the
 * picture rather than a second vocabulary beside it.
 *
 * The baseline is the one that needs its own. It is a VERTICAL RULE on the
 * chart, and a horizontal pill is the wrong shape for a line you measure
 * across -- and it is the entry carrying the rarity, which is Magic's own mark
 * and not a colour at all. Drawn through the `ms-rarity` class here where the
 * chart draws the codepoint directly; an SVG `<text>` cannot reach a `::before`
 * rule, so the two halves of the same symbol are spelled differently on
 * purpose.
 */
/**
 * The two marks that sit on top of each other, and nothing else.
 *
 * A legend is for telling marks apart, and on this chart exactly two need it:
 * the dot and the band are drawn at the same place, the band centred on the
 * dot, so neither can be direct-labelled without its label landing on the
 * other's. That is the case a key is actually for.
 *
 * The rule is not in here. It has room under it and takes a direct label with
 * its value, which is better than a key entry on every count -- it sits with
 * the mark instead of below the chart, and it was the third entry that used to
 * push this list onto a second line.
 *
 * `aside` only where the value is not already on the panel. The card's own rate
 * is the row directly above the chart, so "This card" carries none; the margin
 * appears nowhere else, so it carries its own.
 */
function legendFor({ se, expanded }: { se: number | null; expanded: boolean }): KeyEntry[] {
  return [
    { label: "This card", ink: INK.yours, shape: "dot" },
    ...(se != null
      ? [
          {
            label: "Margin",
            ink: NEUTRAL.hollow,
            shape: "bar" as const,
            aside: `± ${points(se).slice(1)}`,
            // Only under shift, and the panel's own budget is the reason. It
            // cannot be scrolled -- it is pointer-events:none -- so every line
            // added here pushes a keyword reminder out of reach at the bottom,
            // which is the trade the reminders themselves already make. Shift
            // is exactly the moment a reader is asking what a number means.
            ...(expanded && {
              means: "One standard error. Two cards inside each other's bands are a coin flip.",
            }),
          },
        ]
      : []),
  ];
}

export function CardStats({ card, expanded }: { card: DisplayCard; expanded?: boolean }) {
  const rows = rowsFor(card);
  if (rows.length === 0) return null;

  return (
    <div className={`flex flex-col ${expanded ? "gap-2.5" : "gap-1"}`}>
      {rows.map(({ id, label, value }, i) => {
        const def = byId.get(id);
        // Once per entry, under the last row that shares it. See `pickOrderRows`.
        const explains = expanded && def && rows.findLastIndex((r) => r.id === id) === i;
        return (
          <div key={`${id}-${label}`}>
            <div className="flex items-baseline justify-between gap-3">
              {/* No `title=`. The panel is pointer-events:none, so there was
                  nothing to hover and nothing to long-press -- it was an
                  explanation that had never once been shown to anybody. What
                  these mean is on the shift reveal below the rows, which is
                  reachable and says so. */}
              <span className="text-xs text-base-content/60">{label}</span>
              <span className="font-mono text-xs tabular-nums">{value}</span>
            </div>
            {/* Under the row it explains AND hung off it, so the block reads as
                part of that row rather than as a chart parked between two.
                Everything else on this panel is a `label ... value` line, and
                four unindented lines of chart in the middle of them broke the
                table's rhythm without saying what they belonged to. The rule is
                the cheapest thing that says "still the win rate". */}
            {id === "gih" && (
              <div className="mt-1 border-l border-base-content/15 pl-2.5">
                <WinRateScale card={card} expanded={expanded === true} />
              </div>
            )}
            {explains && (
              <p className="mt-0.5 text-[11px] leading-snug text-base-content/70">
                {def.short}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
