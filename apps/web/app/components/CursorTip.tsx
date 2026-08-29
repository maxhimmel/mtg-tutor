"use client";

import { Fragment, useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { damp, placeTip, splitSymbols, type Point } from "../lib/cursorTip";
import { manaClass } from "./ManaCost";

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
  // `Element` rather than `HTMLElement`, because a chart's hoverable is often a
  // `<g>` or a `<rect>`. Every caller so far hung this on a div, so the narrower
  // type never bit -- and then `Plot` started requiring a tip and the first SVG
  // chart needed a cast to say what it already meant. The handlers read nothing
  // but `clientX`/`clientY`, which every element has, so the wider type is not a
  // loosening: it is the type these two functions always had.
  follow: (say: (e: MouseEvent<Element>) => string | null) => {
    onMouseMove: (e: MouseEvent<Element>) => void;
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

/**
 * Write a tip's sentence into its box, drawing `{U}` as the game's own pip.
 *
 * Imperative because this is called from inside an animation frame, which is
 * the one place React must not be -- see the note on `showing`. The symbol
 * classes come from `ManaCost` rather than a second table here: which symbols
 * the font ships is the thing that would drift, and it drifts silently, into an
 * empty box.
 *
 * An unknown symbol falls back to its own braces, which is `ManaCost`'s rule
 * too -- visible and ugly beats invisible.
 */
function paint(el: HTMLElement, text: string): void {
  el.replaceChildren(
    ...splitSymbols(text).map((part) => {
      if ("text" in part) return document.createTextNode(part.text);
      const cls = manaClass(part.mana);
      if (!cls) return document.createTextNode(`{${part.mana}}`);
      const pip = document.createElement("i");
      pip.className = cls;
      // The tip's own line is 12px; a pip at the text's size sits on the
      // baseline beside it rather than towering over the words.
      pip.style.fontSize = "0.95em";
      return pip;
    }),
  );
}

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
        //
        // `paint` and not `textContent` because a tip that names a colour draws
        // the pip, and a pip is an element. It runs on exactly the frames
        // `textContent` used to be assigned on -- the guard is the same string
        // comparison, kept on a data attribute now that the node's own text no
        // longer holds the braces -- so the cost is unchanged: one DOM write
        // when the sentence changes, none while the pointer moves inside a mark.
        if (el.dataset.said !== want.current.text) {
          el.dataset.said = want.current.text;
          paint(el, want.current.text);
        }
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

  // Client-only, so the portal has a `document.body` to reach for. State and not
  // a `typeof window` test: the server renders nothing here, and a first client
  // render that already had the box would not match the HTML it is hydrating.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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

  /**
   * THROUGH A PORTAL, BECAUSE `position: fixed` IS NOT ENOUGH ON ITS OWN.
   *
   * `fixed` positions against the viewport only while no ancestor has made
   * itself a containing block, and a `z-index` only outranks what shares its
   * stacking context. Rendered where the caller renders it, this box inherits
   * whatever the surrounding page happens to be doing -- so the diff screen's
   * masthead, which is `z-20 xl:sticky`, was capping a z-50 tooltip inside a
   * stacking context at 20, and the panel in the next grid column painted
   * straight over it. Nothing about the tooltip was wrong; it was in the wrong
   * tree.
   *
   * That is not a one-off. `ScrollBox` carries a `mask-image`, which is a
   * containing block AND a clip: any chart that puts a tip inside one -- the
   * fork list and the braid's parting list both do -- would have had the box
   * cut off at the scroller's edge instead. Every future `z-*` on any ancestor
   * of any chart is the same bug waiting.
   *
   * `document.body` is the one parent with no such ancestors. It is also what
   * makes this behave like `CardPreview`, whose surface has always worked for
   * exactly this reason and no other: it is rendered once, at the root, by the
   * provider. The docblock at the top of this file calls the hook-not-provider
   * split a cost worth paying; the portal is what stops it costing this.
   *
   * `mounted` guards the server render, where there is no `document` -- and it
   * has to be state rather than a `typeof window` check, or the first client
   * render would disagree with the HTML it is hydrating.
   */
  const tip = showing ? (
    <div
      ref={box}
      role="presentation"
      className="pointer-events-none fixed left-0 top-0 z-50 rounded-box border border-base-300 bg-base-100 px-3 py-2 text-xs leading-relaxed text-base-content/80 shadow-lg"
      style={{
        maxWidth,
        transform: `translate3d(${Math.round(first.x)}px, ${Math.round(first.y)}px, 0)`,
      }}
    >
      {/* Rendered by React on the show frame and by `paint` on every frame
          after. Both go through `splitSymbols`, so the first picture and the
          second cannot disagree -- and drawing the pips here rather than
          leaving the box empty for a frame is what stops a flash of the raw
          braces before the font arrives. */}
      {splitSymbols(want.current.text).map((part, i) =>
        "text" in part ? (
          <Fragment key={i}>{part.text}</Fragment>
        ) : (
          <i key={i} className={manaClass(part.mana) ?? ""} style={{ fontSize: "0.95em" }} />
        ),
      )}
    </div>
  ) : null;

  return {
    follow,
    node: mounted && tip ? createPortal(tip, document.body) : null,
  };
}
