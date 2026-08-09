"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
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

/**
 * What each way in opens with. Specific questions, because "any thoughts?" gets none.
 *
 * An icon AND the label, which is daisyUI's own combination of its two speed-dial
 * examples. The icons replaced "!", "+" and "AI" -- three letters in three
 * circles, which said nothing on their own and were doing no work the label was
 * not already doing better. An icon is skimmable at a glance where the label is
 * the thing that actually disambiguates, so they earn their place together.
 */
const KINDS: { label: string; Icon: ComponentType; prompt: string; surface: FeedbackSurface }[] = [
  {
    label: "Something's off",
    Icon: AlertIcon,
    prompt: "What went wrong?",
    surface: "general",
  },
  {
    label: "An idea",
    Icon: BulbIcon,
    prompt: "What should this do instead?",
    surface: "general",
  },
  {
    label: "The coaching",
    Icon: SparkIcon,
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
    .replace(/^\/review\/[^/]+/, "/review/[sessionId]")
    .replace(/^\/challenge\/[^/]+/, "/challenge/[challengeId]");
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

      {/* fab-close on the wrapper rather than the button, which is daisyUI's own
          labelled shape -- it gives the close the same label-then-circle anatomy
          as the three actions instead of a bare X that has to be guessed at.
          A real <button> inside it, though, where daisyUI uses a <span>: a span
          is neither focusable nor keyboard-operable, and this one has to carry
          the collapse handler. */}
      <div className="fab-close">
        <Label>Close</Label>
        <button type="button" className="btn btn-lg btn-circle" aria-label="Close" onClick={collapse}>
          <Glyph>
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </Glyph>
        </button>
      </div>

      {KINDS.map((kind) => (
        <div key={kind.label}>
          <Label>{kind.label}</Label>
          <button
            type="button"
            className="btn btn-lg btn-circle"
            // The label beside it is a sibling rather than an accessible name,
            // so the button still states its own.
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
            <kind.Icon />
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

/**
 * One label beside one circle.
 *
 * popup-surface, like every other thing in this app that floats over the page.
 * These sit above whatever is behind them -- card art, a pack, a wall of coach
 * prose -- and as bare text, which is what daisyUI's example uses, they were
 * unreadable against half of it.
 */
function Label({ children }: { children: ReactNode }) {
  return <span className="popup-surface px-2 py-1 text-xs">{children}</span>;
}

/**
 * The frame every icon in here is drawn in.
 *
 * Shared so the five of them cannot drift apart in weight or size, and matched
 * to the stroke family the rest of the app's icons already use. aria-hidden
 * throughout: each one sits inside a button that names itself, and a second
 * accessible name on the art would only be read out twice.
 */
function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-6"
    >
      {children}
    </svg>
  );
}

function SpeechIcon() {
  return (
    <Glyph>
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </Glyph>
  );
}

/** Something's off. */
function AlertIcon() {
  return (
    <Glyph>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </Glyph>
  );
}

/** An idea. */
function BulbIcon() {
  return (
    <Glyph>
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </Glyph>
  );
}

/** The coaching. Sparkles rather than a second speech bubble, which is the
    trigger's own icon -- and the one glyph everything else means by "the model
    wrote this". */
function SparkIcon() {
  return (
    <Glyph>
      <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
      <path d="M20 3v4" />
      <path d="M22 5h-4" />
      <path d="M4 17v2" />
      <path d="M5 18H3" />
    </Glyph>
  );
}
