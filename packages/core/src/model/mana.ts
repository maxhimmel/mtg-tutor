// Splits a printed mana cost into its symbols: "{2}{W/U}{X}" -> ["2", "W/U", "X"].
// Anything outside braces is dropped, which is what makes a split card's
// "{1}{U} // {3}{U}" come back as one flat list of symbols to draw.
export function parseManaCost(cost?: string): string[] {
  if (!cost) return [];
  return [...cost.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
}
