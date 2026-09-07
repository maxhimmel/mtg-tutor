import { REPEAT_SLOTS, dueForRepeat, historyByQuestion, normalizeName } from "@mtg-tutor/core";
import type { QueryCtx } from "../_generated/server.js";

// What one person has already answered in a set-based drill, split into what a
// run should be made of.
//
// Shared by both `deal` queries because the split is the same question in both
// -- which of this set's cards have you not seen, and which did you get wrong on
// an earlier day -- while the banks either side of it are an
// `ArchetypeQuestion[]` and a `DeckSpeedQuestion[]` with nothing in common but a
// name. That is the line `drill.ts` draws: the answers are one shape, the
// questions are not, and this file only ever touches the answers.

export type SetDrill = "archetypes" | "deckSpeed";

export interface DealtByHistory<T> {
  /** Never answered, in the bank's own order. */
  fresh: T[];
  /** Misread on an earlier day, least-recently-asked first. */
  repeats: T[];
  /** Distinct cards of this set the drill has put to them. */
  asked: number;
}

/**
 * Split a ranked bank against what this person has answered.
 *
 * THE READ IS BOUNDED BY THE SET'S OWN BANK, which is what makes `.collect()`
 * right here rather than a paginated read: the index prefix is one person and
 * one set, so the ceiling is the number of cards that set can ask about -- a few
 * hundred rows at ~150 bytes, on a query that has already read 270-412KB of
 * statistics to build the bank it is filtering.
 *
 * HOW MANY SLOTS THE REPEAT GETS, and why it is not a fixed share. While a set
 * still has cards you have never seen, one slot: a repeat turns a card's history
 * into a first-versus-latest comparison, and more than one trades teaching for a
 * measurement that the player's own return rate paces anyway. Once the fresh
 * side is empty the repeats take the whole run, because at that point review IS
 * the drill and the alternative is a one-question run. `REPEAT_SLOTS` in core
 * carries the argument.
 */
export async function splitByHistory<T extends { name: string }>(
  ctx: QueryCtx,
  userId: string,
  drill: SetDrill,
  set: { code: string; format: string },
  today: string,
  ranked: readonly T[],
  limit: number,
): Promise<DealtByHistory<T>> {
  const rows = await ctx.db
    .query("drillAnswers")
    .withIndex("by_user_drill_set_and_key", (q) =>
      q.eq("userId", userId).eq("drill", drill).eq("setCode", set.code).eq("format", set.format),
    )
    .collect();

  const history = historyByQuestion(rows);
  const byKey = new Map(ranked.map((q) => [normalizeName(q.name), q]));

  // Off the ROWS rather than off the fold's keys. `historyByQuestion` identifies
  // a question as a card IN A SET, because a reprint is the same name in two
  // sets with two different answers -- so its keys are composite and a bare card
  // key never matches one. This read is already scoped to one set by the index
  // range, so the rows' own keys are the right thing to ask.
  const answered = new Set(rows.map((r) => r.key));
  const fresh = ranked.filter((q) => !answered.has(normalizeName(q.name)));

  // A due card the bank no longer holds is simply not served. `deal` already
  // drops cards the statistics name and the pool has lost; this is the same
  // thing one step earlier, and re-asking a question the set can no longer pose
  // is not a thing to reach for.
  const due = dueForRepeat(history, today)
    .map((key) => byKey.get(key))
    .filter((q): q is T => q !== undefined);

  const slots = fresh.length === 0 ? limit : REPEAT_SLOTS;

  return { fresh, repeats: due.slice(0, Math.max(0, slots)), asked: history.size };
}
