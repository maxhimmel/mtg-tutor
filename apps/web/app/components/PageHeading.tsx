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
  sticky = false,
  children,
}: {
  icon?: ReactNode;
  // The subject of the page -- the set being drafted, the draft being reviewed.
  // A ReactNode so a caller can dim part of it; absent where the page's real
  // headline is further down and a second one would fight it (see /review/deck,
  // where Results opens with its own).
  title?: ReactNode;
  controls?: ReactNode;
  /**
   * Pin the heading to the top of the viewport while the page scrolls under it.
   *
   * For a page that is one long list rather than one screenful: the breakdown
   * runs to seventeen pick records, and a track that says where you are in the
   * draft is worth nothing at record twelve if it left the screen at record two.
   * The switcher and the set name come along because they are in the same box,
   * which is a fair trade -- they are the two things a long scroll most often
   * wants and cannot reach.
   *
   * Only from `lg`. Below it the title and the controls wrap onto two rows, the
   * band stops being a band, and a narrow screen has no height to give away.
   *
   * How tall the band ends up is the CALLER'S to know, not this component's:
   * everything above the slot is fixed here (pt-4, a 2rem title row, gap-3,
   * pb-3 -- 4.5rem in all) but the slot holds whatever the caller put in it. A
   * page that pins its heading has covered the top of its own scroll, so it
   * needs that number for anything else it pins; see PINNED_H in the breakdown.
   */
  sticky?: boolean;
  children?: ReactNode;
}) {
  return (
    <header
      className={`mb-5 flex flex-col gap-3 ${
        sticky
          ? // -mt-4 against the pt-4 so the resting position is unchanged and the
            // padding only shows up as clearance once it pins. mb-2 + pb-3 comes
            // to the same 20px gap mb-5 was, but 12px of it is painted, so the
            // records do not slide out from directly under the rule.
            "lg:sticky lg:top-0 lg:z-30 lg:-mt-4 lg:mb-2 lg:bg-base-100 lg:pb-3 lg:pt-4"
          : ""
      }`}
    >
      {/* Controls stay at the far edge whether or not there is a title opposite
          them. They used to lead the row when a page had none, which meant the
          review's view switcher jumped from one side of the page to the other on
          the one view whose headline lives further down -- and a control that
          moves when you use it is the control being hardest to use. */}
      <div
        className={`flex flex-wrap items-center gap-x-6 gap-y-2 ${title != null ? "justify-between" : "justify-end"}`}
      >
        {title != null && (
          <h1 className="flex min-w-0 items-center gap-2.5 font-display text-2xl font-semibold tracking-tight">
            {icon}
            <span className="truncate">{title}</span>
          </h1>
        )}
        {controls}
      </div>
      {/* The slot is one height whatever fills it, which is what stops the page
          shifting under the reader as they move between a draft's three views.
          1.125rem is what a flat PickTrack occupies. */}
      {children ?? (
        <div className="flex h-[1.125rem] items-center">
          <div className="w-full border-b border-base-300" />
        </div>
      )}
    </header>
  );
}
