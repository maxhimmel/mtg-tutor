import type { Principle, PrinciplesDoc } from "./principlesSchema.js";
import { ANY_HYPHEN, HYPHEN_CLASS } from "./typography.js";

export interface SplitCitations {
  prose: string;
  principles: Principle[];
}

// How the model actually writes citations varies run to run: "[EVAL-02]",
// "[ EVAL-02 ]", "(EVAL-02, SIG-01)", or bare. It also reaches for typographic
// hyphens mid-word, so an id may not be spelled with an ASCII one.
const ID = `[A-Z]{2,}[${HYPHEN_CLASS}]\\d{1,3}`;

// A bracket counts as a citation only when it holds nothing but ids, so
// bracketed prose is left alone.
const GROUP = new RegExp(`[\\[(]\\s*(${ID}(?:\\s*[,;]\\s*${ID})*)\\s*[\\])]`, "g");
const BARE = new RegExp(`\\b${ID}\\b`, "g");

// A citation half-arrived from the stream, e.g. "[ EVA". Anchored to the end so
// it only ever eats the token still being typed, never a bracket mid-sentence.
const PARTIAL_CITATION = new RegExp(`[\\[(]\\s*[A-Z]*[${HYPHEN_CLASS}]?\\d*$`);

const indexes = new WeakMap<PrinciplesDoc, Map<string, Principle>>();

function indexOf(doc: PrinciplesDoc): Map<string, Principle> {
  let index = indexes.get(doc);
  if (!index) {
    index = new Map(doc.principles.map((p) => [p.id, p]));
    indexes.set(doc, index);
  }
  return index;
}

// Pulling a token out of the middle of a sentence leaves debris behind:
// "wins [EVAL-02] and" becomes a double space, "the game [EVAL-02]." strands a
// space before the period, and a citation opening a line leaves it indented.
function tidy(text: string): string {
  return text
    .replace(/[^\S\n]+/g, " ")
    .replace(/ +([.,;:!?)])/g, "$1")
    .replace(/^ +/gm, "")
    .replace(/ +$/gm, "")
    .trim();
}

// Separates the coach's prose from the principles it cited. Citations are
// rendered as their own row of badges, so the bracketed ids come out of the
// text entirely -- including ids the model invented, which have no reference
// sheet entry to show and would otherwise read as a broken link.
//
// Safe to call on every streamed chunk: partial text simply yields fewer
// citations, and re-running on the completed text gives the same answer.
export function splitCitations(text: string, doc: PrinciplesDoc): SplitCitations {
  const index = indexOf(doc);
  const cited = new Map<string, Principle>();

  const take = (raw: string) => {
    const id = raw.replace(ANY_HYPHEN, "-");
    const principle = index.get(id);
    if (principle) cited.set(id, principle);
  };

  const stripped = text
    .replace(GROUP, (_token, ids: string) => {
      for (const id of ids.split(/[,;]/)) take(id.trim());
      return "";
    })
    .replace(BARE, (id) => {
      take(id);
      return "";
    })
    .replace(PARTIAL_CITATION, "");

  return { prose: tidy(stripped), principles: [...cited.values()] };
}
