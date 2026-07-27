// Display helpers. The CLI's equivalents live in apps/cli/src/core/ui/format.ts
// but are wrapped in picocolors escape codes, which mean nothing in a browser.

export const pct = (v?: number | null): string =>
  v == null ? "—" : `${(v * 100).toFixed(1)}%`;

// The gap between two win rates, in the percentage points players compare them
// in. Undefined rather than "—" when either side is missing, so a caller can
// drop the whole line instead of printing a dash next to a minus sign.
export const pctPoints = (a?: number | null, b?: number | null): string | undefined =>
  a == null || b == null ? undefined : `${((a - b) * 100).toFixed(1)}%`;

// "{2}{U}{U}" -> "2UU". The spoken form of a cost the ManaCost component draws
// as symbols, so a screen reader gets something better than a row of icons.
export const manaText = (cost?: string): string =>
  (cost ?? "").replace(/[{}]/g, "").replace(/\//g, "");

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// "2026-04-24" -> "Apr 24, 2026". Formatted off the string rather than through
// Date, which reads a bare ISO date as UTC midnight and so renders the day
// before for anyone west of Greenwich.
export const releaseDate = (iso?: string): string | undefined => {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!parts) return undefined;
  const [, year, month, day] = parts;
  return `${MONTHS[Number(month) - 1]} ${Number(day)}, ${year}`;
};

// Map letter grades onto daisyUI's built-in semantic tokens so grade coloring
// tracks whatever daisyUI theme is active -- no bespoke palette to maintain.
const GRADE_VARS: Record<string, string> = {
  "A+": "--color-success",
  A: "--color-success",
  "B+": "--color-info",
  B: "--color-info",
  "C+": "--color-warning",
  C: "--color-warning",
  D: "--color-error",
  F: "--color-error",
};

export const gradeColor = (grade: string): string =>
  `var(${GRADE_VARS[grade] ?? "--color-base-content"})`;

export const COLOR_NAMES: Record<string, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
};

// What drafters actually call a two-colour pair. The names are Ravnica's, but
// they are the vernacular in every format -- people say "Boros aggro" about a
// set with no guilds in it at all -- so a pair is more legible named than spelt
// "WR". Keyed in WUBRG order, which is how 17Lands writes them.
export const GUILD_NAMES: Record<string, string> = {
  WU: "Azorius",
  WB: "Orzhov",
  WR: "Boros",
  WG: "Selesnya",
  UB: "Dimir",
  UR: "Izzet",
  UG: "Simic",
  BR: "Rakdos",
  BG: "Golgari",
  RG: "Gruul",
};
