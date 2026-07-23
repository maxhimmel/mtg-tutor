"use client";

import { createContext, useContext } from "react";

export interface Settings {
  // When on, coaching hints are shown -- the per-card win-rate badge. Off is
  // "instinct mode": the badge is hidden so the card's printed power/toughness
  // is readable and you draft on your own read.
  guiderails: boolean;
}

export const DEFAULT_SETTINGS: Settings = { guiderails: true };

export const SETTINGS_KEY = "mtg-tutor:settings";

export interface SettingsContextValue {
  settings: Settings;
  setGuiderails: (on: boolean) => void;
}

export const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within a SettingsProvider");
  return ctx;
}
