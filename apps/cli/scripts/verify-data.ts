// Throwaway script: confirm the live 17Lands + Scryfall response shapes before
// building the model layer. Run: npm run verify-data [setCode]
// Fails loudly if an expected field is missing so we catch API drift early.

const SET = (process.argv[2] ?? "fdn").toLowerCase();
const UA =
  "mtg-tutor/0.1 (draft-trainer; https://github.com/local/mtg-tutor) contact:local";

const EXPECTED_17LANDS = [
  "name",
  "color",
  "rarity",
  "url",
  "avg_seen",
  "avg_pick",
  "seen_count",
  "pick_count",
  "ever_drawn_win_rate",
  "ever_drawn_game_count",
  "win_rate",
];

const EXPECTED_SCRYFALL = [
  "name",
  "rarity",
  "colors",
  "color_identity",
  "type_line",
  "collector_number",
  "booster",
];

function checkFields(label: string, obj: Record<string, unknown>, expected: string[]) {
  const missing = expected.filter((f) => !(f in obj));
  if (missing.length) {
    console.error(`\n❌ ${label}: MISSING fields -> ${missing.join(", ")}`);
  } else {
    console.log(`\n✅ ${label}: all expected fields present`);
  }
  console.log(`   sample keys: ${Object.keys(obj).sort().join(", ")}`);
}

async function verify17Lands() {
  const url = `https://www.17lands.com/api/card_data?expansion=${SET.toUpperCase()}&event_type=PremierDraft`;
  console.log(`\n── 17Lands ──\nGET ${url}`);
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  console.log(`   status: ${res.status} ${res.statusText}`);
  if (!res.ok) throw new Error(`17Lands request failed: ${res.status}`);
  const body = (await res.json()) as { data?: Record<string, unknown>[] };
  if (!Array.isArray(body.data)) {
    console.error(`   ❌ expected an envelope with a "data" array, got: ${Object.keys(body)}`);
    return;
  }
  const data = body.data;
  console.log(`   cards returned: ${data.length}`);
  if (!data.length) {
    console.error(`   ⚠️  empty payload — set "${SET}" may have no 17Lands data`);
    return;
  }

  // The whole point of this check: the legacy endpoint still answers, but with
  // every win rate null. A card list alone does not mean the ratings arrived.
  const rated = data.filter((c) => c.ever_drawn_win_rate != null);
  if (!rated.length) {
    console.error(`   ❌ ${data.length} cards but 0 rated — ratings are not coming through`);
    return;
  }
  console.log(`   ✅ rated cards: ${rated.length}/${data.length}`);

  const withData = rated[0];
  checkFields("17Lands card", withData, EXPECTED_17LANDS);
  console.log(
    `   e.g. ${withData.name}: GIH WR=${withData.ever_drawn_win_rate} ALSA=${withData.avg_seen} n=${withData.ever_drawn_game_count} rarity=${withData.rarity} color=${withData.color}`,
  );
}

async function verifyScryfall() {
  const url = `https://api.scryfall.com/cards/search?q=set%3A${SET}+is%3Abooster&unique=cards`;
  console.log(`\n── Scryfall ──\nGET ${url}`);
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
  console.log(`   status: ${res.status} ${res.statusText}`);
  if (!res.ok) throw new Error(`Scryfall request failed: ${res.status}`);
  const body = (await res.json()) as { total_cards: number; has_more: boolean; data: Record<string, unknown>[] };
  console.log(`   total_cards: ${body.total_cards}  has_more: ${body.has_more}  page size: ${body.data.length}`);
  const card = body.data[0];
  checkFields("Scryfall card", card, EXPECTED_SCRYFALL);
  console.log(`   has image_uris: ${"image_uris" in card}  has oracle_text: ${"oracle_text" in card}`);
  const byRarity = body.data.reduce<Record<string, number>>((acc, c) => {
    const r = String(c.rarity);
    acc[r] = (acc[r] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`   rarity spread (page 1): ${JSON.stringify(byRarity)}`);
}

async function main() {
  console.log(`Verifying data contracts for set: ${SET}`);
  await verify17Lands();
  await verifyScryfall();
  console.log(`\nDone.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
