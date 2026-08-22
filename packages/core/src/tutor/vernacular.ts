import { VERNACULAR_DOC } from "./vernacular.generated.js";
import { VERNACULAR_SOURCES } from "./vernacularSources.generated.js";
import type { PrincipleSource } from "./principlesSchema.js";
import type { VernacularDoc } from "./vernacularSchema.js";

export type {
  AvoidedPhrase,
  VernacularDoc,
  VernacularMeta,
  VernacularTerm,
  VoiceRule,
} from "./vernacularSchema.js";
export { validateVernacular } from "./vernacularSchema.js";

// Compiled at build time like the principles corpus, so loading it costs no
// filesystem read and no YAML parser -- the CLI, Convex's V8 runtime and the
// browser all share the same module. Validation already ran during codegen.
export function loadVernacular(): VernacularDoc {
  return VERNACULAR_DOC;
}

export function loadVernacularSources(): PrincipleSource[] {
  return VERNACULAR_SOURCES;
}

/**
 * The voice block for a system prompt.
 *
 * WHAT IS AND IS NOT IN HERE
 *
 * `voice` and `avoid` go to the model. `terms` does not, and that is the whole
 * shape of this feature: the model already knows what a bomb is. What it gets
 * wrong is the GRAMMAR -- it writes "a cheaper, higher-floor flyer" where a
 * Limited writer writes "the floor is pretty high here, as a 3-mana 2/2 flier is
 * solid". Same word, different sentence, completely different register. Fifty
 * dictionary entries would not have fixed that sentence and would cost more than
 * everything else added to this prompt since it was written.
 *
 * The avoided phrases are listed with their replacements rather than as a bare
 * blacklist, because a model told only what not to say reaches for the nearest
 * synonym, which is usually the same register one word over.
 */
export function voiceBlock(doc: VernacularDoc = VERNACULAR_DOC): string {
  return [
    "# How to write",
    "",
    "You are a strong Limited player talking to another player. Sound like one.",
    "",
    ...doc.voice.map((v) => `- ${v.text}`),
    "",
    "Phrases this app does not use, and what to write instead:",
    ...doc.avoid.map((a) => `- "${a.phrase}" → ${a.instead}`),
  ].join("\n");
}

/**
 * The avoided phrases found in a piece of generated prose.
 *
 * THE PAIRED METRIC FOR THE VOICE RULES, AND THE REASON THEY ARE WORTH SHIPPING
 *
 * A style instruction is the easiest thing in this codebase to ship and never
 * check. It costs tokens on every call, it produces no error when it is ignored,
 * and the only detector is somebody reading an answer and finding it stilted --
 * which is exactly how this feature was requested in the first place, months
 * after the prose went out. Counting the phrases the corpus bans is the cheapest
 * honest answer to "did the rule take", and it is the same shape as `claimsTie`:
 * a small closed set the app itself defined, so a hit is a fact rather than a
 * judgment about writing quality.
 *
 * What it does NOT measure is whether the answer reads well. A coach can obey
 * every line here and still be dull. That question needs a person, or the
 * pairwise judge in roadmap #4; this one only catches the failure that has a
 * name.
 *
 * Substring rather than word-boundary matching, because the list is phrases and
 * the interesting ones are hyphenated -- "higher-floor" has to be caught inside
 * "higher-floor flyer", and a \b before a hyphen does not behave the way it
 * looks like it does.
 */
export function jargonHits(prose: string, doc: VernacularDoc = VERNACULAR_DOC): string[] {
  const hay = prose.toLowerCase();
  return doc.avoid.filter((a) => hay.includes(a.phrase)).map((a) => a.phrase);
}
