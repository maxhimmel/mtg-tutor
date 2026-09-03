"use client";

import type { ReactNode } from "react";
import { tally } from "@mtg-tutor/core";
import type { Card, DiffRow, DiffTally, PoolCard, ValueTerm } from "@mtg-tutor/core";
import { CardPlacard, CardPlacardList } from "../components/CardPlacard";
import { CardFace, CardTile } from "../components/CardTile";
import { CardStats, hasStats } from "../components/CardStats";
import { CardText } from "../components/CardText";
import { ColorPips, ColorTally } from "../components/ColorPips";
import { ManaCost } from "../components/ManaCost";
import { PILE_LABELS, PileGrid, PileWell, pileUp } from "../components/CurvePiles";
import { PickTrack, TrackKey, type Tick, type TickState } from "../components/PickTrack";
import { ScrollBox } from "../components/ScrollBox";
import { PickStrip } from "../glossary/figures/PickStrip";
import { Braid } from "../challenge/[id]/diff/Braid";
import { ScoreBreakdown } from "../components/ScoreBreakdown";
import { GapMark } from "../charts/GapMark";
import { Habits, type HabitsData } from "../components/Habits";
import { Reasoning } from "../components/Reasoning";
import { REASON_LIMIT } from "@mtg-tutor/core";

// The long Reasoning sample, hoisted so the specimen's label can read its
// length instead of asserting one. REASON_LIMIT being imported stops the CAP
// going stale; only this stops the SAMPLE going stale against it.
const LONG_REASON =
  "Took the flier over the removal. I'm deep in blue already and I'm light on two-drops — I can find another kill spell easier than a body.";
import { spokenColors } from "../lib/colorTokens";
import { ManaCurve } from "../components/ManaCurve";
import { GradeRuler } from "../glossary/figures/GradeRuler";
import { WinRateAxis } from "../glossary/figures/WinRateAxis";
import { ScorePlot, type ScoreColumn } from "../stats/ScorePlot";
import { ProgressPanel } from "../stats/Progress";
import { pct } from "../lib/format";
import {
  DeckBands,
  Verdict,
  type RevealQuestion,
} from "../practice/archetypes/ArchetypeQuiz";

// One entry per component worth looking at with a real card in it. Adding the
// next one is an append to the list at the bottom, which is the whole point of
// the list existing rather than the page being one long JSX file.
//
// A specimen draws the component AT THE WIDTHS THE APP GIVES IT, in a labelled
// bay per width, because that is where this class of bug lives: nothing was
// wrong with the placard in isolation, it was wrong in a 140px curve well and
// fine everywhere else. A gallery that renders one comfortable copy of each
// component would have shown the ten-pip overflow as working.

export interface SpecimenProps {
  // The card the chip strip has focused: what the one-card specimens draw.
  card: Card;
  // Everything on the stage, for the specimens that are about a pile of cards
  // rather than a card.
  cards: Card[];
  selected: boolean;
  onSelect: () => void;
}

export interface Specimen {
  id: string;
  title: string;
  // Said on the panel's header rule: what this is in the app, so a difference
  // you spot here can be traced to the screen it will show up on.
  note: string;
  // Drawn with the card the chip strip has focused. Most specimens are this.
  render?: (props: SpecimenProps) => ReactNode;
  /**
   * Drawn from numbers of its own, so it is on the page before anything is
   * staged.
   *
   * A SEPARATE FIELD RATHER THAN A FLAG, because the difference is a fact about
   * the function's arguments and a boolean beside it would be a second, weaker
   * statement of the same thing -- one the renderer has to remember to honour
   * and the compiler cannot check. With two fields, a specimen that takes no
   * card cannot be handed one and cannot be gated behind one.
   *
   * The gate was real: the playground drew nothing at all until a card was
   * staged, so `archetype-reveal` -- which has never taken a card, and is the
   * one specimen that can be looked at cold -- could only be reached by
   * searching up an unrelated card first.
   */
  renderBare?: () => ReactNode;
}

