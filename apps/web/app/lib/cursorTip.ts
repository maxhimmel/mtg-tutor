/**
 * The arithmetic behind a tooltip that follows the pointer.
 *
 * Split out of the component for the reason every `lib` file here is: this is
 * where the bugs were. A cursor-follower is four lines of JSX and three
 * genuinely fiddly numbers — where the box goes when the pointer is near an
 * edge, how fast it catches up, and what it does on a display that is not
 * 60Hz — and none of those are reachable from a test if they live inside an
 * animation frame inside a component.
 */

/** Where the pointer is, or how big something is. */
export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** How far the box sits from the pointer, before any flipping. */
export const TIP_GAP: Point = { x: 14, y: 16 };

/** How close to the viewport edge the box may come before it is flipped. */
const MARGIN = 8;

/**
 * Where a tooltip box goes for a pointer at `pointer`.
 *
 * FLIPPED RATHER THAN CLAMPED, on both axes. A box that slides along an edge to
 * stay on screen keeps moving after the pointer has stopped and ends up
 * pointing at whatever happens to be beside it; one that jumps to the other
 * side of the cursor stays attached to the thing that was asked about. The two
 * axes flip independently, so a pointer in the bottom-right corner gets a box
 * up and to the left rather than a choice between the two.
 *
 * Returns viewport coordinates, for a `position: fixed` element.
 */
export function placeTip(
  pointer: Point,
  size: Size,
  viewport: Size,
  gap: Point = TIP_GAP,
): Point {
  const flipX = pointer.x + gap.x + size.width > viewport.width - MARGIN;
  const flipY = pointer.y + gap.y + size.height > viewport.height - MARGIN;

  return {
    // Clamped at the far edge only after flipping, for the case a box is wider
    // than the room on either side: it has to land somewhere, and hard against
    // the left is the one place it is fully readable.
    x: Math.max(MARGIN, flipX ? pointer.x - gap.x - size.width : pointer.x + gap.x),
    y: Math.max(MARGIN, flipY ? pointer.y - gap.y - size.height : pointer.y + gap.y),
  };
}

/** One frame at 60Hz, in milliseconds. The unit `ease` is quoted in. */
const FRAME = 1000 / 60;

/**
 * How far to move toward the pointer this frame.
 *
 * DAMPED BY TIME, NOT BY FRAME, which is the whole reason this is a function
 * rather than a constant. Taking a fixed fraction of the remaining distance
 * every frame chases twice as fast on a 120Hz display as on a 60Hz one, and
 * changes speed whenever a frame is dropped — which is the difference between
 * a follow that feels weighted and one that feels broken, and it is not
 * something the person moving the mouse can diagnose.
 *
 * `ease` is the fraction it would take in one 60Hz frame, so it stays the
 * number somebody would tune, and this converts it to the elapsed time actually
 * seen. `ms` should be clamped by the caller: a tab returning from the
 * background reports a gap of seconds, and `1 - 0.72 ^ 120` is 1, which is a
 * teleport.
 */
export function damp(ease: number, ms: number): number {
  if (ease <= 0) return 0;
  if (ease >= 1) return 1;
  return 1 - Math.pow(1 - ease, ms / FRAME);
}
