"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  SettingsContext,
  type Settings,
} from "../lib/useSettings";

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  // Read persisted settings after mount only: reading localStorage during the
  // first render would diverge from the server-rendered default and trip a
  // hydration mismatch.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
    } catch {
      // Corrupt or unavailable storage: keep defaults.
    }
  }, []);

  const persist = useCallback((next: Settings) => {
    setSettings(next);
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      // Storage may be full or blocked; the in-memory value still applies.
    }
  }, []);

  const setGuiderails = useCallback(
    (on: boolean) => persist({ ...settings, guiderails: on }),
    [persist, settings],
  );

  return (
    <SettingsContext.Provider value={{ settings, setGuiderails }}>
      {children}
    </SettingsContext.Provider>
  );
}
