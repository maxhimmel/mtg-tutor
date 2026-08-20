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
import { type DisplayCard, cardShapeOf, frontIsSideways, keywordsOf } from "@mtg-tutor/core";
import { tokensPreviewed } from "../lib/analytics";
import { webpImage } from "../lib/cardImage";
import {
  type Box,
  type Placement,
  type Viewport,
  boxFor,
  CARD_CORNER,
  PANEL_W,
  PREVIEW_H,
  PREVIEW_W,
  place,
  UPRIGHT,
} from "../lib/previewPlacement";
import { useHeldKey } from "../lib/useHeldKey";
import { CardStats, hasStats } from "./CardStats";

interface HoverState {
  card: DisplayCard;
  // The element the preview is hanging off. The element and not a rect measured
  // from it: a rect is where the card WAS, and the page moves -- see the
  // tracking effect below.
  el: HTMLElement;
  showStats: boolean;
}

interface HoverPreviewValue {
  show: (card: DisplayCard, el: HTMLElement, showStats: boolean) => void;
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
export function useCardHover(card: DisplayCard | undefined, showStats = false) {
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

// Hold the preview back for as long as something else owns the screen. Hiding
// once is not enough: while the cursor is being dragged across the board every
// card and every deck row it passes over fires its own onMouseEnter, so the
// preview would reopen under the hand carrying a card -- and a stage standing
// over the board is the same problem lasting longer, with the preview free to
// open on top of the question the player is being asked. Turned off again when
// the screen goes back to the board.
//
// The ONE dismissal that is not "the pointer left the card": everything else the
// provider works out for itself.
export function useSuspendPreview() {
  const ctx = useContext(HoverPreviewContext);
  return ctx?.suspend ?? (() => {});
}

// The viewport as `place` needs it, read fresh every time rather than held:
// scrolling, resizing and the side panel appearing all change this, and the
// preview is only correct while it is describing the page as it is now.
function viewport(): Viewport {
  const marked = document.querySelector("[data-preview-edge]");
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    wall: marked?.getBoundingClientRect().left ?? null,
  };
}

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
  // A card the numbers were ASKED for and could not be given.
  //
  // `stats` being false has two causes and only one of them is the player's.
  // Turning the readout off is a deliberate choice -- drafting blind is a mode
  // this app offers -- and repeating it back on every hover would be the app
  // arguing with a setting. A card 17Lands has no row for is not a choice, is
  // not fixable, and looks identical: the panel renders, the tokens list, and
  // where the win rates go there is nothing at all.
  //
  // That silence is what notes.md #7 was reported against a second time, after
  // the placement bug behind it was fixed -- and it is unfalsifiable from the
  // outside, which is the whole objection. Unrated cards are overwhelmingly
  // rares and mythics (41 of fdn's 49; up to a third of the rare pool in mom,
  // woe and lci), and the first card in a pack is ALWAYS the rare or mythic
  // because `SLOT_ORDER` is fixed -- so "the first card has no stats" is what a
  // missing row looks like from a chair.
  const unrated = hover != null && hover.showStats && !hasStats(hover.card);
  // Named in the panel whether or not there was room to draw them. This is the
  // half of the token feature that cannot be squeezed out by a narrow viewport,
  // and it is why the pictures are allowed to yield.
  const tokens = hover?.card.tokens ?? [];
  // `unrated` counts, because a sentence explaining an absence is content and a
  // panel that will not open cannot carry it -- which is the shape of the bug
  // one line up, one level down.
  const panel = notes.length > 0 || stats || unrated || tokens.length > 0;
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

