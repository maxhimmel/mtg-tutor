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
}: {
  title?: string;
  // Sits opposite the title on the header rule: counts, badges, a control.
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`card border border-base-300 bg-base-200 ${className ?? ""}`}>
      {(title != null || aside != null) && (
        <div className="flex items-center justify-between gap-3 border-b border-base-300 px-4 py-2.5">
          {title != null ? <h2 className="eyebrow">{title}</h2> : <span />}
          {aside}
        </div>
      )}
      <div className={`card-body gap-2 p-4 ${bodyClassName ?? ""}`}>{children}</div>
    </section>
  );
}
