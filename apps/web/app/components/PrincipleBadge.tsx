"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Principle } from "@mtg-tutor/core";

const POPUP_W = 320;
const GAP = 8;

interface Placement {
  left: number;
  top: number;
}

function place(anchor: DOMRect, height: number): Placement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = anchor.left + anchor.width / 2 - POPUP_W / 2;
  left = Math.max(GAP, Math.min(left, vw - GAP - POPUP_W));

  // Prefer below the badge; flip above when there is no room, which is the
  // common case for a coach panel sitting low in the viewport.
  let top = anchor.bottom + GAP;
  if (top + height > vh - GAP) top = anchor.top - GAP - height;
  top = Math.max(GAP, top);

  return { left, top };
}

function Popup({ principle, anchor }: { principle: Principle; anchor: DOMRect }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Placement | null>(null);

  // Measured rather than assumed: principle text runs from one line to five, so
  // the flip-above decision needs the real height. The box stays transparent
  // until a position lands, so the unplaced first paint is never visible.
  useEffect(() => {
    if (ref.current) setPos(place(anchor, ref.current.offsetHeight));
  }, [anchor]);

  return createPortal(
    <div
      ref={ref}
      className="popup-surface pointer-events-none fixed z-50 flex flex-col gap-2 p-3 transition-opacity"
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        width: POPUP_W,
        opacity: pos ? 1 : 0,
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-primary">{principle.id}</span>
        <span className="text-xs text-base-content/50">{principle.category.replace(/-/g, " ")}</span>
      </div>
      <p className="text-sm leading-snug">{principle.text}</p>
      {principle.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {principle.tags.map((tag) => (
            <span key={tag} className="badge badge-ghost badge-xs font-normal">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}

// One cited principle. Hovering explains it in place; clicking opens the full
// reference sheet at that principle.
function PrincipleBadge({ principle }: { principle: Principle }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const open = (e: { currentTarget: HTMLElement }) =>
    setAnchor(e.currentTarget.getBoundingClientRect());
  const close = () => setAnchor(null);

  return (
    <>
      <Link
        href={`/principles#${principle.id}`}
        className="badge badge-sm badge-ghost cursor-help border-base-content/15 font-mono text-xs font-normal hover:border-primary/50 hover:text-primary"
        onMouseEnter={open}
        onFocus={open}
        onMouseLeave={close}
        onBlur={close}
      >
        {principle.id}
      </Link>
      {anchor && <Popup principle={principle} anchor={anchor} />}
    </>
  );
}

// The principles the coach leaned on, lifted out of its prose. Renders nothing
// when it cited none, so uncited advice keeps the panel exactly as it was.
export function PrincipleBadges({ principles }: { principles: Principle[] }) {
  if (!principles.length) return null;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-base-content/40">grounded in</span>
      {principles.map((p) => (
        <PrincipleBadge key={p.id} principle={p} />
      ))}
    </div>
  );
}
