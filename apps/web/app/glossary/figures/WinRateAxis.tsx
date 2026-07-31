import { CARD_STAT_GLOSSARY } from "@mtg-tutor/core";
import { FIG_LABEL, Figure, Term } from "./Figure";

// The page's opening figure and its thesis: three of the numbers a player is
// shown about a card are positions on ONE axis, and a fourth is the distance
// between two of them. Taught spatially, before any definition, because the
// relationship between them is the hard part -- not the words.
//
// A dumbbell rather than bars, because the subject is the GAP and not either
// endpoint: on a shared axis the connector's length IS the IWD, so the reader
// measures nothing. It also lets the punchline land visually -- the gold dots
// line up, the neutral ones do not.
//
// GP WR is a caliper tick across the connector rather than a third dot. It is a
// different KIND of quantity -- both halves of the split averaged back together,
// over a different denominator -- and it must not compete with the dumbbell it
// sits inside. The reader should notice it second, and notice that it can only
// ever land between the two ends, which is the entire case against it.
//
// The ends are not peer categories, one being a baseline and one a result, so
// the baseline is neutral and identity comes from position and a direct label
// rather than from hue. Every value is labelled, which is why there is no legend
// and no tooltip: there is nothing a hover could add.

interface Row {
  card: string;
  without: number;
  inDeck: number;
  drawn: number;
  iwd: string;
}

// Fixed numbers, not a query: this is an illustration that has to keep saying
// the same thing, and the live set document is re-ingested. Verified against
// packages/backend/data/tdm.TradDraft.json -- gndWr, deckWr, gihWr, iwd.
const ROWS: Row[] = [
  { card: "Dragonstorm Globe", without: 57.1, inDeck: 59.9, drawn: 62.4, iwd: "+5.3pp" },
  { card: "Frontline Rush", without: 62.1, inDeck: 62.1, drawn: 62.2, iwd: "+0.2pp" },
];

// The axis, held wide enough that neither dot touches an edge.
const MIN = 56;
const MAX = 64;
const TICKS = [57, 59, 61, 63];
// Rounded because these land in inline styles, where full float noise
// ("13.750000000000018%") is just something to trip over when reading the DOM.
const round = (v: number) => Math.round(v * 1e4) / 100;
const at = (v: number) => round((v - MIN) / (MAX - MIN));
// Rounded in its own right: subtracting two already-rounded percentages can put
// the noise straight back.
const span = (from: number, to: number) => round((to - from) / (MAX - MIN));

const iwdLabel = CARD_STAT_GLOSSARY.find((s) => s.id === "iwd")?.label ?? "IWD";

// Three values can land on one x -- that is exactly what the second row does --
// so each gets a lane of its own rather than a collision rule. The lanes are
// assigned by meaning: the baseline above the line, the headline below it, and
// the mixture in a quiet third lane at the bottom. When all three coincide they
// stack into a tidy column, which reads correctly as "there is nothing here".
const AXIS_Y = "1.75rem";
// Both spellings are written out, rather than one derived from the other,
// because Tailwind generates a class only when it finds that exact string in the
// source -- a `.replace("sm:", "")` produces a name no stylesheet contains.
const COLUMNS = "sm:grid-cols-[minmax(0,11rem)_1fr_4.5rem]";
const HEADER_COLUMNS = "grid-cols-[minmax(0,11rem)_1fr_4.5rem]";

