"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";

// The masthead below `sm`, where the inline row does not fit and never could.
// Seven labels measure 348px and their six gaps another 120px, against the
// 327px PageShell leaves at a 375px viewport and 272px at the 320px SC 1.4.10
// is written at -- so no amount of tightening reaches one line, and the choice
// was between folding the row and hiding it behind a control. This is the
// control.
//
// THE MECHANICS ARE daisyUI'S AND THE SEMANTICS ARE OURS, which is the whole
// shape of this file. `drawer` is worth having: the panel is `100dvh` so a
// retracting mobile browser chrome cannot clip it, `overscroll-behavior:
// contain` stops a scroll at the panel's end from scrolling the page behind it,
// and `--page-scroll-lock` freezes that page while the panel is open. Those are
// the three things a hand-rolled panel gets wrong and nobody notices until a
// phone is in a hand.
//
// What it gets wrong is the trigger. daisyUI drives the whole component from a
// `<label for>` pointing at `.drawer-toggle`, so the control a screen reader
// meets is a CHECKBOX -- where APG's disclosure pattern wants `role=button`
// with `aria-expanded`, and explicitly does NOT want `menu`/`menuitem` roles on
// site navigation. Because every one of daisyUI's rules keys off
// `.drawer-toggle:checked` and nothing else, React can own that checkbox and
// hide it from assistive technology, leaving a real `<button aria-expanded>` as
// the thing anybody actually meets. One controlled input buys the library's
// animation and the correct semantics at once.
//
// `drawer-end` rather than the default left, because the wordmark holds the
// leading edge and the two things you can open -- this and the account menu --
// then sit together on the trailing one.
function HamburgerIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function NavDrawer({
  open,
  setOpen,
  children,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  children: ReactNode;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);

  // The panel is an overlay over a page that is still there, so leaving focus
  // behind it is leaving somebody tabbing through a page they cannot see. It
  // goes in on open and comes back to the trigger on close -- back to the
  // trigger specifically, because returning it to the top of the document would
  // make closing the menu cost you your place.
  useEffect(() => {
    if (open) panel.current?.focus();
    else if (document.activeElement === document.body) trigger.current?.focus();
  }, [open]);

  return (
    <div className="drawer drawer-end w-auto sm:hidden">
      {/* Hidden from everything that reads the page: it is daisyUI's state, not
          a control. The button below is the control. */}
      <input
        type="checkbox"
        className="drawer-toggle"
        checked={open}
        onChange={(e) => setOpen(e.target.checked)}
        tabIndex={-1}
        aria-hidden="true"
      />

      <div className="drawer-content">
        <button
          ref={trigger}
          type="button"
          aria-expanded={open}
          aria-controls="nav-drawer-panel"
          aria-label="Sections"
          onClick={() => setOpen(true)}
          className="flex cursor-pointer items-center rounded-lg p-2 text-base-content/70 transition-colors hover:bg-base-300 hover:text-base-content"
        >
          <HamburgerIcon />
        </button>
      </div>

      <div className="drawer-side z-50">
        {/* Redundant by design: Escape and the close button both do this too.
            It is not keyboard-reachable and does not need to be -- a keyboard
            already has two ways out, and adding a third to the tab order would
            put an unlabelled stop in front of the first link. */}
        <div className="drawer-overlay" onClick={() => setOpen(false)} />

        <nav
          ref={panel}
          id="nav-drawer-panel"
          aria-label="Sections"
          tabIndex={-1}
          className="flex h-full w-72 max-w-[85vw] flex-col gap-1 border-l border-base-300 bg-base-100 p-3 outline-none"
        >
          <div className="mb-1 flex items-center justify-between border-b border-base-300 pb-2">
            <span className="px-2 font-display text-lg font-semibold">
              P1<span className="text-primary">P1</span>
            </span>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="cursor-pointer rounded-lg p-2 text-base-content/70 transition-colors hover:bg-base-300 hover:text-base-content"
            >
              <CloseIcon />
            </button>
          </div>
          {children}
        </nav>
      </div>
    </div>
  );
}

/**
 * One row of the panel.
 *
 * Deliberately not daisyUI's `menu`. Its
 * `& :where(li:not(.menu-title)>:not(ul,menu,details,.menu-title,.btn))` rule
 * catches ANY direct child of an `li` and forces `display:grid` with its own
 * padding and radius over whatever the link brought -- the same species of
 * descendant rule that reached into a quote block through `.card figure`, and
 * already written down as rejected in UserMenu.
 *
 * The marker is a left rule in parchment, not the header's `-mb-px border-b-2`
 * segment: that one is a piece of the masthead's own bottom rule and means
 * nothing away from it. Parchment rather than gold for the reason the inline
 * marker gives -- gold is the card you are holding and the choice you made, and
 * where you happen to be standing is neither.
 */
export function NavDrawerRow({
  href,
  here,
  onNavigate,
  children,
}: {
  href: string;
  here: boolean;
  onNavigate: () => void;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={here ? "page" : undefined}
      onClick={onNavigate}
      className={`flex items-center gap-2 rounded-lg border-l-2 px-3 py-2.5 text-sm no-underline transition-colors ${
        here
          ? "border-base-content/70 bg-base-200 text-base-content"
          : "border-transparent text-base-content/70 hover:bg-base-300 hover:text-base-content"
      }`}
    >
      {children}
    </Link>
  );
}
