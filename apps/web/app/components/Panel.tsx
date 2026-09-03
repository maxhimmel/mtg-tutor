import type { ReactNode } from "react";

// The one boxed surface the app has. Every sidebar and results panel was
// repeating `card border border-base-300 bg-base-200` plus its own uppercase
// heading, which drifted; this fixes the anatomy in one place -- a labelled
// rule across the top, content below it.
//
// `title` is optional because a couple of panels are pure action surfaces with
// nothing to name.
export function Panel({
  title,
  aside,
  children,
  className,
  bodyClassName,
  footer,
}: {
  title?: string;
  // Sits opposite the title on the header rule: counts, badges, a control.
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  // The header rule, mirrored: a control that belongs to the panel rather than
  // to the page beneath it. The comparison's pick stepper is what asked for it
  // -- a transport floating loose under a bordered panel reads as something the
  // page forgot to finish, and putting it inside the box says the true thing,
  // which is that it drives THIS panel and nothing else on the screen.
  footer?: ReactNode;
}) {
  return (
    // NOT daisyUI's `card`, deliberately. That class ships descendant rules for
    // a card's COVER IMAGE -- `.card figure{display:flex;align-items:center;
    // justify-content:center}` and overflow/radius rewrites on figure:first-
    // child and :last-child -- and they reach any <figure> at any depth inside.
    // Reasoning renders a <figure> and sits in a Panel on the review
    // walkthrough, the review breakdown and the challenge diff, where it
    // declares flex and flex-col but no align-items: so the center won
    // uncontested and its quote and attribution shrink-to-fit and centered
    // instead of filling the width under their own pl-3 rail. Measured before
    // the fix: the attribution was 5% of the figure's width at 1280 and the
    // quote 13% on a short reason.
    //
    // These four utilities are `.card`'s replaceable contribution. Its outline,
    // outline-offset and transition:outline are dropped on purpose and are
    // inert here -- the outline is transparent, this section takes no tabIndex
    // and spreads no props, and every direct child is a div, so :focus-visible,
    // [aria-checked] and :has(>:checked) are all unreachable.
    //
    // One thing here is NOT a no-op: the cascade TIER moves. daisyUI emits
    // `.card` in a nested sublayer of @layer utilities, so a utility passed
    // through `className` always beat it. `relative` and `flex-col` are now
    // unlayered in that layer and decided by emission order, and `.absolute` is
    // emitted before `.relative` -- so a caller passing `absolute` would now
    // lose where it previously won. No caller passes one today.
    //
    // `card-body` below is knowingly kept: it carries `& p{flex-grow:1}`, the
    // same species of descendant rule, but its blast radius is every <p> that
    // is a flex item at any depth in a Panel body and most such Panels are
    // behind auth. That is its own work item, with a bounded grep over Panel
    // callers as the instrument -- Summary.tsx:132 already found the trap and
    // neutralizes it with an inline flexGrow:0.
    <section className={`rounded-box relative flex flex-col border border-base-300 bg-base-200 ${className ?? ""}`}>
      {(title != null || aside != null) && (
        // Wraps, because an aside is allowed to be a control and a control is
        // wider than a count. Without it the comparison's sort buttons pushed
        // the header past the panel's own edge on a phone.
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-base-300 px-4 py-2.5">
          {title != null ? <h2 className="eyebrow">{title}</h2> : <span />}
          {aside}
        </div>
      )}
      <div className={`card-body gap-2 p-4 ${bodyClassName ?? ""}`}>{children}</div>
      {footer != null && (
        // A rule and nothing else, exactly as the header is. A shade was tried
        // and is wrong twice over: it needs the panel's own bottom radius
        // restated on it to keep the corners, and anything drawn on base-100
        // inside a footer -- the track's pack wells are -- goes invisible.
        <div className="border-t border-base-300 px-4 py-3">{footer}</div>
      )}
    </section>
  );
}
