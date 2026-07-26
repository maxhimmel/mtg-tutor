import type { Metadata } from "next";
import { loadPrincipleSources, loadPrinciples } from "@mtg-tutor/core";
import { PrinciplesExplorer } from "./PrinciplesExplorer";

export const metadata: Metadata = {
  title: "Draft principles — mtg-tutor",
  description:
    "The set-agnostic Magic: The Gathering Limited draft and deckbuilding principles the mtg-tutor coach is grounded in. Free to read, with sources.",
};

// A server component so the corpus renders into the HTML and the page is
// readable without JavaScript or an account. The filtering UI is the only part
// that needs to be a client component.
export default function PrinciplesPage() {
  const doc = loadPrinciples();

  return <PrinciplesExplorer doc={doc} sources={loadPrincipleSources()} />;
}
