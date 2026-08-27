"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { damp, placeTip, type Point } from "../lib/cursorTip";

/**
 * A tooltip that follows the pointer and says what is under it.
 *
 * WHEN THIS IS THE RIGHT SHAPE, because usually it is not. An ordinary tooltip
 * anchors to the element it describes, and should: the subject is the element,
 * and a box that moves while the thing it names does not is noise. This one is
 * for the case where the subject is a POSITION rather than an element — a spot
 * on a chart, a point along a scale — where a reader pointing halfway along a
 * band is asking about that spot and the answer belongs where they are
 * pointing. It also earns its place where the marks are a few pixels tall and
 * anchoring would cover the row beneath.
 *
 * IT IS NOT AN ACCESSIBLE NAME. Nothing here is reachable without a pointer, on
 * purpose: what it says is a longer form of something the element must already
 * carry. Give the hoverable an `aria-label` or a caption that stands on its own,
 * and treat this as the version for people who can point at it.
 *
 * THE PERFORMANCE IS THE WHOLE DESIGN, and it was learned the hard way on the
 * archetype quiz. Read the notes on `showing` below before changing anything
 * here: a tooltip whose text is React state re-renders its entire subtree once
 * per input frame, which is faster than React can render, and the result
 * arrives late and in clumps. Everything the pointer changes is a ref, and one
 * animation frame writes both the transform and the text.
 *
 * A HOOK RATHER THAN A PROVIDER, unlike `CardPreview`'s hover panel. That one
 * is a single surface the whole app shares because a card preview is enormous
 * and there must never be two; this is small, and a caller wanting one on two
 * unrelated screens should not have to reach a context through the layout to
 * get it. The cost is one node per hook, which is the right trade at this size.
 *
 *     const tip = useCursorTip();
 *
 *     {rows.map((row) => (
 *       <span key={row.id} aria-label={plainly(row)} {...tip.follow(() => say(row))} />
 *     ))}
 *
 *     {tip.node}
 */
export interface CursorTip {
  /**
   * Handlers to spread onto one hoverable thing.
   *
   * `say` is called on every move with the event, so it can read the pointer's
   * position within the element — which is the point of this component. Return
   * null to say nothing about that spot and hide the box.
   *
   * Shaped as a factory rather than a hook so a caller can attach it to a list
   * without calling a hook per item, which is the rule-of-hooks violation
   * `useCardHoverFactory` exists to avoid and the same answer to it.
   */
  follow: (say: (e: MouseEvent<HTMLElement>) => string | null) => {
    onMouseMove: (e: MouseEvent<HTMLElement>) => void;
    onMouseLeave: () => void;
  };
  /** The box. Render it once, anywhere inside the component that owns the hook. */
  node: ReactNode;
}

export interface CursorTipOptions {
  /**
   * How much of the remaining distance to cover in one 60Hz frame.
   *
   * A follower pinned exactly under the cursor reads as an artefact of the
   * cursor; one that catches up over about four frames reads as a thing being
   * carried. Below about 0.15 it starts to read as lag.
   */
  ease?: number;
  /** Widest the box may get. Also what the first frame assumes before measuring. */
  maxWidth?: number;
}

const DEFAULTS = { ease: 0.28, maxWidth: 272 };

export function useCursorTip(options: CursorTipOptions = {}): CursorTip {
  const { ease, maxWidth } = { ...DEFAULTS, ...options };

  // THE ONLY STATE IS WHETHER IT IS ON SCREEN. Everything the pointer changes --
  // where it is and what it is over -- is a ref, written by the move handler and
  // read by one animation frame. Putting the TEXT in state is what made the
  // first version of this stutter: a tooltip that reports the value under the
  // cursor says something different on every pixel, so every pixel re-rendered
  // the whole subtree.
  const [showing, setShowing] = useState(false);
  const box = useRef<HTMLDivElement | null>(null);
  const want = useRef({ x: 0, y: 0, text: "" });
  const at = useRef<Point>({ x: 0, y: 0 });
  // Whether `setShowing` has already been told. React bails on a set to the
  // value it holds, but is documented as sometimes rendering once more before
  // it does -- and "sometimes" on a path that runs once an input frame is not a
  // thing to leave to chance.
  const shown = useRef(false);

  useEffect(() => {
    if (!showing) return;
    // Start where the pointer already is, or the first frames are spent flying
    // in from the corner of the screen.
    at.current = { x: want.current.x, y: want.current.y };

    let frame = 0;
    let last = performance.now();
    const step = (now: number) => {
      // Clamped, so a tab returning from the background eases rather than
      // teleports -- see `damp`, which says why the number is time and not
      // frames.
      const t = damp(ease, Math.min(64, now - last));
      last = now;

      const el = box.current;
      if (el) {
        at.current = {
          x: at.current.x + (want.current.x - at.current.x) * t,
          y: at.current.y + (want.current.y - at.current.y) * t,
        };
        const to = placeTip(
          at.current,
          { width: el.offsetWidth, height: el.offsetHeight },
          { width: window.innerWidth, height: window.innerHeight },
        );
        el.style.transform = `translate3d(${Math.round(to.x)}px, ${Math.round(to.y)}px, 0)`;
        // Written rather than rendered, for the reason above. React only paints
        // this node on show and on hide, and it paints the current text both
        // times, so the two can never disagree.
        if (el.textContent !== want.current.text) el.textContent = want.current.text;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [showing, ease]);

  const hide = () => {
    shown.current = false;
    setShowing(false);
  };

  const follow: CursorTip["follow"] = (say) => ({
    onMouseMove: (e) => {
      const text = say(e);
      if (text == null) {
        if (shown.current) hide();
        return;
      }
      want.current = { x: e.clientX, y: e.clientY, text };
      if (!shown.current) {
        shown.current = true;
        setShowing(true);
      }
    },
    onMouseLeave: hide,
  });

  // Placed at render rather than on the first frame. Without this the element
  // paints at the origin and jumps to the pointer once the effect has run and a
  // frame has been asked for -- two frames of a tooltip in the corner of the
  // screen, every time one opens. The move handler sets `want` before it sets
  // the state, so the position is already known here; the height is not, and
  // the next frame corrects it.
  const first = placeTip(
    want.current,
    { width: maxWidth, height: 0 },
    { width: typeof window === "undefined" ? 0 : window.innerWidth, height: 0 },
  );

  return {
    follow,
    node: showing ? (
      <div
        ref={box}
        role="presentation"
        className="pointer-events-none fixed left-0 top-0 z-50 rounded-box border border-base-300 bg-base-100 px-3 py-2 text-xs leading-relaxed text-base-content/80 shadow-lg"
        style={{
          maxWidth,
          transform: `translate3d(${Math.round(first.x)}px, ${Math.round(first.y)}px, 0)`,
        }}
      >
        {want.current.text}
      </div>
    ) : null,
  };
}
