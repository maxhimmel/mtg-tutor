"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@mtg-tutor/backend";
import {
  type Card,
  type DiffRow,
  alignDecks,
  buildDeck,
  colorKey,
  committedColors,
  compareDecks,
  decksAgree,
  normalizeBench,
  splitPool,
} from "@mtg-tutor/core";
import { ColorPips } from "../../../components/ColorPips";
import { DeckBoard } from "../../../components/DeckBoard";
import { Panel } from "../../../components/Panel";
import type { Face } from "./faces";
import { Who } from "./sides";

/**
 * The two forties, not the eighty-four picks.
 *
 * The rest of this screen compares what each of you TOOK, and that is a
 * different question from what each of you registered. Two people can take
 * nearly the same cards and hand in two different decks -- one splashes, one
 * cuts the splash and runs an eighteenth land -- and the picks say nothing about
 * it. This is where a draft actually ends, so it belongs on the page where the
 * draft is read.
 *
 * Built in the browser out of what is already here. The rows carry every pick in
 * order, the set's text is already loaded for the card art, and the server sends
 * only the two facts picks cannot carry: which positions were set aside, and how
 * many basics each of you ran. Nothing is replayed and nothing extra is read.
 *
 * The board itself is the one the results screen uses to set your deck against
 * the app's suggestion -- piles by mana cost, a gold rail on a card only you
 * play, a ghost frame on one only they do. It needed one change to work here:
 * the other side is a person now, so it takes their name.
 */
/** What the server sends about a registered forty: the two facts picks cannot carry. */
type SideDeck = FunctionReturnType<typeof api.challenges.diff>["yourDeck"];

export function Decks({
  rows,
  them,
  yourDeck,
  theirDeck,
  yourSessionId,
  faceOf,
  className,
}: {
  rows: DiffRow[];
  them: string;
  yourDeck: SideDeck;
  theirDeck: SideDeck;
  yourSessionId: string;
  faceOf: (name: string, colors: readonly string[]) => Face;
  className?: string;
}) {
  const built = useMemo(() => {
    // Every pick in order IS the pool, which is the same list `sideboard`
    // positions index into -- so the split needs nothing the rows do not have.
    const poolOf = (side: "yours" | "theirs"): Card[] =>
      rows
        .map((r) => {
          const pick = r[side];
          const colors = pick.pack.find((c) => c.name === pick.pickedName)?.colors ?? [];
          return faceOf(pick.pickedName, colors).card;
        })
        .filter((c): c is Card => c !== null);

    const deckFor = (side: "yours" | "theirs", deck: SideDeck) => {
      if (deck.basicLands === undefined) return undefined;
      const pool = poolOf(side);
      // A card the set has since dropped falls out of `pool` above, which would
      // shift every position after it and bench the wrong cards. Better to show
      // no deck than a wrong one.
      if (pool.length !== rows.length) return undefined;
      const { maindeck } = splitPool(pool, normalizeBench(deck.sideboard), rows.length);
      return buildDeck(maindeck, deck.basicLands);
    };

    return {
      yours: deckFor("yours", yourDeck),
      theirs: deckFor("theirs", theirDeck),
    };
  }, [rows, faceOf, yourDeck, theirDeck]);

  // Neither deck is built the moment a challenge finishes: a draft ends at the
  // forty-second pick and a deck ends when somebody locks their forty in. Said
  // plainly, with the way out, rather than hidden behind an absent panel.
  if (!built.yours || !built.theirs) {
    return (
      <Panel title="The two decks" className={className}>
        <p className="text-base-content/70">
          {!built.yours && !built.theirs
            ? "Neither of you has registered a forty yet."
            : !built.yours
              ? `${them} has registered a forty. Build yours and the two go side by side.`
              : `You have registered a forty. ${them} has not built theirs yet — this fills in when they do.`}
        </p>
        {!built.yours && (
          <Link
            href={`/review/${yourSessionId}/deck`}
            className="btn btn-sm btn-primary mt-2 self-start"
          >
            Build your deck
          </Link>
        )}
      </Panel>
    );
  }

  const rowsOut = alignDecks(built.yours, built.theirs);
  const agreed = decksAgree(compareDecks(built.yours, built.theirs));

  return (
    <Panel
      className={className}
      title="The two decks"
      aside={
        <span className="text-xs text-base-content/50">
          {agreed
            ? "card for card, the same forty"
            : `${rowsOut.filter((r) => !r.built || !r.suggested).length} cards apart`}
        </span>
      }
      bodyClassName="gap-4"
    >
      <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-base-300 pb-3 text-sm">
        <DeckColors mine label="You" deck={built.yours} />
        <DeckColors label={them} deck={built.theirs} />
      </div>

      <DeckBoard
        rows={rowsOut}
        basics={{ mine: built.yours.basicLands, theirs: built.theirs.basicLands }}
        agreed={agreed}
        theirs={them}
      />
    </Panel>
  );
}

/**
 * What each deck turned out to be.
 *
 * `committedColors` over the spells rather than `deck.colors`, which is every
 * colour the list asks for including a one-card splash -- the app's own rule for
 * naming a deck is the committed read, and it is what the results screen prints.
 */
function DeckColors({
  mine,
  label,
  deck,
}: {
  mine?: boolean;
  label: string;
  deck: { spells: Card[]; size: number };
}) {
  return (
    <span className="flex items-center gap-2.5">
      <Who mine={mine}>{label}</Who>
      <ColorPips colors={colorKey(committedColors(deck.spells))} className="text-base" />
      <span className="tabular-nums text-base-content/50">{deck.size} cards</span>
    </span>
  );
}
