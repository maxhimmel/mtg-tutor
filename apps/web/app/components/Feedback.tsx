"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Authenticated, useMutation } from "convex/react";
import { usePathname } from "next/navigation";
import { FEEDBACK_TOO_MUCH } from "@mtg-tutor/core";
import { api } from "@mtg-tutor/backend";
import type { Doc, Id } from "@mtg-tutor/backend/dataModel";
import { feedbackOpened, feedbackRefused } from "../lib/analytics";
import { humanError } from "../lib/humanError";

/**
 * Saying something, from anywhere, without leaving what you were doing.
 *
 * The idea the whole thing rests on is that a friend should never have to
 * describe where they were. A screen declares what it is currently showing with
 * useFeedbackAnchor, and whatever gets sent from that screen carries it -- so
 * "the coach is wrong here" arrives with the set, the pick, and the prose
 * attached, and nobody has to type "I was on pick 12 of my Duskmourn draft".
 *
 * That is the same shape as CardPreview's useSuspendPreview: a screen tells a
 * global component about itself, rather than the global component trying to work
 * out where it is.
 */

export type FeedbackSurface = Doc<"feedback">["surface"];
type Anchor = NonNullable<Doc<"feedback">["anchor"]>;
type Sentiment = NonNullable<Doc<"feedback">["sentiment"]>;

export interface FeedbackSeed {
  surface: FeedbackSurface;
  source: "fab" | "ai" | "prompt";
  anchor?: Anchor;
  quote?: string;
  sentiment?: Sentiment;
  /** The question the panel opens with. A specific one gets better answers than "any thoughts?". */
  prompt?: string;
  /** Set when a thumb already wrote its row and this is only collecting the reason. */
  explains?: Id<"feedback">;
}

interface Standing {
  anchor?: Anchor;
  quote?: string;
  surface?: FeedbackSurface;
}

interface FeedbackValue {
  open: (seed: FeedbackSeed) => void;
  declare: (standing: Standing | null) => void;
  suspend: (yes: boolean) => void;
  /** The screen's own declaration, so AiResponse can fall back to it for set and session. */
  standing: Standing | null;
}

const FeedbackContext = createContext<FeedbackValue | null>(null);

/** Opens the panel. Everything that can start a note goes through this. */
export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  return ctx?.open ?? (() => {});
}

/**
 * What this screen is showing, for as long as it is showing it.
 *
 * Declared rather than passed, because the thing that opens the panel is usually
 * a button in the app frame that knows nothing about the page under it.
 */
export function useFeedbackAnchor(standing: Standing | null): void {
  const ctx = useContext(FeedbackContext);
  const declare = ctx?.declare;
  // Serialised rather than compared by identity: callers build this object
  // inline every render, so an identity check would redeclare on every chunk of
  // a streaming coach response. Parsed back out of the key rather than closed
  // over, so the effect genuinely depends on everything it reads.
  const key = JSON.stringify(standing ?? null);
  useEffect(() => {
    declare?.(JSON.parse(key) as Standing | null);
    return () => declare?.(null);
  }, [key, declare]);
}

/**
 * Hold the button back while something else owns the screen.
 *
 * Same shape and the same reason as useSuspendPreview. daisyUI's fab is fixed at
 * z-999, which is above the commitment ceremony's Stage at z-40 -- so without
 * this it floats over a modal the player is being asked to answer, and is
 * clickable through the dim.
 */
export function useSuspendFeedback() {
  const ctx = useContext(FeedbackContext);
  return ctx?.suspend ?? (() => {});
}

/** What each way in opens with. Specific questions, because "any thoughts?" gets none. */
const KINDS: { label: string; glyph: string; prompt: string; surface: FeedbackSurface }[] = [
  { label: "Something's off", glyph: "!", prompt: "What went wrong?", surface: "general" },
  { label: "An idea", glyph: "+", prompt: "What should this do instead?", surface: "general" },
  {
    label: "The coaching",
    glyph: "AI",
    prompt: "What is the coach getting wrong — or right?",
    surface: "coach",
  },
];

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [seed, setSeed] = useState<FeedbackSeed | null>(null);
  const [standing, setStanding] = useState<Standing | null>(null);
  const [suspended, setSuspended] = useState(false);
  const [thanks, setThanks] = useState<string | null>(null);
  const pathname = usePathname() ?? "/";

  const declare = useCallback((next: Standing | null) => setStanding(next), []);
  const suspend = useCallback((yes: boolean) => setSuspended(yes), []);

  const open = useCallback(
    (next: FeedbackSeed) => {
      setSeed(next);
      feedbackOpened({ surface: next.surface, source: next.source, route: routeOf(pathname) });
    },
    [pathname],
  );

  const value = useMemo<FeedbackValue>(
    () => ({ open, declare, suspend, standing }),
    [open, declare, suspend, standing],
  );

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      {/* Signed-in only. An anonymous visitor on the landing page has no identity
          to attach a note to, and submit would refuse them mid-sentence. */}
      <Authenticated>
        {!suspended && seed === null && <FeedbackFab open={open} standing={standing} />}
      </Authenticated>

      {seed && (
        <FeedbackSheet
          seed={seed}
          standing={standing}
          route={routeOf(pathname)}
          onClose={() => setSeed(null)}
          onSent={(message) => {
            setSeed(null);
            setThanks(message);
          }}
        />
      )}

      {thanks && <Thanks message={thanks} onDone={() => setThanks(null)} />}
    </FeedbackContext.Provider>
  );
}

