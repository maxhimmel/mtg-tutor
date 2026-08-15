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
import { type Card, cardShapeOf, frontIsSideways, keywordsOf } from "@mtg-tutor/core";
import { webpImage } from "../lib/cardImage";
import { useHeldKey } from "../lib/useHeldKey";
import { CardStats, hasStats } from "./CardStats";

interface HoverState {
  card: Card;
  // The element the preview is hanging off, kept alongside the rect it was
  // measured from. The rect is what `place` needs; the element is what says
  // whether that rect still describes anything -- see the stranding effect below.
  el: HTMLElement;
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
// a live draft it follows the showStats setting, which is the whole of what that
// setting now controls. After the draft the numbers ARE the lesson, so review
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

// Imperative hide, for a caller that knows it is about to strand the preview --
// e.g. picking a card swaps the whole pack for the next one. No longer the only
// defence: the provider watches for its anchor leaving the document and closes
// on its own. This is the earlier of the two, closing before the render that
// causes the problem rather than after it, which is worth having where the
// caller already knows.
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

interface Box {
  w: number;
  h: number;
}

// A card lying on its side is the same card: the 63mm edge is still drawn at
// PREVIEW_W, so it is the box that turns and not the scale.
const UPRIGHT: Box = { w: PREVIEW_W, h: PREVIEW_H };
const TURNED: Box = { w: PREVIEW_H, h: PREVIEW_W };
const boxFor = (sideways: boolean) => (sideways ? TURNED : UPRIGHT);

interface Placement {
  // One x per face that fits, in the order they were asked for, and SHORTER
  // than that list when they do not all fit -- the front is what the player
  // pointed at, so everything after it yields to the viewport in turn.
  lefts: number[];
  top: number;
  // The tallest face that is actually being drawn. A Battle is a landscape
  // front beside an upright back, so the faces are no longer all one shape and
  // none of them can stand for the block on its own.
  height: number;
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

// `faces` is the front, then whatever else is worth drawing beside it -- a back,
// and the tokens the card makes. Ordered by claim on the space: the front is
// what the player pointed at and is never dropped, and each one after it is
// taken only if the whole of it still fits between the anchor and the wall.
function place(anchor: DOMRect, wantsPanel: boolean, faces: Box[]): Placement {
  const right = rightEdge(anchor);
  const vh = window.innerHeight;

  // How many fit, decided before the horizontal placement because everything
  // below positions against the block as a whole. Measured face by face rather
  // than as a multiple of PREVIEW_W, because a Battle's front is landscape, its
  // back is not, and a token is a third width again.
  let width = faces[0].w;
  let shown = 1;
  while (shown < faces.length && width + GAP + faces[shown].w + GAP * 2 <= right) {
    width += GAP + faces[shown].w;
    shown += 1;
  }
  const drawn = faces.slice(0, shown);
  const height = Math.max(...drawn.map((f) => f.h));

  // Prefer the right of the anchor; flip left when it would overflow.
  let left = anchor.right + GAP;
  if (left + width > right - GAP) left = anchor.left - GAP - width;
  left = Math.max(GAP, Math.min(left, right - GAP - width));

  const lefts: number[] = [];
  let x = left;
  for (const face of drawn) {
    lefts.push(x);
    x += face.w + GAP;
  }

  // Vertically center on the anchor, clamped to the viewport.
  let top = anchor.top + anchor.height / 2 - height / 2;
  top = Math.max(GAP, Math.min(top, vh - GAP - height));

  // The panel sits beyond the preview, so the image never has to move to make
  // room for it.
  let panelLeft: number | null = null;
  if (wantsPanel) {
    const beyond = left + width + GAP;
    const before = left - GAP - PANEL_W;
    if (beyond + PANEL_W <= right - GAP) panelLeft = beyond;
    else if (before >= GAP) panelLeft = before;
  }

  return { lefts, top, height, panelLeft };
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
//
// A SIDEWAYS CARD IS TURNED HERE, because there is nowhere else to turn it.
// Scryfall serves a Battle's front and a split card's whole card as portrait
// 488x680 files with the card lying on its side inside them, and a Room's faces
// carry no image_uris at all -- so there is no upright URL to ask for instead.
// See `frontIsSideways`. The picture rotates and the box turns with it; the
// clip radius does not change, because the card's 3mm corner is still 3mm on a
// card whose 63mm edge is still drawn at PREVIEW_W.
//
// Rotating about the centre rather than a corner is what keeps this to one
// number: a portrait image spun 90 degrees around its own middle lands exactly
// inside a box of its own dimensions swapped, with no offset to compute.
function Face({
  src,
  alt,
  left,
  top,
  sideways = false,
}: {
  src: string;
  alt: string;
  left: number | null;
  top: number | null;
  sideways?: boolean;
}) {
  const box = boxFor(sideways);
  return (
    <div
      className="popup-surface pointer-events-none fixed z-50 overflow-hidden transition-opacity"
      style={{
        left: left ?? -9999,
        top: top ?? -9999,
        width: box.w,
        // Only when turned. An upright box has always hugged its image, and
        // stating a rounded height for it would open a sub-pixel band under the
        // bottom edge -- the exact defect the three rules above exist to close.
        height: sideways ? box.h : undefined,
        opacity: left != null ? 1 : 0,
        borderRadius: CARD_CORNER,
      }}
    >
      <img
        src={webpImage(src)}
        alt={alt}
        className={sideways ? "absolute left-1/2 top-1/2 block" : "block w-full"}
        style={
          sideways
            ? {
                width: PREVIEW_W,
                height: PREVIEW_H,
                transform: "translate(-50%, -50%) rotate(90deg)",
              }
            : undefined
        }
        draggable={false}
      />
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
  // Named in the panel whether or not there was room to draw them. This is the
  // half of the token feature that cannot be squeezed out by a narrow viewport,
  // and it is why the pictures are allowed to yield.
  const tokens = hover?.card.tokens ?? [];
  const panel = notes.length > 0 || stats || tokens.length > 0;
  const back = hover?.card.backImageUrl;
  // Hold Shift to swap the stat rows for what they mean. A key rather than a
  // click because the panel is pointer-events:none -- it sits under the cursor
  // and must stay unclickable, or moving toward it would dismiss the hover.
  const explain = useHeldKey("Shift") && stats;

  // Only the front. A Battle's back is an ordinary upright creature, and there
  // is no card in the pool printed sideways on both sides.
  const turned = hover != null && frontIsSideways(hover.card);

  // What a card makes, drawn as the cards they are.
  //
  // The question "create a Map token" asks is what a Map DOES, and the only
  // complete answer to that is the token's own picture -- its rules text is
  // printed on it and is in no field we store. So a token earns a box beside
  // the card rather than a line in the panel, at the same size, because
  // shrinking the one thing the hover was opened for would defeat it.
  //
  // Behind the back face in the queue, and so the first thing to yield on a
  // narrow screen. It never yields SILENTLY: the panel names every token the
  // card makes whether or not there was room to draw it, which is the whole of
  // what a reader loses when the picture does not fit.
  const drawable = useMemo(
    () => (hover?.card.tokens ?? []).filter((t) => t.imageUrl != null),
    [hover],
  );

  const faces = useMemo(() => {
    const list: { src: string; alt: string; box: Box; sideways: boolean }[] = [];
    if (!hover?.card.imageUrl) return list;
    list.push({
      src: hover.card.imageUrl,
      alt: hover.card.name,
      box: boxFor(turned),
      sideways: turned,
    });
    if (back) {
      list.push({
        // The back of a double-faced card, beside the front rather than instead
        // of it: the two sides are one card and the question the player is
        // asking is what it turns INTO, which needs both. Named by the second
        // half of "Front // Back", which is what the back face is called.
        src: back,
        alt: hover.card.name.split("//").at(-1)?.trim() ?? hover.card.name,
        box: UPRIGHT,
        sideways: false,
      });
    }
    for (const token of drawable) {
      list.push({ src: token.imageUrl!, alt: `${token.name} token`, box: UPRIGHT, sideways: false });
    }
    return list;
  }, [hover, back, turned, drawable]);

  // A ref, not state: suspending must not re-render every card on the page, and
  // nothing renders differently for it -- `show` simply declines.
  const suspended = useRef(false);

  const show = useCallback((card: Card, el: HTMLElement, showStats: boolean) => {
    if (suspended.current) return;
    setHover({ card, el, anchor: el.getBoundingClientRect(), showStats });
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

  /**
   * The preview must not outlive its anchor, and `onMouseLeave` is not enough to
   * promise that.
   *
   * `anchor` is a DOMRect in VIEWPORT coordinates, measured once, and the preview
   * is `fixed`. So the preview is only ever correct while the thing it was
   * measured from is still where it was. Two ways that stops being true and
   * neither of them fires a mouse event:
   *
   * SCROLL. The card slides away and the image stays nailed to the screen beside
   * where it used to be. Hidden rather than repositioned: a hover preview is a
   * statement about where the pointer is, and once the page has moved under it
   * that statement has expired -- following the card would also mean deciding
   * what to do when it leaves the viewport entirely.
   *
   * UNMOUNT. The element under the cursor is destroyed before it can be left, so
   * no leave event is ever dispatched and the image hangs there. The build screen
   * is where this shows up worst -- pressing a card moves it to the other list in
   * its well, which is an unmount and a mount, with the pointer never moving.
   *
   * The observer is what makes this general. `useHidePreview` exists for the same
   * problem and puts the job on the caller, which means every list that can drop a
   * row under the cursor has to remember; this one holds regardless of what caused
   * the DOM to change. Scoped to while a preview is open, and `isConnected` on one
   * element is the whole of the work it does per mutation.
   */
  useEffect(() => {
    if (!hover) return;
    const { el } = hover;

    const stranded = () => {
      if (!el.isConnected) hide();
    };
    const observer = new MutationObserver(stranded);
    observer.observe(document.body, { childList: true, subtree: true });

    // Capture, because a scroll event does not bubble -- the draft screen's piles
    // and the review's lists are their own scrollers, and a listener that only
    // heard the window would miss every one of them.
    window.addEventListener("scroll", hide, { capture: true, passive: true });
    window.addEventListener("resize", hide);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", hide, { capture: true });
      window.removeEventListener("resize", hide);
    };
  }, [hover, hide]);

  // Position after render so the box size is known and clamping is accurate.
  // useEffect (not layout) keeps this off the server render; the box stays at
  // opacity 0 until a position is set, so there is no visible flash.
  useEffect(() => {
    if (hover && faces.length > 0) setPos(place(hover.anchor, panel, faces.map((f) => f.box)));
  }, [hover, panel, faces]);

  // Memoised because every hoverable card on the page consumes this context, and
  // a fresh object here would re-render all of them each time a preview opens.
  const value = useMemo(() => ({ show, hide, suspend }), [show, hide, suspend]);

  return (
    <HoverPreviewContext.Provider value={value}>
      {children}
      {hover?.card.imageUrl && (
        <>
          {/* Each face centred in the block rather than all of them hung from
              its top, which only started to matter once they could be different
              shapes: a Battle's landscape front against its upright back is a
              126px difference, and top-aligning them reads as one having
              slipped.

              Every face is rendered, including the ones `place` found no room
              for: `lefts` comes back short of `faces`, and those fall through
              to the same offscreen parking an unplaced face already used. */}
          {faces.map((face, i) => (
            <Face
              key={`${face.src}-${i}`}
              src={face.src}
              alt={face.alt}
              left={pos?.lefts[i] ?? null}
              top={pos && pos.lefts[i] != null ? pos.top + (pos.height - face.box.h) / 2 : null}
              sideways={face.sideways}
            />
          ))}

          {panel && pos?.panelLeft != null && (
            <div
              className="popup-surface pointer-events-none fixed z-50 flex flex-col gap-3 overflow-y-auto p-3"
              style={{
                left: pos.panelLeft,
                top: pos.top,
                width: PANEL_W,
                maxHeight: pos.height,
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

              {/* What the card makes, above the keyword reminders because it is
                  about THIS card where a reminder is about the game. Two lines
                  each and no picture: the picture is the box beside the card,
                  and repeating it here at panel width would be the smaller copy
                  of the two.

                  Every token, including any the row had no room to draw. A
                  feature that disappears on a narrow screen and says nothing is
                  indistinguishable from one that was never built. */}
              {!explain && tokens.length > 0 && (
                <>
                  {stats && <hr className="border-base-300" />}
                  <div className="flex flex-col gap-1.5">
                    <span className="eyebrow">Makes</span>
                    <ul className="flex flex-col gap-1">
                      {tokens.map((t) => (
                        <li key={t.name} className="leading-snug">
                          <span className="text-sm font-semibold">{t.name}</span>
                          <p className="text-xs text-base-content/70">{t.typeLine}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              )}

              {/* Explaining costs about the height the keywords occupy, and the
                  panel cannot be scrolled (pointer-events:none). Someone holding
                  Shift is asking what the numbers mean, not what Flying does, so
                  the reminders yield rather than overflow out of reach. */}
              {!explain && (stats || tokens.length > 0) && notes.length > 0 && (
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
