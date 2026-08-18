"use client";

import { Fragment, useMemo } from "react";
import { type DisplayCard, canonicalName, cardNamePattern } from "@mtg-tutor/core";
import { COLOR_TOKEN, isColorToken, spokenColors } from "../lib/colorTokens";
import { ColorPips } from "./ColorPips";
import { useCardHover } from "./CardPreview";

// A card name you can hover, wherever one is already known. The preview it
// opens is the same one the pack tiles use.
export function CardName({ card, children }: { card: DisplayCard; children?: React.ReactNode }) {
  const hover = useCardHover(card);
  return (
    <span
      tabIndex={0}
      className="cursor-help text-primary underline decoration-dotted underline-offset-2"
      {...hover}
    >
      {children ?? card.name}
    </span>
  );
}

// The colours a sentence names, drawn the way every card in the pack draws them.
// "UR" is a database key that got into the prose because the model was handed
// the set's archetype win rates under those keys; the pips are the same colours
// with nothing to decode.
//
// A second pass rather than a second alternation in the one pattern, so a card
// name wins the text it covers and the shorthand is only looked for in what is
// left. `colorTokens` owns what counts as shorthand, and refuses far more than
// it accepts -- read its header before widening anything here.
//
// Sized under the surrounding text because a pip is a disc 1.3em across: at full
// size two of them are taller than the line they sit in.
function ColorProse({ text }: { text: string }) {
  return (
    <>
      {text.split(COLOR_TOKEN).map((part, i) =>
        isColorToken(part) ? (
          <ColorPips
            key={i}
            colors={part}
            label={spokenColors(part)}
            className="text-[0.85em]"
          />
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

// Prose with card names in it -- the coach's answer, mostly. Names are matched
// against the cards actually on the board rather than parsed out of the text,
// so nothing has to be trusted about the model's formatting, and re-rendering
// on every streamed chunk is safe: unmatched text passes straight through.
export function CardText({ text, cards }: { text: string; cards: DisplayCard[] }) {
  const { pattern, byName } = useMemo(() => {
    const byName = new Map<string, DisplayCard>();
    const add = (name: string, card: DisplayCard) => {
      const key = canonicalName(name);
      if (!byName.has(key)) byName.set(key, card);
    };

    for (const card of cards) {
      add(card.name, card);
      // A double-faced card is written by its front face far more often than by
      // its full "Front // Back" name.
      add(card.name.split("//")[0].trim(), card);
    }

    return { pattern: cardNamePattern([...byName.keys()]), byName };
  }, [cards]);

  if (!pattern) return <ColorProse text={text} />;

  return (
    <>
      {text.split(pattern).map((part, i) => {
        const card = byName.get(canonicalName(part));
        return card ? <CardName key={i} card={card} /> : <ColorProse key={i} text={part} />;
      })}
    </>
  );
}
