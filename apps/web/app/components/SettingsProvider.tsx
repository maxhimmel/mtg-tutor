"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_SETTINGS,
  SETTINGS_KEY,
  SettingsContext,
  type Settings,
} from "../lib/useSettings";
import { settingChanged, type SettingSurface } from "../lib/analytics";

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

  const update = useCallback((patch: Partial<Settings>, where: SettingSurface) => {
    // Captured here rather than at each control, because this is the only door:
    // every setting change in the app comes through it, including ones added
    // later. Outside the updater below, not inside it -- React may invoke a
    // state updater twice, and an event fired from one would double-count.
    //
    // The mount effect above restores from localStorage with setSettings
    // directly, so a remembered preference is not reported as a fresh choice.
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) settingChanged(key, value, where);
    }

    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch {
        // Storage may be full or blocked; the in-memory value still applies.
      }
      return next;
    });
  }, []);

  return (
    <SettingsContext.Provider value={{ settings, update }}>{children}</SettingsContext.Provider>
  );
}
