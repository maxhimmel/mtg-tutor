import { v } from "convex/values";
import {
  type Card,
  type IngestCard,
  type ScryfallCard,
  type SeventeenLandsCard,
  VALUE_FINGERPRINT,
  computeCardValue,
  isBasicLand,
  mergeCards,
  normalizeName,
  observedRarityBaselines,
  packSize,
  withPackSlots,
} from "@mtg-tutor/core";
import { requireDeployerOrAdmin } from "./admin.js";
import { cardContextFor, cardTextFor, engineHalf, hydrate, textHalf } from "./cardText.js";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import type { Doc, Id } from "./_generated/dataModel.js";
import {
  card,
  cardContext,
  cardStats,
  colorWinRate,
  packCard,
  packComposition,
} from "./validators.js";

// `ingest` calls `internal.sets.store`, which lives in this same module, so its
// return type would be inferred from a type that depends on itself. Declaring
// the shape explicitly breaks that cycle (TS7022/TS7023 otherwise).
export interface IngestResult {
  setId: Id<"sets">;
  cardCount: number;
  ratedCardCount: number;
  keptExistingSnapshot: boolean;
  // True when both fingerprints already matched and nothing was fetched at all.
  skipped: boolean;
  // True when the card pool was current and only the one-request set metadata
  // was refreshed.
  metaOnly: boolean;
  // Pack cards the artifact declares but the pool ended up without. Should
  // always be 0: build-set-stats refuses to write a name it could not resolve,
  // so anything here means the pool silently deals a smaller bonus sheet than
  // the shapes were counted from. Absent on the cached paths, which fetch
  // nothing.
  missingPackCards?: number;
}

const USER_AGENT =
  "mtg-tutor/0.1 (draft-trainer; https://github.com/maxhimmel/mtg-tutor)";
const SCRYFALL_DELAY_MS = 90;
const SCRYFALL_MAX_RETRIES = 5;
const SCRYFALL_BACKOFF_MS = 1_000;

// A set document is fingerprinted in two independent halves, because its two
// halves cost wildly different amounts to rebuild.
//
// The pool -- the card list -- comes from paginated /cards/search crawls, two of
// them per set. That is the expensive half and the one that earns 429s.
// POOL_REVISION pairs with the stats artifact's hash; bump it when the stored
// CARD data changes shape.
//
// The metadata -- name, icon -- comes from /sets/{code}, which is one request
// and returns everything at once. META_REVISION alone gates it, with no artifact
// hash, because none of it derives from our stats. Bump it to add or change a
// set-level field and every set refreshes for one request each.
//
// Keeping these apart is the whole point: adding the set name previously
// invalidated everything and dragged eight full card crawls behind a field that
// costs one cheap call.
//
// The values are opaque tags whose only job is to differ from their
// predecessors. Bumping POOL_REVISION re-crawls every set, so it is only worth
// it when the stored card shape actually changed -- "3-card-stats" added iwd and
// maindeckRate to the card, "4-card-split" put the pack slot on it and moved
// the rules text, art and reading statistics out to setCardText, and
// "5-value-precomputed" settled cardValue at ingest and sent the four statistics
// it was computed from after them, "6-rarity-off-pool" sent the fifth, and
// "9-card-shape" put Scryfall's layout and the back face's art on the text half
// so a two-in-one card can be explained and a double-faced one turned over.
// The tag names what changed; the fingerprint makes a change to how a card is
// VALUED invalidate every pool without anyone remembering to say so. See
// VALUE_FINGERPRINT.
const POOL_REVISION = `9-card-shape.${VALUE_FINGERPRINT}`;
const META_REVISION = "2-name-icon-released";