function Bay({
  label,
  width,
  children,
}: {
  label: string;
  // The bay's own width, which is the specimen's real subject -- so it is stated
  // rather than left to whatever the flex row happens to hand out.
  width?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${width ?? ""}`}>
      <span className="eyebrow text-base-content/45">{label}</span>
      {children}
    </div>
  );
}

// A drafter's readout at the states worth looking at, with the intervals sized
// off the real runs rather than picked to look tidy: `fit-drafter` puts one dial
// at about five drafts and the other at about ten, so the middle row -- one
// called, one not -- is the state most people will actually be in, and it is the
// one a fixture with both dials firing would never show anybody.
function habitsFixture(state: "both" | "one" | "quiet" | "newSet"): HabitsData {
  const dial = (id: "lane" | "signal", value: number, se: number) => ({
    id,
    value,
    se,
    called: Math.abs(value - 1) > 1.96 * se,
  });

  switch (state) {
    case "both":
      return {
        drafts: 12,
        picks: 528,
        skipped: { unmeasured: 0, stale: 0, newSet: 0 },
        dials: [dial("lane", 1.31, 0.09), dial("signal", 0.72, 0.11)],
        sharpness: { above: true, called: true },
      };
    case "one":
      return {
        drafts: 6,
        picks: 264,
        skipped: { unmeasured: 0, stale: 0, newSet: 0 },
        dials: [dial("lane", 1.28, 0.12), dial("signal", 1.09, 0.16)],
        sharpness: { above: false, called: false },
      };
    case "quiet":
      return {
        drafts: 2,
        picks: 88,
        skipped: { unmeasured: 0, stale: 0, newSet: 0 },
        dials: [dial("lane", 1.06, 0.19), dial("signal", 0.94, 0.24)],
        sharpness: { above: true, called: false },
      };
    case "newSet":
      return {
        drafts: 5,
        picks: 220,
        skipped: { unmeasured: 1, stale: 0, newSet: 5 },
        dials: [dial("lane", 1.22, 0.13), dial("signal", 0.98, 0.17)],
        sharpness: { above: false, called: false },
      };
  }
}

// The recessed slot a curve board gives a placard, reproduced rather than
// imported: DeckBoard's wells come with rows, counts and a legend, and what
// matters here is only how much room is left inside one.
function Well({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-base-300/70 bg-base-100 p-2">{children}</div>
  );
}

// A sentence in the coach's own idiom, built from whatever is on the stage: it
// names cards, and it says a colour pair the way the coach says one.
function coachSentence(cards: Card[]): string {
  const [first, second] = cards;
  const shell = [...new Set(cards.flatMap((card) => card.colorIdentity))].join("") || "WU";
  const over = second ? ` over ${second.name}` : "";
  return (
    `Taking ${first.name}${over} keeps you in the ${shell} shell. ` +
    `${first.name} is the pick if the deck is already ${shell}; if it is not, ` +
    `you are paying a colour for it.`
  );
}

/**
 * Stock Up, out of SOS, exactly as the drill served it.
 *
 * A REAL CASE AND NOT AN INVENTED ONE, because this panel exists because of it:
 * a player answered "neither", was told they were right, and could not see why
 * -- the table said Temur +9.8pp against Simic +2.9pp and then a sentence said
 * that was not a difference. The numbers below are the ones they saw, so the
 * panel can be checked against the confusion that produced it rather than
 * against a fixture that agrees with it by construction.
 *
 * The pair on the far side is the same card if Izzet's 1,630 games were all
 * five decks had: the same gap, a tighter band, and a verdict that flips. It is
 * here so the specimen shows the panel SAYING BOTH THINGS rather than only the
 * one it was built for.
 */
const STOCK_UP: RevealQuestion = {
  decks: [
    { colors: "URG", lift: 0.098, n: 678, deckWr: 0.57, sd: 0.0189 },
    { colors: "WUR", lift: 0.071, n: 326, deckWr: 0.56, sd: 0.0276 },
    { colors: "UBG", lift: 0.062, n: 300, deckWr: 0.55, sd: 0.0296 },
    { colors: "UR", lift: 0.059, n: 1630, deckWr: 0.58, sd: 0.0128 },
    { colors: "UG", lift: 0.029, n: 759, deckWr: 0.56, sd: 0.0184 },
  ],
  wants: "URG",
  spurns: "UG",
  sigmas: 2.6,
  separated: false,
};

const STOCK_UP_SEPARATED: RevealQuestion = {
  ...STOCK_UP,
  decks: STOCK_UP.decks.map((d) => ({ ...d, sd: d.sd * 0.55 })),
  sigmas: 4.7,
  separated: true,
};

/**
 * A review's worth of decision picks, with how each one went.
 *
 * Mixed on purpose rather than sorted: the thing a track is read for is WHERE
 * the misses fall, and a run of five hits followed by five misses would show
 * that working on the one arrangement it cannot fail on.
 *
 * `stood` is in here even though no single screen draws all three -- it belongs
 * to the misses drill and the graded pair to the review -- because the point of
 * a specimen is the three of them side by side, which is the comparison the app
 * never puts on one page and the reason a collision between two of them can
 * live for months.
 */
const RUN_STATES: TickState[] = [
  "hit", "hit", "miss", "hit", "stood", "hit", "miss", "miss",
  "hit", "hit", "stood", "hit", "miss", "hit", "hit",
];

const SAID: Partial<Record<TickState, string>> = {
  hit: "you read it right",
  miss: "you missed it",
  stood: "you stood by it",
};

const RUN: Tick[] = RUN_STATES.map((state, i) => ({
  state,
  label: `Pick ${i + 1} — ${SAID[state] ?? state}`,
}));

// The other half of what this component draws: a draft in progress, where most
// ticks carry a position and nothing else. The graded pair have to stand out of
// this and the ungraded pair have to stay a rule, at the same time.
const MID_RUN: Tick[] = RUN_STATES.map((_, i) => ({
  state: i < 6 ? "past" : i === 6 ? "current" : "ahead",
  label: `Pick ${i + 1}`,
}));

const TRACK_KEY = [
  { state: "hit" as const, label: "read it right", aside: 9 },
  { state: "miss" as const, label: "missed it", aside: 4 },
  { state: "stood" as const, label: "stood by it", aside: 2 },
];

// A hundred drafts of per-pick averages, shaped like a history rather than a
// curve. The slide from pick 4 to pick 8 is the thing the panel exists to show;
// the late picks climb back because a pack of four cards has little left to get
// wrong; and pick 15 is a 97.4 on forty-one picks, because only some sets deal a
// fifteenth card. That last column is the whole case for printing n -- on this
// axis it is the tallest dot on the plot and the least worth believing.
const BY_PICK: ScoreColumn[] = [
  { key: "1", label: "1", score: 93.1, n: 300, title: "Pick 1: 93.1 average over 300 picks" },
  { key: "2", label: "2", score: 91.8, n: 300, title: "Pick 2: 91.8 average over 300 picks" },
  { key: "3", label: "3", score: 90.4, n: 300, title: "Pick 3: 90.4 average over 300 picks" },
  { key: "4", label: "4", score: 88.9, n: 300, title: "Pick 4: 88.9 average over 300 picks" },
  { key: "5", label: "5", score: 87.2, n: 300, title: "Pick 5: 87.2 average over 300 picks" },
  { key: "6", label: "6", score: 85.6, n: 300, title: "Pick 6: 85.6 average over 300 picks" },
  { key: "7", label: "7", score: 84.1, n: 300, title: "Pick 7: 84.1 average over 300 picks" },
  { key: "8", label: "8", score: 82.6, n: 300, title: "Pick 8: 82.6 average over 300 picks" },
  { key: "9", label: "9", score: 83.4, n: 300, title: "Pick 9: 83.4 average over 300 picks" },
  { key: "10", label: "10", score: 85.0, n: 300, title: "Pick 10: 85.0 average over 300 picks" },
  { key: "11", label: "11", score: 87.3, n: 300, title: "Pick 11: 87.3 average over 300 picks" },
  { key: "12", label: "12", score: 89.9, n: 300, title: "Pick 12: 89.9 average over 300 picks" },
  { key: "13", label: "13", score: 92.6, n: 299, title: "Pick 13: 92.6 average over 299 picks" },
  { key: "14", label: "14", score: 95.8, n: 299, title: "Pick 14: 95.8 average over 299 picks" },
  { key: "15", label: "15", score: 97.4, n: 41, title: "Pick 15: 97.4 average over 41 picks" },
];

// Ten finished drafts, oldest first, the way /stats draws a run of them: no n,
// because every column is forty-five picks by construction, and a set symbol
// instead of a label. The symbols are masked from Scryfall over the network,
// exactly as the live panel loads them, so an offline bay draws empty gutters
// rather than the wrong thing. The hrefs go nowhere here; on /stats each one is
// the way back into that draft.
const DRAFT_RUN: [code: string, score: number, colors: string][] = [
  ["dft", 78.4, "UB"],
  ["tdm", 81.0, "RG"],
  ["fin", 79.6, "WU"],
  ["eoe", 84.2, "BR"],
  ["ecl", 83.1, "WG"],
  ["blb", 86.7, "GU"],
  ["dsk", 85.9, "WB"],
  ["otj", 88.3, "UR"],
  // THE SPLASH IS THE SPECIMEN. Three pips is what pushes a column past the
  // width the value label was measured for, so `needs` has to grow with it -- a
  // run that quietly cropped the third colour would look completely fine.
  ["mkm", 87.4, "WUB"],
  ["lci", 91.2, "RW"],
];

const BY_DRAFT: ScoreColumn[] = DRAFT_RUN.map(([code, score, colors]) => ({
  key: code,
  label: code.toUpperCase(),
  iconUri: `https://svgs.scryfall.io/sets/${code}.svg`,
  score,
  pips: colors,
  href: "#",
  title: `${code.toUpperCase()} ${spokenColors(colors)}: ${score.toFixed(1)}`,
}));

