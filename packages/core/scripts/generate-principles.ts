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
import { validateVernacular, type VernacularDoc } from "../src/tutor/vernacularSchema.js";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(pkgRoot, "docs", "draft-principles.yaml");
const OUT = join(pkgRoot, "src", "tutor", "principles.generated.ts");
const SOURCES_SOURCE = join(pkgRoot, "docs", "draft-principles-sources.md");
const SOURCES_OUT = join(pkgRoot, "src", "tutor", "principleSources.generated.ts");
const VERNACULAR = join(pkgRoot, "docs", "vernacular.yaml");
const VERNACULAR_OUT = join(pkgRoot, "src", "tutor", "vernacular.generated.ts");
const VERNACULAR_SOURCES = join(pkgRoot, "docs", "vernacular-sources.md");
const VERNACULAR_SOURCES_OUT = join(pkgRoot, "src", "tutor", "vernacularSources.generated.ts");

const doc = validatePrinciples(parse(readFileSync(SOURCE, "utf8")) as PrinciplesDoc, SOURCE);

const banner = `// GENERATED FILE -- DO NOT EDIT BY HAND.
// Source: docs/draft-principles.yaml
// Regenerate: pnpm --filter @mtg-tutor/core generate

import type { PrinciplesDoc } from "./principlesSchema.js";

export const PRINCIPLES_DOC: PrinciplesDoc = `;

writeFileSync(OUT, `${banner}${JSON.stringify(doc, null, 2)};\n`, "utf8");

// The sources files are numbered markdown lists; only their link lines matter.
// The ORDER is load-bearing for the vernacular corpus, whose terms cite a source
// by its 1-based position -- so a line reordered in the markdown silently
// re-points every citation under it. Terms are checked against the count below.
const LINK = /^\d+\.\s*\[(.+)\]\((https?:\/\/[^)]+)\)\s*$/;
function readSources(file: string): PrincipleSource[] {
  const parsed = readFileSync(file, "utf8")
    .split("\n")
    .map((line) => LINK.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map(([, title, url]) => ({ title, url }));
  if (!parsed.length) throw new Error(`No sources parsed from ${file}.`);
  return parsed;
}

const sources = readSources(SOURCES_SOURCE);

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

// The vernacular corpus: how the app is allowed to SAY what the principles let
// it believe. Same compile-to-TS treatment for the same reason -- Convex's V8
// runtime has no filesystem and no YAML parser.
const vernacular = validateVernacular(
  parse(readFileSync(VERNACULAR, "utf8")) as VernacularDoc,
  VERNACULAR,
);
const vernacularSources = readSources(VERNACULAR_SOURCES);

// The one check the schema cannot do, because it never sees the sources file: a
// term citing source 17 out of sixteen is a dangling footnote, and a footnote
// nobody can follow is the same as no citation at all.
for (const t of vernacular.terms) {
  if (t.source != null && (t.source < 1 || t.source > vernacularSources.length)) {
    throw new Error(
      `Term ${t.id} cites source ${t.source}, but ${VERNACULAR_SOURCES} has ` +
        `${vernacularSources.length}.`,
    );
  }
}

writeFileSync(
  VERNACULAR_OUT,
  `// GENERATED FILE -- DO NOT EDIT BY HAND.
// Source: docs/vernacular.yaml
// Regenerate: pnpm --filter @mtg-tutor/core generate

import type { VernacularDoc } from "./vernacularSchema.js";

export const VERNACULAR_DOC: VernacularDoc = ${JSON.stringify(vernacular, null, 2)};
`,
  "utf8",
);

writeFileSync(
  VERNACULAR_SOURCES_OUT,
  `// GENERATED FILE -- DO NOT EDIT BY HAND.
// Source: docs/vernacular-sources.md
// Regenerate: pnpm --filter @mtg-tutor/core generate

import type { PrincipleSource } from "./principlesSchema.js";

export const VERNACULAR_SOURCES: PrincipleSource[] = ${JSON.stringify(vernacularSources, null, 2)};
`,
  "utf8",
);

console.log(
  `wrote ${VERNACULAR_OUT} (${vernacular.voice.length} voice rules, ` +
    `${vernacular.avoid.length} avoided phrases, ${vernacular.terms.length} terms)`,
);
console.log(`wrote ${VERNACULAR_SOURCES_OUT} (${vernacularSources.length} sources)`);
