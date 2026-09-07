/**
 * The calendar day, as the drills' `deal` queries want it.
 *
 * WHY A DAY AND NOT A TIMESTAMP. A Convex query may not read the wall clock --
 * it is not re-run because time advanced, so a `new Date()` inside one answers
 * with a stale idea of "now" for as long as the subscription lives. So the
 * client sends it. A full timestamp would work and would also change the query
 * key on every call, throwing away the cache that lets a sitting page through a
 * set's statistics without re-reading them; a day changes once a day, which is
 * exactly the resolution `dueForRepeat` needs.
 *
 * UTC, matching the day the rows are stamped with, so that "an earlier day"
 * means the same thing on both sides of the comparison. Somebody drilling near
 * midnight in their own timezone can be handed a repeat they have not slept on;
 * that is the cost, it is at most a few hours at one boundary, and the
 * alternative is a timezone the server does not have.
 */
export const today = (): string => new Date().toISOString().slice(0, 10);
