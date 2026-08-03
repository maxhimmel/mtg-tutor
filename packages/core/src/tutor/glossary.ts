// Every term the app shows a player and expects them to already understand.
//
// One corpus, three consumers: the hover panel's labels and hold-Shift reveal,
// the /glossary page, and the coach's system prompt (see STAT_LEGEND in
// cardLine.ts, which is built from CARD_STAT_GLOSSARY). Written once because the
// alternative is three descriptions of IWD that slowly stop agreeing -- the same
// reason the principles corpus feeds both the prompt and /principles.
//
// `short` and `caveat` go into the LLM legend as well as the UI, so they are
// written to be true and terse rather than chatty. `detail` is page-only.

export interface GlossaryEntry {
  id: string;
  // The acronym exactly as the UI renders it, so a reader can match what they
  // are looking at to the entry that explains it.
  label: string;
  name: string;
  short: string;
  detail: string[];
  // The thing people get wrong about this number. Present on every stat that has
  // a common misreading, absent where there genuinely isn't one.
  caveat?: string;
}

export const CARD_STAT_GLOSSARY: GlossaryEntry[] = [
  {
    id: "gih",
    label: "GIH WR",
    name: "Games-in-hand win rate",
    short:
      "Win rate of games where the card was drawn, with its sample size.",
    detail: [
      "Of every game where this card ended up in your hand — drawn in the opening hand or off the top later — this is the share you won.",
      "It is the single most quoted Limited statistic, and the one the app ranks packs by. When a pick is graded, it is graded on this.",
    ],
    caveat:
      "It is confounded by deck quality: a merely fine card in a strong archetype posts a high GIH because the decks playing it win.",
  },
  {
    id: "iwd",
    label: "IWD",
    name: "Improvement when drawn",
    short:
      "The same decks' win rate with the card drawn minus without it, in percentage points.",
    detail: [
      "Take every deck that played this card and split its games in two: the ones where the card was drawn, and the ones where it sat in the library all game. IWD is the gap between those two win rates.",
      "Because both halves come from the same decks, deck quality cancels out. What is left is the card's own contribution — which is exactly what GIH WR cannot tell you.",
      "A high GIH with a flat IWD is a card riding its deck. A high IWD is a card that wins games by itself.",
    ],
    caveat:
      "It runs structurally high for expensive, high-impact cards and near zero for cheap efficient ones and lands, so it is a second axis, not a better ranking.",
  },
  {
    id: "pick-order",
    label: "ATA / ALSA",
    name: "Average taken at / average last seen at",
    short:
      "The mean pick the field takes it at, and the mean pick drafters see it at.",
    detail: [
      "ATA is the average pick number at which drafters actually take this card. ALSA is the average pick number at which they see it sitting in a pack.",
      "ALSA sits below ATA, which surprises people. It is not a bug: a card that goes late is seen by many drafters early while the pack circulates, and taken by one drafter late, so the mean sighting lands earlier than the mean taking.",
      "The size of the gap is the signal. Wide means the card survives the table and can be expected to come back around; near zero means it is taken the moment anyone sees it and will not wheel.",
    ],
    caveat:
      "ALSA sits below ATA, which looks backwards but is not: a circulating card is seen by many drafters early and taken by one late, so the mean sighting lands earlier than the mean taking.",
  },
  {
    id: "maindeck",
    label: "Maindecked",
    name: "Maindeck rate",
    short: "Of the drafters who took it, how many actually played it.",
    detail: [
      "Taking a card and playing it are different decisions. This is the share of drafters who, having picked this card, put it in their 40.",
      "It is the trap detector. A card the field takes early and then cuts is one whose pick order overstates it — you are watching drafters make a mistake and correct it at deckbuilding.",
      "It also calibrates the win rate above it. A card maindecked 8% of the time is a sideboard card, and its GIH WR was measured only on the games where someone chose to play it — which were the games where it was good.",
    ],
    caveat:
      "A low figure means the GIH WR above came from a self-selected sample and deserves less trust. Taken early and rarely maindecked is the signature of a trap.",
  },
  {
    id: "gpwr",
    label: "GP WR",
    name: "Games-played win rate",
    short: "Win rate of decks containing the card, drawn or not.",
    detail: [
      "Every game where this card was in the deck, whether or not you ever saw it, counts here.",
      "Because games where the card was never drawn are included, most of what this measures is how good the decks that play it are — not the card.",
    ],
    caveat:
      "The most deck-dominated number here and the weakest evidence about the card itself; when it disagrees with IWD, believe IWD.",
  },
];

