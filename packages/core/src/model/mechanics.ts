import { MECHANICS_DOC } from "./mechanics.generated.js";
import type { Mechanic, MechanicsDoc } from "./mechanicsSchema.js";

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
