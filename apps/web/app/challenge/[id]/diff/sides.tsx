import type { ReactNode } from "react";

/**
 * Which of the two drafters a thing belongs to, said the same way everywhere.
 *
 * Three encodings of one binary were in use across this screen at once -- above
 * and below in the braid, left and right in the fork cards, a filled badge
 * against an outlined one in the shelf. A reader had to learn the answer three
 * times and could carry it between none of them, which is most of why the screen
 * did not read at a glance.
 *
 * NOT two colours, and that is the load-bearing decision. Gold already means
 * "yours" everywhere in this app -- the card you are holding, the tick you are
 * on, the badge naming your selection -- and every other saturated hue in the
 * theme is spoken for: success, info, warning and error ARE the grade scale, and
 * `info` blue is "you took" over on the review two screens away. A second hue
 * for the opponent would therefore have to mean something it already means
 * somewhere else.
 *
 * So the opponent is not a second colour but the absence of the first: yours is
 * a filled gold dot, theirs a hollow ring in the text colour. Filled against
 * hollow is also the one encoding of a pair that survives being dimmed, printed,
 * or read by somebody who cannot separate gold from anything.
 */
export function Who({ mine, children }: { mine?: boolean; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Dot mine={mine} />
      <span className="eyebrow truncate">{children}</span>
    </span>
  );
}

/**
 * The mark on its own, for the places the thing it marks is not a label.
 *
 * The fork list sets a card's NAME behind it, and a card name is not an eyebrow
 * -- uppercasing and letter-spacing "Ferocious Werefox" makes it unreadable as
 * the specific card it is. Split out rather than copied so there is still one
 * place the filled-against-hollow rule lives.
 */
export function Dot({ mine }: { mine?: boolean }) {
  return (
    <span
      aria-hidden
      className={`size-2 shrink-0 rounded-full ${
        mine ? "bg-primary" : "border border-base-content/55"
      }`}
    />
  );
}

/**
 * What to call the other drafter.
 *
 * Only ever one of the two knows a name. `fromName` is what the challenger typed
 * about themselves when they made the link, so the friend can be told who dared
 * them -- but nothing is ever learned about the friend, by design, so from the
 * challenger's side the other person has no name to use and "your friend" is the
 * honest word rather than a placeholder.
 *
 * Short, because it labels a column and a dot: "Max", not "Max (challenger)".
 */
export function theirName(side: "challenger" | "friend", fromName?: string): string {
  if (side === "challenger") return "Your friend";
  return fromName?.trim() || "Your challenger";
}
