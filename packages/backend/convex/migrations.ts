import { v } from "convex/values";
import { normalizeName, withPackSlots } from "@mtg-tutor/core";
import { internalMutation } from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import { engineHalf, textHalf } from "./cardText.js";
import type { StoredCard } from "./validators.js";

/**
 * Splits the card pools that predate setCardText.
 *
 * Everything the split needs is already in the documents -- a stored card was
 * whole -- so this reads no Scryfall and can run on a deployment whose sets
 * would otherwise need seventeen paginated crawls to rebuild. That matters
 * beyond convenience: those crawls are what earned this project a 429 before.
 *
 * One set per transaction, rescheduling itself until none are left. A set is
 * ~170KB to read and ~300 text rows to write, so a handful would fit together
 * and all of them would not; per-set keeps it well clear either way.
 *
 * A pool is migrated when its cards no longer carry a type line -- the field is
 * required on a whole card and absent from the engine's half, so it answers
 * "has this row been split yet" without a flag to clean up afterwards.
 */
export const splitStoredCards = internalMutation({
  args: { migrated: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ migrated: number; done: boolean }> => {
    const migrated = args.migrated ?? 0;

    const pending = await ctx.db
      .query("setCards")
      .filter((q) => q.neq(q.field("cards"), []))
      .collect();

    const next = pending.find((doc) =>
      doc.cards.some((c) => (c as { typeLine?: string }).typeLine !== undefined),
    );

    if (!next) {
      console.log(`splitStoredCards: done, ${migrated} pool(s) migrated`);
      return { migrated, done: true };
    }

    // Slots are stamped here for the same reason ingest stamps them: the type
    // line is about to be removed from this side of the card, and the partition
    // has to survive it.
    // Cast justified by the predicate that selected this row: it is here only
    // because its cards still carry a type line, which is to say they are whole.
    const whole = withPackSlots(next.code, next.cards as StoredCard[]);

    const stale = await ctx.db
      .query("setCardText")
      .withIndex("by_code_format_and_key", (q) =>
        q.eq("code", next.code).eq("format", next.format),
      )
      .collect();
    for (const row of stale) await ctx.db.delete(row._id);

    for (const c of whole) {
      await ctx.db.insert("setCardText", {
        code: next.code,
        format: next.format,
        key: normalizeName(c.name),
        text: textHalf(c),
      });
    }

    await ctx.db.patch(next._id, { cards: whole.map(engineHalf) });
    console.log(`splitStoredCards: ${next.code}/${next.format}, ${whole.length} cards`);

    await ctx.scheduler.runAfter(0, internal.migrations.splitStoredCards, {
      migrated: migrated + 1,
    });
    return { migrated: migrated + 1, done: false };
  },
});
