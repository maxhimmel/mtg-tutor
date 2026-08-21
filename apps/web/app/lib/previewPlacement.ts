/**
 * Where a card preview goes, and whether it can go anywhere at all.
 *
 * Pure on purpose. Everything the answer depends on -- the viewport, the wall a
 * page nominated, the shape of every face being drawn -- arrives as an argument,
 * so the rule can be read in one place and tested without a browser. Measuring
 * is the provider's job; deciding is this one's.
 */

export const PREVIEW_W = 320; // px; height follows the card aspect ratio
export const PREVIEW_H = Math.round((PREVIEW_W * 680) / 488);
export const PANEL_W = 260;
const GAP = 12;

// A Magic card is 63mm across with a 3mm corner, and Scryfall's art is the whole
// card -- so this is the card's own rounding at whatever width it is drawn.
export const CARD_CORNER = (PREVIEW_W * 3) / 63;

export interface Box {
  w: number;
  h: number;
}

// A card lying on its side is the same card: the 63mm edge is still drawn at
// PREVIEW_W, so it is the box that turns and not the scale.
export const UPRIGHT: Box = { w: PREVIEW_W, h: PREVIEW_H };
export const TURNED: Box = { w: PREVIEW_H, h: PREVIEW_W };
export const boxFor = (sideways: boolean) => (sideways ? TURNED : UPRIGHT);

// The card the preview is hanging off, in viewport coordinates. A DOMRect
// satisfies this, which is the only thing that ever supplies one.
export interface Anchor {
  top: number;
  right: number;
  bottom: number;
  left: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
  // The left edge of whatever the page marked `[data-preview-edge]`, or null
  // where nothing did. Honoured as the preview's right-hand wall only when it
  // genuinely sits to the right of the card -- the draft board's side panel is
  // where the coach is talking, and a card image landing on top of it is the
  // preview covering the thing you are drafting by, but a layout that stacks
  // that panel below the board (narrow viewports) has to fall back to the
  // viewport rather than clamp the preview to nothing.
  //
  // SOFT, and `place` says where it bends: a wall may cost the block a position
  // and it may cost it a token, but it may not cost the card a side of itself.
  wall: number | null;
}

