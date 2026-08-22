// Types + validation for the vernacular corpus. Free of any import of the
// generated module, so codegen can reuse it without depending on its own output
// -- same reason principlesSchema.ts is separate.

/** A rule about how a sentence is built. These go into the system prompts. */
export interface VoiceRule {
  id: string;
  text: string;
}

/**
 * A phrase the app does not say, and what a drafter says instead.
 *
 * `phrase` is matched literally and case-insensitively by `jargonHits`, so it
 * has to stay a PHRASE. A single common word would fire on ordinary sentences
 * and turn the metric into noise -- which is why "value" is not on this list
 * even though the coach overuses it, and "expected value" is.
 */
export interface AvoidedPhrase {
  id: string;
  phrase: string;
  instead: string;
  why: string;
}

/**
 * One word of Limited vernacular.
 *
 * `source` indexes vernacular-sources.md, 1-based, matching how the principles
 * corpus cites. `sourced: false` says outright that a term is standard in speech
 * and could not be traced to a page -- an honest gap rather than a citation that
 * does not exist.
 */
export interface VernacularTerm {
  id: string;
  category: string;
  short: string;
  usage: string;
  source?: number;
  sourced?: boolean;
}

export interface VernacularMeta {
  title: string;
  note?: string;
  sources?: string;
}

export interface VernacularDoc {
  meta: VernacularMeta;
  voice: VoiceRule[];
  avoid: AvoidedPhrase[];
  terms: VernacularTerm[];
}

// Runs at codegen time, so a malformed corpus breaks the build rather than the
// first coaching call.
export function validateVernacular(doc: VernacularDoc, source: string): VernacularDoc {
  if (!doc?.voice?.length) throw new Error(`No voice rules found in ${source}.`);
  if (!doc?.avoid?.length) throw new Error(`No avoided phrases found in ${source}.`);
  if (!doc?.terms?.length) throw new Error(`No terms found in ${source}.`);

  const seen = new Set<string>();
  const claim = (id: string, what: string) => {
    if (!id) throw new Error(`A ${what} in ${source} has no id.`);
    if (seen.has(id)) throw new Error(`Duplicate vernacular id: ${id}`);
    seen.add(id);
  };

  for (const v of doc.voice) {
    claim(v.id, "voice rule");
    if (!v.text) throw new Error(`Voice rule ${v.id} has no text.`);
  }

  for (const a of doc.avoid) {
    claim(a.id, "avoided phrase");
    if (!a.phrase || !a.instead || !a.why) {
      throw new Error(`Avoided phrase ${a.id} is missing phrase/instead/why.`);
    }
    // The phrase becomes a literal needle in `jargonHits`, and a needle with a
    // capital in it silently stops matching lowercase prose.
    if (a.phrase !== a.phrase.toLowerCase()) {
      throw new Error(`Avoided phrase ${a.id} must be lowercase: "${a.phrase}".`);
    }
  }

  for (const t of doc.terms) {
    claim(t.id, "term");
    if (!t.category || !t.short || !t.usage) {
      throw new Error(`Term ${t.id} is missing category/short/usage.`);
    }
    // One or the other, never neither: a term with no source and no admission
    // that it has none is a citation nobody can check.
    if (t.source == null && t.sourced !== false) {
      throw new Error(`Term ${t.id} needs a source index or an explicit \`sourced: false\`.`);
    }
  }

  return doc;
}
