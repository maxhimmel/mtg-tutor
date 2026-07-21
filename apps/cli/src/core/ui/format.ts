import pc from "picocolors";
import type { Card } from "@mtg-tutor/core";

export const pct = (v?: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

const COLOR_FN: Record<string, (s: string) => string> = {
  W: (s) => pc.yellow(s),
  U: (s) => pc.blue(s),
  B: (s) => pc.magenta(s),
  R: (s) => pc.red(s),
  G: (s) => pc.green(s),
};

export function colorSwatch(colors: string[]): string {
  if (colors.length === 0) return pc.gray("◇");
  return colors.map((c) => (COLOR_FN[c] ?? ((s: string) => s))("●")).join("");
}

export function rarityTag(rarity: string): string {
  const map: Record<string, string> = {
    common: pc.gray("C"),
    uncommon: pc.cyan("U"),
    rare: pc.yellow("R"),
    mythic: pc.red("M"),
  };
  return map[rarity] ?? pc.gray(rarity[0]?.toUpperCase() ?? "?");
}

export function gradeColor(grade: string): string {
  if (grade.startsWith("A")) return pc.green(grade);
  if (grade.startsWith("B")) return pc.cyan(grade);
  if (grade.startsWith("C")) return pc.yellow(grade);
  return pc.red(grade);
}

// Render a mana cost like "{2}{U}{U}" into compact colored pips.
export function renderManaCost(cost: string): string {
  const tokens = cost.match(/\{[^}]+\}/g);
  if (!tokens) return "";
  return tokens
    .map((t) => {
      const s = t.slice(1, -1);
      if (/^[WUBRG]$/.test(s)) return COLOR_FN[s](s);
      if (/^[0-9]+$/.test(s) || /^[XYZ]$/.test(s)) return pc.dim(s);
      return pc.dim(s); // hybrid/phyrexian/{T} etc. shown readably
    })
    .join("");
}

export function ptLine(card: Card): string {
  if (card.power != null && card.toughness != null) return `${card.power}/${card.toughness}`;
  if (card.loyalty != null) return `Loyalty ${card.loyalty}`;
  return "";
}

// Word-wrap to a width, preserving the text's own line breaks. Strips the
// braces from mana symbols so oracle text reads naturally in a terminal.
export function wrapText(text: string, width: number): string[] {
  const clean = text.replace(/\{([^}]+)\}/g, "$1");
  const out: string[] = [];
  for (const rawLine of clean.split("\n")) {
    const line = rawLine.trimEnd();
    if (line === "") {
      out.push("");
      continue;
    }
    let cur = "";
    for (const word of line.split(/\s+/)) {
      if (cur === "") cur = word;
      else if ((cur + " " + word).length <= width) cur += " " + word;
      else {
        out.push(cur);
        cur = word;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

// Full multi-line detail panel for the highlighted card (no gutter; the picker
// adds one). `width` is the available text width.
export function cardDetail(card: Card, width = (process.stdout.columns ?? 80) - 4): string {
  const w = Math.max(24, width);
  const lines: string[] = [];
  const cost = renderManaCost(card.manaCost);
  lines.push(pc.bold(card.name) + (cost ? "  " + cost : ""));
  lines.push(`${rarityTag(card.rarity)} ${colorSwatch(card.colors)} ${pc.dim(card.typeLine)}`);
  const pt = ptLine(card);
  if (pt) lines.push(pc.bold(pt));
  if (card.oracleText.trim()) {
    lines.push("");
    for (const l of wrapText(card.oracleText, w)) lines.push(l);
  }
  lines.push("");
  const stats =
    card.gihWinRate != null
      ? `GIH WR ${pct(card.gihWinRate)}  ·  ALSA ${card.alsa?.toFixed(1) ?? "—"}  ·  WR ${pct(card.winRate)}`
      : "no 17Lands data";
  lines.push(pc.dim(stats));
  return lines.join("\n");
}

