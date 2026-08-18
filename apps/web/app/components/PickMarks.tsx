"use client";

// The four things a card in a pack can turn out to have been, and the colours
// the app says them in.
//
// EXTRACTED SO THERE IS EXACTLY ONE OF THEM. This lived inside the review's
// PickReveal, which was fine while the review was the only screen arguing over
// a pack. The misses drill is a second one, and a second screen inventing its
// own words for "the card you took" against "the card the deck wanted" would be
// the app teaching two vocabularies for one idea -- the thing the note below
// about matching the CLI already refuses to do, one surface further out.
//
// The drill uses the same words and the same colours and draws them on card
// faces rather than placards, which is the right kind of difference: the form
// follows the screen, the meaning does not.

export interface Mark {
  label: string;
  tone: string;
  // The rail drawn down the side of the card this marks. Same colour as the
  // label, one step quieter.
  rail: string;
  // What the word means, for the key. Four coloured labels above a stack of
  // cards are a code, and a code with no key is a guessing game -- "raw-best"
  // against "context-best" is the whole lesson this screen exists to teach, and
  // it is not a distinction anyone infers from a green label and an orange one.
  means: string;
}

// Same vocabulary and the same colours the CLI reveal uses, so the two surfaces
// do not teach two different sets of words for one idea.
//
// Written out rather than through the `eyebrow` utility that sets the rest of
// the app's small caps: `eyebrow` carries a text colour of its own, and two
// utilities setting one property are settled by the order they were generated in
// rather than the order they appear in the class attribute -- so the role's
// colour would win or lose depending on nothing legible from here.
export const MARK = "text-[0.6875rem] font-semibold uppercase tracking-[0.14em]";

export const GUESS: Mark = {
  label: "your guess",
  tone: "text-base-content/50",
  rail: "bg-base-content/30",
  means: "what you said before the answer",
};
export const TOOK: Mark = {
  label: "you took",
  tone: "text-info",
  rail: "bg-info/60",
  means: "the card you actually drafted",
};
export const RAW_BEST: Mark = {
  label: "raw-best",
  tone: "text-warning",
  rail: "bg-warning/60",
  means: "the highest win rate in the pack",
};
export const CONTEXT_BEST: Mark = {
  label: "context-best",
  tone: "text-success",
  rail: "bg-success/60",
  means: "the best card for the deck you were building",
};

/**
 * The rail beside a card, one band per mark it holds.
 *
 * It used to take a single colour, picked by a precedence rule -- context-best
 * over raw-best over you-took -- so a card that was both the raw best AND the
 * right card for the deck was drawn as though it were only the second. That is
 * the one card on the page whose two labels are the entire lesson, and it was
 * the one the rail flattened. Bands instead, top to bottom in the order the
 * labels print left to right, so the rail says as much as the line above it.
 */
export function MarkRail({ marks }: { marks: Mark[] }) {
  return (
    <span
      aria-hidden
      className="flex w-[3px] shrink-0 flex-col gap-px overflow-hidden rounded-full"
    >
      {marks.map((mark) => (
        <span key={mark.label} className={`flex-1 ${mark.rail}`} />
      ))}
    </span>
  );
}

/**
 * What the labels above the cards mean.
 *
 * Built out of the same parts as a marked card -- rail, then the label, then a
 * line under it -- so the key is a small picture of the thing it explains rather
 * than a glossary sitting next to it. Read one entry and you have read the shape
 * you are about to meet six times below.
 *
 * Drawn once per view of a shortlist: the walkthrough shows one pick, so it goes
 * inside that pick; the breakdown shows forty, so it goes above them. A key
 * repeated forty times is not a key. `quiz` because "your guess" only ever
 * appears on the walkthrough with guessing turned on, and a key naming a mark the
 * page cannot show is worse than no key.
 */
export function PickMarksKey({ quiz = false }: { quiz?: boolean }) {
  const marks = quiz ? [GUESS, TOOK, RAW_BEST, CONTEXT_BEST] : [TOOK, RAW_BEST, CONTEXT_BEST];

  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2.5">
      {marks.map((mark) => (
        <div key={mark.label} className="flex items-stretch gap-2">
          <MarkRail marks={[mark]} />
          <div>
            <dt className={`${MARK} ${mark.tone}`}>{mark.label}</dt>
            <dd className="text-xs text-base-content/50">{mark.means}</dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

