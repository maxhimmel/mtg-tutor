"use client";

import { useCallback, useEffect, useState } from "react";
import { PageShell } from "../components/PageShell";
import { PageHeading } from "../components/PageHeading";
import { PickTrack, type Tick } from "../components/PickTrack";
import { TableTerms } from "../draft/[sessionId]/TableTerms";

// A throwaway. Nothing here is imported by the app and nothing in the app is
// changed by it -- every variant below is a private copy, so PickTrack itself
// stays exactly as it shipped until one of these wins. Delete the whole
// track-lab directory (and its line in middleware.ts) once it has.

const PACKS = 3;
const PACK_SIZE = 14;
const TOTAL = PACKS * PACK_SIZE;

type State = "past" | "current" | "ahead";

const stateAt = (index: number, at: number): State =>
  index < at ? "past" : index === at ? "current" : "ahead";

const TONE: Record<State, string> = {
  past: "bg-base-content/65",
  current: "bg-primary tick-lit",
  ahead: "bg-base-content/10",
};

const HEIGHT: Record<State, string> = {
  past: "h-0.5",
  current: "h-1.5",
  ahead: "h-0.5",
};

function packOf(at: number) {
  return Math.min(PACKS - 1, Math.floor(at / PACK_SIZE));
}

// ---------------------------------------------------------------------------
// 1. What shipped, for comparison. The real component, called the way the board
//    calls it.
// ---------------------------------------------------------------------------
function AsShipped({ at }: { at: number }) {
  const groups: Tick[][] = Array.from({ length: PACKS }, (_, p) =>
    Array.from({ length: PACK_SIZE }, (_, i) => ({
      state: stateAt(p * PACK_SIZE + i, at),
      label: `Pack ${p + 1}, pick ${i + 1}`,
    })),
  );
  return <PickTrack groups={groups} label="As shipped" />;
}

