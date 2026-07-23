import { v } from "convex/values";
import {
  type CardDataResponse,
  type ColorRating,
  type ScryfallCard,
  colorPairWinRates,
  mergeCards,
} from "@mtg-tutor/core";
import { action, internalMutation, query } from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel.js";
import { card } from "./validators.js";

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

async function fetchScryfallSet(setCode: string): Promise<ScryfallCard[]> {
  const out: ScryfallCard[] = [];
  let url: string | null =
    `https://api.scryfall.com/cards/search?q=set%3A${encodeURIComponent(setCode)}` +
    `+is%3Abooster&unique=cards&order=set`;

  while (url) {
    const res: Response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (res.status === 404) return out;
    if (!res.ok) throw new Error(`Scryfall ${res.status} for set ${setCode}`);

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
      fetchScryfallSet(setCode),
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

    const cards = mergeCards(scryfall, ratings);
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
