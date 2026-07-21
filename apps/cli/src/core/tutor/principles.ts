import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";

export interface Principle {
  id: string;
  category: string;
  text: string;
  tags: string[];
}

export interface PrinciplesMeta {
  title: string;
  note?: string;
  sources?: string;
}

export interface PrinciplesDoc {
  meta: PrinciplesMeta;
  principles: Principle[];
}

// npm scripts run from the repo root, so the canonical YAML resolves off cwd.
const PRINCIPLES_PATH = path.resolve(process.cwd(), "docs/draft-principles.yaml");

let cached: PrinciplesDoc | undefined;

export function loadPrinciples(): PrinciplesDoc {
  if (cached) return cached;

  let raw: string;
  try {
    raw = readFileSync(PRINCIPLES_PATH, "utf8");
  } catch {
    throw new Error(
      `Could not read principles at ${PRINCIPLES_PATH}. Run mtg-tutor from the repo root.`,
    );
  }

  const doc = parse(raw) as PrinciplesDoc;
  if (!doc?.principles?.length) {
    throw new Error(`No principles found in ${PRINCIPLES_PATH}.`);
  }

  const seen = new Set<string>();
  for (const p of doc.principles) {
    if (!p.id || !p.text || !p.category) {
      throw new Error(`Principle is missing id/text/category: ${JSON.stringify(p)}`);
    }
    if (seen.has(p.id)) throw new Error(`Duplicate principle id: ${p.id}`);
    seen.add(p.id);
  }

  cached = doc;
  return doc;
}
