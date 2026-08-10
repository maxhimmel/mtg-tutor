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
    <section className={`card border border-base-300 bg-base-200 ${className ?? ""}`}>
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
