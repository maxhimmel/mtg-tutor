"use client";

import { createContext, useContext } from "react";
import { COACH } from "@mtg-tutor/core";
import type { SettingSurface } from "./analytics";

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
  // Whether hovering a card mid-draft shows what 17Lands knows about it. Off is
  // drafting blind: the card is just a card, and the numbers wait for the
  // review. Named for the prop it feeds -- CardTile and useCardHover both take
  // `showStats`, and a setting whose name is the name of the thing it sets is
  // one indirection fewer to hold.
  showStats: boolean;
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
  showStats: true,
  coachMinPackCards: COACH.minPackCards,
  // The challenge, because it is the one with no evidence behind it yet. A mode
  // nobody is put in teaches nobody anything, and which of the two teaches
  // better is the question this pair of flows exists to answer.
  pickCeremony: "challenge",
  setView: "grid",
};

export const SETTINGS_KEY = "mtg-tutor:settings";

/**
 * What localStorage is holding, brought up to the current shape.
 *
 * `showStats` was called `guiderails` until August 2026 -- a word from an early
 * session that the app then had to teach, in its own glossary entry, to explain
 * what amounted to a checkbox. Renaming the field alone would read the old key
 * as absent and quietly hand the numbers back to everyone who had turned them
 * off, which is precisely the group who chose deliberately.
 *
 * The old key wins only where the new one is missing, so this cannot undo a
 * choice made since the rename. Safe to delete once nobody is carrying a
 * settings blob written before then; until it goes, it costs one read on mount.
 */
export function storedSettings(raw: string): Partial<Settings> {
  const { guiderails, ...rest } = JSON.parse(raw) as Partial<Settings> & {
    guiderails?: boolean;
  };
  return typeof guiderails === "boolean" && rest.showStats === undefined
    ? { ...rest, showStats: guiderails }
    : rest;
}

export interface SettingsContextValue {
  settings: Settings;
  // `where` is required rather than defaulted so that a surface added later
  // cannot report itself as whichever one happened to be the default -- see
  // settingChanged for what the breakdown is for.
  update: (patch: Partial<Settings>, where: SettingSurface) => void;
}

export const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within a SettingsProvider");
  return ctx;
}