  const show = useCallback((card: DisplayCard, el: HTMLElement, showStats: boolean) => {
    if (suspended.current) return;
    setHover({ card, el, showStats });
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
  //
  // Any suspension goes with it. Whoever was holding the preview back -- a drag,
  // a stage -- left with the screen it belonged to, and nothing on the new one
  // will ever turn it off.
  const pathname = usePathname();
  useEffect(() => {
    hide();
    suspended.current = false;
  }, [pathname, hide]);

  /**
   * One effect owns where the preview is: it follows the card it was opened on,
   * and closes when there is no longer a card to follow.
   *
   * The preview is `fixed` and the card is on a page that moves, so a position
   * is only ever true of the moment it was measured. That used to be handled by
   * dismissing on anything that could have moved the page -- which read as the
   * preview quitting while the player was still pointing at the card, because
   * they were. So the anchor is re-measured instead, and only two things end it:
   *
   * SCROLLED OFF. The card left the viewport, so the pointer is not on it. Any
   * scroll that leaves it partly visible just moves the preview with it.
   *
   * UNMOUNTED. The element under the cursor is destroyed before it can be left,
   * so no leave event is ever dispatched and the image would hang there. Picking
   * a card swaps the whole pack for the next one; the build screen is worse,
   * where pressing a card moves it to the other list in its well -- an unmount
   * and a mount with the pointer never moving.
   *
   * The observer is what makes the second one general. Nothing has to remember
   * to tell the preview it is about to be stranded; this holds regardless of
   * what caused the DOM to change. Scoped to while a preview is open, and
   * `isConnected` on one element is the whole of the work it does per mutation
   * -- deliberately not a re-measure, because the coach streams its prose into
   * this same document a token at a time.
   */
  useEffect(() => {
    if (!hover) return;
    const { el } = hover;
    const boxes = faces.map((f) => f.box);

    const follow = () => {
      const next = place(el.getBoundingClientRect(), viewport(), panel, boxes);
      if (next) setPos(next);
      else hide();
    };
    // Placed after render rather than during it, so the faces the block is made
    // of are known. The box stays at opacity 0 until a position is set, so there
    // is no flash where the first render put it.
    follow();

    const stranded = () => {
      if (!el.isConnected) hide();
    };
    const observer = new MutationObserver(stranded);
    observer.observe(document.body, { childList: true, subtree: true });

    // Capture, because a scroll event does not bubble -- the draft screen's piles
    // and the review's lists are their own scrollers, and a listener that only
    // heard the window would miss every one of them.
    window.addEventListener("scroll", follow, { capture: true, passive: true });
    window.addEventListener("resize", follow);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", follow, { capture: true });
      window.removeEventListener("resize", follow);
    };
  }, [hover, panel, faces, hide]);

  // Reported from here rather than from `place`, because the question is how
  // many token pictures a REAL screen had room for and only the placement that
  // actually happened knows that. A ref so it is once per provider: see
  // `tokensPreviewed` for why the same answer repeated per hover is not worth
  // the quota.
  const counted = useRef(false);
  useEffect(() => {
    if (counted.current || !pos || tokens.length === 0) return;
    counted.current = true;
    // `lefts` is a prefix of `faces` and the tokens are its tail, so what fitted
    // is whatever is left of the prefix once the card's own faces are paid for.
    const cardFaces = faces.length - drawable.length;
    tokensPreviewed({
      named: tokens.length,
      withArt: drawable.length,
      drawn: Math.max(0, pos.lefts.length - cardFaces),
      // Whether the stats panel got a place beside all that. The pictures
      // yielding is a design question; the panel yielding is a defect, because
      // it is what names the pictures that did not fit.
      panel: pos.panelLeft != null,
      viewport: window.innerWidth,
    });
  }, [pos, tokens, drawable, faces]);

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

              {/* Said, rather than left as a gap where the numbers usually are.
                  Names 17Lands rather than "no data", because whose data is
                  missing is the difference between a card nobody drafted enough
                  of and a bug in this app -- and a reader who cannot tell which
                  has to assume the second. */}
              {unrated && (
                <p className="text-xs leading-snug text-base-content/60">
                  17Lands published no draft data for this card, so it has no win
                  rates to show. It is scored off its rarity instead.
                </p>
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
                  {(stats || unrated) && <hr className="border-base-300" />}
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
              {!explain && (stats || unrated || tokens.length > 0) && notes.length > 0 && (
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
