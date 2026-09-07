/**
 * The calendar day, as the drills' `deal` queries want it.
 *
 * WHY A DAY AND NOT A TIMESTAMP. A Convex query may not read the wall clock --
 * it is not re-run because time advanced, so a `new Date()` inside one answers
 * with a stale idea of "now" for as long as its caller holds the result. So the
 * client sends it, once per hand. A day is also the resolution `dueForRepeat`
 * actually needs; a timestamp would carry a precision the rule does not use.
 *
 * UTC, matching the day the rows are stamped with, so that "an earlier day"
 * means the same thing on both sides of the comparison. The seam is NOT midnight
 * where the player is -- it is 16:00 at UTC-8 and 13:00 at UTC+13 -- so two
 * sittings twenty minutes apart mid-afternoon can count as different days, which
 * is the massed case the floor exists to exclude. `dueForRepeat` in core carries
 * the full argument for taking that cost rather than adding a timezone the
 * server does not have.
 */
export const today = (): string => new Date().toISOString().slice(0, 10);
