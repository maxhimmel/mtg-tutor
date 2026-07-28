"use client";

import { useEffect, useState } from "react";

// Whether a modifier is being held right now. Used by the card preview to swap
// the stat panel for its explanations without moving the mouse, so the hover it
// is attached to survives.
//
// Listens for blur as well as keyup: holding Shift and tabbing away (or hitting
// a native shortcut that steals focus) never delivers the keyup, and the panel
// would otherwise stay expanded until the next press.
export function useHeldKey(key: "Shift" | "Alt" | "Control" | "Meta"): boolean {
  const [held, setHeld] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === key) setHeld(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === key) setHeld(false);
    };
    const clear = () => setHeld(false);

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", clear);
    };
  }, [key]);

  return held;
}
