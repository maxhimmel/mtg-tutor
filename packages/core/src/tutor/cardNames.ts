import { ANY_APOSTROPHE, ANY_HYPHEN, APOSTROPHE_CLASS, HYPHEN_CLASS } from "./typography.js";

// Finding the cards a coach answer names, without parsing names out of the
// prose. The caller supplies the names it already knows about and matches the
// text against those, so nothing has to be trusted about the model's output --
// unmatched text is just text.
//
// Pure string work, so the same matcher serves the web client's hover styling
// and anything else that needs to point at a card the coach mentioned.

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// One spelling per name, so a lookup succeeds whichever mark the model typed.
export const canonicalName = (s: string): string =>
  s.replace(ANY_APOSTROPHE, "'").replace(ANY_HYPHEN, "-");

const asPattern = (name: string) =>
  escapeRegExp(name)
    .replace(ANY_APOSTROPHE, `[${APOSTROPHE_CLASS}]`)
    .replace(ANY_HYPHEN, `[${HYPHEN_CLASS}]`);

// Matches any of `names`, capturing the matched name so `String.split` yields
// the names and the prose between them in one pass.
//
// Returns null for an empty list: an alternation of nothing matches everywhere.
export function cardNamePattern(names: readonly string[]): RegExp | null {
  if (names.length === 0) return null;

  // Longest first, so "Skystinger Drake" is not matched as "Skystinger".
  const alternation = [...names]
    .sort((a, b) => b.length - a.length)
    .map(asPattern)
    .join("|");

  // Word-bounded, or "Honor" matches inside "Honored Knight-Captain" -- both are
  // real cards in the same set. A trailing apostrophe is deliberately allowed
  // through, so the possessive in "Plasma Bolt's damage" still finds the card.
  //
  // Not global: `split` ignores the flag, and leaving it off keeps the returned
  // regex safe to `test` without carrying `lastIndex` between calls.
  return new RegExp(`(?<![\\p{L}\\p{N}])(${alternation})(?![\\p{L}\\p{N}])`, "u");
}
