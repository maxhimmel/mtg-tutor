import type { ReactNode } from "react";

/**
 * A list that is taller than the room it is given.
 *
 * The app reaches for this whenever a section's height depends on something
 * nobody chose -- how many cards you benched, how many picks you and a friend
 * disagreed on. Left to grow, one of those sections pushes everything after it
 * off the screen, so how much of a page a reader ever finds depends on a number
 * the page has no opinion about.
 *
 * The anatomy is `scroll-box` in globals.css, which is where the reasoning for
 * each part of it lives: a scrollbar that is always drawn, and the content
 * fading out where it runs under the edge, honestly, off the scroll position
 * itself. What is here is the slot the content passes through.
 *
 * TWO ELEMENTS, AND THE FRAME IS THE OUTER ONE. A mask fades everything the
 * element paints, and a border is something the element paints -- so with the
 * frame on the scroller, the top edge of the box dissolved the moment you
 * scrolled off the top of it, which is precisely when a reader most needs to
 * see where the box ends and the panel begins. The wrapper carries the edge,
 * the shadowed lip and the recessed ground and is never masked; the scroller
 * carries the overflow, the scrollbar and the fade. The frame holds still and
 * everything inside it softens at the two edges -- the scrollbar included,
 * which is what lets the bar run the frame's full height without its ends
 * being sliced off by the radius.
 *
 * The ground is base-100 inside a base-200 panel, which is how this app has
 * said "recessed" since the deck board's piles. Anything laid in it should sit
 * at panel weight or above, or it disappears into the floor.
 *
 * The padding is on the scroller and not the wrapper, so the scrollbar stays
 * hard against the frame rather than floating an eighth of an inch inside it.
 * It is there to keep a focused row's ring from being clipped by the very box
 * that is scrolling it.
 *
 * A MAXIMUM AND NOT A HEIGHT, which is why the prop is spelled that way and is
 * required. A section padded out to a fixed size with three rows in it is empty
 * space claiming to be content -- the same fault as the overflow, in the other
 * direction. So the box is as tall as it needs to be until it would be too
 * tall, and no caller can forget to say where that is, because there is no
 * default that would be right for two of them.
 */
export function ScrollBox({
  maxHeight,
  label,
  className,
  children,
}: {
  /** Where it stops growing and starts scrolling, as a Tailwind max-height. */
  maxHeight: string;
  /**
   * What this region is, for a reader who cannot see it.
   *
   * Pass it only when the contents are NOT reachable by tab, because that is
   * exactly when a keyboard has no other way to scroll the box and the region
   * has to become a focus stop itself. Where the contents are buttons or links
   * -- as in the comparison's fork list -- tabbing through them already scrolls
   * the box, and a stop on the container would be one more press between a
   * reader and the thing they are heading for.
   */
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    // overflow-hidden so the frame's own radius is what clips the scrollbar's
    // two ends, rather than the bar running square past a rounded corner.
    <div className="scroll-well overflow-hidden rounded-box border border-base-content/30 bg-base-100">
      <div
        className={`scroll-box p-2 ${maxHeight} ${className ?? ""}`}
        {...(label ? { role: "region", "aria-label": label, tabIndex: 0 } : {})}
      >
        {children}
      </div>
    </div>
  );
}
