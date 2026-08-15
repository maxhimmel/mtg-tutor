"use client";

import { Fragment } from "react";
import { parseManaCost } from "@mtg-tutor/core";
import { manaText } from "../lib/format";

// The class names the Mana font actually ships. Scryfall prints hybrids in the
// same canonical order the font uses ({W/U}, never {U/W}), so lowercasing and
// dropping the slash is the whole mapping -- but an unrecognised symbol would
// render as an empty box, so anything not in here falls back to its text.
const SYMBOLS = new Set([
  ...Array.from({ length: 21 }, (_, i) => String(i)),
  "x",
  "y",
  "z",
  "w",
  "u",
  "b",
  "r",
  "g",
  "c",
  "s",
  "e",
  "p",
  "half",
  "infinity",
  "wu",
  "wb",
  "ub",
  "ur",
  "br",
  "bg",
  "rg",
  "rw",
  "gw",
  "gu",
  "cw",
  "cu",
  "cb",
  "cr",
  "cg",
  "wp",
  "up",
  "bp",
  "rp",
  "gp",
  "wup",
  "wbp",
  "ubp",
  "urp",
  "brp",
  "bgp",
  "rgp",
  "rwp",
  "gwp",
  "gup",
  "2w",
  "2u",
  "2b",
  "2r",
  "2g",
]);

const codeFor = (symbol: string): string | undefined => {
  const code = symbol.toLowerCase().replace(/\//g, "");
  return SYMBOLS.has(code) ? code : undefined;
};

export function ManaCost({
  cost,
  shadow,
  className,
}: {
  cost?: string;
  // The drop shadow the symbols are printed with. Right on a card frame, too
  // heavy in a plain row of text.
  shadow?: boolean;
  className?: string;
}) {
  // A two-in-one card carries both halves in the one cost string -- Picklock
  // Prankster's is "{1}{U} // {1}{U}" -- and running them together prints four
  // pips, which reads as a four-mana card rather than two two-mana halves. The
  // divider is printed for the same reason it is printed on the card.
  const halves = (cost ?? "")
    .split("//")
    .map(parseManaCost)
    .filter((h) => h.length > 0);
  if (halves.length === 0) return null;

  return (
    // A flex row rather than a run of inline pips, so that a cost too wide for
    // the space it is given wraps instead of running out of it. Adjacent inline
    // elements carry no whitespace between them and so offer the browser nowhere
    // to break: Progenitus' ten pips left a deck-list row with no line to wrap
    // onto, and simply drew themselves past the edge of the frame.
    //
    // The pips are printed touching, which reads as one wide shape at a glance --
    // {1}{W}{W} and {3}{W} take about the same room and the difference between
    // them is the whole point. A hair of air between them is enough to count
    // them, and in em so it stays a hair at the 2xl the card frames print these
    // at. It is the container's gap now rather than a margin on each pip, because
    // a margin survives the wrap and indents the second row.
    //
    // Right-aligned because every caller prints this at the end of a line, so a
    // short second row belongs under the end of the first.
    <span
      className={`inline-flex flex-wrap items-center justify-end gap-x-[0.14em] align-middle ${className ?? ""}`}
      role="img"
      aria-label={`Mana cost ${manaText(cost)}`}
    >
      {halves.map((symbols, half) => (
        <Fragment key={half}>
          {half > 0 && (
            <span aria-hidden="true" className="px-0.5 font-mono text-[0.85em] opacity-60">
              //
            </span>
          )}
          {symbols.map((symbol, i) => {
            const code = codeFor(symbol);
            return code ? (
              <i
                key={i}
                className={`ms ms-${code} ms-cost${shadow ? " ms-shadow" : ""}`}
                aria-hidden="true"
              />
            ) : (
              <span key={i} className="font-mono text-xs" aria-hidden="true">
                {symbol}
              </span>
            );
          })}
        </Fragment>
      ))}
    </span>
  );
}
