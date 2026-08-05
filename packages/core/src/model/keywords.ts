// What a mechanic actually does, so a card's rules text does not have to be
// guessed at. Evergreen keywords plus the deciduous ones that keep showing up;
// a set with its own named mechanic can be appended here without touching
// anything else. Reminder text is the printed wording, trimmed of the reminder
// parentheses and of cost placeholders that vary per card.
//
// The bottom of the file answers the same question about the card's SHAPE
// rather than its abilities, in the same {name, reminder} pair, because a
// reader that can render one can render the other and the two belong side by
// side: on a two-in-one card, which half a keyword is on is the first thing
// anybody needs to know.

export interface Keyword {
  name: string;
  reminder: string;
}

// Longest names first, so "double strike" is not read as "strike" of some kind
// and "first strike" cannot swallow it.
const GLOSSARY: Keyword[] = [
  {
    name: "Double strike",
    reminder: "Deals both first-strike and regular combat damage.",
  },
  {
    name: "First strike",
    reminder: "Deals combat damage before creatures without first strike.",
  },
  {
    name: "Deathtouch",
    reminder: "Any amount of damage this deals to a creature is enough to destroy it.",
  },
  {
    name: "Indestructible",
    reminder: "Damage and effects that say “destroy” don't destroy this.",
  },
  {
    name: "Hexproof",
    reminder: "Can't be the target of spells or abilities your opponents control.",
  },
  {
    name: "Shroud",
    reminder: "Can't be the target of spells or abilities at all, including your own.",
  },
  {
    name: "Protection",
    reminder:
      "Can't be damaged, enchanted, equipped, blocked, or targeted by anything with the named quality.",
  },
  {
    name: "Lifelink",
    reminder: "Damage dealt by this creature also causes you to gain that much life.",
  },
  {
    name: "Vigilance",
    reminder: "Attacking doesn't cause this creature to tap.",
  },
  {
    name: "Trample",
    reminder: "Deals excess combat damage to the player or planeswalker it's attacking.",
  },
  {
    name: "Menace",
    reminder: "Can't be blocked except by two or more creatures.",
  },
  {
    name: "Flying",
    reminder: "Can't be blocked except by creatures with flying or reach.",
  },
  {
    name: "Reach",
    reminder: "Can block creatures with flying.",
  },
  {
    name: "Defender",
    reminder: "This creature can't attack.",
  },
  {
    name: "Haste",
    reminder: "Can attack and tap as soon as it comes under your control.",
  },
  {
    name: "Flash",
    reminder: "You may cast this spell any time you could cast an instant.",
  },
  {
    name: "Prowess",
    reminder: "Whenever you cast a noncreature spell, this creature gets +1/+1 until end of turn.",
  },
  {
    name: "Ward",
    reminder:
      "When this becomes the target of a spell or ability an opponent controls, counter it unless they pay the ward cost.",
  },
  {
    name: "Equip",
    reminder: "Attach to a creature you control for the equip cost. Only as a sorcery.",
  },
  {
    name: "Crew",
    reminder:
      "Tap any number of creatures with total power at least the crew number to turn this Vehicle into an artifact creature until end of turn.",
  },
  {
    name: "Saddle",
    reminder:
      "Tap any number of other creatures with total power at least the saddle number to saddle this Mount until end of turn.",
  },
  {
    name: "Convoke",
    reminder:
      "Tap creatures as you cast this; each pays for {1} or one mana of that creature's color.",
  },
  {
    name: "Kicker",
    reminder: "You may pay an additional cost as you cast this spell for an extra effect.",
  },
  {
    name: "Cycling",
    reminder: "Pay the cycling cost and discard this card to draw a card.",
  },
  {
    name: "Flashback",
    reminder: "Cast it from your graveyard for its flashback cost, then exile it.",
  },
  {
    name: "Landfall",
    reminder: "Triggers whenever a land enters the battlefield under your control.",
  },
  {
    name: "Surveil",
    reminder:
      "Look at that many cards from the top of your library, then put any number into your graveyard and the rest back on top in any order.",
  },
  {
    name: "Scry",
    reminder:
      "Look at that many cards from the top of your library, then put any number on the bottom and the rest back on top in any order.",
  },
  {
    name: "Mill",
    reminder: "Put that many cards from the top of your library into your graveyard.",
  },
  {
    name: "Goad",
    reminder:
      "Until your next turn, that creature attacks if able, and attacks someone other than you if able.",
  },
  {
    name: "Fight",
    reminder: "Each creature deals damage equal to its power to the other.",
  },
  {
    name: "Bargain",
    reminder: "You may sacrifice an artifact, enchantment, or token as you cast this spell.",
  },
  {
    name: "Backup",
    reminder:
      "When this creature enters, put that many +1/+1 counters on target creature. If that's another creature, it also gains this card's other abilities until end of turn.",
  },
  {
    name: "Discover",
    reminder:
      "Exile cards from the top of your library until you exile a nonland card with that mana value or less. Cast it without paying its mana cost or put it into your hand, then put the rest on the bottom in a random order.",
  },
  {
    name: "Storm",
    reminder:
      "When you cast this spell, copy it for each spell cast before it this turn. You may choose new targets for the copies.",
  },
];