const BY_PICK_SPOKEN =
  "Average score by pick number within a pack — " + BY_PICK.map((c) => c.title).join("; ");

const BY_DRAFT_SPOKEN =
  "Score by draft, oldest first — " + BY_DRAFT.map((c) => c.title).join("; ");


const BRAID_PACK: PoolCard[] = [
  { name: "Spectral Sailor", colors: ["U"] },
  { name: "Bake into a Pie", colors: ["B"] },
  { name: "Shock", colors: ["R"] },
  { name: "Llanowar Elves", colors: ["G"] },
  { name: "Wall of Runes", colors: ["U"] },
];

const braidSide = (i: number, name: string, score: number) => ({
  pickIndex: i,
  packNo: Math.floor(i / 14) + 1,
  pickNo: (i % 14) + 1,
  pack: BRAID_PACK,
  pickedName: name,
  score,
  grade: "B",
});

// Blue-black against green-red ON PURPOSE: G against R is the pair that comes
// out 2.5 apart under deuteranopia once the cords are mixed, and mono-black is
// the one that fails contrast raw. So this fixture is every case the pips exist
// for, at once. Two forks, one stretch of drift, and both sides undecided for
// the first several picks -- which is also the only way to see THREAD, the
// dashed hairline that means "no pair yet".
const BRAID_ROWS: DiffRow[] = Array.from({ length: 42 }, (_, i) => {
  const fork = i === 6 || i === 17;
  const apart = i >= 24 && i <= 29;
  return {
    pickIndex: i,
    packNo: Math.floor(i / 14) + 1,
    pickNo: (i % 14) + 1,
    yours: braidSide(i, fork ? "Spectral Sailor" : "Wall of Runes", 71),
    theirs: braidSide(i, fork || apart ? "Llanowar Elves" : "Wall of Runes", 68),
    samePack: !apart,
    agree: !fork && !apart,
    offShelf: apart,
    yourLean: i < 4 ? "" : i < 8 ? "U" : "UB",
    theirLean: i < 5 ? "" : i < 10 ? "G" : "GR",
  };
});

const BRAID_TALLY: DiffTally = {
  rows: 42,
  agreed: 34,
  apart: 6,
  comparable: 36,
  guaranteedThrough: 23,
  firstDrift: 24,
  yourAverage: 71,
  theirAverage: 68,
  forks: [
    { pickIndex: 6, packNo: 1, pickNo: 7, yours: "Spectral Sailor", theirs: "Llanowar Elves" },
    { pickIndex: 17, packNo: 2, pickNo: 4, yours: "Spectral Sailor", theirs: "Llanowar Elves" },
  ],
};

const TERMS: ValueTerm[] = [
  { label: "archetype", delta: 0.031 },
  { label: "trust", delta: -0.012 },
  { label: "splash", delta: -0.0042 },
];

