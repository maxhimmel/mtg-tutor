// Reading a type line: "Legendary Creature — Dragon Wizard" is a supertype, a
// card type and two creature types, and every count in the UI depends on
// telling them apart.

export interface ParsedTypeLine {
  supertypes: string[];
  types: string[];
  subtypes: string[];
}

const SUPERTYPES = new Set(["Basic", "Legendary", "Snow", "World", "Ongoing", "Host", "Elite"]);

export function parseTypeLine(typeLine: string): ParsedTypeLine {
  // Front face only, matching isLand/isBasicLand: the back of a transforming
  // card is not what you cast.
  const [head, tail = ""] = typeLine.split("//")[0].split("—");
  const words = head.trim().split(/\s+/).filter(Boolean);

  return {
    supertypes: words.filter((w) => SUPERTYPES.has(w)),
    types: words.filter((w) => !SUPERTYPES.has(w)),
    subtypes: tail.trim().split(/\s+/).filter(Boolean),
  };
}

export const cardTypes = (card: { typeLine: string }): string[] => parseTypeLine(card.typeLine).types;

// Only creatures have creature types. A Dragon on an Aura's type line is an
// enchantment subtype, not a creature in the pool.
export function creatureTypes(card: { typeLine: string }): string[] {
  const parsed = parseTypeLine(card.typeLine);
  return parsed.types.includes("Creature") ? parsed.subtypes : [];
}

// Counts, highest first, name as the tie-break so the order is stable between
// renders. A card contributes to every group it belongs to -- an Artifact
// Creature is both.
export function tally<T>(items: T[], groupsOf: (item: T) => string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const group of groupsOf(item)) counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}
