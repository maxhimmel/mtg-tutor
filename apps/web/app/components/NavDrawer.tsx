"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { useDismissable } from "../lib/useDismissable";

// The masthead below `nav` (43rem), where the inline row does not fit and never
// could. Seven labels measure 348px and their six gaps another 120px, and the
// whole header wants 674px for one row -- see `--breakpoint-nav` in globals.css
// for where that number comes from and why it is the signed-out case.
//
// WHAT THE BUG ACTUALLY WAS, because the first pass through this got it wrong
// and shipped the wrong story in three commit messages. `html { overflow-x:
// clip }` has been set in globals.css since July, so the page cannot pan
// sideways and never could. The 116px of nav hanging past the edge was not
// waiting off-screen to be scrolled to -- it was CLIPPED, and Challenges,
// Principles and Glossary could not be reached on a phone by any gesture at
// all. `documentScrollWidth` still reported it, which is why the measurement was
// right while the sentence around it was not.
//
// So this is not a tidier nav. It is three sections that were unreachable
// becoming reachable.
//
// ON HIDING THEM BEHIND A TAP, which is the obvious objection and deserves an
// answer rather than a shrug. WCAG's Understanding Reflow names F102, content
// disappearing and not being available after reflow, and that is the reason a
// horizontally scrolling nav was rejected here. A disclosure hides more, not
// less -- so the distinction has to be the one UserMenu already draws: what
// failed there was controls whose STATE you had to open a panel to read. These
// seven rows have no state. Each says where it goes and goes there, and a
// labelled control that opens them is a door, not a hidden readout.
//
// THE MECHANICS ARE daisyUI'S AND THE SEMANTICS ARE OURS, which is the shape of
// this file. `drawer` is worth having: the panel is `100dvh` so retracting
// mobile browser chrome cannot clip it, `overscroll-behavior: contain` stops a
// scroll at the panel's end from scrolling the page behind it, and
// `--page-scroll-lock` freezes that page while it is open. Those are the three
// things a hand-rolled panel gets wrong and nobody notices until a phone is in a
// hand.
//
// What it gets wrong is the trigger. daisyUI drives the whole component from a
// `<label for>` pointing at `.drawer-toggle`, so the control a screen reader
// meets is a CHECKBOX -- where APG's disclosure pattern wants `role=button` with
// `aria-expanded`. Because every one of daisyUI's rules keys off
// `.drawer-toggle:checked` and nothing else, React can own that checkbox and
// hide it from assistive technology, leaving a real `<button aria-expanded>` as
// the thing anybody actually meets. One controlled input buys the library's
// animation and the correct semantics at once.
//
// Deliberately no `menu`/`menubar` roles on the list. APG's own Navigation
// Menubar Example is the page that says why -- it carries a Caution that the
// menubar pattern "requires complex functionality that is unnecessary for
// typical site navigation" and points at Disclosure instead. (The disclosure
// pattern page itself says nothing about those roles either way; an earlier pass
// cited it for this and was wrong about which page carries the claim.)
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

export type NavItem = {
  href: string;
  label: string;
  match: (pathname: string) => boolean;
  badge?: boolean;
};

/**
 * The sections, as a panel, below the breakpoint at which they are a row.
 *
 * Takes the items and renders the whole control: its own open state, its own
 * trigger, its own dismissal, its own close-on-navigate. An earlier version
 * exposed `open`/`setOpen`/`children` and left four coordinated obligations with
 * the caller, one of which existed only to wrap the setter in an analytics call
 * -- so a second `setOpen` anywhere would have silently skipped it. The event is
 * gone and so is the seam it forced.
 */
