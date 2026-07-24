// What a mechanic actually does, so a card's rules text does not have to be
// guessed at. Evergreen keywords plus the deciduous ones that keep showing up;
// a set with its own named mechanic can be appended here without touching
// anything else. Reminder text is the printed wording, trimmed of the reminder
// parentheses and of cost placeholders that vary per card.

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
