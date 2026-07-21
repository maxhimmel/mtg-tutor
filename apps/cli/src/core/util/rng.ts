// Deterministic PRNG so a finished draft can be replayed exactly from its stored
// seed (enables review, and keeps deep permutation re-simulation possible later).
// mulberry32: tiny, dependency-free, good enough for shuffling packs.

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A fresh 32-bit seed for a new draft. Stored alongside the draft so the exact
// same pack sequence can be regenerated.
export function newSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}
