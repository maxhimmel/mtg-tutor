"use client";

import { type CSSProperties, useRef, useState } from "react";
import { useMutation } from "convex/react";
import {
  type Bench,
  type Card,
  type DeckPick,
  DECK,
  applyBench,
  buildDeck,
  deckPiles,
  deckSizeNote,
  isLandCount,
  isLegalDeck,
  tally,
} from "@mtg-tutor/core";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import { pct } from "../lib/format";
import { deckShaped } from "../lib/analytics";
import { INK, NEUTRAL } from "../charts/ink";
import { Key } from "../charts/Key";
import { CardPlacard } from "./CardPlacard";
import { type CursorTip, useCursorTip } from "./CursorTip";
import { ColorTally } from "./ColorPips";
import { CurveBar, LANDS_PILE, PILE_LABELS, PileGrid, PileWell, pileUp } from "./CurvePiles";
import { Panel } from "./Panel";

/**
 * Forty slots, drawn as forty cards.
 *
 * A Limited deck is exactly forty cards and the whole of building one is
 * counting down to that, so the count is this screen's instrument rather than a
 * number in a corner. Discrete marks rather than a progress bar, because the
 * question is how many slots are LEFT -- and the split between spells and lands
 * then comes for free in the same picture.
 *
 * The deck turns gold the moment it is a legal forty, in the light this app
 * already uses for the card you are holding. It is the same statement -- this is
 * the live thing -- and it means you can stop counting without reading a number.
 */
function DeckSlots({ spells, lands, size }: { spells: number; lands: number; size: number }) {
  const full = size === DECK.size;
  // Gold once the forty is legal, and only then. The rest of the time the marks
  // are the app's plain ink -- see ink.ts on why gold is not a colour a chart
  // gets to spend on a category.
  const ink = full ? INK.yours : INK.value;

  // IT STAYS A GRID OF DIVS. There is no continuous scale here to hand visx:
  // forty slots is forty, the marks are discrete and countable on purpose, and
  // the layout question -- twenty per row, at a card's aspect ratio, wrapping
  // to two -- is one CSS grid does exactly and an SVG would have to be told.
  // The rule the kit is actually enforcing is the one below, and it is met.
  //
  // Three marks, three FORMS, because two tints of one colour at eight pixels
  // is not a categorical split and spells-against-lands is half of what this
  // drawing promises. A spell is a solid card, a land is the same card hollow,
  // and a slot with nothing in it is a short dash that could not be mistaken
  // for either. The land count agreeing with the stepper two elements along is
  // the point rather than a duplication: it is how you check that the picture
  // and the number are describing the same deck.
  //
  // The three survive greyscale, which is the test that matters here and the
  // one the drawing was built to pass: filled, outlined and a third-height dash
  // differ in FORM, so desaturating the page takes nothing away. There is no
  // hue on this graphic to lose -- both live marks are the same ink, and the
  // gold is a state of the whole forty rather than a category within it.
  const FORMS = {
    spell: { background: ink },
    land: { border: `1px solid ${ink}` },
    open: { background: NEUTRAL.rule, borderRadius: "1px", transform: "scaleY(0.3)" },
  } satisfies Record<string, CSSProperties>;

  const mark = (i: number) =>
    i < spells ? FORMS.spell : i < spells + lands ? FORMS.land : FORMS.open;

  // Forty slots, a stated number of them still open. It is the reading the
  // graphic is FOR -- how many left -- and until now the one mark on it the key
  // did not name.
  const empty = DECK.size - size;

  return (
    <div className="flex w-[13rem] shrink-0 flex-col gap-2">
      <div
        role="img"
        aria-label={`${size} of ${DECK.size} cards: ${spells} spells, ${lands} lands`}
        className="grid grid-cols-[repeat(20,minmax(0,1fr))] gap-[2px]"
      >
        {Array.from({ length: DECK.size }, (_, i) => (
          <span
            key={i}
            aria-hidden
            className="card-aspect rounded-[1px] motion-safe:transition-colors"
            style={mark(i)}
          />
        ))}
      </div>

      {/* `swatch` on every entry, because the default chip is a pill and every
          mark on this graphic is a CARD -- forty slots drawn at a card's aspect
          ratio, which is the whole conceit. A key in a shape the drawing never
          uses asks the reader to match a rounded bar to a little rectangle, and
          the empty slot has no bar to match at all. Handing each entry the same
          span the grid draws, painted out of the same `FORMS` the grid itself
          is painted from, means the key cannot describe a mark the board is not
          drawing. */}
      <Key
        entries={[
          { label: "Spells", ink, shape: "bar", aside: spells, swatch: <SlotMark style={FORMS.spell} /> },
          {
            label: "Lands",
            ink,
            shape: "hollow",
            aside: lands,
            swatch: <SlotMark style={FORMS.land} />,
          },
          ...(empty > 0
            ? [
                {
                  label: "Still open",
                  ink: NEUTRAL.rule,
                  aside: empty,
                  swatch: <SlotMark style={FORMS.open} />,
                },
              ]
            : []),
        ]}
        className="gap-x-4"
      />
    </div>
  );
}