// Convex documents cap at 1MB. Real sets land at 126-164KB, so this is a guard
// rail rather than an expected path -- but fail loudly if a set ever grows past it.
const MAX_SET_BYTES = 900_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Scryfall rate limits on their side regardless of how politely SCRYFALL_DELAY_MS
// spaces our requests -- a deploy ingests every set back to back from a shared
// Vercel egress IP, and the sixth set in a row is enough to earn a 429. Backing
// off and retrying is what they ask for; throwing meant one 429 anywhere in a
// crawl failed the whole deploy and left production half-updated.
async function scryfallFetch(url: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (res.status !== 429 || attempt >= SCRYFALL_MAX_RETRIES) return res;

    const retryAfter = Number(res.headers.get("Retry-After"));
    await sleep(
      retryAfter > 0
        ? retryAfter * 1000
        : SCRYFALL_BACKOFF_MS * 2 ** attempt,
    );
  }
}

async function getJson<T>(url: string): Promise<T> {
  const res = await scryfallFetch(url);
  if (!res.ok) throw new Error(`${res.status} from ${url}`);
  return (await res.json()) as T;
}

async function scryfallSearch(query: string): Promise<ScryfallCard[]> {
  const out: ScryfallCard[] = [];
  let url: string | null =
    `https://api.scryfall.com/cards/search?q=${encodeURIComponent(query)}` +
    `&unique=prints&order=set`;

  while (url) {
    const res: Response = await scryfallFetch(url);
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

// Everything we keep about a set that is not a card. One request serves all of
// it, which is what makes refreshing it independently worth doing.
interface ScryfallSet {
  name?: string;
  released_at?: string;
  icon_svg_uri?: string;
}

// Never throws: a set whose metadata cannot be fetched still has a usable card
// pool, and the UI falls back to the set code.
async function fetchSetMeta(setCode: string): Promise<ScryfallSet> {
  return await getJson<ScryfallSet>(
    `https://api.scryfall.com/sets/${encodeURIComponent(setCode)}`,
  ).catch(() => ({}));
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
//
// The set lookup this needs for the release date is the same one that carries
// the metadata, so a full ingest gets both without paying twice.
async function fetchScryfallPool(
  setCode: string,
): Promise<{ cards: ScryfallCard[]; meta: ScryfallSet }> {
  const main = await scryfallSearch(`set:${setCode}`);
  if (main.length === 0) return { cards: main, meta: {} };

  const meta = await fetchSetMeta(setCode);
  if (!meta.released_at) return { cards: main, meta };

  await sleep(SCRYFALL_DELAY_MS);
  // Bonus sheets ship on the set's release day, so this finds them without a
  // per-set mapping table -- Special Guests is shared across sets and is not a
  // Scryfall child of any of them.
  const sameDay = await scryfallSearch(
    `game:arena date=${meta.released_at} -set:${setCode}`,
  ).catch(() => [] as ScryfallCard[]);

  return { cards: [...main, ...sameDay], meta };
}

// Scryfall's /cards/collection cap.
const COLLECTION_BATCH = 75;

// POST counterpart to scryfallFetch: same 429 backoff, different verb. A card
// the endpoint cannot find comes back under `not_found` and is simply absent
// from the result -- a missing bonus card is a smaller problem than a thrown
// ingest, and pickDraftable already tolerates a name it never sees.
async function postCollection(
  identifiers: { name: string; set: string }[],
): Promise<ScryfallCard[]> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.scryfall.com/cards/collection", {
      method: "POST",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ identifiers }),
    });

    if (res.status === 429 && attempt < SCRYFALL_MAX_RETRIES) {
      const retryAfter = Number(res.headers.get("Retry-After"));
      await sleep(
        retryAfter > 0 ? retryAfter * 1000 : SCRYFALL_BACKOFF_MS * 2 ** attempt,
      );
      continue;
    }
    if (!res.ok) throw new Error(`Scryfall ${res.status} from /cards/collection`);

    const body = (await res.json()) as { data: ScryfallCard[] };
    return body.data;
  }
}

