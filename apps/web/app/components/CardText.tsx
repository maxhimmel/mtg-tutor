"use client";

import { useMemo } from "react";
import type { Card } from "@mtg-tutor/core";
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

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Prose with card names in it -- the coach's answer, mostly. Names are matched
// against the cards actually on the board rather than parsed out of the text,
// so nothing has to be trusted about the model's formatting, and re-rendering
// on every streamed chunk is safe: unmatched text passes straight through.
export function CardText({ text, cards }: { text: string; cards: Card[] }) {
  const { pattern, byName } = useMemo(() => {
    const byName = new Map<string, Card>();
    for (const card of cards) {
      // A double-faced card is written by its front face far more often than by
      // its full "Front // Back" name.
      const front = card.name.split("//")[0].trim();
      if (!byName.has(card.name)) byName.set(card.name, card);
      if (!byName.has(front)) byName.set(front, card);
    }

    // Longest first, so "Sunspine Lynx" is not matched as "Sunspine".
    const names = [...byName.keys()].sort((a, b) => b.length - a.length);
    const pattern = names.length
      ? new RegExp(`(${names.map(escapeRegExp).join("|")})`, "g")
      : null;

    return { pattern, byName };
  }, [cards]);

  if (!pattern) return <>{text}</>;

  return (
    <>
      {text.split(pattern).map((part, i) => {
        const card = byName.get(part);
        return card ? <CardName key={i} card={card} /> : <span key={i}>{part}</span>;
      })}
    </>
  );
}