// One slot from the grid above, at the size a key entry has room for. Sized in
// px rather than by the grid's own column width, which is a fraction of a
// 13rem row and would come out three pixels wide beside a label.
function SlotMark({ style }: { style: CSSProperties }) {
  return (
    <span
      aria-hidden
      className="card-aspect block w-[9px] shrink-0 rounded-[1px]"
      style={style}
    />
  );
}

/**
 * The forty, built by the person who drafted it.
 *
 * The cards are the same maindeck/sideboard split the draft screen has been
 * writing since pick one, edited through the same `bench` mutation -- so
 * finishing a draft does not start a second deck somewhere else. The land count
 * is the only thing this screen adds, because it is the only part of a forty
 * that is not a pick.
 *
 * Laid out in the curve wells the results board uses, and that is the whole of
 * this screen's second draft. It was two panels side by side -- Playing and Cut
 * -- each wrapping its cards into as many natural-width columns as it fit. Both
 * lists were in curve order and both were read ACROSS then down, so a one-drop
 * sat beside a five-drop on every row and the order looked like no order at all.
 * A deck is laid out in piles by mana cost on every table and in every client,
 * and this app already draws that picture one click later.
 *
 * So the piles are the instrument here too, and the cut cards sit under a rule
 * inside the pile they came from rather than in a panel of their own. The
 * question being answered at a well is "what have I got at three mana" -- the
 * cards you are playing, and directly beneath them the ones you are not. A
 * separate column could not answer it without you holding two places at once.
 *
 * The curve is a bar in each well's header rather than a chart above the board.
 * It used to be the pile heights themselves, and that was not true here: the
 * cards you have CUT are pinned to the floor of the well they came from, so a
 * well with two playing and six cut has the mass of an eight-card column while
 * the number in its header reads two. The shape and the number were answering
 * different questions. `CurveBar` counts what the header counts, which leaves
 * the cards underneath free to be the argument they are -- the cut ones under a
 * dashed rule, outside the bar and visibly so.
 */