function AxisRow({ row, index }: { row: Row; index: number }) {
  const a = at(row.without);
  const b = at(row.inDeck);
  const c = at(row.drawn);
  // Staggered so the two rows read as a comparison being made, not as two things
  // happening at once.
  const delay = `${index * 220}ms`;

  return (
    <div className={`grid grid-cols-[1fr] gap-1 ${COLUMNS} sm:items-center sm:gap-4`}>
      <div className="font-display text-base leading-tight text-base-content sm:text-right">
        {row.card}
      </div>

      <div className="relative h-[4.75rem]">
        {/* The hairline the marks sit on, so a near-zero gap still reads as a
            position on a scale rather than a stray dot. */}
        <div
          className="absolute inset-x-0 h-px -translate-y-1/2 bg-base-content/10"
          style={{ top: AXIS_Y }}
        />

        <div
          className="absolute h-[3px] -translate-y-1/2 rounded-full bg-primary motion-safe:animate-gap"
          style={{
            top: AXIS_Y,
            left: `${a}%`,
            width: `${span(row.without, row.drawn)}%`,
            animationDelay: delay,
          }}
        />

        {/* Drawn before the dots so they paint over it where all three coincide. */}
        <span
          className="absolute h-4 w-px -translate-x-1/2 -translate-y-1/2 bg-base-content/50"
          style={{ top: AXIS_Y, left: `${b}%` }}
        />

        {/* ring-2 in the surface colour keeps the marks legible where they almost
            coincide -- which is the entire point of the second row. */}
        <span
          className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-base-content/45 ring-2 ring-base-200"
          style={{ top: AXIS_Y, left: `${a}%` }}
        />
        <span
          className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-base-200 motion-safe:animate-verdict"
          style={{ top: AXIS_Y, left: `${c}%`, animationDelay: `calc(${delay} + 380ms)` }}
        />

        <span
          className="absolute top-0 -translate-x-1/2 text-[0.6875rem] tabular-nums text-base-content/55"
          style={{ left: `${a}%` }}
        >
          <span className="sr-only">Won without drawing it: </span>
          {row.without.toFixed(1)}
        </span>
        <span
          className="absolute top-[2.4rem] -translate-x-1/2 text-[0.6875rem] font-semibold tabular-nums text-primary"
          style={{ left: `${c}%` }}
        >
          <span className="sr-only">Won after drawing it: </span>
          {row.drawn.toFixed(1)}
        </span>
        {/* Self-labelling, because it is the only mark whose lane has no header
            of its own -- and naming it here is what stops the third number
            reading as a stray tick. */}
        <span
          className="absolute top-[3.5rem] -translate-x-1/2 whitespace-nowrap text-[0.625rem] tabular-nums text-base-content/45"
          style={{ left: `${b}%` }}
        >
          GP WR {row.inDeck.toFixed(1)}
        </span>
      </div>

      <div className="text-sm font-semibold tabular-nums text-primary">
        <span className="sr-only">{iwdLabel}: </span>
        {row.iwd}
      </div>
    </div>
  );
}

export function WinRateAxis() {
  return (
    <Figure
      headingLevel="h2"
      title="Two cards with the same win rate. Only one is doing the work."
      lede={
        <>
          Decks that drew{" "}
          <strong className="font-semibold text-base-content">Dragonstorm Globe</strong> won 62.4% of
          those games. Decks that drew{" "}
          <strong className="font-semibold text-base-content">Frontline Rush</strong> won 62.2%. By
          the headline number they are the same card.
        </>
      }
      coda={
        <>
          Now look at the games those same decks played{" "}
          <em className="not-italic text-primary">without</em> ever drawing the card. Globe&apos;s
          decks won 57.1%. Rush&apos;s won 62.1% — they were winning just as often with it stuck in
          the library. That gap is <Term id="iwd" />, and it is the difference between a card that
          wins games and a card along for the ride. The tick between the two ends is{" "}
          <Term id="gpwr" />: every game the card was in the deck, drawn or not, which is the two
          halves averaged back together. It can only ever land between them, and it can never tell
          you which half it came from.
        </>
      }
    >
      <div className="flex flex-col gap-5 sm:gap-3">
        <div className={`hidden gap-4 sm:grid ${HEADER_COLUMNS}`}>
          <span />
          <div className={`flex justify-between ${FIG_LABEL}`}>
            <span className="text-base-content/55">Won without drawing it</span>
            <span className="text-primary/75">Won after drawing it</span>
          </div>
          <span className={`${FIG_LABEL} text-base-content/55`}>{iwdLabel}</span>
        </div>

        {ROWS.map((row, i) => (
          <AxisRow key={row.card} row={row} index={i} />
        ))}

        {/* The axis has to sit in the same three columns as the rows, or it
            measures the label gutter as well as the plot. */}
        <div className={`hidden gap-4 sm:grid ${HEADER_COLUMNS}`}>
          <span />
          <div className="relative h-5">
            <div className="absolute inset-x-0 top-0 h-px bg-base-content/10" />
            {TICKS.map((t) => (
              <span
                key={t}
                className="absolute top-1.5 -translate-x-1/2 text-[0.625rem] tabular-nums text-base-content/40"
                style={{ left: `${at(t)}%` }}
              >
                {t}%
              </span>
            ))}
          </div>
          <span />
        </div>
      </div>
    </Figure>
  );
}