export interface Placement {
  // One x per face that fits, in the order they were asked for, and SHORTER
  // than that list when they do not all fit -- the front is what the player
  // pointed at, so everything after it yields in turn: the card's other side to
  // the page, and a token to whichever of the page and the wall comes first.
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

// Any part of the card still on screen. The preview says "the pointer is on
// THIS card", and a card scrolled entirely out of the viewport is one the
// pointer cannot be on -- so that is the moment the statement expires, rather
// than the first pixel of scroll. Partly visible is still visible: the pointer
// may well be on the half that is left.
function onScreen(anchor: Anchor, viewport: Viewport): boolean {
  return (
    anchor.bottom > 0 &&
    anchor.top < viewport.height &&
    anchor.right > 0 &&
    anchor.left < viewport.width
  );
}

/**
 * `sides` is the card as it is printed -- the front, and the back where there is
 * one. `tokens` is what that card makes, drawn beside it. Both are ordered by
 * claim on the space: the front is what the player pointed at and is never
 * dropped, and each box after it is taken only if the whole of it still fits.
 *
 * THEY ARRIVE APART BECAUSE THEY ARE MEASURED AGAINST DIFFERENT EDGES.
 *
 * A token yields to the wall. It is another card, it is behind the card's own
 * sides in the queue, and the panel names every token whether or not there was
 * room to draw one -- so a token that does not fit is a loss the screen still
 * reports.
 *
 * A side does not yield to the wall. It is THIS card, nothing else on the screen
 * says what the other half of it is, and the wall is a preference the page
 * stated rather than an edge the page has. Letting it swallow a back face makes
 * a wider window show less than a narrower one, which is what the draft board's
 * two-column rail did the day it shipped: the rail went from 360px to 684px, its
 * left edge came 324px in, and between 1440px and roughly 1812px the room left
 * of it dropped below the 652px a front and a back need side by side. So the
 * block is allowed past the wall to keep a side -- by as little as it needs,
 * because it is still pushed as far left as the page allows first -- and the
 * rail gives up its left-hand margin rather than the card giving up its back.
 *
 * Null means there is nowhere to put it, which is the caller's cue to close.
 */
export function place(
  anchor: Anchor,
  viewport: Viewport,
  wantsPanel: boolean,
  sides: Box[],
  tokens: Box[] = [],
): Placement | null {
  const faces = [...sides, ...tokens];
  if (faces.length === 0 || !onScreen(anchor, viewport)) return null;

  const wall =
    viewport.wall != null && viewport.wall > anchor.right ? viewport.wall : viewport.width;

  // How much of the page the block may take. The panel's share is subtracted
  // FIRST, and that ordering is the whole of notes.md #7.
  //
  // The extra faces used to be taken against the full width and the panel
  // placed in whatever was left, so on a wide-enough block there was nothing
  // left: the first card in a pack hangs its block to the RIGHT (there is no
  // room to its left to flip into), a token adds a second card's width to it,
  // and the panel came back null. Same card in the middle of the pack, fine --
  // the block flips left and leaves room beyond. A stats panel that depends on
  // which slot of the pack you are pointing at.
  //
  // The order is not arbitrary, and the token block's own comment already
  // states it: the pictures are "the first thing to yield on a narrow screen"
  // and "it never yields SILENTLY -- the panel names every token the card makes
  // whether or not there was room to draw it". The panel is the half that can
  // report the loss, so it cannot be the half that is lost first.
  const forPanel = wantsPanel ? PANEL_W + GAP : 0;
  const roomTo = (edge: number) => edge - GAP * 2 - forPanel;

  // How many fit, decided before the horizontal placement because everything
  // below positions against the block as a whole. Measured face by face rather
  // than as a multiple of PREVIEW_W, because a Battle's front is landscape, its
  // back is not, and a token is a third width again.
  //
  // The front is exempt from all of it: it is what the player pointed at and is
  // never dropped, so a panel is what yields when even the card alone cannot
  // make room for both -- which is what `panelLeft` being null still means. The
  // rest of the card's sides answer to the page, and only the tokens to the
  // wall; see the note above the signature for why those are different edges.
  let width = faces[0].w;
  let shown = 1;
  while (
    shown < faces.length &&
    width + GAP + faces[shown].w <= roomTo(shown < sides.length ? viewport.width : wall)
  ) {
    width += GAP + faces[shown].w;
    shown += 1;
  }
  const drawn = faces.slice(0, shown);
  const height = Math.max(...drawn.map((f) => f.h));

  // The block's own right-hand limit, with the panel's side already taken out
  // of it. `fits` is false when the page cannot hold both, and then the panel
  // is what goes -- the image is what the player pointed at and still wins.
  //
  // The limit is the wall's while the wall can hold the whole arrangement, and
  // the page's once it cannot. Measuring `fits` against the wall in that second
  // case would answer a question nobody asked -- the block has already been let
  // past it to keep a side -- and would drop the stats panel to protect a margin
  // the block is standing on anyway.
  const right = GAP + width + forPanel + GAP <= wall ? wall : viewport.width;
  const limit = right - GAP - width;
  const fits = wantsPanel && limit - GAP - PANEL_W >= GAP;

  // Where the block may start, and this one is ALWAYS the wall's, which is what
  // keeps the overflow to the minimum. A block too wide for the wall gets a
  // negative rightmost, the clamp below floors it at the left margin, and what
  // hangs past the wall is exactly the width the extra side needed and no more.
  const rightmost = wall - GAP - width - (fits ? GAP + PANEL_W : 0);

  // Prefer the right of the anchor; flip left when it would overflow. The flip
  // now tests the panel's limit rather than the page's, which is what keeps the
  // panel's room without the block ever losing a face or a pixel to it.
  let left = anchor.right + GAP;
  if (left > rightmost) left = anchor.left - GAP - width;
  left = Math.max(GAP, Math.min(left, rightmost));

  const lefts: number[] = [];
  let x = left;
  for (const face of drawn) {
    lefts.push(x);
    x += face.w + GAP;
  }

  // Vertically center on the anchor, clamped to the viewport.
  let top = anchor.top + anchor.height / 2 - height / 2;
  top = Math.max(GAP, Math.min(top, viewport.height - GAP - height));

  // Always beyond the block, never before it. There used to be a near-side
  // fallback for when the block had been placed hard against the wall with
  // nothing past it; the block reserving the room is what made that case
  // unreachable, and a branch nothing can reach is worse than one side.
  const panelLeft = fits ? left + width + GAP : null;

  return { lefts, top, height, panelLeft };
}
