// Compiles docs/draft-principles.yaml into a plain TS module so the corpus can
// be imported anywhere -- CLI, Convex's V8 runtime, or the browser -- without a
// filesystem read. Run via `pnpm --filter @mtg-tutor/core generate`.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { validatePrinciples, type PrinciplesDoc } from "../src/tutor/principlesSchema.js";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(pkgRoot, "docs", "draft-principles.yaml");
const OUT = join(pkgRoot, "src", "tutor", "principles.generated.ts");

const doc = validatePrinciples(parse(readFileSync(SOURCE, "utf8")) as PrinciplesDoc, SOURCE);

const banner = `// GENERATED FILE -- DO NOT EDIT BY HAND.
// Source: docs/draft-principles.yaml
// Regenerate: pnpm --filter @mtg-tutor/core generate

import type { PrinciplesDoc } from "./principlesSchema.js";

export const PRINCIPLES_DOC: PrinciplesDoc = `;

writeFileSync(OUT, `${banner}${JSON.stringify(doc, null, 2)};\n`, "utf8");

console.log(
  `wrote ${OUT} (${doc.principles.length} principles from ${doc.meta.title})`,
);
