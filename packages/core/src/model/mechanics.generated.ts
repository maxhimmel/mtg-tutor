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
    },
    {
      "name": "Adapt",
      "kind": "action",
      "rule": "701.46",
      "short": "Put that many +1/+1 counters on it, but only if it has none yet. Pay it twice and the second one does nothing."
    },
    {
      "name": "Alliance",
      "kind": "ability-word",
      "sourced": false,
      "short": "Something happens every time another creature you control enters."
    },
    {
      "name": "Amass",
      "kind": "action",
      "rule": "701.47",
      "short": "Put that many +1/+1 counters on your Army, making a 0/0 Army token first if you have none. It is one growing creature, not a wide board."
    },
    {
      "name": "Annihilator",
      "kind": "keyword",
      "rule": "702.86",
      "short": "Whenever it attacks, the defender sacrifices that many permanents before blockers. They choose which, and they are gone whether or not the attack gets through."
    },
    {
      "name": "Battle",
      "kind": "designation",
      "rule": "310",
      "short": "A permanent you attack instead of a player. Strip its last defense counter and you get to cast the other side for free."
    },
    {
      "name": "Behold",
      "kind": "action",
      "rule": "701.4",
      "short": "Show a card of the named kind from your hand, or point at one you already have out. You keep it either way — this is a check, not a cost."
    },
    {
      "name": "Bestow",
      "kind": "keyword",
      "rule": "702.103",
      "short": "Cast it for the bestow cost and it is an Aura instead, pumping one of your creatures. When that creature dies the Aura stays and becomes a creature itself."
    },
    {
      "name": "Blight",
      "kind": "action",
      "rule": "701.68",
      "short": "Put that many -1/-1 counters on one of your own creatures. It is a cost, not a bonus."
    },
    {
      "name": "Blitz",
      "kind": "keyword",
      "rule": "702.152",
      "short": "Cast it cheap for a hasty attacker that dies at end of turn and draws you a card on the way out. One good swing and a replacement."
    },
    {
      "name": "Casualty",
      "kind": "keyword",
      "rule": "702.153",
      "short": "Sacrifice a creature with power that high as you cast it and the spell is copied. Cheap creatures you were going to trade off anyway are the ones to feed it."
    },
    {
      "name": "Case",
      "kind": "designation",
      "rule": "719",
      "short": "An enchantment that does something small now and something bigger once you meet its condition. It stays solved for the rest of the game."
    },
    {
      "name": "Celebration",
      "kind": "ability-word",
      "sourced": false,
      "short": "It gets better on any turn two or more nonland permanents came down under your control. A creature and a token in one turn is enough."
    },
    {
      "name": "Changeling",
      "kind": "keyword",
      "rule": "702.73",
      "short": "It counts as every creature type at once, everywhere. In a set that cares about a tribe, it is always one of them."
    },
    {
      "name": "Channel",
      "kind": "ability-word",
      "sourced": false,
      "short": "Discard it for an effect instead of casting it. The card is never dead, and the good ones are worth a card on their own."
    },
    {
      "name": "Collect Evidence",
      "kind": "action",
      "rule": "701.59",
      "short": "Exile cards from your graveyard adding up to that mana value or more. A full graveyard is the cost, so it gets easier the longer the game runs."
    },
    {
      "name": "Companion",
      "kind": "keyword",
      "rule": "702.139",
      "short": "Meets its condition and it waits outside your deck, and you can pay {3} once to put it in your hand. In a draft the condition is usually not worth building around."
    },
    {
      "name": "Converge",
      "kind": "ability-word",
      "sourced": false,
      "short": "It gets bigger for each different color of mana you spent casting it."
    },
    {
      "name": "Corrupted",
      "kind": "ability-word",
      "sourced": false,
      "short": "It does more once an opponent has three or more poison counters. Until then you are playing the plain half of the card."
    },
    {
      "name": "Craft",
      "kind": "keyword",
      "rule": "702.167",
      "short": "Late in the game, pay the cost and exile it along with the materials it names, and it comes back as the much stronger back side."
    },
    {
      "name": "Crime",
      "kind": "designation",
      "rule": "700.13",
      "short": "You commit one whenever anything you cast or activate targets an opponent, something they control, or a card in their graveyard. Almost all your removal does it."
    },
    {
      "name": "Delve",
      "kind": "keyword",
      "rule": "702.66",
      "short": "Exile a card from your graveyard to pay for each {1} of it. It gets cheaper all game and competes with anything else you wanted the graveyard for."
    },
    {
      "name": "Devoid",
      "kind": "keyword",
      "rule": "702.114",
      "short": "It has no color at all, whatever its mana cost looks like. Color-matters cards do not see it, and neither does color-based removal."
    },
    {
      "name": "Devotion",
      "kind": "designation",
      "rule": "700.5",
      "short": "Count the colored mana symbols in the costs of the permanents you have out. Cheap cards with heavy costs push it up faster than expensive ones."
    },
    {
      "name": "Disguise",
      "kind": "keyword",
      "rule": "702.168",
      "short": "Play it face down for {3} as a 2/2 with ward {2}, then flip it up later for its disguise cost. The ward is the difference from morph, and it is a real one."
    },
    {
      "name": "Domain",
      "kind": "ability-word",
      "sourced": false,
      "short": "It scales with how many basic land types you have out — Plains, Island, Swamp, Mountain, Forest. Duals and fetches are how you get past two."
    },
    {
      "name": "Eerie",
      "kind": "ability-word",
      "sourced": false,
      "short": "It triggers whenever an enchantment you control enters, and whenever you finish unlocking a Room."
    },
    {
      "name": "Endure",
      "kind": "action",
      "rule": "701.63",
      "short": "Either put that many +1/+1 counters on it or make a Spirit token that size. Counters if you have a good body to grow, a token if you want the extra creature."
    },
    {
      "name": "Enlist",
      "kind": "keyword",
      "rule": "702.154",
      "short": "As it attacks, tap another creature that is not attacking and add its power to this one. Your ground creature that could not get through pushes the flier instead."
    },
    {
      "name": "Exhaust",
      "kind": "keyword",
      "rule": "702.177",
      "short": "An activated ability you only ever get to use once. Save it."
    },
    {
      "name": "Expend",
      "kind": "designation",
      "rule": "700.14",
      "short": "It counts the mana you have spent on spells across the whole turn, not on any one spell. Two cheap spells get there as well as one expensive one."
    },
    {
      "name": "Explore",
      "kind": "action",
      "rule": "701.44",
      "short": "Flip your top card. A land goes to your hand; anything else puts a +1/+1 counter on the creature and you choose whether to bin the card."
    },
    {
      "name": "Ferocious",
      "kind": "ability-word",
      "sourced": false,
      "short": "It does more if you control a creature with power 4 or greater."
    },
    {
      "name": "Flurry",
      "kind": "ability-word",
      "sourced": false,
      "short": "It triggers on the second spell you cast each turn. Cheap spells are how you turn it on, not big ones."
    },
    {
      "name": "For Mirrodin!",
      "kind": "keyword",
      "rule": "702.163",
      "short": "The Equipment turns up with a 2/2 Rebel already holding it. You are buying a creature and a buff in one card."
    },
    {
      "name": "Fuse",
      "kind": "keyword",
      "rule": "702.102",
      "short": "From your hand you may cast both halves of the split card at once, paying both costs. From anywhere else you get one half."
    },
    {
      "name": "Gift",
      "kind": "keyword",
      "rule": "702.174",
      "short": "Promise an opponent the gift as you cast it and your spell does more. They get the gift first, so you are paying them something real for it."
    },
    {
      "name": "Harmonize",
      "kind": "keyword",
      "rule": "702.180",
      "short": "Cast it out of your graveyard for the harmonize cost, and tap a creature to knock its power off that cost. Then it exiles itself."
    },
    {
      "name": "Heroic",
      "kind": "ability-word",
      "sourced": false,
      "short": "It triggers whenever you cast a spell targeting it. Your own pump and protection spells turn it on; removal you point at it does not, because that is theirs."
    },
    {
      "name": "Incubate",
      "kind": "action",
      "rule": "701.53",
      "short": "Make an Incubator token with that many +1/+1 counters on it, then pay {2} whenever you like to flip it into a creature of that size. Mana now or mana later."
    },
    {
      "name": "Increment",
      "kind": "keyword",
      "rule": "702.191",
      "short": "It grows whenever you cast a spell costing more than its power or its toughness. It gets harder to feed as it gets bigger."
    },
    {
      "name": "Infusion",
      "kind": "ability-word",
      "sourced": false,
      "short": "It does more on any turn you have already gained life."
    },
    {
      "name": "Job Select",
      "kind": "keyword",
      "rule": "702.182",
      "short": "The Equipment arrives with a 1/1 Hero already carrying it. A body and a buff for one card, and the Hero is fragile."
    },
    {
      "name": "Lander Token",
      "kind": "designation",
      "rule": "111.10",
      "short": "An artifact you sacrifice for {2} and a tap to fetch a basic land tapped. It is a land drop you already made, held back."
    },
    {
      "name": "Learn",
      "kind": "action",
      "rule": "701.48",
      "short": "Discard a card to draw a card, or do nothing. In a draft there are no Lessons outside your deck, so it is a rummage and not a tutor."
    },
    {
      "name": "Level",
      "kind": "designation",
      "rule": "716",
      "short": "Pay the cost to move a Class enchantment up a level and it keeps every ability from the levels below. Mana you spend on turns you had nothing else to do."
    },
    {
      "name": "Madness",
      "kind": "keyword",
      "rule": "702.35",
      "short": "Discard it and you may cast it for the madness cost instead of losing it. It makes your own discard effects free rather than painful."
    },
    {
      "name": "Magecraft",
      "kind": "ability-word",
      "sourced": false,
      "short": "It triggers whenever you cast or copy an instant or sorcery."
    },
    {
      "name": "Manifest",
      "kind": "action",
      "rule": "701.40",
      "short": "Put a card onto the battlefield face down as a 2/2. If it is a creature card you can pay its mana cost later to turn it up."
    },
    {
      "name": "Manifest Dread",
      "kind": "action",
      "rule": "701.62",
      "short": "Look at your top two cards, put one onto the battlefield face down as a 2/2 and bin the other. You are choosing which one to keep, so it is better than it looks."
    },
    {
      "name": "Map",
      "kind": "designation",
      "rule": "111.10",
      "short": "An artifact you sacrifice for {1} and a tap to make a creature explore. A +1/+1 counter or a land, held until you want it."
    },
    {
      "name": "Max Speed",
      "kind": "keyword",
      "rule": "702.178",
      "short": "The ability only works while your speed is 4, which is as high as it goes. Getting there takes four separate turns of chipping an opponent, so it is a late-game reward."
    },
    {
      "name": "Mobilize",
      "kind": "keyword",
      "rule": "702.181",
      "short": "Whenever it attacks, that many 1/1 Warriors come in attacking alongside it and die at end of turn. Free damage, and free sacrifice fodder mid-combat."
    },
    {
      "name": "Modified",
      "kind": "designation",
      "rule": "700.9",
      "short": "A creature counts as modified if it has a counter on it, an Equipment attached, or one of your Auras. Your own +1/+1 counters are the easy way there."
    },
    {
      "name": "Monstrosity",
      "kind": "action",
      "rule": "701.37",
      "short": "Pay the cost once and it grows by that many +1/+1 counters and is monstrous from then on. Only ever once, so it is a mana sink and not a loop."
    },
    {
      "name": "Morph",
      "kind": "keyword",
      "rule": "702.37",
      "short": "Play it face down for {3} as a vanilla 2/2, then pay its morph cost any time to flip it up. Your opponent has to guess, and blocking into one is how games are lost."
    },
    {
      "name": "Ninjutsu",
      "kind": "keyword",
      "rule": "702.49",
      "short": "Pay the cost and swap an unblocked attacker back to your hand for this, already attacking. A 1/1 nobody blocks turns into a real hit."
    },
    {
      "name": "Offspring",
      "kind": "keyword",
      "rule": "702.175",
      "short": "Pay the extra cost and it brings a 1/1 copy of itself along. You are buying a second body and any enters trigger a second time."
    },
    {
      "name": "Opus",
      "kind": "ability-word",
      "sourced": false,
      "short": "It triggers on every instant or sorcery you cast, and does more if five or more mana went into that spell."
    },
    {
      "name": "Outlast",
      "kind": "keyword",
      "rule": "702.107",
      "short": "Tap it at sorcery speed to put a +1/+1 counter on it. Somewhere to put mana on a turn you are not attacking anyway."
    },
    {
      "name": "Plot",
      "kind": "keyword",
      "rule": "702.170",
      "short": "Pay the plot cost on an idle turn to exile it from your hand, then cast it free on a later turn. It splits an expensive spell across two turns of spare mana."
    },
    {
      "name": "Power-up",
      "kind": "keyword",
      "rule": "702.193",
      "short": "An activated ability you get once, and it costs less on the turn the permanent came down. Play it and use it the same turn if you can."
    },
    {
      "name": "Powerstone Token",
      "kind": "designation",
      "rule": "111.10",
      "short": "An artifact that taps for one colorless mana you can only spend on artifacts. It ramps you toward your artifacts and does nothing for the rest of your deck."
    },
    {
      "name": "Prepared",
      "kind": "designation",
      "rule": "722.3",
      "short": "While it is prepared, you have a free copy of its spell half waiting in exile. Casting that copy unprepares it, so it is one use until something prepares it again."
    },
    {
      "name": "Prototype",
      "kind": "keyword",
      "rule": "702.160",
      "short": "Cast it small and cheap, or full price and full size. Same abilities either way, so it is an early play and a late one in the same card."
    },
    {
      "name": "Raid",
      "kind": "ability-word",
      "sourced": false,
      "short": "It does more if you attacked with anything this turn. Attack first, then cast it."
    },
    {
      "name": "Read Ahead",
      "kind": "keyword",
      "rule": "702.155",
      "short": "Pick which chapter the Saga starts on. Skipping straight to the good one costs you the chapters you skipped, and they never trigger."
    },
    {
      "name": "Reconfigure",
      "kind": "keyword",
      "rule": "702.151",
      "short": "It is a creature on its own, and for the reconfigure cost it attaches to another creature instead. Removal on the wearer leaves it behind."
    },
    {
      "name": "Renew",
      "kind": "ability-word",
      "sourced": false,
      "short": "Pay the cost and exile it from your graveyard for an effect. The card does something after it dies, which is why these look weak in the pack and are not."
    },
    {
      "name": "Repartee",
      "kind": "ability-word",
      "sourced": false,
      "short": "It triggers whenever you cast an instant or sorcery that targets a creature."
    },
    {
      "name": "Ring-bearer",
      "kind": "designation",
      "rule": "701.54",
      "short": "The creature you picked the last time the Ring tempted you. Cards check whether a creature is it, and you can move the title by being tempted again."
    },
    {
      "name": "Role",
      "kind": "designation",
      "rule": "111.10",
      "short": "An Aura token that buffs the creature it is on. Only one Role per creature at a time — a second one replaces the first, so do not stack them."
    },
    {
      "name": "Room",
      "kind": "designation",
      "sourced": false,
      "short": "An enchantment with two doors. Cast either side for its own cost; the other stays locked until you pay for it later, and then you have both."
    },
    {
      "name": "Shield Counter",
      "kind": "designation",
      "rule": "122.1",
      "short": "The next time that permanent would be damaged or destroyed, remove the counter instead. One free save, and it does not stop exile or a bounce."
    },
    {
      "name": "Siege",
      "kind": "designation",
      "rule": "310.12",
      "short": "A battle only your opponent can defend. Attack it enough to strip its defense counters and you exile it and cast the back side for nothing."
    },
    {
      "name": "Solved",
      "kind": "keyword",
      "rule": "702.169",
      "short": "The half of a Case that switches on once you have met its condition, and it stays on for the rest of the game."
    },
    {
      "name": "Spree",
      "kind": "keyword",
      "rule": "702.172",
      "short": "Choose as many of the extra modes as you want to pay for, but at least one. Cheap and narrow early, or everything at once later."
    },
    {
      "name": "Start Your Engines!",
      "kind": "keyword",
      "rule": "702.179",
      "art": "Start Your Engines! // Max Speed",
      "short": "It gives you speed, which starts at 1 and goes up once per turn whenever an opponent loses life. It stops at 4, and only ever goes up."
    },
    {
      "name": "Station",
      "kind": "keyword",
      "rule": "702.184",
      "short": "Tap another creature to load charge counters equal to its power onto the Spacecraft. It does more the higher it gets and turns into a creature at 7."
    },
    {
      "name": "Survival",
      "kind": "ability-word",
      "sourced": false,
      "short": "It checks after combat, on your second main phase, whether the creature is tapped. It wants you to have attacked with it."
    },
    {
      "name": "Suspect",
      "kind": "action",
      "rule": "701.60",
      "short": "A suspected creature has menace and cannot block. Point it at their best blocker, or at your own creature when you want the menace."
    },
    {
      "name": "Teamwork",
      "kind": "keyword",
      "rule": "702.194",
      "short": "Tap creatures with enough total power as an extra cost and the spell does more. You are spending an attack to get it."
    },
    {
      "name": "The Ring Tempts You",
      "kind": "action",
      "rule": "701.54",
      "art": "The Ring // The Ring Tempts You",
      "short": "Name one of your creatures the Ring-bearer and take an emblem called the Ring. It grows each time it happens again — it can't be blocked by bigger creatures, then a draw when the Ring-bearer attacks, then blockers dying, then 3 life off each opponent."
    },
    {
      "name": "Toxic",
      "kind": "keyword",
      "rule": "702.164",
      "short": "Its combat damage also gives that many poison counters, and ten poison kills. It is a second clock running alongside the life total."
    },
    {
      "name": "Unearth",
      "kind": "keyword",
      "rule": "702.84",
      "short": "Pay the cost to bring it back from the graveyard with haste for one attack, then it exiles itself. A dead creature is one more swing."
    },
    {
      "name": "Valiant",
      "kind": "ability-word",
      "sourced": false,
      "short": "It triggers the first time each turn you target it with one of your own spells or abilities. Once a turn, and only your own."
    },
    {
      "name": "Vivid",
      "kind": "ability-word",
      "sourced": false,
      "short": "It scales with how many different colors are among the permanents you control."
    },
    {
      "name": "Void",
      "kind": "ability-word",
      "sourced": false,
      "short": "It switches on for the turn once a nonland permanent has left the battlefield or a spell was warped. Your own creature dying counts."
    },
    {
      "name": "Warp",
      "kind": "keyword",
      "rule": "702.185",
      "short": "Cast it early and cheap for the warp cost, it does its thing, and it exiles itself at end of turn — then you cast it properly later. One card, two turns."
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
