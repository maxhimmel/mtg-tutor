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
 * There is deliberately no shared question/answer abstraction here. One drill
 * exists; a base class fitted to a sample of one describes this drill twice
 * rather than describing drills. The second one is what will say what is
 * genuinely common, and it can be lifted then.
 */
export type DrillId = "misses";
