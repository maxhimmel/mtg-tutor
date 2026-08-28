"use client";

import type { DisplayCard } from "@mtg-tutor/core";
import { CARD_STAT_GLOSSARY } from "@mtg-tutor/core";
import { INK, MARK, NEUTRAL } from "../charts/ink";
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
function WinRateScale({ card }: { card: DisplayCard }) {
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
  const norm = RANKED.has(rarity ?? "") ? `median ${rarity}` : "median card";
  const se = games != null && games > 0 ? Math.sqrt((rate * (1 - rate)) / games) : null;

  // `points` for the margin because it is a distance between two rates and not
  // a rate, with its leading sign dropped: a standard error is unsigned, and
  // "± +1.1pp" is two claims about a sign in three characters.
  const margin = se != null ? ` ± ${points(se).slice(1)}` : "";
  const caption = `${pct(rate)}${margin} against ${pct(baseline)} for the ${norm} in this set`;

  return (
    <Plot
      height={36}
      needs={140}
      instead={<p className="text-[11px] text-base-content/60">{caption}</p>}
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
            <Reference at={at(baseline)} height={height} label={norm} />

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
            {/* Under the row it explains, so the scale is read with the number
                rather than as a chart of its own. */}
            {id === "gih" && <WinRateScale card={card} />}
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