// `off-color` charges a card its entire win rate, which is the case the track
// was never sized for and the only case the torn end exists to draw.
const TERMS_TORN: ValueTerm[] = [
  { label: "off-color", delta: -0.5 },
  { label: "archetype", delta: 0.018 },
];

// Prideful Parent out of the pick that got photographed: a deck that has barely
// committed yet, so nothing it does to the card is worth a tenth of a point.
// The ordinary case, and the one where the labels do all the work.
const FLAT_TERMS: ValueTerm[] = [
  { label: "archetype", delta: -0.0008 },
  { label: "trust", delta: -0.0005 },
];

export const SPECIMENS: Specimen[] = [
  {
    id: "pick-track",
    title: "Pick track",
    note: "The draft board, both review surfaces and both drills. Hit against miss is the pair that has to survive greyscale",
    renderBare: () => (
      <div className="flex flex-col gap-8">
        <Bay label="A graded run, at the width the review gives it">
          <PickTrack groups={[RUN]} label="A finished review" />
          <TrackKey className="mt-3" entries={TRACK_KEY} />
        </Bay>

        {/* THE BAY THE FIX EXISTS FOR. Hit and miss were success and error at
            the same height, so this bay was two rows of identical grey marks --
            and that is what a red-green reader had in colour. The hollow tick
            has to still be a hollow tick here, and the key beside it has to
            show the same difference the track does. */}
        <Bay label="The same run in greyscale — hue removed">
          <div style={{ filter: "grayscale(1)" }}>
            <PickTrack groups={[RUN]} label="A finished review, in greyscale" />
            <TrackKey className="mt-3" entries={TRACK_KEY} />
          </div>
        </Bay>

        <div className="flex flex-wrap items-start gap-8">
          <Bay label="263px — what a 375px phone leaves" width="w-[263px] shrink-0">
            <PickTrack groups={[RUN]} label="A finished review on a phone" />
          </Bay>
          <Bay label="Mid-draft — nothing graded yet" width="w-[22rem] max-w-full">
            <PickTrack groups={[MID_RUN]} label="A draft in progress" />
          </Bay>
        </div>
      </div>
    ),
  },
  {
    id: "archetype-reveal",
    title: "Archetype quiz reveal",
    note: "Stock Up in SOS — the real case a player could not read, and the same numbers on a sample that would settle it",
    renderBare: () => (
      <div className="flex flex-col gap-8">
        <Bay label="No difference (2.6 against a bar of 2.7)">
          <DeckBands question={STOCK_UP} guess="UG" />
          <Verdict question={STOCK_UP} />
        </Bay>
        <Bay label="Same gaps, tighter samples — now it counts">
          <DeckBands question={STOCK_UP_SEPARATED} guess="UG" />
          <Verdict question={STOCK_UP_SEPARATED} />
        </Bay>
      </div>
    ),
  },
  {
    id: "deck-bands-widths",
    title: "Deck bands at every width",
    note: "The same five decks in the three boxes the app gives them. 263px is the specimen — it is what a 375px phone leaves inside two panels",
    renderBare: () => (
      <div className="flex flex-col gap-8">
        <div className="flex flex-wrap items-start gap-8">
          {/* THE CASE THAT WAS BROKEN. 375px, less the shell's 48 and two
              panels' padding at 32 each. The row was 352px of columns that
              cannot shrink, so the track -- the only part of this that carries
              the argument -- was squeezed to nothing and the games count hung
              ninety pixels off the panel. */}
          <Bay label="263px — what a 375px phone leaves" width="w-[263px] shrink-0">
            <DeckBands question={STOCK_UP} guess="UG" />
            <Verdict question={STOCK_UP} />
          </Bay>
          <Bay label="480px — a phone turned over" width="w-[480px] max-w-full">
            <DeckBands question={STOCK_UP} guess="UG" />
            <Verdict question={STOCK_UP} />
          </Bay>
        </div>

        {/* Under the axis's own minimum, where the ticks would be four numbers
            on top of each other, so the bands say their domain in words
            instead -- which is the whole of what `needs` and `instead` are for.
            The verdict's own mark is fixed at 80px and does not swap: it has no
            axis to lose, which is the argument in `GapMark`. */}
        <Bay label="180px — under the axis's minimum" width="w-[180px] shrink-0">
          <DeckBands question={STOCK_UP} guess="UG" />
          <Verdict question={STOCK_UP} />
        </Bay>

        <Bay label="Full width — the desktop rendering, unchanged">
          <DeckBands question={STOCK_UP} guess="UG" />
        </Bay>
      </div>
    ),
  },
  {
    id: "placard-widths",
    title: "Card placard",
    note: "Deck lists, results, the build board, both sides of a verdict",
    render: ({ card }) => (
      <div className="flex flex-wrap items-start gap-8">
        <Bay label="In a curve well" width="w-44">
          <Well>
            <CardPlacard card={card} />
          </Well>
        </Bay>
        <Bay label="Natural width">
          <CardPlacard card={card} />
        </Bay>
        <Bay label="Told to fill 40rem" width="w-[40rem] max-w-full">
          <div className="flex">
            <CardPlacard card={card} className="min-w-0 flex-1" />
          </div>
        </Bay>
      </div>
    ),
  },
  {
    id: "placard-states",
    title: "Placard states",
    note: "Ghost is a card the other forty plays and yours does not",
    render: ({ card, selected, onSelect }) => (
      <div className="flex flex-wrap items-start gap-8">
        <Bay label="Filled">
          <CardPlacard card={card} />
        </Bay>
        <Bay label="Ghost (on base-100)">
          <Well>
            <CardPlacard card={card} ghost />
          </Well>
        </Bay>
        <Bay label={`Pressable — ${selected ? "moved" : "click it"}`}>
          <CardPlacard
            card={card}
            onClick={onSelect}
            label={`Move ${card.name}`}
            className={selected ? "opacity-50" : ""}
          />
        </Bay>
      </div>
    ),
  },
  {
    id: "placard-list",
    title: "Placard list",
    note: "Every card on the stage, with the builder's win-rate gutter",
    render: ({ cards }) => (
      <Bay label={`${cards.length} card${cards.length === 1 ? "" : "s"}`} width="w-72 max-w-full">
        <CardPlacardList
          cards={cards}
          trailing={(card) => (card.gihWinRate != null ? pct(card.gihWinRate) : "—")}
        />
      </Bay>
    ),
  },
  {
    id: "tile",
    title: "Card tile",
    note: "The pack. Hover for the preview, click to lift, double-click picks",
    render: ({ card, selected, onSelect }) => (
      <div className="flex flex-wrap items-start gap-8">
        <Bay label="In a pack row" width="w-44">
          <CardTile card={card} onPick={onSelect} selected={selected} />
        </Bay>
        <Bay label="Stats forced on" width="w-44">
          <CardTile card={card} onPick={() => {}} showStats />
        </Bay>
        <Bay label="Disabled" width="w-44">
          <CardTile card={card} onPick={() => {}} disabled />
        </Bay>
        <Bay label="Bare face" width="w-44">
          <CardFace card={card} />
        </Bay>
      </div>
    ),
  },
  {
    id: "stats",
    title: "Card stats",
    note: "What the hover preview prints under the art",
    render: ({ card }) =>
      hasStats(card) ? (
        <div className="flex flex-wrap items-start gap-8">
          <Bay label="As the preview draws it" width="w-64">
            <CardStats card={card} />
          </Bay>
          <Bay label="Expanded" width="w-64">
            <CardStats card={card} expanded />
          </Bay>
          {/* Under the win-rate scale's `needs`, so the chart gives way to its
              one-line caption. The bay is here because that is the state the
              block's grouping has to survive too: the row, a sentence, and then
              the rest of the table, with nothing left hanging. */}
          <Bay label="Too narrow for the scale — the caption instead" width="w-[8.5rem]">
            <CardStats card={card} />
          </Bay>
        </div>
      ) : (
        // Not an error: a card with no 17Lands row is exactly what the app has
        // to draw for a bonus sheet card nobody drafted enough of.
        <p className="text-sm text-base-content/60">
          No 17Lands data for this one — the panel renders nothing, which is what the app
          does with it.
        </p>
      ),
  },
  {
    id: "cost",
    title: "Mana cost and pips",
    note: "The cost as the placard, the preview and prose each size it",
    render: ({ card }) => (
      <div className="flex flex-wrap items-start gap-8">
        <Bay label="Placard size (11px)" width="w-44">
          <ManaCost cost={card.manaCost} className="text-[11px]" />
        </Bay>
        <Bay label="Prose size">
          <ManaCost cost={card.manaCost} className="text-base" />
        </Bay>
        <Bay label="With shadow, on a card frame">
          <span className="inline-block rounded bg-[#d9d2c0] px-2 py-1">
            <ManaCost cost={card.manaCost} shadow className="text-[15px] text-[#0d0b06]" />
          </span>
        </Bay>
        <Bay label="Colour identity">
          <ColorPips colors={card.colorIdentity.join("")} />
        </Bay>
      </div>
    ),
  },
  {
    id: "text",
    title: "Rules text",
    note: "The card's own text, and the coach's prose about it",
    render: ({ card, cards }) => (
      <div className="flex flex-wrap items-start gap-8">
        <Bay label={card.typeLine} width="w-[30rem] max-w-full">
          <CardText text={card.oracleText} cards={cards} />
        </Bay>
        {/* The other half of what CardText is for. Oracle text names a card
            rarely; the coach names one in every other sentence, and says
            colours in shorthand while it does -- which is the pair of
            substitutions this component makes and the reason a sentence
            nobody's card carries belongs on the stage. */}
        <Bay label="Coach prose" width="w-[30rem] max-w-full">
          <CardText text={coachSentence(cards)} cards={cards} />
        </Bay>
      </div>
    ),
  },
  {
    id: "piles",
    title: "Curve wells",
    note: "The furniture the results and build boards lay a forty out in",
    render: ({ cards }) => (
      <PileGrid>
        {pileUp(cards, (card) => card).map((pile, i) => (
          <PileWell
            key={PILE_LABELS[i].label}
            label={PILE_LABELS[i].label}
            spoken={PILE_LABELS[i].spoken}
            aside={
              pile.length > 0 ? (
                <span className="text-xs tabular-nums text-base-content/60">{pile.length}</span>
              ) : undefined
            }
          >
            <div className="flex flex-col gap-0.5">
              {pile.map((card, j) => (
                <CardPlacard key={`${card.name}-${j}`} card={card} />
              ))}
            </div>
          </PileWell>
        ))}
      </PileGrid>
    ),
  },
  {
    id: "scroll-box",
    title: "Scroll box",
    note: "Sideboards, the drill's deck rail, the comparison's fork list",
    // THE TWO BAYS ARE THE SPECIMEN. A gallery that renders one comfortable
    // overflowing box shows the lip working and says nothing about the case
    // that was wrong -- a box whose content FITS, drawing a shadow at both ends
    // for content that is not there. Put side by side, the left one must be
    // flat and the right one must have a foot and no head until it is scrolled.
    //
    // Scroll the right one. The head arrives over the first inch of travel and
    // the foot retires over the last, both cut from the scroll position rather
    // than painted on, which is the whole of the fix.
    render: ({ cards }) => (
      <div className="flex flex-wrap items-start gap-8">
        <Bay label="Fits — no lip at either end" width="w-[22rem] max-w-full">
          <ScrollBox maxHeight="max-h-64" label="A list that fits">
            <CardPlacardList cards={cards.slice(0, 3)} />
          </ScrollBox>
        </Bay>
        <Bay label="Overflows — foot only, until scrolled" width="w-[22rem] max-w-full">
          <ScrollBox maxHeight="max-h-64" label="A list that overflows">
            <CardPlacardList cards={[...cards, ...cards, ...cards]} />
          </ScrollBox>
        </Bay>
      </div>
    ),
  },
{
    id: "score-plot",
    title: "Score plot",
    note: "All three panels on /stats — a run of drafts, by pack, by pick",
    // THE THIRD BAY IS THE SPECIMEN. The first two show the plot working; the
    // third is the same fifteen columns at 20rem, which is under `needs`, so it
    // must draw the table and not a squeezed chart. If a fifteen-column plot
    // ever appears in that bay, `needs` has been under-stated and every phone is
    // getting the wrong drawing.
    renderBare: () => (
      <div className="flex flex-col gap-8">
        <Bay label="By pick — fifteen columns, every label with room">
          <ScorePlot columns={BY_PICK} label={BY_PICK_SPOKEN} counting="picks" />
        </Bay>
        <Bay label="A run of drafts — set symbols, no sample size, columns are links">
          <ScorePlot columns={BY_DRAFT} label={BY_DRAFT_SPOKEN} />
        </Bay>
        {/* THE GRADE KEY HAS TO SURVIVE THIS. The dots are painted from the
            grade scale and nothing else, so with the hue gone the only things
            left saying which grade a column landed in are the letter in the key
            and the letter at the end of its threshold line. Ten identical grey
            dots over an unreadable key means the swatch is doing nothing. */}
        <Bay label="The run in greyscale — the key's letters are the second channel">
          <div style={{ filter: "grayscale(1)" }}>
            <ScorePlot columns={BY_DRAFT} label={BY_DRAFT_SPOKEN} />
          </div>
        </Bay>
        <Bay label="The same fifteen at 20rem — under needs, so the table" width="w-[20rem] max-w-full">
          <ScorePlot columns={BY_PICK} label={BY_PICK_SPOKEN} counting="picks" />
        </Bay>
      </div>
    ),
  },
  {
    id: "glossary-figures",
    title: "Glossary figures",
    note: "The page's opening dumbbell and the grade ruler, at full width and at a phone's",
    // NARROW THE WINDOW to check these. The narrow bay gives the figure the
    // 23rem a 375px phone gives it, which is what catches an overflow -- but the
    // layouts inside both figures switch on Tailwind's `sm:`, and that is a
    // VIEWPORT media query, not a container one. The bay cannot trip it. So the
    // stacked forms -- the dumbbell's axis and end labels, which used to vanish
    // below 640px -- only appear once the browser window itself is under 640px.
    renderBare: () => (
      <div className="flex flex-col gap-8">
        <Bay label="Win-rate dumbbell — full width">
          <WinRateAxis />
        </Bay>
        <Bay label="Win-rate dumbbell — a phone's 23rem" width="w-[23rem] max-w-full">
          <WinRateAxis />
        </Bay>
        <Bay label="Grade ruler — full width, F fading past the axis end">
          <GradeRuler />
        </Bay>
        <Bay label="Grade ruler — a phone's 23rem" width="w-[23rem] max-w-full">
          <GradeRuler />
        </Bay>
        <Bay label="Pick strip — full width, the wheel at the seam after pick 8">
          <PickStrip />
        </Bay>
        {/* THE BAY THE KEY EXISTS FOR. The two ends were gold against neutral
            and nothing else, which in greyscale is two marks of the same size
            with no way to tell the SEEING from the TAKING. The ALSA dot has to
            still read as hollow here, and the key beside it has to show the
            same difference. */}
        <Bay label="Pick strip in greyscale — hollow against filled has to survive">
          <div style={{ filter: "grayscale(1)" }}>
            <PickStrip />
          </div>
        </Bay>
      </div>
    ),
  },
  {
    id: "mana-curve-channels",
    title: "Mana curve — colour is never the only channel",
    note: "The draft board's picks column and the misses drill's deck rail. The GREYSCALE bay is the specimen",
    // THE SECOND AND THIRD BAYS ARE THE SPECIMEN, and the first is only there to
    // be compared against.
    //
    // `cardFrame`'s WUBRG rings are Arena's and are not ours to re-pick. Put
    // through a colour-vision check against this app's near-black ground they
    // come back green-against-red 4.8 apart under deuteranopia -- below the
    // floor at which a categorical palette is legal even WITH a second channel
    // -- and colourless-against-green 14.2 apart to NORMAL vision.
    //
    // So the bar carries a letter and the key carries a count, and the
    // greyscale bay is how you check that actually worked: with the hue gone,
    // every band must still be nameable. If it is not, the letters are too
    // small or the key is missing, and no amount of looking at the colour
    // version will tell you.
    render: ({ cards }) => {
      // Drawn the way both real callers draw it: the tally sits in the panel
      // header above the bars, and it IS this chart's key -- the component does
      // not carry one, because a second copy under the bars was the same
      // colours and counts twice in one panel. A bay without it would be
      // testing a screen the app does not have.
      const curve = (
        <div className="flex flex-col gap-2">
          <ColorTally colors={tally(cards, (c) => c.colors)} />
          <ManaCurve cards={cards} />
        </div>
      );

      return (
        <div className="flex flex-wrap items-start gap-8">
          <Bay label="In the picks column (360px)" width="w-[22.5rem]">
            {curve}
          </Bay>
          <Bay label="Greyscale — every band still nameable?" width="w-[22.5rem]">
            <div style={{ filter: "grayscale(1)" }}>{curve}</div>
          </Bay>
          <Bay label="Deuteranopia — green and red are 4.8 apart here" width="w-[22.5rem]">
            <div style={{ filter: "url(#deuter)" }}>{curve}</div>
            <svg width="0" height="0" aria-hidden>
              <filter id="deuter" colorInterpolationFilters="linearRGB">
                <feColorMatrix
                  type="matrix"
                  values="0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0"
                />
              </filter>
            </svg>
          </Bay>
        </div>
      );
    },
  },
  {
    id: "progress-panel",
    title: "Coming back to them",
    note: "The /stats progress panel through the three states it has",
    // ALL THREE STATES, because two of them are the ones nobody has data for
    // yet and are therefore the ones that ship unlooked-at. A panel that has
    // only ever been seen full is a panel whose empty branch is a guess.
    //
    // The middle bay is the state this feature spends its first weeks in: the
    // drill leads with what you have never answered, so a run of them all lands
    // here and the headline it is built for cannot be computed. If that bay
    // ever reads like a failure, the ranking is being blamed for working.
    renderBare: () => (
      <div className="flex flex-col gap-8">
        <Bay label="Nothing answered yet — the drill has never been played">
          <ProgressPanel
            progress={{
              asked: 0,
              fixed: 0,
              askedAgain: 0,
              tookBack: 0,
              heldOn: 0,
              slipped: 0,
              stillWrong: 0,
              answers: 0,
              since: undefined,
            }}
          />
        </Bay>
        <Bay label="Answered, none twice — where this sits for the first few weeks">
          <ProgressPanel
            progress={{
              asked: 14,
              fixed: 6,
              askedAgain: 0,
              tookBack: 0,
              heldOn: 0,
              slipped: 0,
              stillWrong: 0,
              answers: 14,
              since: "2026-08-14T19:02:11.000Z",
            }}
          />
        </Bay>
        <Bay label="A real history — the four counts sum to the headline's denominator">
          <ProgressPanel
            progress={{
              asked: 34,
              fixed: 21,
              askedAgain: 12,
              tookBack: 7,
              heldOn: 3,
              slipped: 1,
              stillWrong: 1,
              answers: 47,
              since: "2026-06-02T18:40:00.000Z",
            }}
          />
        </Bay>
        <Bay label="263px — what a 375px phone leaves" width="w-[263px] shrink-0">
          <ProgressPanel
            progress={{
              asked: 34,
              fixed: 21,
              askedAgain: 12,
              tookBack: 7,
              heldOn: 3,
              slipped: 1,
              stillWrong: 1,
              answers: 47,
              since: "2026-06-02T18:40:00.000Z",
            }}
          />
        </Bay>
      </div>
    ),
  },
  {
    id: "score-breakdown-widths",
    title: "Score breakdown at every width",
    note: "188px is the specimen — it is what the 300px coach rail leaves once the panel's padding and the grade column are taken out",
    // THE BAY THAT SHOULD HAVE EXISTED BEFORE THIS SHIPPED. This component was
    // imported into this file and never drawn in it, which is the whole of how
    // a 28px label column reached a live draft: every place it was looked at
    // was comfortable, and the one place it lives is not.
    //
    // 188px is not a phone. It is the DESKTOP rendering -- `DraftBoard`'s
    // `wide:` grid gives the coach a 300px rail, the panel's padding takes 32
    // and the grade beside the breakdown takes 80. A component whose narrowest
    // box is on the widest screen is a component that width bays are the only
    // way to catch.
    renderBare: () => (
      <div className="flex flex-col gap-8">
        <div className="flex flex-wrap items-start gap-8">
          <Bay
            label="188px — the coach rail, where this was unreadable"
            width="w-[188px] shrink-0"
          >
            <ScoreBreakdown base={0.586} total={0.6008} terms={TERMS} />
          </Bay>
          <Bay
            label="288px — the first width the row fits on one line"
            width="w-[288px] shrink-0"
          >
            <ScoreBreakdown base={0.586} total={0.6008} terms={TERMS} />
          </Bay>
          <Bay label="Review column — room to spare" width="w-[420px] max-w-full">
            <ScoreBreakdown base={0.586} total={0.6008} terms={TERMS} />
          </Bay>
        </div>

        {/* THE PICK IN THE SCREENSHOT. Both terms are a tenth of a point, so
            both bars are a pixel and a half against a rule -- which is the
            fixed scale telling the truth, not failing: this deck did almost
            nothing to this card, and a per-pick scale would have drawn the same
            nothing as a full-width bar. What has to be legible here is the
            LABELS, because they are carrying the entire row. */}
        <Bay label="188px — the real pick, where every term is near zero" width="w-[188px] shrink-0">
          <ScoreBreakdown base={0.586} total={0.585} terms={FLAT_TERMS} />
        </Bay>

        {/* The clamped case, at the width it is hardest to draw in. `off-color`
            charges a card its entire win rate, so this bar runs off an 8pp
            track and has to say so with a torn end and a third key entry --
            which is a legend that gets taller exactly where there is least room
            for one. */}
        <Bay label="188px, with a term that runs off the track" width="w-[188px] shrink-0">
          <ScoreBreakdown base={0.554} total={0.072} terms={TERMS_TORN} />
        </Bay>

        {/* Both branches that draw no bars at all. Empty is the ordinary answer
            at P1P1, where commitment is zero and zeroes every colour term. */}
        <div className="flex flex-wrap items-start gap-8">
          <Bay label="P1P1 — nothing adjusted it" width="w-[188px] shrink-0">
            <ScoreBreakdown base={0.586} total={0.586} terms={[]} />
          </Bay>
          <Bay label="A pick from before the score kept its working" width="w-[188px] shrink-0">
            <ScoreBreakdown base={0.586} total={0.586} terms={undefined} />
          </Bay>
        </div>
      </div>
    ),
  },
  {
    id: "reasoning-in-panel",
    title: "A player's reason, inside a panel",
    note: "The one thing on either screen a person wrote — at a short reason and at the cap the field allows",
    // THE SPECIMEN THAT EXISTS TO CATCH A PRODUCTION BUG, and the reason it is
    // here rather than on the screens that ship it. Reasoning renders a
    // <figure>, and it appears inside a Panel on the review walkthrough, the
    // review breakdown and the challenge diff -- all behind auth, where a
    // browser test cannot reach. daisyUI ships `.card figure { display:flex;
    // align-items:center; justify-content:center }` as a DESCENDANT rule for a
    // card's cover image. Panel WAS a `.card` until this specimen's own commit,
    // and Reasoning declares flex and flex-col but no align-items -- so the
    // center won uncontested and its quote and attribution shrink-to-fit and
    // centered instead of filling the width under their own pl-3 rail.
    //
    // Both lengths, because the defect reads differently at each: the field is
    // capped at REASON_LIMIT (packages/core/src/tutor/challenge.ts), imported
    // here rather than retyped so the specimen cannot outlive the cap, and
    // a long reason wraps and fills its box while a short one collapses to its
    // own width and floats. Measuring only one would have recorded the wrong
    // answer for how bad this is.
    renderBare: () => (
      <div className="flex flex-col gap-6">
        <Bay label="A short reason — where this used to collapse to 13% of the width">
          <Reasoning reason="Wheeled, so I took it." attribution={<span>You said</span>} />
        </Bay>
        <Bay
          label={`At ${LONG_REASON.length} characters against a ${REASON_LIMIT} cap — long enough to wrap, where the caption still floated free of its rail`}
        >
          <Reasoning
            reason={LONG_REASON}
            attribution={<span>You said</span>}
          />
        </Bay>
      </div>
    ),
  },
  {
    id: "gap-mark",
    title: "The gap, and whether the data can see it",
    note: "The mark in the verdict's eyebrow, at the two readings it has — and at the sizes that made the first version read as a toggle switch",
    // THE READING IS BINARY AND THE PICTURE HAS TO BE TOO: the interval reaches
    // the zero rule or it does not. Both cases side by side is the only way to
    // check that, because either one alone looks fine.
    renderBare: () => (
      <div className="flex flex-col gap-8">
        <Bay label="A gap the data can see — 2.3pp against a bar of 0.6">
          <GapMark gap={-0.023} margin={0.006} />
        </Bay>
        <Bay label="Inside the margin — 0.3pp against a bar of 1.1">
          <GapMark gap={-0.003} margin={0.011} />
        </Bay>
        <Bay label="Barely clears it — the case the mark exists for">
          <GapMark gap={-0.012} margin={0.011} />
        </Bay>
        <Bay label="Unrated card — no margin, so nothing is drawn">
          <GapMark gap={-0.023} margin={undefined} />
        </Bay>
      </div>
    ),
  },
  {
    id: "habits",
    title: "How you draft",
    note: "The two dials that survived three phases of measuring, at every state the panel has — at a phone's width, and below the width where the track stops being true",
    // NUMBERS OFF THE REAL RUNS. `fit-drafter` says one dial clears at about
    // five drafts and the other at about ten, so the interesting states are the
    // ones in between: a panel that only ever gets checked with both dials
    // called is a panel whose empty state nobody has read.
    //
    // The narrow bay is the whole point of putting it here. Every row is a mark
    // and a sentence side by side, and the sentence is the part that wraps -- at
    // 375px the flex row breaks and the mark ends up alone above its own
    // caption, which is fine, and is the sort of thing only a bay this width
    // says out loud.
    renderBare: () => (
      <div className="flex flex-col gap-8">
        <Bay label="Both dials clear their margin — twelve drafts">
          <Habits habits={habitsFixture("both")} />
        </Bay>
        <Bay label="Committing shows, signals do not yet — six drafts">
          <Habits habits={habitsFixture("one")} />
        </Bay>
        <Bay label="Nothing clears yet — two drafts, which is what most people have">
          <Habits habits={habitsFixture("quiet")} />
        </Bay>
        <Bay label="Half the history is in sets nobody has measured">
          <Habits habits={habitsFixture("newSet")} />
        </Bay>
        <Bay label="At the narrowest the app gives it" width="w-[375px] shrink-0">
          <Habits habits={habitsFixture("both")} />
        </Bay>
        {/* Under the axis `Plot`'s `needs`, so the scale is replaced by the values
            as a list. Here because a fallback nobody has looked at is a fallback
            that renders clipped, empty or wrong on the first phone that meets
            it -- which is the whole reason this page exists. */}
        <Bay label="Below the width where the axis stops fitting" width="w-[260px] shrink-0">
          <Habits habits={habitsFixture("both")} />
        </Bay>
      </div>
    ),
  },
];