/**
 * The route pattern, not the resolved path.
 *
 * A stored "/review/j57x..." would fork one screen into one label per draft
 * anybody has ever reviewed. The id is on the anchor, where it can be followed.
 */
export function routeOf(pathname: string): string {
  return pathname
    .replace(/^\/draft\/[^/]+/, "/draft/[sessionId]")
    .replace(/^\/review\/[^/]+/, "/review/[sessionId]");
}

function FeedbackFab({
  open,
  standing,
}: {
  open: (seed: FeedbackSeed) => void;
  standing: Standing | null;
}) {
  const trigger = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);

  // daisyUI's fab expands on :focus-within and has no open class to drive -- so
  // the ONLY thing that closes it is focus leaving the container, and every
  // control that could ask it to close lives inside that container. The X could
  // never work on its own: clicking it either focuses it (still within) or, on a
  // browser that does not focus buttons on click, leaves focus on the trigger
  // (also still within). Either way :focus-within holds and the fab stays open.
  //
  // So closing has to be done rather than asked for. Both are blurred because
  // which of them holds focus is exactly the thing that varies by browser.
  const collapse = () => {
    root.current?.querySelector<HTMLElement>(":focus")?.blur();
    trigger.current?.blur();
  };

  return (
    // max-lg:bottom-24 clears the sticky confirm bar, which spans the full width
    // once the draft columns stack. At lg and up that bar centres inside the pack
    // column and there is nothing here to collide with.
    <div
      ref={root}
      className="fab max-lg:bottom-24"
      onKeyDown={(e) => {
        if (e.key === "Escape") collapse();
      }}
    >
      <div
        ref={trigger}
        tabIndex={0}
        role="button"
        aria-label="Say something"
        className="btn btn-circle btn-lg btn-primary"
        // Pressing it again shuts it, which is what anybody tries before they
        // look for an X. On mousedown rather than click, because by the time a
        // click fires the focus that opens it has already been taken.
        onMouseDown={(e) => {
          if (document.activeElement === e.currentTarget) {
            e.preventDefault();
            collapse();
          }
        }}
      >
        <SpeechIcon />
      </div>

      <button
        type="button"
        className="fab-close btn btn-circle btn-lg"
        aria-label="Close"
        onClick={collapse}
      >
        ✕
      </button>

      {KINDS.map((kind) => (
        <div key={kind.label}>
          {/* popup-surface, like every other thing in this app that floats over
              the page. These labels sit above whatever the page is showing --
              card art, a pack, a wall of prose -- and as bare text they were
              unreadable against half of it. */}
          <span className="popup-surface px-2 py-1 text-xs">{kind.label}</span>
          <button
            type="button"
            className="btn btn-circle"
            aria-label={kind.label}
            onClick={() => {
              collapse();
              open({
                // A kind that names a surface wins; otherwise the screen's own
                // declaration does, and "general" is the floor.
                surface: kind.surface === "coach" ? (standing?.surface ?? "coach") : (standing?.surface ?? "general"),
                source: "fab",
                anchor: standing?.anchor,
                quote: standing?.quote,
                prompt: kind.prompt,
              });
            }}
          >
            {kind.glyph}
          </button>
        </div>
      ))}
    </div>
  );
}

