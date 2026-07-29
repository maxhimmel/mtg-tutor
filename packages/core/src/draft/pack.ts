import type { EngineCard, PackShape, PackSlot, SetData } from "../model/card.js";
import { PACK } from "../config.js";

function sampleUniform(pool: EngineCard[], n: number, rng: () => number): EngineCard[] {
  const picked: EngineCard[] = [];
  const used = new Set<number>();
  while (picked.length < n) {
    const i = Math.floor(rng() * pool.length);
    if (!used.has(i)) {
      used.add(i);
      picked.push(pool[i]);
    }
  }
  return picked;
}

// Draw without replacement, each card weighted by how often it was really
// opened. Renormalising after every draw is what makes it "without
// replacement": the remaining cards keep their relative odds.
//
// Linear in pool size per draw, which is nothing here -- pools run to ~100 cards
// and no slot asks for more than nine.
function sampleWeighted(pool: EngineCard[], n: number, rng: () => number): EngineCard[] {
  const remaining = [...pool];
  const weights = remaining.map((c) => c.packRate as number);
  const picked: EngineCard[] = [];

  while (picked.length < n && remaining.length > 0) {
    const total = weights.reduce((a, b) => a + b, 0);
    // Every remaining card was seen zero times. Nothing left to weight by, so
    // fall back rather than divide by zero.
    if (total <= 0) return [...picked, ...sampleUniform(remaining, n - picked.length, rng)];

    let roll = rng() * total;
    let i = 0;
    while (i < weights.length - 1 && roll > weights[i]) {
      roll -= weights[i];
      i++;
    }
    picked.push(remaining[i]);
    remaining.splice(i, 1);
    weights.splice(i, 1);
  }
  return picked;
}

// A pool is weighted only when every card in it carries an observed rate. A
// partially-measured pool would silently rank the measured cards above the rest,
// which is worse than drawing evenly; and this is what keeps a set that has not
// been rebuilt dealing exactly the packs its saved drafts replay from.
function sampleUnique(pool: EngineCard[], n: number, rng: () => number): EngineCard[] {
  if (pool.length <= n) return [...pool];
  return pool.every((c) => c.packRate != null)
    ? sampleWeighted(pool, n, rng)
    : sampleUniform(pool, n, rng);
}

function weightedShape(shapes: PackShape[], rng: () => number): PackShape {
  const total = shapes.reduce((sum, s) => sum + s.weight, 0);
  let roll = rng() * total;
  for (const shape of shapes) {
    roll -= shape.weight;
    if (roll <= 0) return shape;
  }
  return shapes[shapes.length - 1];
}

// Pre-2024 shape: a fixed rarity mix with no bonus sheet and no land slot. Used
// for sets we have no observed pack data for.
function makeFixedPack(set: SetData, rng: () => number): EngineCard[] {
  const { common, uncommon, rare, mythic } = set.pools;
  const cards: EngineCard[] = [];

  for (let i = 0; i < PACK.rareOrMythic; i++) {
    const useMythic = mythic.length > 0 && rng() < PACK.mythicChance;
    const src = useMythic ? mythic : rare.length ? rare : uncommon;
    cards.push(...sampleUnique(src, 1, rng));
  }
  cards.push(...sampleUnique(uncommon, PACK.uncommon, rng));
  cards.push(...sampleUnique(common, PACK.common, rng));
  return cards;
}

// Slot order is fixed so a given seed always produces the same pack: iterating
// an object's keys would tie pack contents to how the shape was serialised.
const SLOT_ORDER: PackSlot[] = ["mythic", "rare", "uncommon", "common", "bonus", "land"];

// Generate one booster. With observed composition, samples a real pack shape and
// fills each slot from its own pool -- so a bonus-sheet card appears exactly as
// often as it does in the real format instead of diluting the uncommon slot.
export function makePack(set: SetData, rng: () => number = Math.random): EngineCard[] {
  const composition = set.packComposition;
  if (!composition || composition.shapes.length === 0) return makeFixedPack(set, rng);

  const shape = weightedShape(composition.shapes, rng);
  const cards: EngineCard[] = [];

  for (const slot of SLOT_ORDER) {
    const want = shape.slots[slot] ?? 0;
    if (want > 0) cards.push(...sampleUnique(set.pools[slot], want, rng));
  }
  return cards;
}

export function makePacks(set: SetData, count: number, rng: () => number = Math.random): EngineCard[][] {
  return Array.from({ length: count }, () => makePack(set, rng));
}

// Cards per booster, and therefore picks per pack. Driven by observed data where
// we have it, since Play Boosters are 14 and the older fixed shape is 15.
export function packSizeFor(set: SetData): number {
  return set.packComposition?.size ?? PACK.rareOrMythic + PACK.uncommon + PACK.common;
}
