"use client";

import { useMemo } from "react";
import { type Card, canonicalName, cardNamePattern } from "@mtg-tutor/core";
import { useCardHover } from "./CardPreview";

// A card name you can hover, wherever one is already known. The preview it
// opens is the same one the pack tiles use.
export function CardName({ card, children }: { card: Card; children?: React.ReactNode }) {
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

// Prose with card names in it -- the coach's answer, mostly. Names are matched
// against the cards actually on the board rather than parsed out of the text,
// so nothing has to be trusted about the model's formatting, and re-rendering
// on every streamed chunk is safe: unmatched text passes straight through.
export function CardText({ text, cards }: { text: string; cards: Card[] }) {
  const { pattern, byName } = useMemo(() => {
    const byName = new Map<string, Card>();
    const add = (name: string, card: Card) => {
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

  if (!pattern) return <>{text}</>;

  return (
    <>
      {text.split(pattern).map((part, i) => {
        const card = byName.get(canonicalName(part));
        return card ? <CardName key={i} card={card} /> : <span key={i}>{part}</span>;
      })}
    </>
  );
}
