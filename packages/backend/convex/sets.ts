import { v } from "convex/values";
import {
  type Card,
  type ScryfallCard,
  type SeventeenLandsCard,
  isBasicLand,
  mergeCards,
  normalizeName,
  observedRarityBaselines,
} from "@mtg-tutor/core";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import type { Doc, Id } from "./_generated/dataModel.js";
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

// Our own stats, adapted to the shape `mergeCards` reads. This is where win
// rates enter the set document: from setStats, which we derived from the
// 17Lands public datasets -- not from the API. The API is a testing oracle only
// (see scripts/validate-set-stats.mjs), never a runtime dependency.
function statsAsRatings(stats: Doc<"setStats">): SeventeenLandsCard[] {
  return stats.cards.map((c) => ({
    name: c.name,
    color: "",
    rarity: "",
    url: "",
    avg_seen: c.alsa ?? null,
    avg_pick: c.ata ?? null,
    seen_count: c.seen ?? null,
    pick_count: c.taken ?? null,
    ever_drawn_win_rate: c.gihWr ?? null,
    ever_drawn_game_count: c.gihN ?? null,
    win_rate: c.deckWr ?? null,
  }));
}

// Builds the draftable set document from Scryfall (card metadata + pool) and our
// own setStats (win rates, baselines, colour-pair rates, pack composition). No
// 17Lands API call. Requires stats to be built and seeded first --
//   pnpm build-set-stats <SET> <FORMAT> && pnpm seed-set-stats
// -- so the flow is availability -> build -> seed -> ingest.
export const ingest = action({
  args: { setCode: v.string(), format: v.optional(v.string()) },
  handler: async (ctx, args): Promise<IngestResult> => {
    const setCode = args.setCode.toLowerCase();
    const format = args.format ?? "PremierDraft";

    const [scryfall, stats] = await Promise.all([
      fetchScryfallPool(setCode),
      ctx.runQuery(internal.sets.readStats, { code: setCode, format }),
    ]);

    if (scryfall.length === 0) {
      throw new Error(`No Scryfall cards found for set "${setCode}". Check the set code.`);
    }
    if (!stats) {
      throw new Error(
        `No stats for "${setCode}" (${format}). Build and seed them first: ` +
          `pnpm build-set-stats ${setCode.toUpperCase()} ${format} && pnpm seed-set-stats`,
      );
    }

    const ratings = statsAsRatings(stats);

    // Our stats list exactly what appears in packs, so it decides the pool --
    // that drops promos, art cards and Alchemy rebalances the Scryfall search
    // pulls in, and keeps the bonus sheet. Basics are the one omission (they are
    // not rated) and the Play Booster land slot needs them.
    const draftable = pickDraftable(mergeCards(scryfall, ratings), ratings);

    // Measure what an unrated card of each rarity is worth in THIS set, from the
    // set's own rated cards, and stamp it on every card. Without it, unrated
    // cards are scored against a fixed guess that no format actually sits on --
    // ~7 points low for SOS, and 41 of its 49 unrated cards are rares/mythics.
    // See the note on Card.rarityBaseline for why it is denormalised.
    const baselines = observedRarityBaselines(draftable);
    const cards = draftable.map((c) => {
      const rarityBaseline = baselines.get(c.rarity);
      return rarityBaseline != null ? { ...c, rarityBaseline } : c;
    });

    // Two-colour archetype win rates, for describing guilds in the review.
    const pairs = (stats.colorWinRates ?? [])
      .filter((c) => /^[WUBRG]{2}$/.test(c.colors))
      .map((c) => ({ pair: c.colors, winRate: c.wr }));

    return await ctx.runMutation(internal.sets.store, {
      code: setCode,
      format,
      cards,
      colorPairWinRates: pairs,
      packComposition: stats.packComposition,
    });
  },
});

export const readStats = internalQuery({
  args: { code: v.string(), format: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("setStats")
      .withIndex("by_code_and_format", (q) =>
        q.eq("code", args.code.toLowerCase()).eq("format", args.format),
      )
      .unique(),
});

export const store = internalMutation({
  args: {
    code: v.string(),
    format: v.string(),
    cards: v.array(card),
    colorPairWinRates: v.array(v.object({ pair: v.string(), winRate: v.number() })),
    packComposition: v.optional(packComposition),
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
      // Ingest passes this from setStats; fall back to any existing value so a
      // bare re-run can't drop the set back to 15-card packs.
      packComposition: args.packComposition ?? existing?.packComposition,
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

// Upserts the artifact produced by scripts/build-set-stats.mjs -- the whole of a
// set's derived stats, including its pack composition, which `ingest` then reads.
// Separate from `ingest` because it cannot be derived from any API: it comes from
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
    colorWinRates: v.array(
      v.object({ colors: v.string(), n: v.number(), wr: v.number() }),
    ),
    synergies: v.array(
      v.object({
        name: v.string(),
        partners: v.array(
          v.object({ partner: v.string(), lift: v.number(), n: v.number() }),
        ),
      }),
    ),
    packComposition: v.optional(packComposition),
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
