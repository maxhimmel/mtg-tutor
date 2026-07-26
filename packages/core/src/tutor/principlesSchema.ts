// Types + validation for the principles corpus. Deliberately free of any import
// of the generated module so the codegen script can reuse this without a
// chicken-and-egg dependency on its own output.

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

// Kept out of PrinciplesDoc on purpose: the doc is rendered straight into the
// coach's system prompt, and a list of URLs there would be dead weight in a
// block that is prompt-cached on every call.
export interface PrincipleSource {
  title: string;
  url: string;
}

// Runs at codegen time so a malformed corpus breaks the build rather than the
// first coaching call.
export function validatePrinciples(doc: PrinciplesDoc, source: string): PrinciplesDoc {
  if (!doc?.principles?.length) {
    throw new Error(`No principles found in ${source}.`);
  }

  const seen = new Set<string>();
  for (const p of doc.principles) {
    if (!p.id || !p.text || !p.category) {
      throw new Error(`Principle is missing id/text/category: ${JSON.stringify(p)}`);
    }
    if (seen.has(p.id)) throw new Error(`Duplicate principle id: ${p.id}`);
    seen.add(p.id);
  }

  return doc;
}
