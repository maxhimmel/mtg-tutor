// Types + validation for the set-mechanics corpus. Free of any import of the
// generated module, so codegen can reuse it without depending on its own output
// -- same reason principlesSchema.ts and vernacularSchema.ts are separate.

/**
 * What kind of thing the mechanic is, which decides how a card wears it.
 *
 * The distinction is not cosmetic: it is the difference between a phrase that
 * appears mid-sentence and one that opens an ability, and matching the wrong way
 * is how "void" the ability word finds the word "avoid".
 *
 * - `ability-word` is printed in italics at the start of an ability, always
 *   followed by an em-dash: "Magecraft — Whenever you cast...". Matched in that
 *   position only. The Comprehensive Rules name these (207.2c) and refuse to
 *   define them, which is why every one of them is written here by hand.
 * - `action` is something you do, written into a sentence: "the Ring tempts
 *   you", "collect evidence 6".
 * - `keyword` is an ability a card has, usually on its own line, often with a
 *   cost: "Warp {1}{R}", "Disguise {3}".
 * - `designation` is a state a permanent or player is in rather than anything
 *   printed as an ability: prepared, suspected, saddled, monstrous.
 */
export type MechanicKind = "ability-word" | "action" | "keyword" | "designation";

/**
 * One mechanic a set is built on, and what it means in our words.
 *
 * WHY `short` IS OURS AND NOT THE RULE'S
 *
 * The Comprehensive Rules are not licensed for redistribution -- the Fan Content
 * Policy carves verbatim republication of rules content out of what it permits,
 * and the CR itself grants nothing. So `rule` is a citation and `short` is a
 * sentence somebody wrote. Nothing in this corpus is copied from the CR, and
 * `checkOriginal` below is what keeps that true as it grows.
 *
 * `short` is read by the hover panel and written into the coach's prompt, so it
 * is the same sentence in both places for the same reason CARD_STAT_GLOSSARY is:
 * two descriptions of one mechanic slowly stop agreeing.
 */
export interface Mechanic {
  /**
   * The Comprehensive Rules heading, verbatim -- "The Ring Tempts You".
   *
   * The key as well as the label, and deliberately not the rule number: "The
   * Ring Tempts You" was 701.52 in the LTR-era CR and is 701.54 today, because
   * two keyword actions were inserted ahead of it. Heading text has never moved.
   */
  name: string;
  kind: MechanicKind;
  /**
   * The CR section, for a reader who wants the whole rule. Display only -- never
   * matched on, and re-derived by refresh-mechanics rather than trusted.
   *
   * Absent for a mechanic the CR does not carry. That is a real category and not
   * an oversight: `corrupted` is on 26 paper cards and appears nowhere in the
   * live CR, nor in the CR published for its own set.
   */
  rule?: string;
  /** Said outright when there is no rule to cite, rather than left blank. */
  sourced?: boolean;
  short: string;
  /**
   * The card the game already prints to explain this, by name.
   *
   * Some sets ship a rules card in the booster because nothing on the cards
   * themselves says what the mechanic does -- LTR's "The Ring // The Ring Tempts
   * You" carries all four of the Ring's escalating abilities and four bullets of
   * edge cases, none of which appears on any of the 50 cards that tempt you.
   * Where one exists the printed card is better than our sentence and replaces
   * it in the hover panel, which is the whole point of this field.
   *
   * ONLY WHERE IT SAYS MORE THAN WE DO, and most do not. A booster's other
   * inserts are places to put cards rather than explanations: mh3's Energy
   * Reserve reads "(Place your energy counters in this area.)" and nothing else,
   * woe's On an Adventure and otj's Plot are storage markers with the rule
   * restated, and one's Poison Counter is a counter area with a single line of
   * reminder. Those keep our sentence, which is shorter and says more.
   *
   * Authored rather than derived, and `refresh-mechanics` reports the candidates
   * with both texts so the call is made against the evidence. A rule that picked
   * automatically would need a threshold on length, and the first set to ship a
   * terse rules card or a wordy placemat would break it silently.
   *
   * The COACH never sees this. Its prompt is text and cannot hold a picture, so
   * `describeCard` goes on writing `short` whatever is set here.
   */
  art?: string;
  /**
   * What to look for in a card's rules text, when the heading is not what the
   * card says. "The Ring Tempts You" is printed "the Ring tempts you"; `Behold`
   * is printed "As an additional cost... behold a Dragon".
   *
   * Matching is case-insensitive, so this is for a different WORDING, not a
   * different capitalisation.
   */
  match?: string[];
}

export interface MechanicsMeta {
  title: string;
  note?: string;
  sources?: string;
}

