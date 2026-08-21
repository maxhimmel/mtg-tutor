import type { CardRole, ColorCode, EngineCard, PackSlot } from "./card.js";

// How a list of EngineCards is stored, and why it is not a list of EngineCards.
//
// Convex bills the bytes a query READS, whole documents rather than the fields
// used, and a card pool is retrieved on every pick of a draft. An array of
// objects repeats every field NAME once per element: measured across the 18
// ingested sets, `"name"` `"colors"` `"turn"` `"role"` `"value"` `"slot"`
// written out 253-381 times accounts for 34.8%-44.5% of the stored document --
// 14.2KB of blb's 31.3KB, 26.7KB of mh3's 52.9KB. Parallel arrays write each
// name once, and the mean pool goes 36.5KB -> 21.2KB with no card data lost.
//
// WHAT THIS COSTS, SO IT IS NOT DISCOVERED LATER
//
// The validator can no longer say "every card has a turn and a role". Six arrays
// of the same length is not a shape a validator can express, so the property
// that `EngineCard.turn` documents at length -- that a push proves no stored
// pool is missing one -- moves OUT of the schema and into `unpackCards`, which
// throws on a length mismatch. That is a deliberate trade of one guarantee for
// another, not an oversight: the schema check ran once per deploy, and this one
// runs on every read.
//
// So this pair is the ONLY door. Nothing anywhere else may index into these
// arrays, because every such site is a place the columns can be read out of step
// with each other. Pack on the way in, unpack on the way out, work in
// EngineCard everywhere between.

// A PROJECTION, not a container. Packing keeps the seven engine fields and
// nothing else, so handing it whole `Card`s silently drops the text half. That
// is safe for a stored pool, which is `v.array(engineCard)` and has no other
// half to lose -- and it is a trap for a fixture, which usually holds whole
// cards. Pack what the engine deals, never what a reader renders.

/** Optional per-card fields are dense with `null` holes, so index `i` lines up. */
export interface PackedCards {
  names: string[];
  colors: ColorCode[][];
  turns: number[];
  roles: CardRole[];
  values: number[];
  // Omitted entirely when no card in the pool has one -- which is the common
  // case for `packRates`, and keeps a set measured before pack rates existed
  // from carrying 285 nulls to say so.
  slots?: (PackSlot | null)[];
  packRates?: (number | null)[];
  // What a real table pays for the card, where it differs from what it wins.
  // Absent for a pool ingested before `tableValue` existed, and for every card
  // in a set 17Lands published no pick order for -- both of which a pod reading
  // it falls back to `values` for, rather than to nothing.
  tableValues?: (number | null)[];
}

const someDefined = <T>(xs: (T | null)[]): boolean => xs.some((x) => x !== null);

export function packCards(cards: readonly EngineCard[]): PackedCards {
  const slots = cards.map((c) => c.slot ?? null);
  const packRates = cards.map((c) => c.packRate ?? null);
  // Not `tableValues`, which is the core function that computes these. Shadowing
  // it here would compile and silently pack the wrong thing.
  const tableVals = cards.map((c) => c.tableValue ?? null);

  return {
    names: cards.map((c) => c.name),
    colors: cards.map((c) => c.colors),
    turns: cards.map((c) => c.turn),
    roles: cards.map((c) => c.role),
    values: cards.map((c) => c.value),
    ...(someDefined(slots) ? { slots } : {}),
    ...(someDefined(packRates) ? { packRates } : {}),
    ...(someDefined(tableVals) ? { tableValues: tableVals } : {}),
  };
}

/**
 * The cards back, in the order they were packed.
 *
 * Order is load-bearing and not incidental: a pool is sampled by
 * `makePack`, so two pools holding the same cards in a different order deal
 * different boosters and strand every draft taken against the old one. Packing
 * and unpacking preserve it; nothing here may sort.
 */
export function unpackCards(packed: PackedCards): EngineCard[] {
  const n = packed.names.length;

  // The check that replaces the per-card validator. A short column would
  // otherwise surface as a card with `turn: undefined` scoring as though it had
  // no place on the curve -- a confident wrong answer, which is the failure mode
  // `EngineCard.turn` was made required to stop.
  const columns: [string, { length: number } | undefined][] = [
    ["colors", packed.colors],
    ["turns", packed.turns],
    ["roles", packed.roles],
    ["values", packed.values],
    ["slots", packed.slots],
    ["packRates", packed.packRates],
    ["tableValues", packed.tableValues],
  ];
  for (const [name, column] of columns) {
    if (column && column.length !== n) {
      throw new Error(
        `Packed pool is inconsistent: ${n} names but ${column.length} ${name}.`,
      );
    }
  }

  return Array.from({ length: n }, (_, i) => {
    const slot = packed.slots?.[i] ?? null;
    const packRate = packed.packRates?.[i] ?? null;
    const tableValue = packed.tableValues?.[i] ?? null;
    return {
      name: packed.names[i],
      colors: packed.colors[i],
      turn: packed.turns[i],
      role: packed.roles[i],
      value: packed.values[i],
      ...(slot === null ? {} : { slot }),
      ...(packRate === null ? {} : { packRate }),
      ...(tableValue === null ? {} : { tableValue }),
    };
  });
}
