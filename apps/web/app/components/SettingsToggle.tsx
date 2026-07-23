"use client";

import { useSettings } from "../lib/useSettings";

export function SettingsToggle() {
  const { settings, setGuiderails } = useSettings();

  return (
    <label className="label cursor-pointer gap-2 text-sm">
      <span className="label-text text-base-content/70">Guiderails</span>
      <input
        type="checkbox"
        className="toggle toggle-primary toggle-sm"
        checked={settings.guiderails}
        onChange={(e) => setGuiderails(e.target.checked)}
        aria-label="Toggle guiderails (per-card win-rate hints)"
      />
    </label>
  );
}
