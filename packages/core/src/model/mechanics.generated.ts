// GENERATED FILE -- DO NOT EDIT BY HAND.
// Source: docs/set-mechanics.yaml
// Regenerate: pnpm --filter @mtg-tutor/core generate

import type { MechanicsDoc } from "./mechanicsSchema.js";

export const MECHANICS_DOC: MechanicsDoc = {
  "meta": {
    "title": "Set mechanics",
    "note": "What a mechanic a set is built on actually does, for the hover panel and the coach.",
    "sources": "./set-mechanics-sources.md"
  },
  "mechanics": [
    {
      "name": "Saddle",
      "kind": "keyword",
      "rule": "702.171",
      "short": "Tap your other creatures until their power adds up to the saddle number and the Mount is saddled for the turn. Most Mounts only do their good thing while it is."
    },
    {
      "name": "Discover",
      "kind": "action",
      "rule": "701.57",
      "short": "Turn over cards until you hit a nonland one cheap enough, then cast it for free or take it into your hand. Everything else goes to the bottom."
    },
    {
      "name": "Backup",
      "kind": "keyword",
      "rule": "702.165",
      "short": "It enters and puts that many +1/+1 counters somewhere. On another creature, that creature also borrows the rest of this card's abilities for the turn. On itself, it just comes down bigger."
    },
    {
      "name": "Bargain",
      "kind": "keyword",
      "rule": "702.166",
      "short": "As you cast it you may sacrifice an artifact, an enchantment or a token, and the spell does more if you did."
    },
    {
      "name": "Storm",
      "kind": "keyword",
      "rule": "702.40",
      "short": "It copies itself once for every spell already cast this turn, and you pick new targets for each copy. Cast late in a busy turn it is many more than one spell."
    }
  ],
  "ignored": [
    {
      "name": "Face Up",
      "why": "How morph, disguise and cloak are worded, on 55 cards of ktk and mkm. The mechanic a drafter needs told about is Morph or Disguise; this is the sentence those are written in."
    },
    {
      "name": "Starting Deck",
      "why": "Companion's own wording. Companion is the entry; this is a phrase inside it."
    },
    {
      "name": "Color Identity",
      "why": "A deckbuilding rule the app already enforces, not something a card does."
    },
    {
      "name": "Commander",
      "why": "A format this app does not deal. It turns up because mh3 prints cards with one eye on it, and none of them mean anything in a draft."
    },
    {
      "name": "Unlock",
      "why": "How a Room is worded. Room is the entry."
    },
    {
      "name": "Door",
      "why": "The half of a Room you cast. Room is the entry."
    },
    {
      "name": "Speed",
      "why": "The counter Start Your Engines! gives you. Both of those are entries, and this is the noun they share."
    }
  ]
};
