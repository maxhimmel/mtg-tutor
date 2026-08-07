"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A panel that is open until you click off it or press Escape.
 *
 * Open state is ours, not CSS's. daisyUI drives its dropdown off :focus-within,
 * which both closes the panel when a control takes focus out of the document (a
 * native <select> opens an OS-level popup) and keeps it open while the trigger
 * still holds focus after a "close". Its `dropdown` also hides content with
 * `:not(:focus-within) { display: none }`, leaving an invisible box in the
 * layout that swallows hovers over whatever is beneath it -- so the panel is
 * mounted only while open, and this hook is what decides "while open".
 *
 * `ref` goes on the element wrapping BOTH the trigger and the panel: a pointer
 * down inside it is a click on the control, and everywhere else is off.
 */
export function useDismissable<T extends HTMLElement>() {
  const [open, setOpen] = useState(false);
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return { open, setOpen, ref };
}
