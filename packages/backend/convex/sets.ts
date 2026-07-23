import { v } from "convex/values";
import {
  type Card,
  type CardDataResponse,
  type ColorRating,
  type ScryfallCard,
  type SeventeenLandsCard,
  colorPairWinRates,
  isBasicLand,
  mergeCards,
  normalizeName,
} from "@mtg-tutor/core";
import { action, internalMutation, mutation, query } from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel.js";
import { card, cardStats, packComposition } from "./validators.js";

// `ingest` calls `internal.sets.store`, which lives in this same module, so its
// return type would be inferred from a type that depends on itself. Declaring
// the shape explicitly breaks that cycle (TS7022/TS7023 otherwise).
export interface IngestResult {
  setId: Id<"sets">;
  cardCount: number;
  ratedCardCount: number;
  keptExistingSnapshot: boolean;
}

const USER_AGENT =
  "mtg-tutor/0.1 (draft-trainer; https://github.com/maxhimmel/mtg-tutor)";
const SCRYFALL_DELAY_MS = 90;

// Convex documents cap at 1MB. Real sets land at 126-164KB, so this is a guard
// rail rather than an expected path -- but fail loudly if a set ever grows past it.
const MAX_SET_BYTES = 900_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${res.status} from ${url}`);
  return (await res.json()) as T;
}

async function scryfallSearch(query: string): Promise<ScryfallCard[]> {
  const out: ScryfallCard[] = [];
  let url: string | null =
    `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}` +
    `&unique=prints&order=set`;

  while (url) {
    const res: Response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (res.status === 404) return out;
    if (!res.ok) throw new Error(`Scryfall ${res.status} for query "${query}"`);

    const body = (await res.json()) as {
      data: ScryfallCard[];
      has_more: boolean;
      next_page: string | null;
    };
    out.push(...body.data);
    url = body.has_more ? body.next_page : null;
    if (url) await sleep(SCRYFALL_DELAY_MS);
  }

  return out;
}

// Every card that can appear in the set's boosters -- which is more than the set
// itself. Modern boosters carry a bonus sheet (Mystical Archive) and Special
// Guests, printed under their own set codes and released the same day. Those are
// real picks: a bonus card appears in 100% of SOS packs.
//
// `is:booster` used to filter this and cannot: Scryfall does not flag it for
// Play Booster sets, so `set:sos is:booster` 404s and the set was undraftable.
// The caller narrows the result to 17Lands' manifest instead, which is the
// authoritative list of what is actually in packs.
async function fetchScryfallPool(setCode: string): Promise<ScryfallCard[]> {
  const main = await scryfallSearch(`set:${setCode}`);
  if (main.length === 0) return main;

  const released = await getJson<{ released_at?: string }>(
    `https://api.scryfall.com/sets/${encodeURIComponent(setCode)}`,
  ).catch(() => ({ released_at: undefined }));
  if (!released.released_at) return main;

  await sleep(SCRYFALL_DELAY_MS);
  // Bonus sheets ship on the set's release day, so this finds them without a
  // per-set mapping table -- Special Guests is shared across sets and is not a
  // Scryfall child of any of them.
  const sameDay = await scryfallSearch(
    `game:arena date=${released.released_at} -set:${setCode}`,
  ).catch(() => [] as ScryfallCard[]);

  return [...main, ...sameDay];
}

