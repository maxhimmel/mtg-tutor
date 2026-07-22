// Display helpers. The CLI's equivalents live in apps/cli/src/core/ui/format.ts
// but are wrapped in picocolors escape codes, which mean nothing in a browser.

export const pct = (v?: number | null): string =>
  v == null ? "—" : `${(v * 100).toFixed(1)}%`;

const GRADE_VARS: Record<string, string> = {
  "A+": "--a-plus",
  A: "--a",
  "B+": "--b",
  B: "--b",
  "C+": "--c",
  C: "--c",
  D: "--d",
  F: "--f",
};

export const gradeColor = (grade: string): string =>
  `var(${GRADE_VARS[grade] ?? "--muted"})`;

export const COLOR_NAMES: Record<string, string> = {
  W: "White",
  U: "Blue",
  B: "Black",
  R: "Red",
  G: "Green",
};
