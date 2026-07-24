"use client";

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

export function ManaCost({ cost, className }: { cost?: string; className?: string }) {
  const symbols = parseManaCost(cost);
  if (symbols.length === 0) return null;

  return (
    <span className={className} role="img" aria-label={`Mana cost ${manaText(cost)}`}>
      {symbols.map((symbol, i) => {
        const code = codeFor(symbol);
        return code ? (
          <i key={i} className={`ms ms-${code} ms-cost`} aria-hidden="true" />
        ) : (
          <span key={i} className="font-mono text-xs" aria-hidden="true">
            {symbol}
          </span>
        );
      })}
    </span>
  );
}
