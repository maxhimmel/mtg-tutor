import { CARD_STAT_GLOSSARY } from "@mtg-tutor/core";

// The opening figure: two real cards from the committed TDM artifact whose GIH
// WR is identical to a rounding error, and whose IWD is not.
//
// A dumbbell rather than bars, because the subject is the GAP and not either
// endpoint -- on a shared axis the connector's length IS the IWD, so the reader
// measures nothing. It also lets the punchline land visually: the right-hand
// dots line up, the left-hand ones do not.
//
// One saturated colour, per the theme's own rule. The two ends are not peer
// categories -- one is a baseline and one is a result -- so the baseline dot is
// neutral and recessive, and identity comes from position and a direct label
// rather than from hue. Every value is labelled, which is why there is no
// legend and no tooltip: there is nothing a hover could add.

interface Row {
  card: string;
  without: number;
  with_: number;
  iwd: string;
}

// Fixed numbers, not a query: this is an illustration that must keep saying the
// same thing, and the live set document is re-ingested. Verified against
// packages/backend/data/tdm.TradDraft.json.
const ROWS: Row[] = [
  { card: "Dragonstorm Globe", without: 57.1, with_: 62.4, iwd: "+5.3pp" },
  { card: "Frontline Rush", without: 62.1, with_: 62.2, iwd: "+0.2pp" },
];

// The axis, held wide enough that neither dot touches an edge.
const MIN = 56;
const MAX = 64;
const TICKS = [57, 59, 61, 63];
// Rounded because these land in inline styles, where full float noise
// ("13.750000000000018%") is just something to trip over when reading the DOM.
const at = (v: number) => Math.round(((v - MIN) / (MAX - MIN)) * 1e4) / 100;

const iwdLabel = CARD_STAT_GLOSSARY.find((s) => s.id === "iwd")?.label ?? "IWD";

const LABEL = "text-[0.6875rem] font-semibold uppercase tracking-[0.14em]";

function Lollipop({ row, index }: { row: Row; index: number }) {
  const a = at(row.without);
  const b = at(row.with_);
  // Staggered so the two rows read as a comparison being made, not two things
  // happening at once.
  const delay = `${index * 220}ms`;

  return (
    <div className="grid grid-cols-[1fr] gap-1 sm:grid-cols-[minmax(0,11rem)_1fr_4.5rem] sm:items-center sm:gap-4">
      <div className="font-display text-base leading-tight text-base-content sm:text-right">
        {row.card}
      </div>

      <div className="relative h-11 sm:h-9">
        {/* Hairline the dots sit on, so a near-zero gap still reads as a
            position on a scale rather than a stray dot. */}
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-base-content/10" />

        <div
          className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-primary motion-safe:animate-gap"
          style={{ left: `${a}%`, width: `${b - a}%`, animationDelay: delay }}
        />

        {/* ring-2 in the surface colour keeps the two dots legible where they
            almost coincide -- which is the entire point of the second row. */}
        <span
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-base-content/45 ring-2 ring-base-200"
          style={{ left: `${a}%` }}
        />
        <span
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-base-200 motion-safe:animate-verdict"
          style={{ left: `${b}%`, animationDelay: `calc(${delay} + 380ms)` }}
        />

        <span
          className="absolute top-0 -translate-x-1/2 text-[0.6875rem] tabular-nums text-base-content/55"
          style={{ left: `${a}%` }}
        >
          {row.without.toFixed(1)}
        </span>
        <span
          className="absolute bottom-0 -translate-x-1/2 text-[0.6875rem] font-semibold tabular-nums text-primary"
          style={{ left: `${b}%` }}
        >
          {row.with_.toFixed(1)}
        </span>
      </div>

      <div className="text-sm font-semibold tabular-nums text-primary">{row.iwd}</div>
    </div>
  );
}

export function Dumbbell() {
  return (
    <figure className="rounded-box border border-base-content/15 bg-base-200 p-5 sm:p-7">
      <figcaption className="max-w-xl">
        <h2 className="font-display text-2xl font-semibold leading-tight tracking-tight">
          Two cards with the same win rate. Only one is doing the work.
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-base-content/70">
          Decks that drew <strong className="font-semibold text-base-content">Dragonstorm Globe</strong> won
          62.4% of those games. Decks that drew{" "}
          <strong className="font-semibold text-base-content">Frontline Rush</strong> won 62.2%. By the
          headline number they are the same card.
        </p>
      </figcaption>

      <div className="mt-7 flex flex-col gap-5 sm:gap-3">
        {/* Not the `eyebrow` utility: these need their own colour, and both it
            and an override would be text-* utilities in the same Tailwind layer,
            so which one won would come down to sort order. */}
        <div className="hidden grid-cols-[minmax(0,11rem)_1fr_4.5rem] gap-4 sm:grid">
          <span />
          <div className={`flex justify-between ${LABEL}`}>
            <span className="text-base-content/55">Won without drawing it</span>
            <span className="text-primary/75">Won after drawing it</span>
          </div>
          <span className={`${LABEL} text-base-content/55`}>{iwdLabel}</span>
        </div>

        {ROWS.map((row, i) => (
          <Lollipop key={row.card} row={row} index={i} />
        ))}

        {/* The axis has to sit in the same three columns as the rows, or it
            measures the label gutter as well as the plot. */}
        <div className="hidden grid-cols-[minmax(0,11rem)_1fr_4.5rem] gap-4 sm:grid">
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

      <p className="mt-8 max-w-xl border-l-2 border-primary pl-4 leading-relaxed">
        Now look at the games those same decks played{" "}
        <em className="not-italic text-primary">without</em> ever drawing the card. Globe&apos;s decks
        won 57.1%. Rush&apos;s won 62.1% — they were winning just as often with it stuck in the
        library. That gap is {iwdLabel}, and it is the difference between a card that wins games
        and a card along for the ride.
      </p>
    </figure>
  );
}
