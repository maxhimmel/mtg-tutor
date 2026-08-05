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
import { type Card, cardShapeOf, keywordsOf } from "@mtg-tutor/core";
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
  suspend: (on: boolean) => void;
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

// Hold the preview back for the duration of a gesture. Hiding once is not enough
// when the cursor is being dragged across the board: every card and every deck
// row it passes over fires its own onMouseEnter, so the preview would reopen
// under the hand carrying a card. Turned off again when the gesture ends.
export function useSuspendPreview() {
  const ctx = useContext(HoverPreviewContext);
  return ctx?.suspend ?? (() => {});
}

const PREVIEW_W = 320; // px; height follows the card aspect ratio
const PREVIEW_H = Math.round((PREVIEW_W * 680) / 488);
const PANEL_W = 260;
const GAP = 12;

interface Placement {
  left: number;
  top: number;
  // Where the back face's own popup goes. Null when the card has no back face,
  // and also when there is no room for two cards side by side -- the face the
  // player hovered is the one they asked for, so the back yields first.
  backLeft: number | null;
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

function place(anchor: DOMRect, wantsPanel: boolean, wantsBack: boolean): Placement {
  const right = rightEdge(anchor);
  const vh = window.innerHeight;

  // Two cards where a double-faced one has room for both, one otherwise. Decided
  // before the horizontal placement because everything below positions against
  // the block as a whole.
  const showBack = wantsBack && PREVIEW_W * 2 + GAP * 3 <= right;
  const width = showBack ? PREVIEW_W * 2 + GAP : PREVIEW_W;

  // Prefer the right of the anchor; flip left when it would overflow.
  let left = anchor.right + GAP;
  if (left + width > right - GAP) left = anchor.left - GAP - width;
  left = Math.max(GAP, Math.min(left, right - GAP - width));

  // Vertically center on the anchor, clamped to the viewport.
  let top = anchor.top + anchor.height / 2 - PREVIEW_H / 2;
  top = Math.max(GAP, Math.min(top, vh - GAP - PREVIEW_H));

  // The panel sits beyond the preview, so the image never has to move to make
  // room for it.
  let panelLeft: number | null = null;
  if (wantsPanel) {
    const beyond = left + width + GAP;
    const before = left - GAP - PANEL_W;
    if (beyond + PANEL_W <= right - GAP) panelLeft = beyond;
    else if (before >= GAP) panelLeft = before;
  }

  return { left, top, backLeft: showBack ? left + PREVIEW_W + GAP : null, panelLeft };
}

// A Magic card is 63mm across with a 3mm corner, and Scryfall's art is the whole
// card -- so this is the card's own rounding at whatever width it is drawn.
const CARD_CORNER = (PREVIEW_W * 3) / 63;

// One card image. Unplaced until the effect below has measured the viewport,
// which is what `left` being null means -- parked offscreen at opacity 0 so
// there is no flash where the first render put it.
//
// Flush to the border, and the three rules that keep it there. Scryfall's art is
// full-bleed, so any inset shows as a band -- and the surface's own padding used
// to leave one that widened at the corners, where the card's clip and the
// border's curve pull apart. ONE curve does the clipping, never two: the
// surface's. `block` because an inline image sits on a text baseline, which put a
// few more pixels of that band under the bottom edge only.
//
// The third rule is which curve. `rounded-box` is close to a card's corner and
// not equal to it, which went unnoticed for as long as every image had an alpha
// channel: outside the card's rounding those pixels are transparent, so the gap
// between the two curves showed base-200 against base-200. Scryfall does not
// serve alpha for every card -- MOM's transform faces come back as plain VP8
// where WOE's adventures are VP8X -- and an opaque image has to put a colour in
// those corners, which is white. Clipping at the card's real radius means there
// is no gap to fill either way.
function Face({
  src,
  alt,
  left,
  top,
}: {
  src: string;
  alt: string;
  left: number | null;
  top: number | null;
}) {
  return (
    <div
      className="popup-surface pointer-events-none fixed z-50 overflow-hidden transition-opacity"
      style={{
        left: left ?? -9999,
        top: top ?? -9999,
        width: PREVIEW_W,
        opacity: left != null ? 1 : 0,
        borderRadius: CARD_CORNER,
      }}
    >
      <img src={webpImage(src)} alt={alt} className="block w-full" draggable={false} />
    </div>
  );
}

export function HoverPreviewProvider({ children }: { children: React.ReactNode }) {
  const [hover, setHover] = useState<HoverState | null>(null);
  const [pos, setPos] = useState<Placement | null>(null);
  // How the card is printed leads the list. On a two-in-one card the keywords
  // under it belong to one half or the other, and which is which is unreadable
  // until you know the card has halves at all.
  const notes = useMemo(() => {
    if (!hover) return [];
    const shape = cardShapeOf(hover.card);
    const keywords = keywordsOf(hover.card);
    return shape ? [shape, ...keywords] : keywords;
  }, [hover]);
  // Stats can be the panel's only content -- a vanilla creature with no keywords
  // still has draft data worth reading -- so placement has to count them too, or
  // the panel gets no position and never appears.
  const stats = hover != null && hover.showStats && hasStats(hover.card);
  const panel = notes.length > 0 || stats;
  const back = hover?.card.backImageUrl;
  // Hold Shift to swap the stat rows for what they mean. A key rather than a
  // click because the panel is pointer-events:none -- it sits under the cursor
  // and must stay unclickable, or moving toward it would dismiss the hover.
  const explain = useHeldKey("Shift") && stats;

  // A ref, not state: suspending must not re-render every card on the page, and
  // nothing renders differently for it -- `show` simply declines.
  const suspended = useRef(false);

  const show = useCallback((card: Card, el: HTMLElement, showStats: boolean) => {
    if (suspended.current) return;
    setHover({ card, anchor: el.getBoundingClientRect(), showStats });
  }, []);
  const hide = useCallback(() => {
    setHover(null);
    setPos(null);
  }, []);
  const suspend = useCallback(
    (on: boolean) => {
      suspended.current = on;
      if (on) hide();
    },
    [hide],
  );

  // Clicking a nav link while hovering a card leaves the preview stranded: the
  // element under the cursor unmounts with the page it was on, so onMouseLeave
  // never fires and the image hangs over the route you just navigated to.
  const pathname = usePathname();
  useEffect(hide, [pathname, hide]);

  // Position after render so the box size is known and clamping is accurate.
  // useEffect (not layout) keeps this off the server render; the box stays at
  // opacity 0 until a position is set, so there is no visible flash.
  useEffect(() => {
    if (hover) setPos(place(hover.anchor, panel, back != null));
  }, [hover, panel, back]);

  // Memoised because every hoverable card on the page consumes this context, and
  // a fresh object here would re-render all of them each time a preview opens.
  const value = useMemo(() => ({ show, hide, suspend }), [show, hide, suspend]);

  return (
    <HoverPreviewContext.Provider value={value}>
      {children}
      {hover?.card.imageUrl && (
        <>
          <Face
            src={hover.card.imageUrl}
            alt={hover.card.name}
            left={pos?.left ?? null}
            top={pos?.top ?? null}
          />

          {/* The back of a double-faced card, beside the front rather than
              instead of it: the two sides are one card and the question the
              player is asking is what it turns INTO, which needs both. Named by
              the second half of "Front // Back", which is what the back face is
              actually called. */}
          {back && pos?.backLeft != null && (
            <Face
              src={back}
              alt={hover.card.name.split("//").at(-1)?.trim() ?? hover.card.name}
              left={pos.backLeft}
              top={pos.top}
            />
          )}

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
              {!explain && stats && notes.length > 0 && (
                <hr className="border-base-300" />
              )}

              {!explain && notes.length > 0 && (
                <ul className="flex flex-col gap-2.5">
                  {notes.map((k) => (
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
