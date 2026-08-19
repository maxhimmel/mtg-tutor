import type { ReactNode } from "react";

/**
 * What somebody said for a pick, before anything was revealed.
 *
 * ONE COMPONENT FOR BOTH READERS, because the two surfaces that show a reason
 * are making the same claim about it and must not phrase it differently. The
 * review shows you your own sentence; the challenge diff shows each drafter the
 * other's. If those drifted apart, the more prominent one would start reading as
 * the real feature and the other as an afterthought.
 *
 * DRAWN AS A QUOTATION, deliberately. Everything else on both screens is the
 * app talking -- grades, win rates, the coach's prose. This is the one thing on
 * either screen a person wrote, and the quotation marks are what stop it being
 * read as another thing the app worked out. `italic` is not used: the sentences
 * are short, often carry a card name, and italicising a proper noun inside a
 * quote makes it look like emphasis the writer did not put there.
 *
 * NO COLOUR OF ITS OWN. Ownership on the diff is filled-against-hollow (see
 * `sides.tsx`) and the grade scale owns every saturated hue in the theme, so
 * this borrows the caller's mark rather than introducing a third encoding.
 */
export function Reasoning({
  reason,
  attribution,
  className = "",
}: {
  reason: string;
  /** Who said it, drawn by the caller so the diff can keep its own dot. */
  attribution: ReactNode;
  className?: string;
}) {
  return (
    <figure className={`flex flex-col gap-1 ${className}`}>
      <blockquote className="border-l-2 border-base-content/20 pl-3 text-sm leading-relaxed text-base-content/80">
        {`“${reason}”`}
      </blockquote>
      <figcaption className="pl-3 text-xs text-base-content/45">{attribution}</figcaption>
    </figure>
  );
}
