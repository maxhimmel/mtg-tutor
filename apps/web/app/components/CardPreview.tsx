"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Card } from "@mtg-tutor/core";

interface HoverState {
  card: Card;
  anchor: DOMRect;
}

interface HoverPreviewValue {
  show: (card: Card, el: HTMLElement) => void;
  hide: () => void;
}

const HoverPreviewContext = createContext<HoverPreviewValue | null>(null);

// Handlers to spread onto any hoverable card element. Covers mouse and keyboard
// focus so the preview is reachable without a pointer.
export function useCardHover(card: Card | undefined) {
  const ctx = useContext(HoverPreviewContext);
  if (!ctx || !card?.imageUrl) return {};
  const onEnter = (e: { currentTarget: HTMLElement }) => ctx.show(card, e.currentTarget);
  return {
    onMouseEnter: onEnter,
    onFocus: onEnter,
    onMouseLeave: ctx.hide,
    onBlur: ctx.hide,
  };
}

// Imperative hide, for when the hovered element unmounts before onMouseLeave can
// fire -- e.g. picking a card swaps the whole pack for the next one.
export function useHidePreview() {
  const ctx = useContext(HoverPreviewContext);
  return ctx?.hide ?? (() => {});
}

const PREVIEW_W = 320; // px; height follows the card aspect ratio
const PREVIEW_H = Math.round((PREVIEW_W * 680) / 488);
const GAP = 12;

function place(anchor: DOMRect): { left: number; top: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Prefer the right of the anchor; flip left when it would overflow.
  let left = anchor.right + GAP;
  if (left + PREVIEW_W > vw - GAP) left = anchor.left - GAP - PREVIEW_W;
  left = Math.max(GAP, Math.min(left, vw - GAP - PREVIEW_W));

  // Vertically center on the anchor, clamped to the viewport.
  let top = anchor.top + anchor.height / 2 - PREVIEW_H / 2;
  top = Math.max(GAP, Math.min(top, vh - GAP - PREVIEW_H));

  return { left, top };
}

export function HoverPreviewProvider({ children }: { children: React.ReactNode }) {
  const [hover, setHover] = useState<HoverState | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const show = useCallback((card: Card, el: HTMLElement) => {
    setHover({ card, anchor: el.getBoundingClientRect() });
  }, []);
  const hide = useCallback(() => {
    setHover(null);
    setPos(null);
  }, []);

  // Position after render so the box size is known and clamping is accurate.
  // useEffect (not layout) keeps this off the server render; the box stays at
  // opacity 0 until a position is set, so there is no visible flash.
  useEffect(() => {
    if (hover) setPos(place(hover.anchor));
  }, [hover]);

  return (
    <HoverPreviewContext.Provider value={{ show, hide }}>
      {children}
      {hover?.card.imageUrl && (
        <div
          ref={boxRef}
          className="pointer-events-none fixed z-50 rounded-xl shadow-2xl transition-opacity"
          style={{
            left: pos?.left ?? -9999,
            top: pos?.top ?? -9999,
            width: PREVIEW_W,
            opacity: pos ? 1 : 0,
          }}
        >
          <img
            src={hover.card.imageUrl}
            alt={hover.card.name}
            className="w-full rounded-xl"
            draggable={false}
          />
        </div>
      )}
    </HoverPreviewContext.Provider>
  );
}
