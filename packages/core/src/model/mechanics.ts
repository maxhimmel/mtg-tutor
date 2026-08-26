import { MECHANICS_DOC } from "./mechanics.generated.js";
import type { Mechanic, MechanicsDoc } from "./mechanicsSchema.js";
import { indexInText, withoutReminders } from "./mechanicMatch.js";

export type { Mechanic, MechanicKind, MechanicsDoc, MechanicsMeta } from "./mechanicsSchema.js";
export { validateMechanics, checkOriginal } from "./mechanicsSchema.js";

// Compiled into a TS module at build time (see scripts/generate-principles.ts),
// so loading it needs no filesystem and no YAML parser -- the CLI, Convex and
// the browser all share it. Validation already ran during codegen.
export function loadMechanics(): MechanicsDoc {
  return MECHANICS_DOC;
}

export function allMechanics(): readonly Mechanic[] {
  return MECHANICS_DOC.mechanics;
}

/**
 * The set's own mechanics this card carries, most specific first.
 *
 * Separate from `keywordsOf`, which merges these with the evergreen keywords
 * because a person hovering a card does not care which is which. A prompt does:
 * the model knows what flying is and does not know what warp is, and paying to
 * tell it about flying on every card of every pack is what the reminder strip
 * exists to avoid.
 */
export function setMechanicsOf(card: { oracleText: string }): Mechanic[] {
  const rules = withoutReminders(card.oracleText);
  const found = MECHANICS_DOC.mechanics
    .map((m) => ({ m, at: indexInText(m, rules) }))
    .filter(({ at }) => at >= 0);

  // "manifest dread" matches Manifest and Manifest Dread at the same character.
  // The general one says less about the same sentence, so it goes.
  const general = new Set(
    found.flatMap(({ m: a }) =>
      found
        .filter(({ m: b }) => b.name.toLowerCase().startsWith(`${a.name.toLowerCase()} `))
        .map(() => a.name),
    ),
  );

  return found
    .filter(({ m }) => !general.has(m.name))
    .sort((a, b) => a.at - b.at)
    .map(({ m }) => m);
}