// The vocabulary the app invented, as opposed to the stats it imported. Someone
// confused by IWD is just as likely to be confused by why a pick scored 61.
export const SCORING_GLOSSARY: GlossaryEntry[] = [
  {
    id: "score",
    label: "Score",
    name: "Pick score, 0-100",
    short: "How close your pick came to the best card for the deck you are building.",
    detail: [
      "Taking that card scores 100. Otherwise the score falls with the win-rate gap between your pick and it — a gap of about two percentage points costs roughly fifteen points.",
      "The card it compares you against is not always the strongest one in the pack. Once you have committed to colors, a card that would drag you into a third is charged what a third color actually costs in this set, and a card that suits your archetype is credited what the archetype's own data says it is worth.",
      "Early on there is no such thing: with nothing committed, the comparison is raw power alone, so a first-pick score never implies you should be in any particular color.",
    ],
    caveat:
      "It measures the pick, not the plan. A high score means you took the best card available for the deck you were in, which is a different question from whether that deck was the one to be in.",
  },
  {
    id: "grade",
    label: "Grade",
    name: "Letter grade",
    short: "The pick score as a letter, A+ through F.",
    detail: [
      "A+ from 97, A from 90, B+ from 83, B from 75, C+ from 65, C from 55, D from 45, and F below that.",
      "The bands are deliberately generous at the top: several cards in a pack are often within a point of each other, and taking any of them is a fine draft.",
    ],
  },
  {
    id: "raw-power-best",
    label: "Raw-power best",
    name: "Raw-power best",
    short: "The highest-rated card in the pack, by win rate alone.",
    detail: [
      "This is what the score is measured against. It is decided by data only, before any coaching happens.",
      "It is blind to everything about your draft: what you have already taken, what colors you are in, what your curve looks like. It is the best card in a vacuum.",
    ],
    caveat:
      "It is not a claim that this was the correct pick — only that it was the strongest card. Those come apart often, which is what the review is for.",
  },
  {
    id: "context-best",
    label: "Context-best",
    name: "Context-best",
    short: "The card the coach would have taken, given the deck you were building.",
    detail: [
      "Unlike the raw-power best, this accounts for your pool: your colors, what you are short of, and what the signals were saying.",
      "When it agrees with the raw-power best, the pick was straightforward. When it disagrees, that gap is the lesson the review is built around.",
    ],
    caveat:
      "It only exists after the coach has looked at the pick, so nothing can sort or filter your draft by it up front.",
  },
  {
    id: "accuracy",
    label: "Accuracy",
    name: "Draft accuracy",
    short: "The share of your picks that took the pack's highest-rated card.",
    detail: [
      "A blunter measure than the average score: a pick either took the top-rated card or it did not, with no partial credit for coming close.",
      "Low accuracy alongside a high average score is a good sign, not a bad one — it means you keep taking the second- or third-rated card by a hair, which is usually deckbuilding discipline rather than error.",
    ],
  },
  {
    id: "guiderails",
    label: "Guiderails",
    name: "Guiderails",
    short: "Whether a card's draft data is shown while you are still drafting.",
    detail: [
      "With guiderails on, hovering a card during a draft shows its data. With them off, you draft blind and see the numbers only in the review afterwards.",
      "Off is the harder and more useful practice once you know the format; on is how you learn what the numbers mean in the first place.",
    ],
  },
];