function FeedbackSheet({
  seed,
  standing,
  route,
  onClose,
  onSent,
}: {
  seed: FeedbackSeed;
  standing: Standing | null;
  route: string;
  onClose: () => void;
  onSent: (message: string) => void;
}) {
  const submit = useMutation(api.feedback.submit);
  const explain = useMutation(api.feedback.explain);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  // showModal() rather than the `modal-open` class, and that is the whole reason
  // this is a <dialog> at all. The browser puts it in the top layer, above every
  // stacking context on the page -- which is the problem DraftBoard's DragOverlay
  // comment documents -- and brings Escape, a focus trap and background inerting
  // with it. Commitment.tsx's Stage hand-rolls all three.
  useEffect(() => {
    const el = dialog.current;
    if (!el?.open) el?.showModal();
  }, []);

  const anchor = seed.anchor ?? standing?.anchor;
  const quote = seed.quote ?? standing?.quote;

  const send = async () => {
    const trimmed = note.trim();
    if (!trimmed) {
      setError("Say something first.");
      feedbackRefused({ surface: seed.surface, reason: "empty", message: "empty" });
      return;
    }

    setSending(true);
    setError(null);
    try {
      if (seed.explains) {
        await explain({ id: seed.explains, note: trimmed });
      } else {
        await submit({
          note: trimmed,
          sentiment: seed.sentiment,
          route,
          surface: seed.surface,
          anchor,
          quote,
        });
      }
      onSent("Thank you -- that is exactly the sort of thing I cannot see from here.");
    } catch (e) {
      const message = humanError(e);
      setError(message);
      // Compared against the sentence the server actually threw, not matched
      // against a shape of it. The wording is a product decision and a regex
      // here would take the metric with it the day it changes -- which is the
      // access_blocked note in the root CLAUDE.md. humanError returns
      // error.data, so this is the exact string core exports.
      feedbackRefused({
        surface: seed.surface,
        reason: message === FEEDBACK_TOO_MUCH ? "rate" : "error",
        message,
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <dialog
      ref={dialog}
      className="modal modal-bottom sm:modal-middle"
      onClose={onClose}
      aria-label="Say something"
    >
      <div className="modal-box max-w-xl">
        <h2 className="font-display text-xl leading-tight">
          {seed.prompt ?? "What is on your mind?"}
        </h2>

        <Receipt surface={seed.surface} anchor={anchor} quote={quote} sentiment={seed.sentiment} />

        <textarea
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={5}
          maxLength={2000}
          placeholder="However rough. Half a sentence beats nothing."
          className="textarea textarea-bordered mt-3 w-full"
        />

        {error && <p className="mt-2 text-sm text-error">{error}</p>}

        <div className="modal-action">
          <button type="button" className="btn btn-ghost" onClick={() => dialog.current?.close()}>
            {seed.explains ? "Leave it at the thumb" : "Never mind"}
          </button>
          <button type="button" className="btn btn-primary" disabled={sending} onClick={() => void send()}>
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>

      {/* daisyUI's click-outside-to-close: a full-bleed form whose only button
          submits the dialog, which is what closes it. No handler of our own. */}
      <form method="dialog" className="modal-backdrop">
        <button>close</button>
      </form>
    </dialog>
  );
}

/**
 * What is going with this, spelled out before it goes.
 *
 * Notes are attributed and carry a snapshot of whatever was on screen, so a
 * friend gets to see that rather than discover it. It doubles as the proof the
 * anchor is working: an empty receipt on the draft board is a bug you can see.
 */
function Receipt({
  surface,
  anchor,
  quote,
  sentiment,
}: {
  surface: FeedbackSurface;
  anchor?: Anchor;
  quote?: string;
  sentiment?: Sentiment;
}) {
  const bits = [
    sentiment === "up" ? "rated helpful" : sentiment === "down" ? "rated unhelpful" : null,
    anchor?.setCode && `${anchor.setCode}${anchor.format ? ` ${anchor.format}` : ""}`,
    // Numbered from one, and NOT split into pack-and-pick. Pack size varies by
    // set and format, so any division here would be a guess that reads as a
    // fact -- and the receipt's whole job is being checkable at a glance.
    anchor?.pickIndex !== undefined && `pick ${anchor.pickIndex + 1}`,
    quote && `and what the ${surface} said`,
  ].filter(Boolean);

  if (bits.length === 0) return null;

  return (
    <p className="mt-2 text-sm text-base-content/60">
      Sent with this: {bits.join(" · ")}.
    </p>
  );
}

/**
 * The acknowledgement, and the app's first toast.
 *
 * Ambient notes only. A per-response thumb acknowledges itself by changing
 * state under the cursor, and a toast on top of that would be noise.
 */
function Thanks({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 5000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="toast toast-end toast-bottom z-[1000]">
      <div className="alert alert-success" role="status">
        <span>{message}</span>
      </div>
    </div>
  );
}

function SpeechIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}