export function DeckBuilder({
  sessionId,
  setCode,
  format,
  pool,
  sideboard,
  onBuilt,
}: {
  sessionId: Id<"draftSessions">;
  // Carried only so `deck_shaped` can stand on its own rather than needing a
  // join against `draft_started` to say which format was being built for.
  setCode: string;
  format: string;
  pool: Card[];
  sideboard: Bench[];
  onBuilt: () => void;
}) {
  // One hook for the whole board rather than one per row: `follow` is a factory
  // for exactly this, and twenty-three rows are twenty-three hooks otherwise.
  const tip = useCursorTip();
  const bench = useMutation(api.draft.bench);
  const lockIn = useMutation(api.draft.build);
  const [pending, setPending] = useState<Bench[] | null>(null);
  // The convention, offered as the thing to disagree with rather than as the
  // answer -- nothing we have ingested says what a winning deck really runs.
  const [basicLands, setBasicLands] = useState(DECK.size - DECK.spellCount);
  const [locking, setLocking] = useState(false);

  // Optimistic, because moving a card between two piles should feel like moving
  // a card and not like asking a server whether it may be moved. Reconciled with
  // what the mutation returns, and dropped back to the query's copy on failure.
  const current = pending ?? sideboard;

  // Counted rather than derived from the final split, because the two are not
  // the same number: cutting a card and putting it back is two presses and no
  // difference, and "did anybody work at this" is a question about the presses.
  const worked = useRef({ cuts: 0, plays: 0, landSteps: 0 });

  const move = async (pickIndex: number, cut: boolean) => {
    if (cut) worked.current.cuts++;
    else worked.current.plays++;
    setPending(applyBench(current, pickIndex, cut, pool.length));
    try {
      setPending(await bench({ sessionId, pickIndex, benched: cut }));
    } catch {
      setPending(null);
    }
  };

  const { maindeck: playing, sideboard: cut } = deckPiles(pool, current);

  const deck = buildDeck(
    playing.map((p) => p.card),
    basicLands,
  );
  const lands = deck.nonbasicLands.length + deck.basicLands;
  const shortfall = deckSizeNote(deck);
  const colors = tally(deck.spells, (c) => c.colors);

  const playingPiles = pileUp(playing, (p) => p.card);
  const cutPiles = pileUp(cut, (p) => p.card);

  // The right-hand end of every curve bar on the board. Spell wells only: see
  // CurveBar on why seventeen lands are not a point on a mana curve.
  const most = Math.max(...playingPiles.slice(0, LANDS_PILE).map((p) => p.length));

  const rates = winRateSpan(pool);

  return (
    <>
      <Panel
        title="Your deck"
        aside={
          // The one place in the chrome that carries Magic's colours, earned here
          // for the reason it is earned during the draft: which colours the deck
          // is in is the question this panel answers.
          <ColorTally colors={colors} />
        }
        bodyClassName="gap-3"
      >
        {/* The one instruction the board needs, and it earns its line: a placard
            has never been pressable anywhere else in the app. */}
        <p className="text-sm text-base-content/60">
          Press a card to move it between the deck and the sideboard. Forty-five went into the
          pool and forty come out.
        </p>

        {/* The scale the gutter is drawn against, said in words because it is
            the reader's own pool and changes every draft. Without it the bar
            under each win rate is a length with no domain, which is the same
            complaint the numbers alone had. */}
        {rates && (
          <p className="text-xs text-base-content/55">
            Win rates run {pct(rates.lo)} to {pct(rates.hi)} across your pool. The bar under each
            is where that card sits between them.
          </p>
        )}

        <PileGrid gutter>
          {PILE_LABELS.map((pile, i) => (
            <PileWell
              key={pile.label}
              label={pile.label}
              spoken={pile.spoken}
              mv={pile.mv}
              andUp={pile.andUp}
              aside={
                <span
                  className="text-xs tabular-nums"
                  style={{ color: playingPiles[i].length === 0 ? NEUTRAL.quiet : INK.value }}
                >
                  {playingPiles[i].length}
                  <span className="sr-only"> playing</span>
                </span>
              }
              bar={
                i === LANDS_PILE ? undefined : (
                  <CurveBar count={playingPiles[i].length} most={most} />
                )
              }
            >
              {playingPiles[i].length > 0 && (
                <ul className="flex flex-col gap-0.5">
                  {playingPiles[i].map((pick) => (
                    <BuildRow
                      key={pick.pos}
                      pick={pick}
                      cut={false}
                      rates={rates}
                      onMove={move}
                      follow={tip.follow}
                    />
                  ))}
                </ul>
              )}

              {i === LANDS_PILE && basicLands > 0 && (
                <p className="text-xs tabular-nums text-base-content/45">
                  + {basicLands} basic{basicLands === 1 ? "" : "s"}
                </p>
              )}

              {/* The cut cards and the rule naming them, as ONE box on the floor
                  of the well.

                  Both parts matter. `mt-auto` puts it on the floor because the
                  wells are grid items stretched to the tallest, so a rule that
                  simply follows the last card you are playing sits at a different
                  height in all seven columns -- seven dashed lines at seven
                  heights, none of which is a boundary you can run an eye along.
                  On the floor they read as one line across the board, and the
                  slack falls in the middle where it says something true: there is
                  room at this cost.

                  The wrapper is what makes the rule stay ON the cards. As two
                  loose children of the well they were two flex items, and an auto
                  margin on the first of them is a rule the layout is free to
                  honour by moving one and not the other -- which is exactly what
                  it did, stranding the label at the top with its cards at the
                  bottom. One box cannot come apart. */}
              {cutPiles[i].length > 0 && (
                <div className="mt-auto flex flex-col gap-1.5">
                  {/* Dashed, because the cards under it are drawn with a dashed
                      plate and mean the same thing there: not in your forty. */}
                  <p className="eyebrow border-t border-dashed border-base-300 pt-1.5 text-base-content/35">
                    Cut
                  </p>
                  <ul className="flex flex-col gap-0.5">
                    {cutPiles[i].map((pick) => (
                      <BuildRow
                        key={pick.pos}
                        pick={pick}
                        cut
                        rates={rates}
                        onMove={move}
                        follow={tip.follow}
                      />
                    ))}
                  </ul>
                </div>
              )}
            </PileWell>
          ))}
        </PileGrid>
      </Panel>

      {/* Where the draft screen puts its confirm bar, because it is the same
          kind of thing: the deck as it stands, and the one action on it. */}
      <div className="sticky bottom-4 z-20 mt-4 flex justify-center">
        <div className="popup-surface flex flex-wrap items-center justify-center gap-x-5 gap-y-3 px-4 py-3">
          <DeckSlots spells={deck.spells.length} lands={lands} size={deck.size} />

          <span className="flex items-baseline gap-1.5">
            <span
              className={`font-display text-2xl font-semibold leading-none tabular-nums ${
                shortfall === null ? "text-primary" : ""
              }`}
            >
              {deck.size}
            </span>
            <span className="text-sm tabular-nums text-base-content/45">/{DECK.size}</span>
            {shortfall && <span className="text-xs text-base-content/60">{shortfall}</span>}
          </span>

          <LandStepper
            value={basicLands}
            drafted={deck.nonbasicLands.length}
            onChange={(n) => {
              worked.current.landSteps++;
              setBasicLands(n);
            }}
          />

          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!isLegalDeck(deck) || locking}
            onClick={async () => {
              setLocking(true);
              try {
                await lockIn({ sessionId, basicLands });
                // After the write, so a forty that never made it to the server
                // is not reported as one somebody built.
                const { cuts, plays, landSteps } = worked.current;
                deckShaped({
                  sessionId,
                  setCode,
                  format,
                  moves: cuts + plays,
                  cuts,
                  plays,
                  landSteps,
                  basicLands,
                  benched: cut.length,
                });
                onBuilt();
              } finally {
                setLocking(false);
              }
            }}
          >
            {locking ? "Locking in…" : "Lock in your deck"}
          </button>
        </div>
      </div>

      {/* Outside both boxes: it follows the pointer and belongs to neither the
          panel nor the confirm bar. */}
      {tip.node}
    </>
  );
}

