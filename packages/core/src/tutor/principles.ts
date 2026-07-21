import { PRINCIPLES_DOC } from "./principles.generated.js";

export type {
  Principle,
  PrinciplesMeta,
  PrinciplesDoc,
} from "./principlesSchema.js";
export { validatePrinciples } from "./principlesSchema.js";

import type { PrinciplesDoc } from "./principlesSchema.js";

// The corpus is compiled into a TS module at build time (see
// scripts/generate-principles.ts), so loading it needs no filesystem and no
// YAML parser at runtime — the CLI, Convex, and the browser all share it.
// Validation already ran during codegen.
export function loadPrinciples(): PrinciplesDoc {
  return PRINCIPLES_DOC;
}
