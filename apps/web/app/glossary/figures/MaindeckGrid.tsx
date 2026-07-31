import { FIG_LABEL, Figure, Term } from "./Figure";

// Maindeck rate is the only number on the hover panel that is not about the
// card, so it gets the only figure that is not a position on an axis. It is
// about the SAMPLE the numbers above it were measured on, and a sample is
// something you count.
//
// Hence a hundred dots: the denominator drawn at its own size, so "measured on a
// self-selected sample" stops being a statistical phrase and becomes sixty-one
// hollow dots you can see. Bars would have shown the same ratio and let the
// reader off the counting.
//
// The pairing repeats the opening figure's method on purpose -- two cards with
// the same headline win rate, one difference that decides whether to believe it.
// That repetition is the page's spine: the headline number is never enough.

interface Card {
  name: string;
  takers: string;
  maindeck: number;
  gih: string;
}

// Fixed, like every number in these figures. Verified against
// packages/backend/data/tdm.TradDraft.json -- taken, maindeckRate, gihWr.
const CARDS: Card[] = [
  { name: "Dragonstorm Forecaster", takers: "1,690 drafters took it", maindeck: 39, gih: "61.6%" },
  { name: "Stormplain Detainment", takers: "2,961 drafters took it", maindeck: 86, gih: "61.7%" },
];

const DOTS = 100;

function Hundred({ filled, label }: { filled: number; label: string }) {
  return (
    <div role="img" aria-label={label} className="grid w-fit grid-cols-10 gap-1.5">
      {Array.from({ length: DOTS }, (_, i) => (
        <span
          key={i}
          className={`size-2 rounded-full ${i < filled ? "bg-primary" : "bg-base-content/15"}`}
        />
      ))}
    </div>
  );
}

function Stat({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div>
      <p className={`${FIG_LABEL} text-base-content/50`}>{label}</p>
      <p
        className={`font-display text-xl leading-none tabular-nums ${gold ? "text-primary" : "text-base-content"}`}
      >
        {value}
      </p>
    </div>
  );
}

export function MaindeckGrid() {
  return (
    <Figure
      title="Sixty-one of these drafters cut the card they just took."
      lede={
        <>
          Both of these cards won about 61.6% of the games they were drawn in. Each grid is a
          hundred of the drafters who took one — gold if it made their deck.
        </>
      }
      coda={
        <>
          The Forecaster&apos;s 61.6% was measured on the gold dots only: the games played by the
          drafters who, having taken it, still thought it was worth a slot. The hollow ones took it
          and then knew better. <Term id="maindeck" /> is what tells you which kind of sample you are
          looking at — and taken early, rarely maindecked is the signature of a trap.
        </>
      }
    >
      <div className="grid gap-8 sm:grid-cols-2 sm:gap-6">
        {CARDS.map((card) => (
          <div key={card.name}>
            <h4 className="font-display text-base leading-tight text-base-content">{card.name}</h4>
            <p className="mt-0.5 text-xs text-base-content/50">{card.takers}</p>

            <div className="mt-4">
              <Hundred
                filled={card.maindeck}
                label={`${card.maindeck} of every 100 drafters who took ${card.name} played it`}
              />
            </div>

            <div className="mt-4 flex gap-8">
              <Stat label="Maindecked" value={`${card.maindeck}%`} gold />
              <Stat label="GIH WR" value={card.gih} />
            </div>
          </div>
        ))}
      </div>
    </Figure>
  );
}
