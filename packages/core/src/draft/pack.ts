import type { Card, SetData } from "../model/card.js";
import { PACK } from "../config.js";

function sampleUnique(pool: Card[], n: number, rng: () => number): Card[] {
  if (pool.length <= n) return [...pool];
  const picked: Card[] = [];
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

// Generate one booster's worth of draftable cards from the set's rarity pools.
export function makePack(set: SetData, rng: () => number = Math.random): Card[] {
  const { common, uncommon, rare, mythic } = set.pools;
  const cards: Card[] = [];

  for (let i = 0; i < PACK.rareOrMythic; i++) {
    const useMythic = mythic.length > 0 && rng() < PACK.mythicChance;
    const src = useMythic ? mythic : rare.length ? rare : uncommon;
    cards.push(...sampleUnique(src, 1, rng));
  }
  cards.push(...sampleUnique(uncommon, PACK.uncommon, rng));
  cards.push(...sampleUnique(common, PACK.common, rng));
  return cards;
}

export function makePacks(set: SetData, count: number, rng: () => number = Math.random): Card[][] {
  return Array.from({ length: count }, () => makePack(set, rng));
}