// Fetches pack cards the release-day crawl above cannot reach. MKM's Arena
// boosters carry a 50-card List sheet printed between 2005 and 2017, so no
// "released the same day" query can find them; build-set-stats resolved each one
// by name and recorded which printing it landed on, and this reads that answer
// back rather than repeating the guess.
//
// Identified by {name, set} rather than name alone, which matters: a name-only
// lookup returns the card's DEFAULT printing, and for `Worldspine Wurm` that is
// a paper-only one. The stored set code is what makes this exact.
//
// /cards/collection takes 75 identifiers per request, so a set like MKM costs
// one round trip rather than fifty -- which is what keeps this inside the
// action's time budget.
async function fetchByPrinting(
  wanted: { name: string; setCode?: string }[],
): Promise<ScryfallCard[]> {
  // Front face only. /cards/collection matches a split or double-faced card by
  // the face name -- `Consign` resolves, `Consign // Oblivion` comes back in
  // not_found -- and it is the one place our card names are not already
  // front-face. Casing and punctuation are left alone; normalizeName would strip
  // the comma out of `Syr Konrad, the Grim` and stop matching.
  const identifiers = wanted
    .filter((c) => c.setCode)
    .map((c) => ({ name: c.name.split("//")[0].trim(), set: c.setCode as string }));
  const out: ScryfallCard[] = [];

  for (let i = 0; i < identifiers.length; i += COLLECTION_BATCH) {
    out.push(...(await postCollection(identifiers.slice(i, i + COLLECTION_BATCH))));
    if (i + COLLECTION_BATCH < identifiers.length) await sleep(SCRYFALL_DELAY_MS);
  }
  return out;
}

