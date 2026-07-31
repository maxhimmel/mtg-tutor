import { Figure, Term, FIG_LABEL } from "./Figure";

// ATA and ALSA are the only pair on the panel where neither number means much
// alone and the DISTANCE between them means everything. So they are drawn the
// way a draft actually works: a pack of fourteen, one slot per pick, and a span
// from where the field first sees a card to where somebody finally takes it.
//
// The dashed rule is the whole reason that distance matters. Eight players pass
// in a circle, so the pack you send away on your first pick is the pack that
// reaches you again on your ninth -- and a card whose span crosses that line is
// a card you can pass and still expect to get back. "The wheel" is the field's
// own word for it, which is why the marker needs no other label.
//
// Deliberately NOT numbered 1 to 14. The stored figures are 17Lands' raw
// pick_number, which counts a fresh pack as pick 0 -- see build-set-stats, where
// a fresh pack is detected as pick_number === "0" -- and the hover panel prints
// them raw. Numbering the slots here would either contradict the panel or assert
// an index this page has no business asserting, so the strip is labelled by its
// ends and the marks carry the app's own numbers.

interface Row {
  card: string;
  seen: number;
  taken: number;
}

// Verified against packages/backend/data/tdm.TradDraft.json -- alsa and ata.
const ROWS: Row[] = [
  { card: "Marang River Regent", seen: 0.47, taken: 0.45 },
  { card: "Highspire Bell-Ringer", seen: 5.33, taken: 10.95 },
];

const PACK = 14;
const SEATS = 8;

const round = (v: number) => Math.round(v * 1e4) / 100;
// Slot centres, so a mark sits inside a pick rather than on the seam between two.
const at = (pick: number) => round((pick + 0.5) / PACK);
// The seam itself, which is where the wheel belongs: it is the moment between
// two picks, not a pick of its own.
const seam = (pick: number) => round(pick / PACK);

// A card taken the instant it is seen can post an ATA a hundredth BELOW its
// ALSA -- the Regent does -- which as a raw subtraction is a negative width the
// browser discards, leaving a full-bleed bar across the track. Floored at zero,
// so "no span at all" draws as no span at all, which is what it means.
const span = (from: number, to: number) => Math.max(0, round((to - from) / PACK));

const COLUMNS = "sm:grid-cols-[minmax(0,11rem)_1fr]";

function Wheel() {
  return (
    <div
      className="absolute inset-y-1 w-px border-l border-dashed border-base-content/25"
      style={{ left: `${seam(SEATS)}%` }}
    />
  );
}

export function PickStrip() {
  return (
    <Figure
      title="One of these comes back to you. The other never leaves the table."
      lede={
        <>
          A pack is fourteen cards passed around eight players. The neutral dot is the pick the
          field first sees a card at; the gold dot is the pick somebody finally takes it at. What
          is worth reading is the distance between them.
        </>
      }
      coda={
        <>
          Eight seats means the pack you pass on your first pick is the one that reaches you again
          on your ninth. The Bell-Ringer&apos;s span crosses that line, so you can take something
          else now and still expect it back. The Regent has no span at all — it is gone the moment
          anyone sees it. That is what <Term id="pick-order" /> is for, and neither number claims the
          Bell-Ringer is the worse card. Only that it is the cheaper one to wait for.
        </>
      }
    >
      <div className="flex flex-col gap-6 sm:gap-4">
        <div className={`grid gap-1 sm:gap-4 ${COLUMNS}`}>
          <span className="hidden sm:block" />
          <div className="relative">
            <div className={`flex justify-between ${FIG_LABEL} text-base-content/55`}>
              <span>First pick</span>
              <span>Last card</span>
            </div>
            {/* The pack drawn at its own resolution: fourteen slots, so the axis
                has a unit and the spans below are read in picks. */}
            <div className="relative mt-2 h-2">
              {Array.from({ length: PACK }, (_, i) => (
                <span
                  key={i}
                  className="absolute inset-y-0 w-px -translate-x-1/2 bg-base-content/15"
                  style={{ left: `${at(i)}%` }}
                />
              ))}
            </div>
          </div>
        </div>

        {ROWS.map((row) => (
          <div key={row.card} className={`grid grid-cols-[1fr] gap-1 ${COLUMNS} sm:items-center sm:gap-4`}>
            <div className="sm:text-right">
              <p className="font-display text-base leading-tight text-base-content">{row.card}</p>
              <p className="mt-0.5 text-xs leading-snug text-base-content/50">
                seen <span className="tabular-nums">{row.seen.toFixed(1)}</span> · taken{" "}
                <span className="tabular-nums">{row.taken.toFixed(1)}</span>
              </p>
            </div>

            <div className="relative h-9">
              <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-base-content/10" />
              <Wheel />
              <div
                className="absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-primary"
                style={{ left: `${at(row.seen)}%`, width: `${span(row.seen, row.taken)}%` }}
              />
              <span
                className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-base-content/45 ring-2 ring-base-200"
                style={{ left: `${at(row.seen)}%` }}
              />
              <span
                className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary ring-2 ring-base-200"
                style={{ left: `${at(row.taken)}%` }}
              />
            </div>
          </div>
        ))}

        {/* Named once, under the rule it belongs to, rather than repeated in
            every row. */}
        <div className={`grid gap-1 sm:gap-4 ${COLUMNS}`}>
          <span className="hidden sm:block" />
          <div className="relative h-4">
            <span
              className={`absolute top-0 -translate-x-1/2 whitespace-nowrap ${FIG_LABEL} text-base-content/45`}
              style={{ left: `${seam(SEATS)}%` }}
            >
              The wheel
            </span>
          </div>
        </div>
      </div>
    </Figure>
  );
}