const MATCHERS = GLOSSARY.map((keyword) => ({
  keyword,
  // Word-boundary so "reach" the ability is not found inside "unreachable",
  // and so "Scry" matches "Scry 2".
  pattern: new RegExp(`\\b${keyword.name}\\b`, "i"),
}));

// The mechanics a card's rules text actually mentions, in the order they are
// printed -- which is the order the player reads them.
export function keywordsOf(card: { oracleText: string }): Keyword[] {
  // Scryfall's oracle text carries the printed reminder text, and reminder text
  // names other keywords: flying's mentions reach, deathtouch's mentions
  // destroy. Matching inside it would report abilities the card does not have.
  const rules = card.oracleText.replace(/\([^)]*\)/g, " ");
  const found: { keyword: Keyword; at: number }[] = [];

  for (const { keyword, pattern } of MATCHERS) {
    const at = rules.search(pattern);
    if (at >= 0) found.push({ keyword, at });
  }

  return found.sort((a, b) => a.at - b.at).map((f) => f.keyword);
}

// How a card is PRINTED, where that is itself a rule -- two spells sharing one
// card, or one card with a second side.
//
// Keyed by what the card names itself, because a name it prints is more precise
// than the layout it is filed under: `adventure` covers both Adventure and Omen
// and the two differ in exactly the way that matters here -- an Adventure waits
// in exile to be cast again, an Omen is shuffled away.
const SHAPE_BY_SUBTYPE: Record<string, Keyword> = {
  Adventure: {
    name: "Adventure",
    reminder:
      "Two cards in one. Cast the Adventure half as an instant or sorcery and it exiles itself instead of going to the graveyard, and you may cast the creature from exile later.",
  },
  Omen: {
    name: "Omen",
    reminder:
      "Two cards in one. Cast the Omen half as an instant or sorcery, then shuffle the card back into your library — so the creature is still in there to be drawn again.",
  },
  Room: {
    name: "Room",
    reminder:
      "Two halves of one enchantment. Cast either door for its own cost; the other stays locked on the battlefield until you pay its mana cost as a sorcery, and then you have both.",
  },
};

// The shapes no card names on itself. Scryfall's layout is the only thing that
// distinguishes them: "Creature — X // Sorcery" is a spell you choose between
// and "Creature — X // Creature — Y" is a card you turn over, and neither type
// line says so.
//
// `adventure` is here as well as above, and is unreachable in the sets we hold,
// because that layout has already been given a second subtype once -- Omen is
// Adventure's frame under new rules -- so a third arriving with no entry of its
// own is the likely case rather than the impossible one.
const SHAPE_BY_LAYOUT: Record<string, Keyword> = {
  adventure: {
    name: "Two-part card",
    reminder:
      "Two cards in one. Cast the lower half as a spell, and the creature above it becomes available afterwards.",
  },
  split: {
    name: "Split card",
    reminder: "Two spells on one card. Choose one half to cast; the whole card goes to the graveyard.",
  },
  prepare: {
    name: "Prepared spell",
    reminder:
      "A creature with a spell attached. Cast the creature, and while it is prepared you may cast a copy of the spell half — once, unless something prepares it again.",
  },
  // `transform` is deliberately absent. Every other shape here needs saying
  // because the card does not show it: a split card and an Adventure look alike
  // and are not. A double-faced card explains itself the moment its back is
  // drawn beside its front, so a note saying it has a back is a caption on a
  // picture of the back.
};

// Everything after the last "//" -- the half that names the shape. An Adventure
// and an Omen are always the SECOND half, so reading the whole type line would
// find "Creature" first and say nothing useful.
function backSubtypes(typeLine: string): string[] {
  const back = typeLine.split("//").at(-1) ?? "";
  return (back.split("—")[1] ?? "").trim().split(/\s+/);
}

/**
 * How this card is printed, when that is something the player has to be told.
 *
 * Undefined for the ordinary card and for the layouts that are only a frame --
 * Saga, Class and Case are their own Scryfall layouts and are still one card
 * with one rules box, so there is nothing here to explain.
 *
 * Also undefined for a card ingested before `layout` was stored, which is the
 * same answer a normal card gets. That is deliberate: guessing the shape from
 * the type line would report split cards and double-faced cards as each other.
 */
export function cardShapeOf(card: { layout?: string; typeLine: string }): Keyword | undefined {
  if (!card.layout) return undefined;

  for (const subtype of backSubtypes(card.typeLine)) {
    const named = SHAPE_BY_SUBTYPE[subtype];
    if (named) return named;
  }

  return SHAPE_BY_LAYOUT[card.layout];
}
