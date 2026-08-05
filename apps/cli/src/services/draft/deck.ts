import * as p from "@clack/prompts";
import pc from "picocolors";
import {
  CURVE_TOP,
  DECK,
  applyBench,
  benchChanges,
  buildDeck,
  byCurve,
  deckPiles,
  deckSizeNote,
  isLandCount,
  isLegalDeck,
} from "@mtg-tutor/core";
import type { Bench, BuiltDeck, Card } from "@mtg-tutor/core";
import type { ConvexHttpClient } from "convex/browser";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import { pct } from "../../core/ui/format.js";
import { editPiles, type PileRow } from "../../core/ui/cardPicker.js";
import { spinner } from "../../core/ui/spinner.js";

// The two piles, opened from the draft loop or from the build screen. Which
// cards are in the deck is the same question in both places and the same
// `sideboard` answers it, so it is the same editor -- the build screen only adds
// the land count, which is the one part of a forty that is not a pick.
export async function managePiles(
  convex: ConvexHttpClient,
  sessionId: Id<"draftSessions">,
  pool: Card[],
  sideboard: Bench[],
): Promise<Bench[]> {
  if (pool.length === 0) {
    p.log.info("Nothing drafted yet.");
    return sideboard;
  }

  const piles = deckPiles(pool, sideboard);
  const rows: PileRow[] = [
    ...piles.maindeck.map((pick) => ({ ...pick, benched: false })),
    ...piles.sideboard.map((pick) => ({ ...pick, benched: true })),
  ];

  const edited = await editPiles(rows, "Your picks");
  if (!edited) return sideboard;

  // What the player left the editor holding, as the calls that get the stored
  // split there. One per card actually moved -- the pool has forty-five of them
  // and almost none of them moved.
  const wanted = edited.reduce(
    (bench, row) => applyBench(bench, row.pos, row.benched, pool.length),
    sideboard,
  );
  const changes = benchChanges(sideboard, wanted);
  if (changes.length === 0) return sideboard;

  const spin = spinner();
  spin.start(`Moving ${changes.length} card${changes.length === 1 ? "" : "s"}`);
  let stored = sideboard;
  try {
    for (const change of changes) {
      stored = await convex.mutation(api.draft.bench, {
        sessionId,
        pickIndex: change.pos,
        benched: change.benched,
      });
    }
  } catch (e) {
    // Whatever landed before the failure is still stored, so the server's last
    // answer is the honest one to keep rather than the split just edited.
    spin.stop(pc.red(`Could not move every card (${e instanceof Error ? e.message : String(e)})`));
    return stored;
  }

  const out = changes.filter((c) => c.benched).length;
  const moved = [
    out > 0 ? `${out} to the sideboard` : "",
    out < changes.length ? `${changes.length - out} back into the deck` : "",
  ].filter(Boolean);
  spin.stop(moved.join(", "));
  return stored;
}

const curveLine = (curve: number[]) =>
  "Curve  " +
  curve
    .map((n, i) => `${i + 1 === CURVE_TOP ? `${CURVE_TOP}+` : i + 1}:${n === 0 ? pc.dim("0") : n}`)
    .join("  ");

function deckReadout(deck: BuiltDeck, benched: number): string {
  const lands = deck.nonbasicLands.length + deck.basicLands;
  return [
    `${deck.colors.join("") || "—"} · ${deck.spells.length} spells · ${lands} lands · ` +
      `${benched} in the sideboard`,
    curveLine(deck.curve),
    "",
    ...[...deck.spells, ...deck.nonbasicLands]
      .sort(byCurve)
      .map((c) => `  ${c.name} ${pc.dim(pct(c.gihWinRate))}`),
    pc.dim(`  + ${deck.basicLands} basic lands`),
  ].join("\n");
}

async function askLands(current: number): Promise<number | null> {
  const answer = await p.text({
    message: "How many basic lands?",
    initialValue: String(current),
    validate: (value) =>
      isLandCount(Number(value)) ? undefined : `A whole number, 0 to ${DECK.size}.`,
  });
  return p.isCancel(answer) ? null : Number(answer);
}

/**
 * Forty-five cards in, forty out.
 *
 * The exercise the results screen waits on: the player says which cards they are
 * playing and how much land the rest wants, and only then does the app show them
 * what it would have built. Handing over the answer first is what this exists to
 * stop, which is why the suggestion is not on the wire until `build` is stored.
 *
 * Returns false when the player walks away -- their picks are safe, the deck is
 * simply not built yet, and `--resume` brings them back here.
 */
export async function buildTheForty(
  convex: ConvexHttpClient,
  sessionId: Id<"draftSessions">,
  pool: Card[],
  sideboard: Bench[],
): Promise<boolean> {
  let bench = sideboard;
  // The convention, offered as the thing to disagree with rather than as the
  // answer -- nothing we have ingested says what a winning deck really runs.
  let basicLands = DECK.size - DECK.spellCount;

  for (;;) {
    const { maindeck } = deckPiles(pool, bench);
    const deck = buildDeck(
      maindeck.map((pick) => pick.card),
      basicLands,
    );
    const short = deckSizeNote(deck);

    p.note(
      deckReadout(deck, pool.length - maindeck.length),
      `Your deck — ${deck.size}/${DECK.size}${short ? pc.yellow(`  ${short}`) : pc.green("  ✓")}`,
    );

    const action = await p.select({
      message: "Build the forty",
      options: [
        { value: "cards", label: "Move cards between the deck and the sideboard" },
        { value: "lands", label: `Basic lands: ${basicLands}` },
        {
          value: "lock",
          label: "Lock in the forty",
          hint: short ?? "reveals the suggested build",
        },
      ],
    });

    if (p.isCancel(action)) return false;

    if (action === "cards") {
      bench = await managePiles(convex, sessionId, pool, bench);
    } else if (action === "lands") {
      basicLands = (await askLands(basicLands)) ?? basicLands;
    } else if (isLegalDeck(deck)) {
      await convex.mutation(api.draft.build, { sessionId, basicLands });
      return true;
    } else {
      p.log.warn(`A Limited deck is exactly ${DECK.size} cards. Yours is ${short}.`);
    }
  }
}
