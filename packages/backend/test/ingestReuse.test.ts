// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest";
import { restateRatings } from "@mtg-tutor/core";

import { harness } from "./convexHarness.js";
import { internal } from "../convex/_generated/api.js";
import { cardText, engineCard } from "../convex/validators.js";
import { CRAWL_REVISION, META_REVISION, POOL_REVISION } from "../convex/sets.js";
import type { StoredCard } from "../convex/validators.js";

// What `sets.ingest` re-reads instead of crawling Scryfall for it again.
//
// The saving is only safe while this read is LOSSLESS: a re-derived set is built
// from whatever comes back here, so a field the round trip drops is a field that
// silently disappears from every set that took the cheap path -- while a full
// crawl kept it. That is the failure this file exists to make loud.

const complete: StoredCard = {
  name: "Beluna's Gatekeeper // Entry Denied",
  colors: ["U"],
  slot: "common",
  packRate: 0.42,
  value: 0.55,
  turn: 6,
  role: "creature",
  tableValue: 0.53,
  rarity: "common",
  colorIdentity: ["U"],
  gihWinRate: 0.55,
  gihGames: 1000,
  alsa: 5.5,
  rarityBaseline: 0.54,
  manaCost: "{5}{U} // {1}{U}",
  cmc: 6,
  typeLine: "Creature — Giant Soldier // Sorcery — Adventure",
  oracleText: "When this creature enters, return target creature to its owner's hand.",
  power: "4",
  toughness: "4",
  loyalty: "3",
  imageUrl: "https://example.invalid/front.jpg",
  layout: "adventure",
  backImageUrl: "https://example.invalid/back.jpg",
  tokens: [{ name: "Insect", typeLine: "Token Creature — Insect" }],
  helpers: [
    {
      name: "The Ring // The Ring Tempts You",
      typeLine: "Emblem // Card",
      imageUrl: "https://example.test/ring-front.jpg",
      backImageUrl: "https://example.test/ring-back.jpg",
    },
  ],
  collectorNumber: "51",
  setCode: "woe",
  avgPick: 4.07,
  winRate: 0.55,
  iwd: 0.02,
  maindeckRate: 0.6,
};

async function storeAndRead(t: ReturnType<typeof harness>, cards: StoredCard[]) {
  await t.mutation(internal.sets.store, {
    code: "woe",
    format: "TradDraft",
    cards,
    colorWinRates: [],
    contexts: [],
    sourceHash: "pool-1",
    crawlHash: "crawl-1",
    metaRevision: "meta-1",
  });
  return await t.query(internal.sets.readPool, { code: "woe", format: "TradDraft" });
}

describe("readPool", () => {
  // The same argument textHalf's test makes, one step further down: that test
  // proves the projection writes every field, this one proves the join reads
  // them all back. Key sets rather than named fields, so it catches the NEXT
  // field to go missing rather than the last one that did.
  it("gives back every field that was stored", async () => {
    const pool = await storeAndRead(harness(), [complete]);

    expect(pool).not.toBeNull();
    expect(pool).toHaveLength(1);
    expect(Object.keys(pool![0]).sort()).toEqual(Object.keys(complete).sort());
    expect(pool![0]).toEqual(complete);
  });

  // Without this the test above can pass by being blind: a fixture missing a
  // field agrees with a round trip that drops it.
  it("keeps the fixture exhaustive", () => {
    const declared = [
      ...Object.keys(engineCard.fields),
      ...Object.keys(cardText.fields),
    ];
    const missing = declared.filter((k) => complete[k as keyof StoredCard] === undefined);
    expect(missing).toEqual([]);
  });

  it("says nothing at all about a set it has never stored", async () => {
    const t = harness();
    expect(await t.query(internal.sets.readPool, { code: "ltr", format: "TradDraft" })).toBeNull();
  });
});

