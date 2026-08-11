"use client";

import Link from "next/link";
import { Fragment, type CSSProperties } from "react";
import { useQuery } from "convex/react";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import { Panel } from "./Panel";

/**
 * The other half of ChallengeAFriend: what the person who took the link sees.
 *
 * A friend accepted a challenge, made forty-two picks, built their forty -- and
 * was handed the solo completion screen, which mentions no challenger, says
 * nothing about the comparison that unlocked on their forty-second pick, and
 * offers to make a challenge of their own. The comparison was reachable from the
 * list, the landing page and an email, and from none of them was it reachable
 * from the screen they were standing on. They had answered somebody and the app
 * did not acknowledge it.
 *
 * Renders nothing at all when the draft was not dealt by a challenge, which is
 * most of them -- see `challenges.forSession` for why only the receiving side
 * can be asked this question.
 */
export function ChallengeAnswered({
  sessionId,
  stage,
}: {
  sessionId: Id<"draftSessions">;
  /**
   * Whether the forty is in.
   *
   * NOT one component that links either way. The comparison carries the other
   * person's registered deck, and putting a way to it on the build screen would
   * hand somebody a forty to copy while they are being asked to commit to one --
   * which is the single thing the build step exists to stop, and the reason the
   * suggested build is not on the wire until it is locked. So before the lock
   * this is a spur, and after it a door.
   */
  stage: "building" | "built";
}) {
  const challenge = useQuery(api.challenges.forSession, { sessionId });
  if (!challenge || challenge.state !== "finished") return null;

  // Written out rather than taken from `theirName` on the comparison screen.
  // That one labels a column and a dot, where a nameless opponent is "Your
  // challenger" -- which does not survive being made possessive or made the
  // subject of a sentence. A missing name is not a placeholder to inflect.
  const them = challenge.fromName?.trim();

  return stage === "building" ? (
    <StillToBuild them={them} />
  ) : (
    <HandOff challengeId={challenge.id} them={them} />
  );
}

/**
 * Mid-build, with the comparison already half-open.
 *
 * The forty-second pick unlocked the picks half of the comparison and sent the
 * mail, so the other person is not waiting to hear -- they are already reading.
 * What they cannot see is the deck: `challenges.diff` returns `basicLands`
 * undefined until somebody locks their forty in, and the comparison's deck panel
 * says so out loud. That asymmetry is the whole motivation and it is TRUE, which
 * is why it can be said plainly instead of cheered about. The app does not use
 * exclamation marks anywhere else and is not going to start on a build screen.
 */
function StillToBuild({ them }: { them?: string }) {
  return (
    // Titled the same as the banner the locked deck gets, so the two moments
    // read as one thread. "One step left" was the title on its own and named a
    // step in nothing -- on a build screen, under a build heading, the one thing
    // it did not say was that any of this was about a challenge.
    <Panel
      title="Challenge answered"
      aside={<span className="eyebrow text-primary">One step left</span>}
      bodyClassName="gap-4"
    >
      <h3 className="font-display text-xl font-semibold leading-snug tracking-tight sm:text-2xl">
        {them ?? "Your challenger"} can see your picks. Not your forty.
      </h3>
      <p className="max-w-prose text-sm leading-relaxed text-base-content/70">
        All forty-two are in and already counted against theirs. Cut to forty and the two
        decks join the picks — the whole comparison, both sides of it.
      </p>
      <Steps />
    </Panel>
  );
}

/**
 * Three stops, because there are three and the order is the information.
 *
 * The one place in this app where numbered progress is honest: picks, then a
 * forty, then two forties beside each other is a real sequence somebody is
 * partway along, not a decoration borrowed from an onboarding flow. Hence the
 * shape it is drawn in -- the draft board's own gold tick with its halo marks
 * where you are standing, exactly as it does under a pack.
 */
const STEPS = [
  { label: "Forty-two picks", state: "done" },
  { label: "Your forty", state: "here" },
  { label: "Both forties", state: "waiting" },
] as const;