// Narrows a Scryfall pool to the cards 17Lands saw in packs, plus basic lands.
// Also collapses reprints/variants to one card per name -- `unique=prints` is
// deliberate (it is how a bonus-sheet printing keeps its own rarity) but it
// returns showcase and borderless versions of the same card too. The first
// print wins, and the main set is searched first, so a card appearing in both
// the set and a bonus sheet keeps its main-set rarity.
function pickDraftable(cards: Card[], ratings: SeventeenLandsCard[]): Card[] {
  const manifest = new Set(ratings.map((r) => normalizeName(r.name)));
  const seen = new Set<string>();
  const out: Card[] = [];

  for (const c of cards) {
    const key = normalizeName(c.name);
    if (seen.has(key)) continue;
    // With no ratings at all we cannot tell draftable from promo, so keep
    // everything rather than ingest an empty set.
    if (manifest.size > 0 && !manifest.has(key) && !isBasicLand(c)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

// Pulls Scryfall + 17Lands and stores the merged set. Safe to re-run: see the
// unrated-snapshot guard in `store`.
export const ingest = action({
  args: { setCode: v.string(), format: v.optional(v.string()) },
  handler: async (ctx, args): Promise<IngestResult> => {
    const setCode = args.setCode.toLowerCase();
    const format = args.format ?? "PremierDraft";
    const exp = setCode.toUpperCase();

    // `/api/card_data` with `event_type` serves every set back to 2020. The
    // legacy `/card_ratings/data?format=` this used to call still responds, but
    // suppresses any card under 500 games-in-hand, so only currently-live queues
    // came back rated and every other set silently scored on RARITY_BASELINE.
    // Date params are inert on both endpoints (the real ones are start/end).
    const [scryfall, ratings, colorRatings] = await Promise.all([
      fetchScryfallPool(setCode),
      getJson<CardDataResponse>(
        `https://www.17lands.com/api/card_data?expansion=${exp}&event_type=${format}`,
      ).then((r) => r.data ?? []),
      getJson<ColorRating[]>(
        `https://www.17lands.com/color_ratings/data?expansion=${exp}&event_type=${format}` +
          `&combine_splash=false`,
      ).catch((e) => {
        console.warn(`color_ratings failed for ${exp}/${format}: ${String(e)}`);
        return [] as ColorRating[];
      }),
    ]);

    if (scryfall.length === 0) {
      throw new Error(`No Scryfall cards found for set "${setCode}". Check the set code.`);
    }

    // 17Lands lists exactly what appears in packs, so it decides the pool --
    // that drops promos, art cards and Alchemy rebalances the searches pull in,
    // and keeps the bonus sheet. Basics are the one omission (they are not
    // rated) and the Play Booster land slot needs them.
    const cards = pickDraftable(mergeCards(scryfall, ratings), ratings);
    const pairs = [...colorPairWinRates(colorRatings)].map(([pair, winRate]) => ({
      pair,
      winRate,
    }));

    return await ctx.runMutation(internal.sets.store, {
      code: setCode,
      format,
      cards,
      colorPairWinRates: pairs,
    });
  },
});

export const store = internalMutation({
  args: {
    code: v.string(),
    format: v.string(),
    cards: v.array(card),
    colorPairWinRates: v.array(v.object({ pair: v.string(), winRate: v.number() })),
  },
  handler: async (ctx, args) => {
    const bytes = JSON.stringify(args.cards).length;
    if (bytes > MAX_SET_BYTES) {
      throw new Error(
        `Set ${args.code} serializes to ${bytes} bytes, over the ${MAX_SET_BYTES} guard. ` +
          `Split the card list across rows before ingesting it.`,
      );
    }

    const rated = args.cards.filter((c) => c.gihWinRate != null).length;
    const existing = await ctx.db
      .query("sets")
      .withIndex("by_code_and_format", (q) => q.eq("code", args.code).eq("format", args.format))
      .unique();

    // A set can come back with the full card list and every win rate null --
    // a brand new set with no games yet, or an upstream hiccup. Re-ingesting
    // then would destroy a good snapshot, so keep the one we already have.
    // (This is not about rotation: /api/card_data serves every set back to 2020.)
    if (existing && rated === 0 && existing.ratedCardCount > 0) {
      return {
        setId: existing._id,
        cardCount: existing.cards.length,
        ratedCardCount: existing.ratedCardCount,
        keptExistingSnapshot: true,
      };
    }

    const doc = {
      code: args.code,
      format: args.format,
      cards: args.cards,
      colorPairWinRates: args.colorPairWinRates,
      ratedCardCount: rated,
      ingestedAt: new Date().toISOString(),
      // `replace` writes the whole document, so carrying this forward is what
      // stops a re-ingest from silently dropping the set back to 15-card packs.
      packComposition: existing?.packComposition,
    };

    const setId = existing
      ? (await ctx.db.replace(existing._id, doc), existing._id)
      : await ctx.db.insert("sets", doc);

    return {
      setId,
      cardCount: args.cards.length,
      ratedCardCount: rated,
      keptExistingSnapshot: false,
    };
  },
});

// Written from the 17Lands draft dataset by
// `packages/backend/scripts/extract-pack-composition.mjs`, which ingestion has
// no way to reach -- the shapes come from observing real boosters, not from any
// API. Kept separate so re-ingesting a set never has to redo it.
export const storePackComposition = mutation({
  args: {
    code: v.string(),
    format: v.string(),
    composition: packComposition,
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sets")
      .withIndex("by_code_and_format", (q) =>
        q.eq("code", args.code.toLowerCase()).eq("format", args.format),
      )
      .unique();
    if (!existing) {
      throw new Error(
        `No stored set "${args.code}" (${args.format}). Run sets:ingest for it first.`,
      );
    }

    const total = args.composition.shapes.reduce((sum, s) => sum + s.weight, 0);
    if (total <= 0) throw new Error("Pack composition has no weight; nothing to sample.");

    await ctx.db.patch(existing._id, { packComposition: args.composition });
    return {
      setId: existing._id,
      packSize: args.composition.size,
      shapeCount: args.composition.shapes.length,
    };
  },
});

// Upserts the artifact produced by scripts/build-set-stats.mjs. Kept separate
// from `ingest` because it cannot be derived from any API -- it comes from
// streaming ~1.2GB of public dataset, which no server action should attempt.
export const storeSetStats = mutation({
  args: {
    code: v.string(),
    format: v.string(),
    games: v.number(),
    baseWinRate: v.number(),
    cards: v.array(cardStats),
    archetypes: v.array(
      v.object({ name: v.string(), colors: v.string(), n: v.number(), wr: v.number() }),
    ),
    synergies: v.array(
      v.object({
        name: v.string(),
        partners: v.array(
          v.object({ partner: v.string(), lift: v.number(), n: v.number() }),
        ),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const bytes = JSON.stringify(args).length;
    if (bytes > MAX_SET_BYTES) {
      throw new Error(
        `Stats for ${args.code} serialize to ${bytes} bytes, over the ${MAX_SET_BYTES} guard. ` +
          `Lower SYNERGY_PER_CARD or raise the sample floors in build-set-stats.mjs.`,
      );
    }
    if (args.baseWinRate <= 0 || args.baseWinRate >= 1) {
      throw new Error(`baseWinRate ${args.baseWinRate} is not a rate; recentering would corrupt scoring.`);
    }

    const code = args.code.toLowerCase();
    const doc = { ...args, code, builtAt: new Date().toISOString() };
    const existing = await ctx.db
      .query("setStats")
      .withIndex("by_code_and_format", (q) => q.eq("code", code).eq("format", args.format))
      .unique();

    const id = existing
      ? (await ctx.db.replace(existing._id, doc), existing._id)
      : await ctx.db.insert("setStats", doc);

    return { id, cards: args.cards.length, bytes, baseWinRate: args.baseWinRate };
  },
});

export const getStats = query({
  args: { setCode: v.string(), format: v.optional(v.string()) },
  handler: async (ctx, args) =>
    await ctx.db
      .query("setStats")
      .withIndex("by_code_and_format", (q) =>
        q.eq("code", args.setCode.toLowerCase()).eq("format", args.format ?? "PremierDraft"),
      )
      .unique(),
});

export const get = query({
  args: { setCode: v.string(), format: v.optional(v.string()) },
  handler: async (ctx, args) =>
    await ctx.db
      .query("sets")
      .withIndex("by_code_and_format", (q) =>
        q.eq("code", args.setCode.toLowerCase()).eq("format", args.format ?? "PremierDraft"),
      )
      .unique(),
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const sets = await ctx.db.query("sets").collect();
    return sets.map((s) => ({
      code: s.code,
      format: s.format,
      cardCount: s.cards.length,
      ratedCardCount: s.ratedCardCount,
      ingestedAt: s.ingestedAt,
    }));
  },
});
