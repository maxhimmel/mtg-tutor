"use client";

import { useId, type ReactNode } from "react";

/**
 * A sentence that is true, needed, and in the way.
 *
 * This screen carries four passages of real explanation -- what the score is out
 * of, what "changed N of your later packs" was measured by, why some picks are
 * not a comparison at all, and how to read the braid. Every one of them is
 * load-bearing the first time and furniture the fifth, and together they are
 * most of the reason a page of instruments reads as a page of prose.
 *
 * So the passage does not move and does not shorten. It gets a second place to
 * live, and the page decides which: `inline` is the paragraph exactly as it was,
 * `hover` is a question mark next to the thing being explained. Nothing is ever
 * cut, because a caveat that only some readers see is a caveat that stops being
 * true.
 *
 * IT IS NOT A HOVER-ONLY CONTROL, which is the trap this component exists to
 * avoid. The mark is a real button: it takes focus, it opens on focus as well as
 * on hover, and it names its subject out loud rather than saying "more info". A
 * reader who cannot hover gets the passage by tabbing to it, and a screen reader
 * gets it as the button's description without opening anything -- which is why
 * the panel stays in the DOM and is hidden with opacity rather than removed.
 */
export type ExplainMode = "inline" | "hover";

export function Explain({
  mode,
  subject,
  align = "end",
  className,
  children,
}: {
  mode: ExplainMode;
  /**
   * What is being explained, as the button's accessible name -- "the score",
   * "what a fork changed". "More information" would be forty-two identical
   * buttons to anyone reading the page by its controls.
   */
  subject: string;
  /** Which edge the panel hangs from, so a mark in a rail does not open off-screen. */
  align?: "start" | "end" | "left";
  className?: string;
  children: ReactNode;
}) {
  const id = useId();

  if (mode === "inline") {
    return (
      <p className={`text-xs leading-relaxed text-base-content/55 ${className ?? ""}`}>
        {children}
      </p>
    );
  }

  return (
    <span className={`group relative inline-flex align-middle ${className ?? ""}`}>
      <button
        type="button"
        aria-label={`Explain ${subject}`}
        aria-describedby={id}
        // A ring rather than a filled chip: it is an offer, not an alert, and
        // this app spends its one filled circle on "yours". Sized to the
        // eyebrow it usually sits beside.
        className="card-focus flex size-[1.125rem] shrink-0 items-center justify-center rounded-full border border-base-content/30 text-[0.625rem] font-semibold leading-none text-base-content/55 transition-colors hover:border-base-content/60 hover:text-base-content/85 peer"
      >
        ?
      </button>
      <span
        id={id}
        role="tooltip"
        // Raised, not recessed. It is laid over panels that are already
        // base-200, and base-300 is the one step this theme has above them.
        // Reachable by the pointer while it is open, which `invisible` already
        // prevents while it is not. A passage of four sentences that closes when
        // you move towards it is a passage nobody finishes.
        className={`invisible absolute top-full z-50 mt-2 w-72 rounded-box border border-base-300 bg-base-300 p-3 text-xs leading-relaxed text-base-content/80 opacity-0 shadow-lg transition-opacity motion-reduce:transition-none group-hover:visible group-hover:opacity-100 peer-focus:visible peer-focus:opacity-100 ${
          align === "end"
            ? "right-0"
            : align === "start"
              ? "left-0"
              : "right-full top-1/2 mr-2 mt-0 -translate-y-1/2"
        }`}
      >
        {children}
      </span>
    </span>
  );
}
