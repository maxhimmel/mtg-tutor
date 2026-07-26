import { PRINCIPLES_DOC } from "./principles.generated.js";
import { PRINCIPLE_SOURCES } from "./principleSources.generated.js";

export type {
  Principle,
  PrinciplesMeta,
  PrinciplesDoc,
  PrincipleSource,
} from "./principlesSchema.js";
export { validatePrinciples } from "./principlesSchema.js";

import type { PrincipleSource, PrinciplesDoc } from "./principlesSchema.js";

// The corpus is compiled into a TS module at build time (see
// scripts/generate-principles.ts), so loading it needs no filesystem and no
// YAML parser at runtime — the CLI, Convex, and the browser all share it.
// Validation already ran during codegen.
export function loadPrinciples(): PrinciplesDoc {
  return PRINCIPLES_DOC;
}

// The credible sources behind the corpus, compiled the same way so the public
// principles page can show its work without a markdown loader.
export function loadPrincipleSources(): PrincipleSource[] {
  return PRINCIPLE_SOURCES;
}