// Narrows a Scryfall pool to the cards 17Lands saw in packs, plus basic lands.
// Also collapses reprints/variants to one card per name -- `unique=prints` is
// deliberate (it is how a bonus-sheet printing keeps its own rarity) but it
// returns showcase and borderless versions of the same card too. The first
// print wins, and the main set is searched first, so a card appearing in both
// the set and a bonus sheet keeps its main-set rarity.
//
// The manifest is the union of the rated cards and the set's pack columns. Both
// are needed: ratings come from GAME data, so a card that appeared in packs but
// never made a deck is missing from them -- MKM's `Possibility Storm` is exactly
// that, and keying on ratings alone would fetch it and then drop it again.
function pickDraftable(
  cards: IngestCard[],
  ratings: SeventeenLandsCard[],
  packCards: { name: string }[] = [],
): IngestCard[] {
  const manifest = new Set(
    [...ratings.map((r) => r.name), ...packCards.map((p) => p.name)].map(normalizeName),
  );
  const seen = new Set<string>();
  const out: IngestCard[] = [];

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
  args: {
    setCode: v.string(),
    format: v.optional(v.string()),
    // Hash of the stats artifact this ingest is for. Omitted by callers that
    // have no artifact to hand (the CLI ingesting a set on demand), which just
    // means the set is always rebuilt.
    sourceHash: v.optional(v.string()),
    force: v.optional(v.boolean()),
    // Absent from the CLI's calls, which authenticate as a person instead.
    deployKey: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<IngestResult> => {
    await requireDeployerOrAdmin(ctx, args.deployKey);

    const setCode = args.setCode.toLowerCase();
    const format = args.format ?? "PremierDraft";

    // Checked before anything touches Scryfall: re-ingesting a set that has not
    // changed costs two paginated crawls, and doing that for every set on every
    // deploy is what got us rate limited in the first place.
    const poolFingerprint = args.sourceHash
      ? `${POOL_REVISION}:${args.sourceHash}`
      : undefined;

    if (poolFingerprint && !args.force) {
      const current = await ctx.runQuery(internal.sets.readIngestState, {
        code: setCode,
        format,
      });

      if (current && current.sourceHash === poolFingerprint) {
        // The card pool is current, so the crawl is off the table either way.
        // Metadata may still be behind -- one request settles it.
        if (current.metaRevision !== META_REVISION) {
          const meta = await fetchSetMeta(setCode);
          await ctx.runMutation(internal.sets.storeMeta, {
            code: setCode,
            format,
            name: meta.name,
            iconUri: meta.icon_svg_uri,
            releasedAt: meta.released_at,
            metaRevision: META_REVISION,
          });
          return {
            ...current.result,
            keptExistingSnapshot: false,
            skipped: false,
            metaOnly: true,
          };
        }

        return {
          ...current.result,
          keptExistingSnapshot: false,
          skipped: true,
          metaOnly: false,
        };
      }
    }

    const [scryfall, stats] = await Promise.all([
      fetchScryfallPool(setCode),
      ctx.runQuery(internal.sets.readStats, { code: setCode, format }),
    ]);

    if (scryfall.cards.length === 0) {
      throw new Error(`No Scryfall cards found for set "${setCode}". Check the set code.`);
    }
    if (!stats) {
      throw new Error(
        `No stats for "${setCode}" (${format}). Build and seed them first: ` +
          `pnpm build-set-stats ${setCode.toUpperCase()} ${format} && pnpm seed-set-stats`,
      );
    }

    const ratings = statsAsRatings(stats);
    const packCards = stats.packCards ?? [];

    // Bonus-sheet cards the release-day crawl could not reach. build-set-stats
    // already resolved which printing each one is, so this is an exact lookup
    // and costs one request per 75 cards. Empty for every set whose boosters
    // hold nothing older than the set itself, which is all of them but MKM.
    const known = new Set(scryfall.cards.map((c) => normalizeName(c.name)));
    const leftovers = await fetchByPrinting(
      packCards.filter((p) => !known.has(normalizeName(p.name))),
    );

    // Our stats list exactly what appears in packs, so it decides the pool --
    // that drops promos, art cards and Alchemy rebalances the Scryfall search
    // pulls in, and keeps the bonus sheet. Basics are the one omission (they are
    // not rated) and the Play Booster land slot needs them.
    //
    // Leftovers go last so pickDraftable's first-print-wins dedupe still lets a
    // name that is in both the main set and a bonus sheet keep its main rarity.
    const draftable = pickDraftable(
      mergeCards([...scryfall.cards, ...leftovers], ratings),
      ratings,
      packCards,
    );

    // Measure what an unrated card of each rarity is worth in THIS set, from the
    // set's own rated cards, and stamp it on every card. Without it, unrated
    // cards are scored against a fixed guess that no format actually sits on --
    // ~7 points low for SOS, and 41 of its 49 unrated cards are rares/mythics.
    // See the note on Card.rarityBaseline for why it is denormalised.
    const baselines = observedRarityBaselines(draftable);
    // How often each card was really opened, denormalised onto the card for the
    // same reason rarityBaseline is: makePack fills a slot from a plain Card[]
    // and has no set context to look anything up in. A card with no measured
    // rate leaves the field off, and makePack then draws that whole pool evenly
    // -- see sampleUnique.
    const rates = new Map(
      packCards
        .filter((p) => p.openedRate != null)
        .map((p) => [normalizeName(p.name), p.openedRate as number]),
    );
    // The two stats that make a GIH WR readable, denormalised for the same reason
    // as the two above. They do not come through statsAsRatings/mergeCards because
    // that path models the 17Lands API response, which has neither -- see
    // SeventeenLandsCard. This is where our own derived metrics belong.
    const readability = new Map(
      stats.cards.map((c) => [
        normalizeName(c.name),
        { iwd: c.iwd, maindeckRate: c.maindeckRate },
      ]),
    );
    const cards = draftable.map((c) => {
      const rarityBaseline = baselines.get(c.rarity);
      const packRate = rates.get(normalizeName(c.name));
      const { iwd, maindeckRate } = readability.get(normalizeName(c.name)) ?? {};
      const rated = {
        ...c,
        ...(rarityBaseline != null ? { rarityBaseline } : {}),
        ...(packRate != null ? { packRate } : {}),
        ...(iwd != null ? { iwd } : {}),
        ...(maindeckRate != null ? { maindeckRate } : {}),
      };
      // After the baseline is on, never before: computing it against the raw
      // card would bake in RARITY_BASELINE's fixed guess for every unrated card
      // and quietly undo what observedRarityBaselines just measured.
      return { ...rated, value: computeCardValue(rated) };
    });

    // Every archetype the format actually produced, at every colour count. The
    // two-colour filter that used to be here threw away the majority archetype
    // of ktk and snc, and with it the only measure of what a third colour costs
    // -- which is the difference between these rates and varies by set from
    // -0.3pp (snc) to -4.3pp (fdn).
    const colorWinRates = (stats.colorWinRates ?? []).filter((c) =>
      /^[WUBRG]+$/.test(c.colors),
    );

    const pooled = new Set(cards.map((c) => normalizeName(c.name)));
    const missingPackCards = packCards.filter(
      (p) => !pooled.has(normalizeName(p.name)),
    ).length;

    // The context rows. Built here rather than in `store` because this is where
    // the stats artifact is already open, and written as a whole row per card so
    // scoring reads a pack's worth and not a set's.
    const archByCard = new Map<string, Record<string, number>>();
    for (const a of stats.archetypes ?? []) {
      const key = normalizeName(a.name);
      const seen = archByCard.get(key) ?? {};
      seen[a.colors] = a.wr;
      archByCard.set(key, seen);
    }

    const contexts = stats.cards.map((c) => {
      const key = normalizeName(c.name);
      const archWr = archByCard.get(key);
      // Both halves have to have cleared the sample floor for the difference
      // between them to mean anything; the artifact writes undefined otherwise.
      const speed =
        c.ohWr != null && c.gdWr != null ? Math.round((c.ohWr - c.gdWr) * 1e4) / 1e4 : undefined;
      return {
        key,
        context: {
          ...(archWr && Object.keys(archWr).length > 0 ? { archWr } : {}),
          ...(speed != null ? { speed } : {}),
          ...(c.iwd != null ? { iwd: c.iwd } : {}),
          ...(c.maindeckRate != null ? { maindeckRate: c.maindeckRate } : {}),
        },
      };
    });

    const stored = await ctx.runMutation(internal.sets.store, {
      code: setCode,
      name: scryfall.meta.name,
      iconUri: scryfall.meta.icon_svg_uri,
      releasedAt: scryfall.meta.released_at,
      format,
      cards,
      colorWinRates,
      contexts,
      packComposition: stats.packComposition,
      sourceHash: poolFingerprint,
      metaRevision: META_REVISION,
    });

    return { ...stored, missingPackCards };
  },
});

