"use client";

import { createContext, useContext } from "react";
import { COACH } from "@mtg-tutor/core";

export type SetView = "grid" | "list";

/**
 * Which of the two ways of making a pick the player is drafting under.
 *
 * Nothing on the server knows this setting exists, and nothing needs to: a
 * stored pick that carries a defense went through the challenge and one that
 * does not did not, so which way a pick was made is already recorded per pick.
 * That is what makes switching mid-draft nearly free -- there is no claim about
 * a whole draft to keep true.
 */
export type PickCeremony = "challenge" | "passive";

/** Named for what the player does, not for how either one is built. */
export const PICK_CEREMONIES: readonly { id: PickCeremony; label: string; blurb: string }[] = [
  {
    id: "challenge",
    label: "Challenge",
    blurb: "Say why first, then defend it against one other card from the pack",
  },
  {
    id: "passive",
    label: "Just pick",
    blurb: "Take the card; the coach explains it afterwards",
  },
];

export interface Settings {
  // When on, coaching hints are shown -- the per-card win-rate badge. Off is
  // "instinct mode": the badge is hidden so the card's printed power/toughness
  // is readable and you draft on your own read.
  guiderails: boolean;
  // Smallest pack the AI coach will comment on. Below it the pick is forced and
  // the deterministic explanation is shown instead, spending no tokens.
  coachMinPackCards: number;
  // What happens between choosing a card and the pick landing. Read at the
  // moment a card is chosen, so it is switchable mid-draft: picks already made
  // keep whatever they recorded and only the next one changes.
  pickCeremony: PickCeremony;
  // How the set picker draws its formats. The grid is for browsing -- one
  // plate per set, scanned by symbol. The list is for comparing them against
  // each other, which is a different job and is why it sorts.
  setView: SetView;
}

export const DEFAULT_SETTINGS: Settings = {
  guiderails: true,
  coachMinPackCards: COACH.minPackCards,
  // The challenge, because it is the one with no evidence behind it yet. A mode
  // nobody is put in teaches nobody anything, and which of the two teaches
  // better is the question this pair of flows exists to answer.
  pickCeremony: "challenge",
  setView: "grid",
};

export const SETTINGS_KEY = "mtg-tutor:settings";

export interface SettingsContextValue {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
}

export const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within a SettingsProvider");
  return ctx;
}