/**
 * The rope, then the labels under it, as two rows rather than three cells.
 *
 * Three equal cells each holding [dot, leg] put the stops at 0%, 33% and 66% and
 * left the last third of the row empty past the final dot -- and the cell's own
 * gap meant every leg started clear of the dot behind it and ran hard into the
 * one in front. A sequence drawn as though it had come loose at one end.
 *
 * Laid out as one flex row -- dot, leg, dot, leg, dot -- the stops land at 0%,
 * 50% and 100% and each leg touches both of its neighbours, because a leg is
 * simply the space between two dots. The labels are their own row of thirds,
 * aligned left, centre and right, which puts each one under its own stop without
 * either row having to know the other's measurements.
 */
function Steps() {
  const dot = (state: (typeof STEPS)[number]["state"]) =>
    state === "waiting"
      ? // Hollow, which is this app's mark for the half of a pair that is not
        // yours -- and the last stop is the one with the other person in it. See
        // the comparison's sides.tsx: never a second colour, because every hue
        // here is spoken for.
        "size-2.5 border border-base-content/40"
      : state === "here"
        ? "tick-lit size-3.5 bg-primary motion-safe:animate-verdict"
        : "size-2.5 bg-primary";

  return (
    <div className="flex flex-col gap-2.5 pt-1">
      <div aria-hidden className="flex items-center">
        {STEPS.map((step, i) => (
          <Fragment key={step.label}>
            <span className={`shrink-0 rounded-full ${dot(step.state)}`} />
            {i < STEPS.length - 1 && <Leg travelled={step.state === "done"} />}
          </Fragment>
        ))}
      </div>

      <ol className="flex">
        {STEPS.map((step, i) => (
          <li
            key={step.label}
            aria-current={step.state === "here" ? "step" : undefined}
            /* Each label owns a third and hugs its own stop: the first is flush
               left under the dot at 0%, the last flush right under the one at
               100%, the middle centred under the one between them.

               All three take the eyebrow's own colour, unmodified. The state is
               already said twice over by the dot and the leg above, and a third
               saying would mean colouring .eyebrow -- two text-* utilities in one
               Tailwind layer, decided by sort order rather than by intent. See
               FIG_LABEL in glossary/figures/Figure.tsx, which exists because of
               exactly that. `aria-current` carries it for a reader who gets none
               of the drawing. */
            className={`eyebrow flex-1 ${
              i === 0 ? "text-left" : i === STEPS.length - 1 ? "text-right" : "text-center"
            }`}
          >
            {step.label}
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * The space between two stops, which is the whole of what a leg is.
 *
 * Behind you it fills, once, gold arriving along an empty track with a warm
 * front. Ahead of you it is dotted and marching toward the stop you have not
 * reached -- the difference between the two said in the drawing rather than in a
 * shade of the same line.
 */
function Leg({ travelled }: { travelled: boolean }) {
  if (travelled) {
    return (
      <span className="relative h-1 flex-1 rounded-full bg-base-content/15">
        <span
          className="absolute inset-0 rounded-full motion-safe:animate-fill"
          style={{
            // Gold, with the warm front tick-arrive uses held in the last tenth
            // -- so the tip of a growing bar is always the leading edge, with
            // nothing chasing it and nothing to fall out of step with.
            backgroundImage:
              "linear-gradient(90deg, var(--color-primary) 0 88%, var(--color-warning) 100%)",
            boxShadow: "0 0 7px -1px color-mix(in oklab, var(--color-primary) 65%, transparent)",
          }}
        />
      </span>
    );
  }

  return (
    <span
      className="h-1 flex-1 text-base-content/35 motion-safe:animate-march"
      style={{
        // Round dots on 11px centres. A repeating LINEAR gradient draws
        // rectangles, which at 2px read as grit rather than as a dotted line.
        backgroundImage:
          "radial-gradient(circle 1.75px at center, currentColor 98%, transparent 100%)",
        backgroundSize: "11px 100%",
        backgroundRepeat: "repeat-x",
      }}
    />
  );
}

/**
 * The forty is in, and this is the door.
 *
 * NOT a Panel, which is the app's one boxed surface and is sized to hold a
 * reading -- a score, a decklist, a list of misses. This is the page's opening
 * statement and has to out-rank the grade below it by a clear step, so it takes
 * the same material (the hairline on base-200) at hero scale rather than a
 * second surface invented for it.
 *
 * It stays ON this page rather than redirecting to the comparison, which was the
 * other way this could have gone. Somebody who has just spent forty-two picks
 * and a deck build has two verdicts waiting and only one of them is the one they
 * came for; sending them straight to the comparison spends the other silently,
 * because nothing on that screen points back at it. So the challenge leads and
 * the grade follows -- and the cord below says the grade is there, which is the
 * job an unexplained scroll cannot do.
 */
function HandOff({ challengeId, them }: { challengeId: string; them?: string }) {
  return (
    // THE WRAPPER TAKES THE SCREEN; THE CARD DOES NOT.
    //
    // These are two different wants and stretching the card served only one of
    // them. What has to be true is that nothing else is on screen until somebody
    // scrolls -- that is a question about what sits in the viewport, which the
    // container answers. Sizing the card to the viewport instead answered it by
    // inflating the card, and a banner with four lines in it and six hundred
    // pixels of height is not a hero, it is a room.
    //
    // So the card is its own size, centred in a screen's worth of space, with
    // the spur at its foot. `svh`, not `vh`: on a phone the toolbars are the
    // difference between the spur being on screen and being the thing nobody
    // scrolled to.
    <div className="flex min-h-[calc(100svh-12rem)] flex-col justify-center">
      <section className="card relative overflow-hidden border border-base-300 bg-base-200">
        {/* A floor rather than a fill: enough height that the rope beside it has
            a run to be read in, and no more. `sm:pr-56` clears the rail's 12rem.
            Nothing in here is allowed to run under the rope -- a cord crossing
            behind a word is the one way this drawing could cost the banner the
            thing it is there to sell. */}
        <div className="relative flex flex-col justify-center gap-3 p-6 sm:min-h-[22rem] sm:p-10 sm:pr-56">
          <p className="eyebrow">Challenge answered</p>
          <h2 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
            The same cards, drafted twice.
          </h2>
          <p className="max-w-prose text-sm leading-relaxed text-base-content/70 sm:text-base">
            {them ? `You and ${them}` : "You both"} opened the same forty-two, in pods of
            your own — so what each of you took changed what wheeled back. The comparison
            says where the two drafts stopped being the same question.
          </p>
          <div className="pt-1">
            <Link
              href={`/challenge/${challengeId}/diff?from=results`}
              className="btn btn-primary"
            >
              See the two drafts side by side
            </Link>
          </div>
        </div>
        <Rope />
      </section>
      <Spur />
    </div>
  );
}

/**
 * The first inch of a braid, which is what is behind the button.
 *
 * The comparison's signature instrument is two cords off one seed that run
 * together and part where the drafts did, and this screen cannot draw the real
 * one -- the braid is a fold over both drafts' rows, ~138KB, and none of it is
 * on this page or worth fetching for a picture. So this is the rope's OPENING
 * and nothing more: two cords, together, parting once. It claims no number and
 * measures nothing, which is the only honest way to preview a drawing whose
 * whole value is that it is measured.
 *
 * STOOD ON END, which the comparison does with the real one for the same reason
 * -- see Spine, "the rail IS the braid, same rope, same measure". Laid along the
 * floor of the banner this was 56 units tall across nine hundred, and a parting
 * drawn on a 17:1 canvas is a straight line with a kink in it. Read as four
 * horizontal rules and was taken for a border. Vertical it gets a canvas the
 * gesture fits in, and it fills the half of a wide banner that the copy leaves
 * empty rather than being pushed into the one strip nothing else wanted.
 *
 * Gold is yours and the pale cord is theirs, the same rule the comparison reads
 * under. It runs off both ends and is clipped by the banner, so it reads as a
 * rope passing through rather than a drawing that starts and stops.
 *
 * NO `vectorEffect`, and no stretched viewBox. Non-scaling-stroke moves dash
 * computation into screen space, where `pathLength={1}` no longer normalises
 * anything -- `stroke-dasharray: 1` came out as a ~615px dash against a ~615px
 * gap and drew the rope in two pieces with a hole in the middle. It scales
 * uniformly off its own aspect instead, so the stroke and the dash agree.
 */
function Rope() {
  const cord = {
    fill: "none",
    strokeWidth: 5,
    strokeLinecap: "round",
    pathLength: 1,
  } as const;

  return (
    <svg
      aria-hidden
      // A viewBox proportioned like the rail it rides in. `slice` scales to
      // COVER, so a viewBox much squarer than the rail zooms until the cords sit
      // on the crop edges and get shaved in half -- which is what 200x300 did as
      // soon as the banner grew. Roughly the rail's own aspect, with the parting
      // in the middle third, keeps the one event in this drawing on screen at
      // every height the card takes.
      viewBox="0 0 200 560"
      // Fixed WIDTH and full height, cropped rather than fitted: the banner's
      // height is set by the viewport and the copy, and a rail sized off its own
      // aspect would grow wider as the banner grew taller and eventually run
      // under the words. `slice` scales uniformly -- which is what keeps the
      // dash normalisation honest -- and trims the excess off the ends, where
      // this rope is running off the edge anyway.
      preserveAspectRatio="xMidYMid slice"
      // Hidden on a phone, where the banner is nearly as tall as it is wide and
      // there is no half of it going spare. The type is the hero there.
      className="pointer-events-none absolute right-0 top-0 hidden h-full w-48 sm:block"
    >
      {/* Theirs, laid first and dimmer, so where the two run close the gold
          reads as the one in front rather than as a colour change in one rope. */}
      <path
        {...cord}
        d="M 108 -20 L 108 200 C 108 270 148 290 148 360 L 148 580"
        className="stroke-base-content/30 motion-safe:animate-rope [animation-delay:260ms]"
      />
      <path
        {...cord}
        d="M 92 -20 L 92 200 C 92 270 52 290 52 360 L 52 580"
        className="stroke-primary/55 motion-safe:animate-rope [animation-delay:380ms]"
      />
    </svg>
  );
}

/**
 * A cord off the bottom-left corner, and what it points at.
 *
 * The one thing the reader cannot be told by the banner: that their own result
 * did not go anywhere. A banner this size reads as the whole answer, and the
 * grade, the decklist and the missed picks are all underneath it.
 *
 * Its own small fixed-size drawing rather than a continuation of the rope above.
 * The rope is stretched to the band's width and this is not, so a join between
 * them would land in a different place at every viewport -- and a cord that
 * visibly misses its own continuation is worse than two objects that are plainly
 * made of the same material. Same gold, same weight, same draw.
 */
/**
 * How far the spur descends, in one place.
 *
 * LONG, and fixed rather than stretched to the fold. Running it to the bottom of
 * the viewport was the instinct and it is the wrong instinct twice over: on a
 * tall monitor it is a four-hundred-pixel hairline with a dot on the end, which
 * stops reading as a cord and starts reading as a rule somebody forgot to
 * delete, and the bead's travel is a fixed distance in a keyframe, so its speed
 * would swing from a crawl to a blur with the window. Moving the banner down
 * instead only trades the problem for dead space under the masthead, which reads
 * as a bug rather than as composition.
 *
 * A long fixed cord gets the whole of the effect and none of that: the banner
 * and the spur are centred as one group, so a taller cord pushes the card UP and
 * the label DOWN -- the composition opens toward the fold on every screen,
 * without a single measurement depending on how tall the screen is.
 *
 * The numbers agree with each other here or nowhere: the cord stops just short
 * of the foot, the foot is where the bead lands and where the ring is thrown
 * from, and `--spur-run` is what the keyframe reads.
 */
const SPUR = { cord: 108, foot: 113.5, height: 120 } as const;

// One cord, drawn three times over: laid down, glowed along, and run down by a
// bead. Shared so the afterglow cannot drift off the line it is answering.
const CORD = {
  d: `M 4.5 0 L 4.5 ${SPUR.cord}`,
  fill: "none",
  strokeWidth: 1.5,
  pathLength: 1,
} as const;

// Written twice into the DOM -- the label and the transparent copy the sheen is
// painted on -- so it is written once here.
const SPUR_LABEL = "Your own result";

/**
 * Where the spur points.
 *
 * Exported because the thing it names lives in Results, which owns the heading
 * this banner is standing on top of. A bare "#your-result" in two files is a
 * link that breaks silently the day one of them is edited.
 */
export const RESULT_ANCHOR = "your-result";

function Spur() {
  return (
    // `items-end`, so the label sits level with the dot at the cord's foot
    // rather than halfway up its length. The drawing is bottom-heavy by
    // construction -- 27 units of cord, then the dot -- so aligning the two
    // boxes' bottoms lands the label within a pixel of the dot's centre, which
    // no amount of padding against `items-center` does honestly.
    // A link, not a decoration. The banner above it is sized to take the whole
    // screen, which makes this the app's only word that anything follows it --
    // so it had better be pressable. An anchor rather than a button with a
    // handler: it is navigation within the page, it works before hydration, it
    // is keyboard-reachable for free, and `scroll-behavior` is where the smooth
    // and reduced-motion behaviours already live.
    <a
      href={`#${RESULT_ANCHOR}`}
      className="group ml-6 flex w-fit items-end gap-2.5 sm:ml-8"
    >
      <svg
        aria-hidden
        width={9}
        height={SPUR.height}
        viewBox={`0 0 9 ${SPUR.height}`}
        className="shrink-0"
      >
        <path {...CORD} className="stroke-primary/45 motion-safe:animate-rope [animation-delay:620ms]" />
        {/* The cord's answer to the bead, as a second copy at full strength
            rather than an animation on the cord itself -- that one already
            carries the draw, and two `animation` declarations on one element
            leave the winner to sort order. */}
        <path {...CORD} className="stroke-primary opacity-0 motion-safe:animate-afterglow" />
        <circle
          cx={4.5}
          cy={0}
          r={2}
          className="fill-primary opacity-0 motion-safe:animate-spur"
          style={
            {
              "--spur-run": `${SPUR.foot}px`,
              filter:
                "drop-shadow(0 0 3.5px color-mix(in oklab, var(--color-primary) 85%, transparent))",
            } as CSSProperties
          }
        />
        {/* The ring the arrival throws off. Its origin is written here, beside
            the coordinates it is made of, rather than in the utility. */}
        <circle
          cx={4.5}
          cy={SPUR.foot}
          r={2.75}
          fill="none"
          strokeWidth={1.25}
          className="stroke-primary opacity-0 motion-safe:animate-ping-once"
          style={{ transformOrigin: `4.5px ${SPUR.foot}px` }}
        />
        {/* Where the bead lands, and what it lands on. */}
        <circle
          cx={4.5}
          cy={SPUR.foot}
          r={2.75}
          className="fill-primary motion-safe:animate-verdict [animation-delay:1500ms]"
        />
      </svg>
      <span className="eyebrow relative pb-1 underline-offset-4 decoration-primary/50 group-hover:underline motion-safe:animate-verdict [animation-delay:1500ms]">
        {SPUR_LABEL}
        {/* The sheen, as a transparent copy laid exactly over the words. The
            real label keeps the eyebrow's own colour -- clipping IT to a
            gradient would mean restating that colour inside a keyframe, and
            would put a second text-* utility in the layer beside .eyebrow where
            sort order decides the winner. This copy carries only the light. */}
        <span
          aria-hidden
          className="absolute inset-0 bg-clip-text text-transparent motion-safe:animate-label-sheen"
          style={{
            backgroundImage:
              "linear-gradient(90deg, transparent 0 55%, var(--color-primary) 65%, transparent 75% 100%)",
          }}
        >
          {SPUR_LABEL}
        </span>
      </span>
    </a>
  );
}