/**
 * The win rates in this pool, lowest and highest, as the scale the gutter is
 * drawn against.
 *
 * The pool rather than the set, because the pool is what the browser is holding
 * -- forty-five cards with their win rates already on them -- and because it is
 * the honest denominator for the question being asked. Nobody at this screen is
 * deciding whether a card is good in the abstract; they are deciding which
 * twenty-two of the cards IN FRONT OF THEM to cut, and "the worst card you
 * drafted" is an end of the scale that means something to that decision.
 *
 * Null when there is nothing to span. One rated card, or a pool where every
 * rated card posts the same rate, gives a scale with no width, and a bar drawn
 * on it would put every card at either end.
 */
function winRateSpan(pool: readonly Card[]): Rates | null {
  const rates = pool.map((c) => c.gihWinRate).filter((r): r is number => r != null);
  if (rates.length === 0) return null;
  const lo = Math.min(...rates);
  const hi = Math.max(...rates);
  if (hi <= lo) return null;

  // Best first, so a rank is a position in this array and the tip can say it
  // without re-sorting per row. Ties take the better rank -- two cards on the
  // same rate are the same card as far as this decision goes, and numbering
  // one of them below the other would be an ordering the data does not have.
  const ranked = rates.slice().sort((a, b) => b - a);
  return {
    lo,
    hi,
    rated: ranked.length,
    rankOf: (rate) => ranked.findIndex((r) => r <= rate) + 1,
  };
}

interface Rates {
  lo: number;
  hi: number;
  /** How many cards in the pool 17Lands has a rate for. The tip's denominator. */
  rated: number;
  /** Where a rate places among them, best first and 1-based. */
  rankOf: (rate: number) => number;
}

/**
 * One card in a well, and the win rate you are weighing it on.
 *
 * The number rides in a gutter beside the placard rather than inside it, which is
 * the rule everywhere placards are listed: a placard is exactly the name and cost
 * the printed card carries. It survived the move to piles because THIS screen is
 * where it earns its place -- the results board can drop it, since by then the
 * argument is the suggestion rather than a column of percentages, but cutting
 * twenty-two cards without them is guesswork.
 *
 * A COLUMN OF FIVE-CHARACTER STRINGS IS NOT A COMPARISON. Ranking "56.3" against
 * "58.1" against "54.9" down a well is arithmetic the reader was left to do, on
 * the exact decision the screen exists for, and it got harder the more cards
 * there were to cut. The bar under each number is that arithmetic done: one
 * scale for the whole board, stated above it, so a card sitting near the bottom
 * of your own pool is visible as a short bar rather than as a number you have to
 * hold three others beside.
 */