// ---------------------------------------------------------------------------
// 2 & 3. Weighted lanes. The pack you are in takes most of the width; the other
//    two bundle. Ticks in the open lane end up about three times wider, which is
//    the whole point -- the current pick becomes one of fourteen instead of one
//    of forty-two.
// ---------------------------------------------------------------------------
function WeightedLanes({ at, animate }: { at: number; animate: boolean }) {
  const here = packOf(at);
  return (
    <div className="flex items-end gap-3" role="img" aria-label="Weighted lanes">
      {Array.from({ length: PACKS }, (_, p) => {
        const open = p === here;
        return (
          <div
            key={p}
            className={`flex basis-0 items-end ${open ? "gap-[3px]" : "gap-px"}`}
            style={{
              flexGrow: open ? 7 : 1.5,
              transition: animate ? "flex-grow 520ms cubic-bezier(.22,1,.36,1)" : undefined,
            }}
          >
            {Array.from({ length: PACK_SIZE }, (_, i) => {
              const s = stateAt(p * PACK_SIZE + i, at);
              return (
                <span
                  key={i}
                  className={`w-full flex-1 rounded-full ${TONE[s]} ${HEIGHT[s]}`}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4. The accordion, closest to what you described. Packs you are not in draw as
//    a card mark -- filled when spent, outline when untouched -- and the open
//    one sits in a container that gives it an edge. This is the only variant
//    that spends height the track does not currently have.
// ---------------------------------------------------------------------------
function PackMark({ spent }: { spent: boolean }) {
  return (
    <span
      aria-hidden
      className={`h-5 w-3.5 shrink-0 rounded-[3px] border ${
        spent ? "border-base-content/45 bg-base-content/45" : "border-base-content/25"
      }`}
    />
  );
}

function Accordion({ at }: { at: number }) {
  const here = packOf(at);
  return (
    <div className="flex items-center gap-2.5" role="img" aria-label="Accordion">
      {Array.from({ length: PACKS }, (_, p) =>
        p === here ? (
          <div
            key={p}
            className="flex flex-1 items-end gap-[3px] rounded-md border border-base-300 bg-base-200/60 px-2.5 py-2"
          >
            {Array.from({ length: PACK_SIZE }, (_, i) => {
              const s = stateAt(p * PACK_SIZE + i, at);
              return (
                <span key={i} className={`flex-1 rounded-full ${TONE[s]} ${HEIGHT[s]}`} />
              );
            })}
          </div>
        ) : (
          <PackMark key={p} spent={p < here} />
        ),
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5. Only the pack you are in. The most minimal of the lot: fourteen ticks at
//    roughly 70px each, and a counter for the thing the other two packs were
//    telling you.
// ---------------------------------------------------------------------------
function CurrentPackOnly({ at }: { at: number }) {
  const here = packOf(at);
  return (
    <div className="flex items-center gap-4" role="img" aria-label="Current pack only">
      <div className="flex flex-1 items-end gap-1.5">
        {Array.from({ length: PACK_SIZE }, (_, i) => {
          const s = stateAt(here * PACK_SIZE + i, at);
          return <span key={i} className={`flex-1 rounded-full ${TONE[s]} ${HEIGHT[s]}`} />;
        })}
      </div>
      <span className="eyebrow shrink-0 tabular-nums">
        Pack {here + 1} of {PACKS}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6. The pack empties, which is what a real one does. Cards you have taken
//    collapse out of the row and the rest spread into the space, so the run
//    shortens as the pack does rather than filling up behind you.
// ---------------------------------------------------------------------------
function PackEmpties({ at }: { at: number }) {
  const here = packOf(at);
  return (
    <div className="flex items-center gap-4" role="img" aria-label="The pack empties">
      <div className="flex flex-1 items-end gap-1.5">
        {Array.from({ length: PACK_SIZE }, (_, i) => {
          const s = stateAt(here * PACK_SIZE + i, at);
          const taken = s === "past";
          return (
            <span
              key={i}
              className={`rounded-full ${s === "current" ? "bg-primary tick-lit h-2" : "bg-base-content/25 h-1"}`}
              style={{
                flexGrow: taken ? 0 : 1,
                flexBasis: 0,
                opacity: taken ? 0 : 1,
                transition: "flex-grow 420ms cubic-bezier(.22,1,.36,1), opacity 260ms linear",
              }}
            />
          );
        })}
      </div>
      <span className="flex shrink-0 items-center gap-1.5">
        {Array.from({ length: PACKS }, (_, p) => (
          <PackMark key={p} spent={p < here} />
        ))}
      </span>
    </div>
  );
}

const VARIANTS = [
  { name: "As shipped", note: "Uniform hairline, tone fill, halo on the current pick.", render: (at: number) => <AsShipped at={at} /> },
  { name: "Weighted lanes — animated", note: "Open lane takes 7/10 of the width. Lanes travel at the pack break.", render: (at: number) => <WeightedLanes at={at} animate /> },
  { name: "Weighted lanes — no animation", note: "Same at rest. Lanes snap instead of travelling.", render: (at: number) => <WeightedLanes at={at} animate={false} /> },
  { name: "Accordion with card marks", note: "Your idea. Costs height the track does not currently spend.", render: (at: number) => <Accordion at={at} /> },
  { name: "Only the pack you're in", note: "Fourteen ticks, no whole-draft shape except the counter.", render: (at: number) => <CurrentPackOnly at={at} /> },
  { name: "The pack empties", note: "Taken cards collapse out; the rest spread into the gap.", render: (at: number) => <PackEmpties at={at} /> },
];

export function TrackLab() {
  const [variant, setVariant] = useState(0);
  const [at, setAt] = useState(4);
  const [playing, setPlaying] = useState(false);
  const [all, setAll] = useState(false);

  const step = useCallback((by: number) => {
    setAt((prev) => (prev + by + TOTAL) % TOTAL);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => step(1), 700);
    return () => clearInterval(id);
  }, [playing, step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowRight") step(1);
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === " ") {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (/^[1-6]$/.test(e.key)) setVariant(Number(e.key) - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [step]);

  const here = packOf(at);
  const pickNo = (at % PACK_SIZE) + 1;
  const v = VARIANTS[variant]!;

  return (
    <PageShell>
      {(all ? VARIANTS : [v]).map((variantToDraw, i) => (
        <div key={variantToDraw.name} className={i > 0 ? "mt-10" : ""}>
          <p className="eyebrow mb-2">
            {all ? `${i + 1}. ` : `${variant + 1} of ${VARIANTS.length} — `}
            {variantToDraw.name}
          </p>
          <PageHeading
            title="Bloomburrow"
            controls={
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {!all && <TableTerms />}
                <span className="text-sm font-semibold tracking-[0.08em] tabular-nums text-base-content/70">
                  P{here + 1}P{pickNo}
                </span>
              </div>
            }
          >
            {variantToDraw.render(at)}
          </PageHeading>
          <p className="-mt-2 mb-6 text-xs text-base-content/50">{variantToDraw.note}</p>
        </div>
      ))}

      <div className="popup-surface sticky bottom-4 z-40 mt-10 flex flex-wrap items-center gap-x-4 gap-y-3 p-3">
        <span className="flex items-center gap-2">
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={() => setVariant((n) => (n - 1 + VARIANTS.length) % VARIANTS.length)}
          >
            ‹ variant
          </button>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={() => setVariant((n) => (n + 1) % VARIANTS.length)}
          >
            variant ›
          </button>
        </span>

        <span className="flex flex-1 items-center gap-3">
          <button
            type="button"
            className={`btn btn-sm ${playing ? "btn-primary" : "btn-outline"}`}
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? "pause" : "play the draft"}
          </button>
          <input
            type="range"
            min={0}
            max={TOTAL - 1}
            value={at}
            onChange={(e) => setAt(Number(e.target.value))}
            className="range range-xs range-primary min-w-40 flex-1"
            aria-label="Pick"
          />
          <span className="w-16 shrink-0 text-xs tabular-nums text-base-content/60">
            {at + 1} / {TOTAL}
          </span>
        </span>

        <span className="flex items-center gap-2">
          {/* The pack break is the moment every animated variant is really
              being judged on, so it is one button rather than a hunt on the
              slider. */}
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={() => setAt(PACK_SIZE - 1)}
          >
            to P1P14
          </button>
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input
              type="checkbox"
              className="toggle toggle-xs toggle-primary"
              checked={all}
              onChange={(e) => setAll(e.target.checked)}
            />
            all at once
          </label>
        </span>

        <span className="w-full text-xs text-base-content/45">
          ← → step a pick · space plays · 1-6 jumps to a variant
        </span>
      </div>
    </PageShell>
  );
}
