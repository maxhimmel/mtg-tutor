"use client";

import type { ReactNode } from "react";
import type { Card } from "@mtg-tutor/core";
import { CardPlacard, CardPlacardList } from "../components/CardPlacard";
import { CardFace, CardTile } from "../components/CardTile";
import { CardStats, hasStats } from "../components/CardStats";
import { CardText } from "../components/CardText";
import { ColorPips } from "../components/ColorPips";
import { ManaCost } from "../components/ManaCost";
import { PILE_LABELS, PileGrid, PileWell, pileUp } from "../components/CurvePiles";
import { ScrollBox } from "../components/ScrollBox";
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
  render: (props: SpecimenProps) => ReactNode;
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

export const SPECIMENS: Specimen[] = [
  {
    id: "archetype-reveal",
    title: "Archetype quiz reveal",
    note: "Stock Up in SOS — the real case a player could not read, and the same numbers on a sample that would settle it",
    render: () => (
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
];
