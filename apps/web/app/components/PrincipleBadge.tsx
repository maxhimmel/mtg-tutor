"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Principle } from "@mtg-tutor/core";
import { PrincipleIcon } from "./PrincipleIcon";

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
      {/* The popup is where the badge's shorthand is spelled out: the full id,
          the mark, and the category in words, together in one place. That is
          what lets the badge itself be an icon and a number. */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-xs font-semibold text-primary">{principle.id}</span>
        <span className="flex items-center gap-1.5 text-xs capitalize text-base-content/50">
          <PrincipleIcon category={principle.category} className="size-3.5 shrink-0" />
          {principle.category.replace(/-/g, " ")}
        </span>
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
//
// THE CATEGORY IS DRAWN AND THE ORDINAL IS SPELLED
//
// This used to print the whole id -- "SIG-03" -- which is six mono characters
// of which the first four repeat across every citation from the same category.
// A coach answer citing three grounds put three of those in a row and the eye
// had to read all of them to find out whether they were three signal principles
// or three different subjects. The mark says the category at a glance and the
// number distinguishes one within it, which is the same division of labour the
// id already had, drawn rather than spelled.
//
// The full id is never actually lost: it is the `title`, the accessible name,
// the popup's first line, and the anchor this links to. Nothing that has to be
// quoted or searched for is only available as a picture.
function PrincipleBadge({ principle }: { principle: Principle }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const open = (e: { currentTarget: HTMLElement }) =>
    setAnchor(e.currentTarget.getBoundingClientRect());
  const close = () => setAnchor(null);

  return (
    <>
      <Link
        href={`/principles#${principle.id}`}
        className="badge badge-sm badge-ghost cursor-help gap-1 border-base-content/15 pl-1.5 font-mono text-xs font-normal text-base-content/70 transition-colors hover:border-primary/50 hover:text-primary"
        onMouseEnter={open}
        onFocus={open}
        onMouseLeave={close}
        onBlur={close}
        title={principle.id}
        aria-label={principle.id}
      >
        {/* Gold at rest, which is where the reference sheet already prints an
            id, so the mark reads as the live part of the badge rather than as
            an ornament beside it. */}
        <PrincipleIcon category={principle.category} className="size-3.5 shrink-0 text-primary" />
        <span aria-hidden>{ordinalOf(principle.id)}</span>
      </Link>
      {anchor && <Popup principle={principle} anchor={anchor} />}
    </>
  );
}

// The half of an id the mark cannot carry. Falls back to the whole id rather
// than to nothing, so an id shaped in some way this does not expect still says
// which principle it is.
function ordinalOf(id: string): string {
  return /-(\d+)$/.exec(id)?.[1] ?? id;
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