/**
 * A term the vocabulary finds that is not a mechanic anybody needs told about.
 *
 * The rules name a great many things, and matching a set's cards against all of
 * them turns up `Face Up` on 55 cards of mkm and ktk, `Starting Deck` on 10 of
 * mom, `Color Identity` on 4 of mh3. Those are the plumbing a rule is written
 * in, not something a drafter is stuck on, and no containment test can tell them
 * from `Prepared` or `Crime`, which arrive by the same route and are real.
 *
 * So it is a decision, and decisions get written down. Kept beside the
 * definitions rather than in a second file, because the question "why is there
 * no entry for Face Up" is asked in exactly the place the answer belongs -- and
 * because without it refresh-mechanics is red forever and a check that is always
 * red is a check nobody reads.
 */
export interface IgnoredTerm {
  name: string;
  why: string;
}

export interface MechanicsDoc {
  meta: MechanicsMeta;
  mechanics: Mechanic[];
  /** Read by refresh-mechanics only. Nothing at runtime looks at it. */
  ignored?: IgnoredTerm[];
}

const KINDS = new Set<string>([
  "ability-word",
  "action",
  "keyword",
  "designation",
] satisfies MechanicKind[]);

/**
 * The licence check, run at codegen so it cannot be skipped.
 *
 * Twelve consecutive words shared with the Comprehensive Rules is not a
 * coincidence in a one-sentence definition; it is a paraphrase that stopped
 * paraphrasing. The check is cheap and the failure it catches is the one that
 * would matter, so it runs over the whole corpus every build rather than being
 * somebody's job to remember at review.
 *
 * `crText` is passed in rather than read here -- this file stays pure, and the
 * CR is a dev-time download that no runtime should ever depend on.
 */
export function checkOriginal(doc: MechanicsDoc, crText: string, span = 12): void {
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[^a-z0-9'" ]/g, " ")
      .split(/\s+/)
      .filter(Boolean);

  const rules = normalize(crText);
  const seen = new Set<string>();
  for (let i = 0; i + span <= rules.length; i++) seen.add(rules.slice(i, i + span).join(" "));

  for (const m of doc.mechanics) {
    const words = normalize(m.short);
    for (let i = 0; i + span <= words.length; i++) {
      const run = words.slice(i, i + span).join(" ");
      if (seen.has(run)) {
        throw new Error(
          `Mechanic "${m.name}" shares ${span} consecutive words with the Comprehensive ` +
            `Rules: "${run}". The corpus ships our prose, not Wizards'. Rewrite it.`,
        );
      }
    }
  }
}

// Runs at codegen time, so a malformed corpus breaks the build rather than the
// first hover.
export function validateMechanics(
  doc: MechanicsDoc,
  source: string,
  avoided: readonly string[] = [],
): MechanicsDoc {
  if (!doc?.mechanics?.length) throw new Error(`No mechanics found in ${source}.`);

  const seen = new Set<string>();
  for (const m of doc.mechanics) {
    if (!m.name) throw new Error(`A mechanic in ${source} has no name.`);
    const key = m.name.toLowerCase();
    if (seen.has(key)) throw new Error(`Duplicate mechanic: ${m.name}`);
    seen.add(key);

    if (!KINDS.has(m.kind)) {
      throw new Error(`Mechanic ${m.name} has an unknown kind: ${String(m.kind)}.`);
    }
    if (!m.short) throw new Error(`Mechanic ${m.name} has no definition.`);
    // Same rule the vernacular corpus holds its terms to: a citation nobody can
    // check is worse than an admission there isn't one.
    if (m.rule == null && m.sourced !== false) {
      throw new Error(`Mechanic ${m.name} needs a \`rule\` or an explicit \`sourced: false\`.`);
    }
    if (m.match?.some((p) => !p.trim())) {
      throw new Error(`Mechanic ${m.name} has an empty match phrase.`);
    }
    if (m.art != null && !m.art.trim()) {
      throw new Error(`Mechanic ${m.name} has an empty art name.`);
    }

    // The corpus goes into the coach's prompt, so the voice rules bind it the
    // same way they bind what the model writes back. `jargonHits` measures the
    // model; this measures us, and it is the half that would otherwise never be
    // checked at all.
    const lower = m.short.toLowerCase();
    for (const phrase of avoided) {
      if (lower.includes(phrase)) {
        throw new Error(
          `Mechanic ${m.name} uses "${phrase}", which vernacular.yaml lists under \`avoid\`.`,
        );
      }
    }
  }

  for (const i of doc.ignored ?? []) {
    if (!i.name) throw new Error(`An ignored term in ${source} has no name.`);
    if (!i.why) throw new Error(`Ignored term ${i.name} does not say why.`);
    if (seen.has(i.name.toLowerCase())) {
      throw new Error(`${i.name} is both defined and ignored in ${source}.`);
    }
  }

  return doc;
}
