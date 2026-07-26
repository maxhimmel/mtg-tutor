import type { Principle, PrinciplesDoc } from "./principlesSchema.js";

export interface SplitCitations {
  prose: string;
  principles: Principle[];
}

const CITATION = /\[([A-Z]+-\d+)\]/g;

// A citation half-arrived from the stream, e.g. "[EVA". Anchored to the end so
// it only ever eats the token still being typed, never a bracket mid-sentence.
const PARTIAL_CITATION = /\[[A-Z]*-?\d*$/;

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

  const stripped = text.replace(CITATION, (_token, id: string) => {
    const principle = index.get(id);
    if (principle) cited.set(id, principle);
    return "";
  });

  return {
    prose: tidy(stripped.replace(PARTIAL_CITATION, "")),
    principles: [...cited.values()],
  };
}
