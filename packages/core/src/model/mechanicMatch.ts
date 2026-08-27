import type { MechanicKind } from "./mechanicsSchema.js";

// Finding a mechanic in a card's rules text. Pure, and shared on purpose:
// refresh-mechanics counts cards with this so its report is a claim about what
// the app will actually show, not about a second matcher that agrees today.

/** The least a thing needs to be looked for. A whole `Mechanic` satisfies it. */
export interface Matchable {
  name: string;
  kind: MechanicKind;
  match?: string[];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A word boundary, but only where one can exist.
 *
 * `\b` between `!` and a space is not a boundary, so `/\bFor Mirrodin!\b/`
 * matches nothing at all -- silently, on all ten cards that carry it, and on
 * the forty carrying `Start Your Engines!`. A matcher that finds nothing and
 * reports no error is the exact failure this whole feature exists to remove, so
 * the boundary is conditional on the term ending in a word character.
 */
const tail = (term: string) => (/\w$/.test(term) ? "\\b" : "");

/**
 * Cards inflect what the rules name in the infinitive: the rule is `Explore`
 * and the card says "it explores", the rule is `Suspect` and the card says "a
 * suspected creature".
 *
 * Only after a word character, and only as a suffix, so `beholder` is not
 * `Behold` -- the optional group declines to match `er` and the boundary then
 * fails mid-word, which is the behaviour we want and the reason this is not a
 * looser `\w*`.
 */
const INFLECTIONS = "(?:s|es|d|ed|ing)?";

/**
 * English doubles a final consonant before a suffix, and Magic's rules text
 * does it on the mechanics we care about: `Plot` is printed "was plotted",
 * `Station` would be "stationned" if it were a verb of that shape.
 *
 * Optional, and only the term's OWN final letter, so it cannot widen into a
 * wildcard: `Behold` may be followed by another `d`, which does not help
 * `Beholder` match, because the suffix group then declines `er` and the word
 * boundary lands mid-word.
 */
function doubling(term: string): string {
  const last = term.slice(-1).toLowerCase();
  return /[bcdfghjklmnpqrstvwxz]/.test(last) ? `${last}?` : "";
}

function patternFor(term: string, kind: MechanicKind): RegExp {
  const body = escape(term).replace(/\\?\s+/g, "\\s+");

  // An ability word is printed in italics at the head of an ability and
  // followed by an em-dash, always. Matching it anywhere else is how `Void` the
  // Edge of Eternities mechanic is found inside "void" the ordinary English
  // word, and how `Raid` is found in flavour-shaped rules text.
  if (kind === "ability-word") return new RegExp(`(^|\\n)\\s*${body}\\s*—`, "i");

  const inflected = /\w$/.test(term) ? `${doubling(term)}${INFLECTIONS}` : "";
  return new RegExp(`\\b${body}${inflected}${tail(term)}`, "i");
}

/**
 * Reminder text names OTHER mechanics -- flying's mentions reach, amass's
 * mentions counters and tokens -- so matching inside it reports mechanics the
 * card does not have. Same reason `keywordsOf` strips it before looking.
 */
export const withoutReminders = (oracleText: string) => oracleText.replace(/\([^)]*\)/g, " ");

/** Every phrase this mechanic can be printed as, the heading included. */
export function phrasesOf(m: Matchable): string[] {
  return [m.name, ...(m.match ?? [])];
}

export function matchesText(m: Matchable, rulesText: string): boolean {
  return phrasesOf(m).some((p) => patternFor(p, m.kind).test(rulesText));
}

/** True when this card carries the mechanic. Strips reminder text first. */
export function matchesCard(m: Matchable, card: { oracleText: string }): boolean {
  return matchesText(m, withoutReminders(card.oracleText));
}

/**
 * Where the first phrase of this mechanic appears, or -1.
 *
 * The hover panel lists what a card does in the order it is printed, which is
 * the order somebody reads it, so a mechanic needs a position and not just a
 * yes.
 */
export function indexInText(m: Matchable, rulesText: string): number {
  let first = -1;
  for (const phrase of phrasesOf(m)) {
    const at = rulesText.search(patternFor(phrase, m.kind));
    if (at >= 0 && (first === -1 || at < first)) first = at;
  }
  return first;
}
