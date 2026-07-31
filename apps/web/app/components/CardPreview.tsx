"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { type Card, keywordsOf } from "@mtg-tutor/core";
import { webpImage } from "../lib/cardImage";
import { useHeldKey } from "../lib/useHeldKey";
import { CardStats, hasStats } from "./CardStats";

interface HoverState {
  card: Card;
  anchor: DOMRect;
  showStats: boolean;
}

interface HoverPreviewValue {
  show: (card: Card, el: HTMLElement, showStats: boolean) => void;
  hide: () => void;
}

const HoverPreviewContext = createContext<HoverPreviewValue | null>(null);

// Handlers to spread onto any hoverable card element. Covers mouse and keyboard
// focus so the preview is reachable without a pointer.
//
// `showStats` is the caller's call because the answer differs by surface: during
// a live draft it follows the guiderails setting, which is the whole of what
// guiderails now controls. After the draft the numbers ARE the lesson, so review
// and results pass true.
export function useCardHover(card: Card | undefined, showStats = false) {
  const ctx = useContext(HoverPreviewContext);
  if (!ctx || !card?.imageUrl) return {};
  const onEnter = (e: { currentTarget: HTMLElement }) =>
    ctx.show(card, e.currentTarget, showStats);
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
const PANEL_W = 260;
const GAP = 12;

interface Placement {
  left: number;
  top: number;
  // Null when there is no room for the keyword panel on either side of the
  // preview; the card image is what the player asked for and always wins.
  panelLeft: number | null;
}

// The preview's right-hand wall. Usually the viewport, but a page can nominate
// something else as its edge -- the draft board's side panel is where the coach
// is talking, and a card image landing on top of it is the preview covering the
// thing you are drafting by. Only honoured when that element genuinely sits to
// the right of the card, so a layout that stacks it below (narrow viewports)
// falls back to the viewport rather than clamping the preview to nothing.
function rightEdge(anchor: DOMRect): number {
  const marked = document.querySelector("[data-preview-edge]");
  const box = marked?.getBoundingClientRect();
  return box && box.left > anchor.right ? box.left : window.innerWidth;
}

function place(anchor: DOMRect, wantsPanel: boolean): Placement {
  const right = rightEdge(anchor);
  const vh = window.innerHeight;

  // Prefer the right of the anchor; flip left when it would overflow.
  let left = anchor.right + GAP;
  if (left + PREVIEW_W > right - GAP) left = anchor.left - GAP - PREVIEW_W;
  left = Math.max(GAP, Math.min(left, right - GAP - PREVIEW_W));

  // Vertically center on the anchor, clamped to the viewport.
  let top = anchor.top + anchor.height / 2 - PREVIEW_H / 2;
  top = Math.max(GAP, Math.min(top, vh - GAP - PREVIEW_H));

  // The panel sits beyond the preview, so the image never has to move to make
  // room for it.
  let panelLeft: number | null = null;
  if (wantsPanel) {
    const beyond = left + PREVIEW_W + GAP;
    const before = left - GAP - PANEL_W;
    if (beyond + PANEL_W <= right - GAP) panelLeft = beyond;
    else if (before >= GAP) panelLeft = before;
  }

  return { left, top, panelLeft };
}

export function HoverPreviewProvider({ children }: { children: React.ReactNode }) {
  const [hover, setHover] = useState<HoverState | null>(null);
  const [pos, setPos] = useState<Placement | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const keywords = useMemo(() => (hover ? keywordsOf(hover.card) : []), [hover]);
  // Stats can be the panel's only content -- a vanilla creature with no keywords
  // still has draft data worth reading -- so placement has to count them too, or
  // the panel gets no position and never appears.
  const stats = hover != null && hover.showStats && hasStats(hover.card);
  const panel = keywords.length > 0 || stats;
  // Hold Shift to swap the stat rows for what they mean. A key rather than a
  // click because the panel is pointer-events:none -- it sits under the cursor
  // and must stay unclickable, or moving toward it would dismiss the hover.
  const explain = useHeldKey("Shift") && stats;

  const show = useCallback((card: Card, el: HTMLElement, showStats: boolean) => {
    setHover({ card, anchor: el.getBoundingClientRect(), showStats });
  }, []);
  const hide = useCallback(() => {
    setHover(null);
    setPos(null);
  }, []);

  // Clicking a nav link while hovering a card leaves the preview stranded: the
  // element under the cursor unmounts with the page it was on, so onMouseLeave
  // never fires and the image hangs over the route you just navigated to.
  const pathname = usePathname();
  useEffect(hide, [pathname, hide]);

  // Position after render so the box size is known and clamping is accurate.
  // useEffect (not layout) keeps this off the server render; the box stays at
  // opacity 0 until a position is set, so there is no visible flash.
  useEffect(() => {
    if (hover) setPos(place(hover.anchor, panel));
  }, [hover, panel]);

  return (
    <HoverPreviewContext.Provider value={{ show, hide }}>
      {children}
      {hover?.card.imageUrl && (
        <>
          <div
            ref={boxRef}
            className="popup-surface pointer-events-none fixed z-50 overflow-hidden transition-opacity"
            style={{
              left: pos?.left ?? -9999,
              top: pos?.top ?? -9999,
              width: PREVIEW_W,
              opacity: pos ? 1 : 0,
            }}
          >
            {/* Flush to the border, and the two rules that keep it there.
                Scryfall's art is full-bleed with square corners, so any inset
                shows as a band of base-200 -- and the surface's own padding used
                to leave one that widened at the corners, where the card's clip
                and the border's curve pull apart. The surface clips to its own
                radius instead. `block` because an inline image sits on a text
                baseline, which put a few more pixels of that band under the
                bottom edge only. */}
            <img
              src={webpImage(hover.card.imageUrl)}
              alt={hover.card.name}
              className="block w-full"
              draggable={false}
            />
          </div>

          {panel && pos?.panelLeft != null && (
            <div
              className="popup-surface pointer-events-none fixed z-50 flex flex-col gap-3 overflow-y-auto p-3"
              style={{
                left: pos.panelLeft,
                top: pos.top,
                width: PANEL_W,
                maxHeight: PREVIEW_H,
              }}
            >
              {/* Data first: it is what the player is hovering to check. The
                  keyword reminders are reference material and can scroll away.

                  The shift hint belongs to the stat rows and sits with them --
                  it is what those abbreviations expand to, and below the keyword
                  reminders it read as an offer to explain those instead. */}
              {stats && (
                <div className="flex flex-col gap-1.5">
                  <CardStats card={hover.card} expanded={explain} />
                  {!explain && (
                    <p className="text-[11px] text-base-content/45">
                      Hold <kbd className="kbd kbd-xs">shift</kbd> for what these mean
                    </p>
                  )}
                </div>
              )}

              {/* Explaining costs about the height the keywords occupy, and the
                  panel cannot be scrolled (pointer-events:none). Someone holding
                  Shift is asking what the numbers mean, not what Flying does, so
                  the reminders yield rather than overflow out of reach. */}
              {!explain && stats && keywords.length > 0 && (
                <hr className="border-base-300" />
              )}

              {!explain && keywords.length > 0 && (
                <ul className="flex flex-col gap-2.5">
                  {keywords.map((k) => (
                    <li key={k.name}>
                      <span className="text-sm font-semibold">{k.name}</span>
                      <p className="text-xs leading-snug text-base-content/70">{k.reminder}</p>
                    </li>
                  ))}
                </ul>
              )}

            </div>
          )}
        </>
      )}
    </HoverPreviewContext.Provider>
  );
}