// The end-to-end claim the split rests on, as far as it can be made without a
// network: a stored pool, read back and restated against new numbers, is the
// same INPUT a fresh crawl would have handed the derivation -- printing intact,
// ratings new, nothing derived carried over.
describe("a re-derive off the stored pool", () => {
  it("keeps the printing and takes the new ratings", async () => {
    const pool = await storeAndRead(harness(), [complete]);

    const [card] = restateRatings(pool!, [
      {
        name: "Beluna's Gatekeeper // Entry Denied",
        color: "U",
        rarity: "common",
        url: "",
        avg_seen: 2.2,
        avg_pick: 2.0,
        seen_count: 500,
        pick_count: 500,
        ever_drawn_win_rate: 0.61,
        ever_drawn_game_count: 8000,
        win_rate: 0.60,
      },
    ]);

    expect(card.oracleText).toBe(complete.oracleText);
    expect(card.typeLine).toBe(complete.typeLine);
    expect(card.imageUrl).toBe(complete.imageUrl);
    expect(card.backImageUrl).toBe(complete.backImageUrl);
    expect(card.tokens).toEqual(complete.tokens);
    expect(card.collectorNumber).toBe(complete.collectorNumber);

    expect(card.gihWinRate).toBe(0.61);
    expect(card.alsa).toBe(2.2);

    // Recomputed by the derivation that runs next, against the NEW stats. A
    // survivor here would be a number measured against the previous ones.
    expect(card).not.toHaveProperty("value");
    expect(card).not.toHaveProperty("tableValue");
    expect(card).not.toHaveProperty("rarityBaseline");
    expect(card).not.toHaveProperty("packRate");
  });
});

// The claim the whole split was built for, made against the real action: a set
// whose STATS moved and whose PRINTINGS did not is rebuilt without a crawl.
//
// Worth an end-to-end test rather than trusting the two units above, because the
// failure mode is not an exception -- it is a deploy that still works and still
// crawls, which reads as "the optimization is in" right up until the bill or the
// clock says otherwise. `reusedPool` is asserted for exactly that reason.
describe("sets.ingest after a scoring change", () => {
  const DEPLOY_KEY = "test-deploy-key";

  async function seeded(crawlHash: string) {
    process.env.MTG_TUTOR_DEPLOY_KEY = DEPLOY_KEY;
    const t = harness();

    await t.mutation(internal.sets.store, {
      code: "woe",
      format: "TradDraft",
      cards: [complete],
      colorWinRates: [],
      contexts: [],
      // Stored as the ingest stores them: already carrying their revision tags.
      sourceHash: `${POOL_REVISION}:stats-before`,
      crawlHash: `${CRAWL_REVISION}:${crawlHash}`,
      metaRevision: META_REVISION,
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("setStats", {
        code: "woe",
        format: "TradDraft",
        games: 1000,
        baseWinRate: 0.58,
        cards: [
          {
            name: complete.name,
            gihN: 8000,
            gihWr: 0.61,
            ohN: 3000,
            ohWr: 0.60,
            gdN: 5000,
            gdWr: 0.62,
            gndN: 2000,
            gndWr: 0.55,
            iwd: 0.06,
            deckN: 9000,
            deckWr: 0.59,
            alsa: 2.2,
            ata: 2.0,
            seen: 500,
            taken: 500,
            maindeckRate: 0.9,
          },
        ],
        archetypes: [],
        synergies: [],
        packCards: [{ name: complete.name, slot: "common", setCode: "woe" }],
        builtAt: "2026-08-26T00:00:00.000Z",
      } as never);
    });

    return t;
  }

  it("re-derives from the stored pool when only the stats moved", async () => {
    const t = await seeded("identities-1");

    const result: any = await t.action(internal.sets.ingest as never, {
      setCode: "woe",
      format: "TradDraft",
      sourceHash: "stats-after",
      crawlHash: "identities-1",
      deployKey: DEPLOY_KEY,
    } as never);

    expect(result.reusedPool).toBe(true);
    expect(result.skipped).toBe(false);

    // The new win rate reached the stored card, so this is a real rebuild and
    // not a dressed-up skip.
    const pool = await t.query(internal.sets.readPool, { code: "woe", format: "TradDraft" });
    expect(pool![0].gihWinRate).toBe(0.61);
    expect(pool![0].alsa).toBe(2.2);
    // And the printing came through the rebuild untouched.
    expect(pool![0].oracleText).toBe(complete.oracleText);
  });

  it("still skips outright when nothing moved at all", async () => {
    const t = await seeded("identities-1");

    const result: any = await t.action(internal.sets.ingest as never, {
      setCode: "woe",
      format: "TradDraft",
      sourceHash: "stats-before",
      crawlHash: "identities-1",
      deployKey: DEPLOY_KEY,
    } as never);

    expect(result.skipped).toBe(true);
  });
});
