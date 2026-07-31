import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { CARD_STAT_GLOSSARY, SCORING_GLOSSARY, type GlossaryEntry } from "@mtg-tutor/core";
import { PageShell } from "../components/PageShell";
import { MaindeckGrid } from "./figures/MaindeckGrid";
import { PickStrip } from "./figures/PickStrip";
import { WinRateAxis } from "./figures/WinRateAxis";

export const metadata: Metadata = {
  title: "Glossary — mtg-tutor",
  description:
    "What GIH WR, IWD, ATA, ALSA, maindeck rate and GP WR actually measure, where each one misleads, and how mtg-tutor grades a pick.",
};

// Grouped by the question each number answers, rather than alphabetically or in
// the order the hover panel happens to draw them. Two of these groupings carry
// an argument:
//
//   - "How good is it" runs GP WR -> GIH -> IWD, which is most-contaminated-by-
//     the-deck to least. That ordering is the point of the section, so it is
//     stated in the section note rather than left for the reader to infer.
//   - Maindeck rate is deliberately NOT in that group. It does not measure the
//     card at all; it measures how much to believe the group above it.
//
// Ids, not entries, so core stays the single source of the definitions.
const SECTIONS: { id: string; question: string; note?: string; ids: string[] }[] = [
  {
    id: "how-good",
    question: "How good is the card?",
    note: "Three win rates, ordered by how much of each one is really about the deck rather than the card. Read down.",
    ids: ["gpwr", "gih", "iwd"],
  },
  {
    id: "how-much-trust",
    question: "How much should I trust that?",
    note: "The numbers above are measured only on games somebody chose to play the card in.",
    ids: ["maindeck"],
  },
  {
    id: "when",
    question: "When can I take it?",
    note: "Nothing to do with how strong the card is — only with whether it will still be there.",
    ids: ["pick-order"],
  },
  {
    id: "grading",
    question: "How the app grades a pick",
    note: "This vocabulary is the app's own, not 17Lands'.",
    ids: SCORING_GLOSSARY.map((e) => e.id),
  },
];

// Each question that has a figure gets it above its definitions, because the
// figure is the answer and the entries are the reference you come back for. The
// opening figure is not in here: it sits above every section, since the argument
// it makes -- that the headline number is never enough -- is the page's, not one
// section's.
//
// Keyed by section id rather than listed alongside the ids, so a section without
// a figure needs no placeholder and adding one later touches nothing else.
const FIGURES: Record<string, ReactNode> = {
  "how-much-trust": <MaindeckGrid />,
  when: <PickStrip />,
};

const ALL = [...CARD_STAT_GLOSSARY, ...SCORING_GLOSSARY];
const byId = new Map(ALL.map((e) => [e.id, e]));

// Anything core adds that this page has not been told where to put still gets
// rendered, rather than silently disappearing from the glossary.
const placed = new Set(SECTIONS.flatMap((s) => s.ids));
const sections = [
  ...SECTIONS,
  ...(ALL.some((e) => !placed.has(e.id))
    ? [
        {
          id: "other",
          question: "Everything else",
          note: undefined,
          ids: ALL.filter((e) => !placed.has(e.id)).map((e) => e.id),
        },
      ]
    : []),
];

function Entry({ entry }: { entry: GlossaryEntry }) {
  return (
    <section
      id={entry.id}
      className="scroll-mt-8 border-t border-base-300 pt-6 first:border-t-0 first:pt-0"
    >
      <h3 className="font-display text-xl leading-none tracking-tight text-primary">
        {entry.label}
      </h3>
      <p className="mt-1.5 text-sm text-base-content/55">{entry.name}</p>

      <div className="mt-3 flex max-w-[62ch] flex-col gap-3 leading-relaxed">
        {entry.detail.map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>

      {entry.caveat && (
        <div className="mt-4 max-w-[62ch] border-l-2 border-warning pl-4">
          {/* Explicit rather than the `eyebrow` utility, which would fight this
              colour: both are text-* utilities in one layer, so the winner would
              be decided by sort order rather than by intent. */}
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-warning">
            The catch
          </p>
          <p className="mt-1 leading-relaxed text-base-content/80">{entry.caveat}</p>
        </div>
      )}
    </section>
  );
}

export default function GlossaryPage() {
  return (
    <PageShell>
      {/* PageShell caps at the app's outer 1500px, which is not a reading
          measure. This is a page of prose and one figure, so the column stops at
          5xl -- leaving the entries at 3xl once the rail takes its 13rem. */}
      <div className="max-w-5xl">
        <div className="max-w-3xl">
          {/* Says "Glossary" because that is what the nav link says. The h1 is a
              thesis, not a signpost, and the reader still needs the signpost. */}
          <p className="eyebrow">Glossary</p>
          <h1 className="mb-2 mt-2 font-display text-3xl font-semibold tracking-tight">
            Every number on a card, and where it misleads you
          </h1>
          <p className="text-base-content/70">
            The draft data comes from hundreds of thousands of real games per set. None of it
            means quite what it looks like it means. While you draft, hold{" "}
            <kbd className="kbd kbd-sm">shift</kbd> over any card for the short version.
          </p>
        </div>

        <div className="mt-8">
          <WinRateAxis />
        </div>

        <div className="mt-12 gap-12 xl:flex xl:items-start">
          {/* Eleven terms, and most people arrive wanting exactly one of them. */}
          <nav aria-label="Terms" className="hidden w-52 shrink-0 xl:sticky xl:top-8 xl:block">
            {sections.map((section) => (
              <div key={section.id} className="mb-5">
                <p className="eyebrow mb-2">{section.question}</p>
                <ul className="flex flex-col gap-1 border-l border-base-300">
                  {section.ids.map((id) => (
                    <li key={id}>
                      <a
                        href={`#${id}`}
                        className="-ml-px block border-l border-transparent py-0.5 pl-3 text-sm text-base-content/60 transition-colors hover:border-primary hover:text-primary focus-visible:border-primary focus-visible:text-primary"
                      >
                        {byId.get(id)?.label ?? id}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          <div className="flex min-w-0 flex-1 flex-col gap-14">
            {sections.map((section) => (
              <div key={section.id}>
                <h2
                  id={section.id}
                  className="scroll-mt-8 font-display text-2xl font-semibold tracking-tight"
                >
                  {section.question}
                </h2>
                {section.note && (
                  <p className="mt-1.5 max-w-[58ch] text-sm leading-relaxed text-base-content/55">
                    {section.note}
                  </p>
                )}

                {FIGURES[section.id] && <div className="mt-6">{FIGURES[section.id]}</div>}

                <div className="mt-8 flex flex-col gap-6">
                  {section.ids.map((id) => {
                    const entry = byId.get(id);
                    return entry ? <Entry key={id} entry={entry} /> : null;
                  })}
                </div>
              </div>
            ))}

            <p className="border-t border-base-300 pt-6 text-sm text-base-content/60">
              The coaching itself rests on a separate corpus —{" "}
              <Link href="/principles" className="link link-primary">
                draft principles
              </Link>
              , with sources.
            </p>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
