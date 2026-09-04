/**
 * A drill is one short, repeated question with an answer the app already holds.
 *
 * A draft is 45 picks and half an hour; a drill is a handful of decisions and a
 * few minutes, on one skill at a time. That is the whole of what the category
 * means, and it is a category rather than a folder because the next ones are
 * already written down -- the archetype quiz (notes Ideas #1) and the mulligan
 * trainer (roadmap #3) are both this shape.
 *
 * WHAT THE ROOF ACTUALLY OWNS is the event family. Every drill reports through
 * `drill_started` / `drill_answered` / `drill_finished` carrying its `DrillId`,
 * so "does anyone play these at all" is one funnel no matter how many exist,
 * and each one still breaks out on its own. A drill that named its own events
 * would be a second parallel set of charts that can never be merged with the
 * first -- an event name cannot be repaired retroactively.
 *
 * There is deliberately no shared question/answer abstraction here, and the
 * second drill did not change that. It was supposed to: the note used to say
 * the archetype quiz would show what was genuinely common and could be lifted
 * then. What it showed is that almost nothing is. `MissQuestion` is three card
 * names out of a stored pick; `ArchetypeQuestion` is a card and a table of
 * decks derived from a set's statistics. They share a SHAPE -- deal, answer,
 * grade, tally -- and no data at all, so a base class would have one field and
 * three type parameters. Lifting it would cost both drills their own
 * vocabulary and buy an import.
 *
 * What they share is written down where it is enforced instead: the event
 * family below, `ARCHETYPE_QUIZ` / `DECK_SPEED` / `DRILLS` in config.ts for the
 * run lengths, and the route shape.
 *
 * ASKED AGAIN AT THE THIRD DRILL, AND THE ANSWER IS STILL NO -- but it is closer
 * than it was, so here is what changed. `deckSpeed` grades to the same shape the
 * archetype quiz does: an outcome of `read` or `misread`, a boolean, and a
 * `mistake` naming which kind of wrong. Two of three drills agreeing is the
 * first real candidate this roof has had.
 *
 * It still does not earn a base type, because the part worth sharing is the part
 * that cannot be: `mistake` is a different union in each drill and the unions ARE
 * the value. `stronger-deck` and `backwards` are two specific Limited errors, and
 * a lifted `mistake: string` would type-check every misuse while teaching
 * nothing. The misses drill has three outcomes rather than two and does not fit
 * either. Ask again if a fourth drill grades to `read`/`misread` -- at three of
 * four, a generic over the mistake union starts to pay for its import.
 */
export type DrillId = "misses" | "archetypes" | "deckSpeed";
