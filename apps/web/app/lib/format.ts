// Display helpers. The CLI's equivalents live in apps/cli/src/core/ui/format.ts
// but are wrapped in picocolors escape codes, which mean nothing in a browser.

export const pct = (v?: number | null): string =>
  v == null ? "—" : `${(v * 100).toFixed(1)}%`;

// "{2}{U}{U}" -> "2UU". Cleaned mana cost for compact list rows; a full
// mana-symbol rendering is a later polish.
export const manaText = (cost?: string): string =>
  (cost ?? "").replace(/[{}]/g, "").replace(/\//g, "");

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