function BuildRow({
  pick,
  cut,
  rates,
  onMove,
  follow,
}: {
  pick: DeckPick<Card>;
  cut: boolean;
  rates: Rates | null;
  onMove: (pos: number, cut: boolean) => void;
  follow: CursorTip["follow"];
}) {
  const wr = pick.card.gihWinRate;
  const at = rates && wr != null ? (wr - rates.lo) / (rates.hi - rates.lo) : null;

  // WHAT THE BAR IS, SAID AT THE CURSOR. The gutter is a POSITION on a scale --
  // the one case `useCursorTip` is for -- and the position is what the digits
  // beside it cannot state: "56.3%" is a rate, and where that rate falls among
  // the forty-five cards in front of you is the thing a cut is decided on. The
  // rank is the same arithmetic the bar's length already does, printed. The
  // scale it is measured on is stated in prose above the board, which is this
  // chart's legend; the rate itself is printed in the gutter, which is why the
  // hover is allowed to be the longer form rather than the only form.
  //
  // Null for an unrated card, which hides the box: there is no bar under a
  // basic land and nothing a pointer could be asking about.
  const say = () =>
    rates && wr != null
      ? `${pick.card.name}: ${pct(wr)} — #${rates.rankOf(wr)} of ${rates.rated} rated cards in your pool, which run ${pct(rates.lo)} to ${pct(rates.hi)}.`
      : null;

  return (
    <li className="flex items-center gap-1.5">
      <CardPlacard
        card={pick.card}
        ghost={cut}
        // Named for the pile the card lands in, which is the rule the draft
        // screen's confirm bar already works to.
        label={cut ? `Play ${pick.card.name}` : `Cut ${pick.card.name}`}
        onClick={() => onMove(pick.pos, !cut)}
        className="min-w-0 flex-1"
      />
      {/* A fixed width, and the reason is the basic lands. 17Lands rates nothing
          you are handed for free, so `pct` renders an em dash for them -- one
          character against the five of "56.3%" -- and with the gutter sized to
          its content the placard beside it took the difference and grew. A well
          of cards where the unrated ones are visibly longer than the rest reads
          as a rendering fault, which it was. Wide enough for "100.0%", right
          aligned so the decimal points line up down the well.

          The bar is a background rather than a second element, and that is what
          makes it affordable: twenty-three rows each three pixels taller is a
          board that has grown by most of a placard. Painted as a gradient under
          the digits it costs no layout at all -- which is also why it did not
          go to visx. `scaleLinear` would compute the same fraction a percentage
          stop already is, and drawing it would cost forty-five SVGs and a
          measurement each, to put a three-pixel rule where a background is
          already free.

          Full ink on both states. The cut cards used to render at /25 -- around
          2:1 against this ground -- which put the faintest number on the screen
          on exactly the card you are deciding whether to bring back. The placard
          beside it already says which pile it is in. */}
      <span
        {...follow(say)}
        className="w-10 shrink-0 pb-[4px] text-right text-[11px] tabular-nums"
        style={{
          color: INK.value,
          ...(at != null && {
            backgroundImage: `linear-gradient(to right, ${INK.value} 0 ${at * 100}%, ${
              NEUTRAL.rule
            } ${at * 100}% 100%)`,
            backgroundSize: "100% 3px",
            backgroundPosition: "left bottom",
            backgroundRepeat: "no-repeat",
          }),
        }}
      >
        {pct(wr)}
      </span>
    </li>
  );
}

// Basics are not picks, so there is nothing in the pool to move -- you are
// handed as many as you want. The stepper is the whole of that decision, and it
// reads out total lands rather than basics because that is the number a deck is
// described by.
function LandStepper({
  value,
  drafted,
  onChange,
}: {
  value: number;
  drafted: number;
  onChange: (n: number) => void;
}) {
  return (
    <span className="flex items-center gap-2">
      <span className="text-sm tabular-nums text-base-content/70">
        {value + drafted} land{value + drafted === 1 ? "" : "s"}
        {drafted > 0 && <span className="text-base-content/45"> ({drafted} drafted)</span>}
      </span>
      <span className="join">
        <button
          type="button"
          className="btn btn-xs join-item"
          disabled={!isLandCount(value - 1)}
          onClick={() => onChange(value - 1)}
          aria-label="One fewer basic land"
        >
          −
        </button>
        <button
          type="button"
          className="btn btn-xs join-item"
          disabled={!isLandCount(value + 1)}
          onClick={() => onChange(value + 1)}
          aria-label="One more basic land"
        >
          +
        </button>
      </span>
    </span>
  );
}