// Just enough of a set document to decide whether to rebuild it, and to answer
// for it if not. Deliberately not `sets.get`: that returns the whole card list,
// and shipping 164KB into an action to compare one string would trade one waste
// for another.
export const readIngestState = internalQuery({
  args: { code: v.string(), format: v.string() },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("sets")
      .withIndex("by_code_and_format", (q) =>
        q.eq("code", args.code).eq("format", args.format),
      )
      .unique();
    if (!doc) return null;

    return {
      sourceHash: doc.sourceHash,
      metaRevision: doc.metaRevision,
      result: {
        setId: doc._id,
        cardCount: doc.cardCount,
        ratedCardCount: doc.ratedCardCount,
      },
    };
  },
});

// The cheap half of an ingest: set-level fields only, patched onto a document
// whose card pool is already current. Everything here came from one request.
export const storeMeta = internalMutation({
  args: {
    code: v.string(),
    format: v.string(),
    name: v.optional(v.string()),
    iconUri: v.optional(v.string()),
    releasedAt: v.optional(v.string()),
    metaRevision: v.string(),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("sets")
      .withIndex("by_code_and_format", (q) =>
        q.eq("code", args.code).eq("format", args.format),
      )
      .unique();
    if (!doc) {
      throw new Error(`No set "${args.code}" (${args.format}) to refresh.`);
    }

    // A failed metadata fetch arrives as undefined rather than an error, so
    // fall back to what is stored instead of blanking a good value. The
    // revision still advances: the fields are as current as Scryfall will say.
    await ctx.db.patch(doc._id, {
      name: args.name ?? doc.name,
      iconUri: args.iconUri ?? doc.iconUri,
      releasedAt: args.releasedAt ?? doc.releasedAt,
      metaRevision: args.metaRevision,
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
    name: v.optional(v.string()),
    iconUri: v.optional(v.string()),
    releasedAt: v.optional(v.string()),
    format: v.string(),
    cards: v.array(card),
    colorWinRates: v.array(colorWinRate),
    contexts: v.array(v.object({ key: v.string(), context: cardContext })),
    packComposition: v.optional(packComposition),
    sourceHash: v.optional(v.string()),
    metaRevision: v.optional(v.string()),
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
    const existingCards = await ctx.db
      .query("setCards")
      .withIndex("by_code_and_format", (q) => q.eq("code", args.code).eq("format", args.format))
      .unique();

    // A set can come back with the full card list and every win rate null --
    // a brand new set with no games yet, or an upstream hiccup. Re-ingesting
    // then would destroy a good snapshot, so keep the one we already have.
    // (This is not about rotation: /api/card_data serves every set back to 2020.)
    if (existing && rated === 0 && existing.ratedCardCount > 0) {
      // The card list is discarded, but the name is metadata the snapshot has
      // nothing to lose by taking.
      if (args.name && !existing.name) {
        await ctx.db.patch(existing._id, { name: args.name });
      }
      // The fingerprint is deliberately left stale. It describes the document we
      // just declined to write, so leaving it means the next run tries again
      // rather than skipping a set that never took.
      return {
        setId: existing._id,
        cardCount: existing.cardCount,
        ratedCardCount: existing.ratedCardCount,
        keptExistingSnapshot: true,
        skipped: false,
        metaOnly: false,
      };
    }

    // The draft payload, on its own row. Nothing here may leak back onto the
    // `sets` document: that row is read once per set by `list` on every page
    // showing the picker, which is what made the pool expensive in the first
    // place. See the setCards comment in schema.ts.
    // Which pool each card is dealt from, settled once here instead of being
    // re-derived from the type line on every replay of every draft.
    const slotted = withPackSlots(args.code, args.cards);

    const cardsDoc = {
      code: args.code,
      format: args.format,
      // The engine's half only. `slotted` is whole cards -- that is what the
      // action built from Scryfall and what the text rows below are written
      // from -- and storing them whole here is exactly the cost the split
      // exists to remove. It silently did, for as long as the pool validator
      // still accepted a whole card: every ingest undid the split for that set
      // and nothing failed. The strict validator is what makes it impossible.
      cards: slotted.map(engineHalf),
      colorWinRates: args.colorWinRates,
      // Ingest passes this from setStats; fall back to any existing value so a
      // bare re-run can't drop the set back to 15-card packs.
      packComposition: args.packComposition ?? existingCards?.packComposition,
    };

    if (existingCards) {
      await ctx.db.replace(existingCards._id, cardsDoc);
    } else {
      await ctx.db.insert("setCards", cardsDoc);
    }

    // The other half of every card, one row each. Replaced wholesale rather
    // than diffed: a re-ingest is rare and rewriting a few hundred small rows
    // costs less than working out which of them changed. Bounded by the set's
    // card count, so it is nowhere near a transaction's write limits.
    const staleText = await ctx.db
      .query("setCardText")
      .withIndex("by_code_format_and_key", (q) =>
        q.eq("code", args.code).eq("format", args.format),
      )
      .collect();
    for (const row of staleText) await ctx.db.delete(row._id);

    for (const c of slotted) {
      await ctx.db.insert("setCardText", {
        code: args.code,
        format: args.format,
        key: normalizeName(c.name),
        text: textHalf(c),
      });
    }

    // Same wholesale replace as the text rows above, and for the same reason.
    // Only cards the stats artifact actually had context for get a row, so a
    // reader must treat a missing one as "no context", not as an error -- which
    // is the honest state for a card no archetype had enough games of.
    const staleContext = await ctx.db
      .query("setCardContext")
      .withIndex("by_code_format_and_key", (q) =>
        q.eq("code", args.code).eq("format", args.format),
      )
      .collect();
    for (const row of staleContext) await ctx.db.delete(row._id);

    for (const { key, context } of args.contexts) {
      await ctx.db.insert("setCardContext", {
        code: args.code,
        format: args.format,
        key,
        context,
      });
    }

    const doc = {
      code: args.code,
      // Fall back to the stored name so a run that could not reach Scryfall's
      // set endpoint cannot blank it out.
      name: args.name ?? existing?.name,
      format: args.format,
      cardCount: args.cards.length,
      ratedCardCount: rated,
      ingestedAt: new Date().toISOString(),
      iconUri: args.iconUri ?? existing?.iconUri,
      releasedAt: args.releasedAt ?? existing?.releasedAt,
      sourceHash: args.sourceHash,
      metaRevision: args.metaRevision,
    };

    const setId = existing
      ? (await ctx.db.replace(existing._id, doc), existing._id)
      : await ctx.db.insert("sets", doc);

    return {
      setId,
      cardCount: args.cards.length,
      ratedCardCount: rated,
      keptExistingSnapshot: false,
      skipped: false,
      metaOnly: false,
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
    packCards: v.optional(v.array(packCard)),
    // Hash of the artifact file, so an unchanged one is not re-written on every
    // deploy. Optional: an upload without one always writes.
    sourceHash: v.optional(v.string()),
    force: v.optional(v.boolean()),
    // The deploy has no person to authenticate as. See admin.ts.
    deployKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireDeployerOrAdmin(ctx, args.deployKey);

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

    // Checked before anything touches the stats document itself. Reading that
    // document is the expensive act, not writing it, so the hash has to be
    // answerable from somewhere small. See setStatsMeta in schema.ts.
    const meta = await ctx.db
      .query("setStatsMeta")
      .withIndex("by_code_and_format", (q) => q.eq("code", code).eq("format", args.format))
      .unique();

    if (args.sourceHash && meta?.sourceHash === args.sourceHash && !args.force) {
      return {
        id: null,
        cards: args.cards.length,
        bytes,
        baseWinRate: args.baseWinRate,
        skipped: true,
      };
    }

    // deployKey is destructured out with the rest of the control arguments, and
    // that is not tidiness: `rest` is spread straight into the document below,
    // so a secret left in here would be written into setStats and read back by
    // everything that reads a set.
    const { sourceHash, force: _force, deployKey: _deployKey, ...rest } = args;
    const doc = { ...rest, code, builtAt: new Date().toISOString() };
    const existing = await ctx.db
      .query("setStats")
      .withIndex("by_code_and_format", (q) => q.eq("code", code).eq("format", args.format))
      .unique();

    const id = existing
      ? (await ctx.db.replace(existing._id, doc), existing._id)
      : await ctx.db.insert("setStats", doc);

    // Written last, so a run that dies mid-write leaves a stale-or-absent hash
    // and the next deploy retries rather than skipping a set that never landed.
    if (sourceHash) {
      const metaDoc = { code, format: args.format, sourceHash };
      if (meta) {
        await ctx.db.replace(meta._id, metaDoc);
      } else {
        await ctx.db.insert("setStatsMeta", metaDoc);
      }
    } else if (meta) {
      // An unhashed upload invalidates the fingerprint rather than leaving one
      // that describes an artifact this no longer holds.
      await ctx.db.delete(meta._id);
    }

    return {
      id,
      cards: args.cards.length,
      bytes,
      baseWinRate: args.baseWinRate,
      skipped: false,
    };
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

// The whole set, metadata and draft payload stitched back together. Deliberately
// fat and deliberately not used by the app: only the validation scripts
// (smoke-draft, validate-pack-model) call it, and they need the pool. Anything
// that just lists or names sets must use `list`, which is ~550x cheaper.
export const get = query({
  args: { setCode: v.string(), format: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const code = args.setCode.toLowerCase();
    const format = args.format ?? "PremierDraft";

    const setDoc = await ctx.db
      .query("sets")
      .withIndex("by_code_and_format", (q) => q.eq("code", code).eq("format", format))
      .unique();
    if (!setDoc) return null;

    const cardsDoc = await ctx.db
      .query("setCards")
      .withIndex("by_code_and_format", (q) => q.eq("code", code).eq("format", format))
      .unique();

    // Both halves put back together. This is the scripts' view of a set --
    // validate-pack-model, bench-llm, smoke-draft -- and they are run by hand a
    // few times a release, so the whole-set text read that costs is exactly the
    // read they came for. Nothing on a draft's hot path calls this.
    const text = cardsDoc ? await cardTextFor(ctx, code, format) : new Map();

    return {
      ...setDoc,
      cards: cardsDoc ? hydrate(cardsDoc.cards, text) : [],
      colorWinRates: cardsDoc?.colorWinRates ?? [],
      packComposition: cardsDoc?.packComposition,
    };
  },
});

// The rules text, art and reading statistics for one set's cards.
//
// Read once when a draft board mounts, and joined by name against every board
// the session returns after that. A set's text does not change between picks,
// so sending it back with each of the 42 picks is 42 copies of the same ~180KB
// -- which is what the pool document used to do implicitly, and the single
// biggest thing this split undoes. See draft.boardView.
export const cardText = query({
  args: { setCode: v.string(), format: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("setCardText")
      .withIndex("by_code_format_and_key", (q) =>
        q.eq("code", args.setCode.toLowerCase()).eq("format", args.format ?? "PremierDraft"),
      )
      .collect();
    return rows.map((r) => r.text);
  },
});

// What scoring reads to judge one pack's cards against the deck being built.
//
// Named cards only, and deliberately without a whole-set arm: `cardTextFor` has
// one because a review walkthrough genuinely wants every card, and nothing wants
// every card's CONTEXT except a replay, which happens server-side. A pack is
// ~14 rows, and that is the only shape this query is for.
//
// This is what makes the challenge free. Ranking a pack by contextValue needs
// these rows plus the archetype table `draft.state` already sends once, and the
// pack itself is on the client -- so the browser can name the card that best
// serves the deck without a second read of the 46KB pool, and without the server
// having to score a pick that has not been made yet.
//
// Named for the pack rather than for the card, unlike `cardText` beside it,
// because the whole-set read that name would imply is exactly what must not
// happen here.
export const packContext = query({
  args: {
    setCode: v.string(),
    format: v.optional(v.string()),
    names: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // Enforced, not just documented. cardContextFor fans out one indexed read
    // per name, and Convex bills bytes read -- so an unbounded list on a public
    // query is an unbounded bill. A pack is the largest thing this ever answers
    // for, and packSize() is this codebase's own answer to how big that is, so
    // a set whose boosters somehow exceed it fails loudly here rather than
    // quietly turning one query into a whole-set read.
    if (args.names.length > packSize()) {
      throw new Error(
        `packContext takes one pack at a time; ${args.names.length} names is more than ` +
          `the ${packSize()}-card cap. Read the set's context server-side if you need all of it.`,
      );
    }

    const found = await cardContextFor(
      ctx,
      args.setCode.toLowerCase(),
      args.format ?? "PremierDraft",
      args.names,
    );
    // As entries rather than a Map: Convex serializes the return value, and a
    // Map does not survive the wire. The client rebuilds it.
    return [...found].map(([key, context]) => ({ key, context }));
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const sets = await ctx.db.query("sets").collect();
    return sets
      .map((s) => ({
        code: s.code,
        name: s.name,
        format: s.format,
        cardCount: s.cardCount,
        ratedCardCount: s.ratedCardCount,
        ingestedAt: s.ingestedAt,
        releasedAt: s.releasedAt,
        iconUri: s.iconUri,
      }))
      // Newest first. Dates are ISO yyyy-mm-dd, so they compare as strings. A
      // set with no date yet -- ingested before the field existed, or whose
      // metadata fetch failed -- sorts last rather than pretending to be old.
      .sort((a, b) => {
        if (a.releasedAt !== b.releasedAt) {
          if (!a.releasedAt) return 1;
          if (!b.releasedAt) return -1;
          return b.releasedAt.localeCompare(a.releasedAt);
        }
        return a.code.localeCompare(b.code) || a.format.localeCompare(b.format);
      });
  },
});
