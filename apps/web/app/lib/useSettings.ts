"use client";

import { createContext, useContext } from "react";
import { COACH } from "@mtg-tutor/core";

export interface Settings {
  // When on, coaching hints are shown -- the per-card win-rate badge. Off is
  // "instinct mode": the badge is hidden so the card's printed power/toughness
  // is readable and you draft on your own read.
  guiderails: boolean;
  // Smallest pack the AI coach will comment on. Below it the pick is forced and
  // the deterministic explanation is shown instead, spending no tokens.
  coachMinPackCards: number;
}

export const DEFAULT_SETTINGS: Settings = {
  guiderails: true,
  coachMinPackCards: COACH.minPackCards,
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
