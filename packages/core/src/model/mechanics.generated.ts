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
      "short": "Tap any number of other creatures with total power at least the saddle number to saddle this Mount until end of turn."
    },
    {
      "name": "Discover",
      "kind": "action",
      "rule": "701.57",
      "short": "Exile cards from the top of your library until you exile a nonland card with that mana value or less. Cast it without paying its mana cost or put it into your hand, then put the rest on the bottom in a random order."
    },
    {
      "name": "Backup",
      "kind": "keyword",
      "rule": "702.165",
      "short": "When this creature enters, put that many +1/+1 counters on target creature. If that's another creature, it also gains this card's other abilities until end of turn."
    },
    {
      "name": "Bargain",
      "kind": "keyword",
      "rule": "702.166",
      "short": "You may sacrifice an artifact, enchantment, or token as you cast this spell."
    },
    {
      "name": "Storm",
      "kind": "keyword",
      "rule": "702.40",
      "short": "When you cast this spell, copy it for each spell cast before it this turn. You may choose new targets for the copies."
    }
  ]
};