export function NavDrawer({ items, badge }: { items: NavItem[]; badge?: ReactNode }) {
  const pathname = usePathname() ?? "/";
  // The ref wraps trigger and panel together, which is what makes a pointer down
  // anywhere else a dismissal. Escape comes with it.
  const { open, setOpen, ref } = useDismissable<HTMLDivElement>();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const everOpened = useRef(false);

  // NO CLOSE-ON-ROUTE-CHANGE EFFECT, and its absence is deliberate rather than
  // forgotten. One was written, looked obviously necessary, and turned out to be
  // dead: `PageShell` is rendered by each page rather than by the root layout,
  // so a route change mounts a whole new header and a new drawer with `open`
  // already false. Deleting the effect changed no test, including one written
  // specifically to catch it by going BACK with the panel open -- which is the
  // one path a row's own onClick does not cover.
  //
  // If PageShell ever moves into a layout so the masthead persists across
  // navigations, this comes back, and the back-navigation test in nav.spec.ts is
  // the one that will start failing.

  // The panel overlays a page that is still there, so leaving focus behind it
  // strands somebody tabbing through what they cannot see. It goes in on open
  // and returns to the TRIGGER on close -- not to the top of the document, which
  // would make closing a menu cost you your place.
  //
  // `everOpened` is load-bearing and not defensive. This effect runs on mount
  // with `open` false, and an earlier version inferred "closed, so restore
  // focus" from `document.activeElement === document.body` -- which is true on
  // every page load after hydration. The result was focus landing on the
  // hamburger on arrival at every route, on exactly the viewports this component
  // exists for. An effect cannot tell mounted from closed; it has to be told.
  //
  // And it cannot focus the panel the moment `open` flips. daisyUI transitions
  // `.drawer-side`'s VISIBILITY (`allow-discrete`, 0.3s after a 0.1s delay), and
  // `focus()` on a `visibility: hidden` element is a silent no-op -- it returns
  // normally and moves nothing. So the focus has to wait for the transition that
  // makes the panel focusable, with a timer as the fallback for the case where
  // no transition runs at all (reduced motion, or a browser that discards it).
  useEffect(() => {
    if (!open) {
      if (everOpened.current) trigger.current?.focus();
      return;
    }
    everOpened.current = true;

    const el = panel.current;
    if (!el) return;
    const side = el.parentElement;
    const focus = () => el.focus();

    side?.addEventListener("transitionend", focus, { once: true });
    const fallback = window.setTimeout(focus, 450);
    return () => {
      side?.removeEventListener("transitionend", focus);
      window.clearTimeout(fallback);
    };
  }, [open]);

  return (
    <div ref={ref} className="drawer drawer-end w-auto nav:hidden">
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
          className="flex cursor-pointer items-center rounded-lg p-2 text-base-content/70 transition-colors hover:bg-base-300 hover:text-base-content focus-visible:outline-2 focus-visible:outline-primary"
        >
          <HamburgerIcon />
        </button>
      </div>

      <div className="drawer-side z-50">
        {/* Redundant by design: Escape and the close button both do this too. It
            is not keyboard-reachable and does not need to be -- a keyboard has
            two ways out already, and a third would put an unlabelled stop in
            front of the first link. */}
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
              className="cursor-pointer rounded-lg p-2 text-base-content/70 transition-colors hover:bg-base-300 hover:text-base-content focus-visible:outline-2 focus-visible:outline-primary"
            >
              <CloseIcon />
            </button>
          </div>

          {items.map((item) => {
            const here = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={here ? "page" : undefined}
                onClick={() => setOpen(false)}
                // The marker is a left rule in parchment, not the header's
                // `-mb-px border-b-2` segment: that one is a piece of the
                // masthead's own bottom rule and means nothing away from it.
                // Parchment rather than gold for the reason the inline marker
                // gives -- gold is the card you are holding and the choice you
                // made, and where you happen to be standing is neither.
                className={`flex items-center gap-2 rounded-lg border-l-2 px-3 py-2.5 text-sm no-underline transition-colors ${
                  here
                    ? "border-base-content/70 bg-base-200 text-base-content"
                    : "border-transparent text-base-content/70 hover:bg-base-300 hover:text-base-content"
                }`}
              >
                {item.label}
                {item.badge === true && badge}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
