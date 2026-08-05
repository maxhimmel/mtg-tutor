import type { ReactNode } from "react";

/**
 * The head of a page, as opposed to the head of the app.
 *
 * The masthead above this used to carry both -- which set you were drafting,
 * which pick you were on, whether quiz mode was up, and the links between a
 * review's three views, all sitting beside the wordmark and the account menu.
 * That made the masthead a different shape on every page and gave page controls
 * nowhere of their own to be, so each page invented its own arrow-links.
 *
 * So this is that place: what the page is about on the left, what the page can
 * be told to do on the right, and a rule under both. The rule is the slot: pass
 * `children` and it is drawn as whatever the page has to say -- on the board and
 * in the review that is a PickTrack, so the line separating heading from content
 * is the draft itself.
 */
export function PageHeading({
  icon,
  title,
  controls,
  children,
}: {
  icon?: ReactNode;
  // The subject of the page -- the set being drafted, the draft being reviewed.
  // A ReactNode so a caller can dim part of it; absent where the page's real
  // headline is further down and a second one would fight it (see /review/deck,
  // where Results opens with its own).
  title?: ReactNode;
  controls?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-col gap-3">
      {/* With no title there is nothing for the controls to sit opposite, so
          they lead the row rather than floating alone at the far edge. */}
      <div
        className={`flex flex-wrap items-center gap-x-6 gap-y-2 ${title != null ? "justify-between" : ""}`}
      >
        {title != null && (
          <h1 className="flex min-w-0 items-center gap-2.5 font-display text-2xl font-semibold tracking-tight">
            {icon}
            <span className="truncate">{title}</span>
          </h1>
        )}
        {controls}
      </div>
      {children ?? <div className="border-b border-base-300" />}
    </header>
  );
}
