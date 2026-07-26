// Compiles docs/draft-principles.yaml into a plain TS module so the corpus can
// be imported anywhere -- CLI, Convex's V8 runtime, or the browser -- without a
// filesystem read. Run via `pnpm --filter @mtg-tutor/core generate`.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import {
  validatePrinciples,
  type PrincipleSource,
  type PrinciplesDoc,
} from "../src/tutor/principlesSchema.js";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(pkgRoot, "docs", "draft-principles.yaml");
const OUT = join(pkgRoot, "src", "tutor", "principles.generated.ts");
const SOURCES_SOURCE = join(pkgRoot, "docs", "draft-principles-sources.md");
const SOURCES_OUT = join(pkgRoot, "src", "tutor", "principleSources.generated.ts");

const doc = validatePrinciples(parse(readFileSync(SOURCE, "utf8")) as PrinciplesDoc, SOURCE);

const banner = `// GENERATED FILE -- DO NOT EDIT BY HAND.
// Source: docs/draft-principles.yaml
// Regenerate: pnpm --filter @mtg-tutor/core generate

import type { PrinciplesDoc } from "./principlesSchema.js";

export const PRINCIPLES_DOC: PrinciplesDoc = `;

writeFileSync(OUT, `${banner}${JSON.stringify(doc, null, 2)};\n`, "utf8");

// The sources file is a numbered markdown list; only its link lines matter.
const LINK = /^\d+\.\s*\[(.+)\]\((https?:\/\/[^)]+)\)\s*$/;
const sources: PrincipleSource[] = readFileSync(SOURCES_SOURCE, "utf8")
  .split("\n")
  .map((line) => LINK.exec(line))
  .filter((m): m is RegExpExecArray => m !== null)
  .map(([, title, url]) => ({ title, url }));

if (!sources.length) {
  throw new Error(`No sources parsed from ${SOURCES_SOURCE}.`);
}

const sourcesBanner = `// GENERATED FILE -- DO NOT EDIT BY HAND.
// Source: docs/draft-principles-sources.md
// Regenerate: pnpm --filter @mtg-tutor/core generate

import type { PrincipleSource } from "./principlesSchema.js";

export const PRINCIPLE_SOURCES: PrincipleSource[] = `;

writeFileSync(
  SOURCES_OUT,
  `${sourcesBanner}${JSON.stringify(sources, null, 2)};\n`,
  "utf8",
);

console.log(
  `wrote ${OUT} (${doc.principles.length} principles from ${doc.meta.title})`,
);
console.log(`wrote ${SOURCES_OUT} (${sources.length} sources)`);
