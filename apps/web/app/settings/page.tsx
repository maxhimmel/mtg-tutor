"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Authenticated } from "convex/react";
import { PageShell } from "../components/PageShell";
import { Segmented, SegmentedBlurb } from "../components/Segmented";
import { SignedOut } from "../components/SignedOut";
import { settingsOpened } from "../lib/analytics";
import {
  COACH_THRESHOLDS,
  DIFF_LAYOUTS,
  PICK_CEREMONIES,
  PODS,
  SET_VIEWS,
  STAT_MODES,
  useSettings,
} from "../lib/useSettings";

/**
 * Every setting in one place, as a SECOND door rather than a replacement.
 *
 * THE ACCOUNT MENU USED TO BE THIS AND IT WAS EMPTIED ON PURPOSE. `UserMenu`
 * still carries the reasoning: the card stats, the coach threshold and the
 * ceremony sat behind the avatar, two clicks from the one screen any of them
 * affects, with their state unreadable until you opened it, and they were
 * changed by almost nobody. Moving them onto the surfaces they change was
 * right and none of them moves back -- the terms strip stays on the draft
 * board, the picker keeps its view toggle, the diff keeps its layout picker.
 *
 * WHAT THAT DECISION DID NOT COVER is when the surface is unreachable. Three
 * settings are only settable once you are already committed to the thing they
 * govern: you cannot choose a pick ceremony until a draft is open and you are
 * looking at a pack, you cannot choose a diff layout without a finished
 * challenge to lay out, and the pod and view toggles do not render at all while
 * the set list is empty or still loading. "On the surface it changes" and "only
 * on the surface it changes" are different rules, and only the first one was
 * argued for.
 *
 * So this page adds nothing and removes nothing. Every control here is the same
 * control as its counterpart, through the same `update` seam, tagged
 * `where: "settings"` so the two doors are told apart in the one measurement
 * that has been running since the account menu was emptied.
 *
 * READ AT REST, which is what makes it a page rather than a panel. Every
 * setting shows its current value and what that value means without being
 * touched, so the whole shape of how the app is configured is one screenful.
 * That is the thing a toolbar cannot do and the old dropdown did not: a control
 * you have to open to read is a control that says nothing until you are already
 * looking for it.
 */

interface Row {
  title: string;
  /** What the setting decides, in the app's terms rather than the code's. */
  what: string;
  control: React.ReactNode;
  blurb: React.ReactNode;
  /** Where else this lives, so the page never reads as the only way. */
  alsoOn: string;
}

function SettingRow({ row }: { row: Row }) {
  return (
    <li className="flex flex-col gap-2 border-b border-base-300 py-6 last:border-0 md:flex-row md:items-start md:gap-10">
      <div className="flex min-w-0 flex-col gap-1 md:w-[22rem] md:shrink-0">
        <h2 className="font-display text-lg font-semibold tracking-tight">{row.title}</h2>
        <p className="max-w-prose text-sm leading-relaxed text-base-content/70">{row.what}</p>
        <p className="text-xs text-base-content/40">Also on {row.alsoOn}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        {row.control}
        {row.blurb}
      </div>
    </li>
  );
}

function SettingsList() {
  const { settings, update } = useSettings();

  // Once per visit, on arrival. Read against `setting_changed` with
  // `where: "settings"`, which is what separates "nobody finds this page" from
  // "people read it and the defaults were already right" -- see settingsOpened
  // for why the count of what moved is NOT carried here.
  const seen = useRef(false);
  useEffect(() => {
    if (seen.current) return;
    seen.current = true;
    settingsOpened({ from: "menu" });
  }, []);

  const set = <K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) => {
    update({ [key]: value } as Partial<typeof settings>, "settings");
  };

  const rows: Row[] = [
    {
      title: "Making a pick",
      what: "Whether you commit to a reason before the pick lands, and get one other card from the pack argued against yours.",
      alsoOn: "the draft board",
      control: (
        <Segmented
          label="How a pick is made"
          options={PICK_CEREMONIES}
          value={settings.pickCeremony}
          onChange={(id) => set("pickCeremony", id)}
        />
      ),
      blurb: <SegmentedBlurb options={PICK_CEREMONIES} value={settings.pickCeremony} />,
    },
    {
      title: "Numbers while you draft",
      what: "Whether hovering a card mid-draft shows what 17Lands knows about it, or whether the numbers wait for the review.",
      alsoOn: "the draft board",
      control: (
        <Segmented
          label="Whether stats show while drafting"
          options={STAT_MODES}
          value={settings.showStats}
          onChange={(id) => set("showStats", id)}
        />
      ),
      blurb: <SegmentedBlurb options={STAT_MODES} value={settings.showStats} />,
    },
    {
      title: "How much the coach says",
      what: "The smallest pack the coach will comment on. Below it the pick is forced, and you get the plain explanation instead of spending a call on “you had no choice”.",
      alsoOn: "the draft board",
      control: (
        <Segmented
          label="Smallest pack the coach comments on"
          options={COACH_THRESHOLDS}
          value={settings.coachMinPackCards}
          onChange={(id) => set("coachMinPackCards", id)}
        />
      ),
      blurb: <SegmentedBlurb options={COACH_THRESHOLDS} value={settings.coachMinPackCards} />,
    },
    {
      title: "Who you draft against",
      what: "The seven bots at your table. This one is read once when a draft starts and copied onto it — changing it never affects a draft already running.",
      alsoOn: "the set picker",
      control: (
        <Segmented
          label="Which pod the next draft is dealt against"
          options={PODS}
          value={settings.pod}
          onChange={(id) => set("pod", id)}
        />
      ),
      blurb: <SegmentedBlurb options={PODS} value={settings.pod} />,
    },
    {
      title: "The set picker",
      what: "How the sets you can draft are laid out.",
      alsoOn: "the set picker",
      control: (
        <Segmented
          label="How the set picker is laid out"
          options={SET_VIEWS}
          value={settings.setView}
          onChange={(id) => set("setView", id)}
        />
      ),
      blurb: <SegmentedBlurb options={SET_VIEWS} value={settings.setView} />,
    },
    {
      title: "Reading a challenge",
      what: "The shape a comparison of two drafts is read in — whether the score and the braid scroll away with the page or stay put.",
      alsoOn: "a finished challenge",
      control: (
        <Segmented
          label="How a challenge comparison is laid out"
          options={DIFF_LAYOUTS}
          value={settings.diffLayout}
          onChange={(id) => set("diffLayout", id)}
        />
      ),
      blurb: <SegmentedBlurb options={DIFF_LAYOUTS} value={settings.diffLayout} />,
    },
  ];

  return (
    <section className="max-w-4xl py-2">
      <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight">
        Settings
      </h1>
      {/* Says where these live the rest of the time, because a page that
          collected them silently would read as having MOVED them -- and they
          have not moved. Somebody who learned the terms strip should not come
          away thinking it is going to disappear. */}
      <p className="mt-4 max-w-prose text-lg leading-relaxed text-base-content/70">
        All of these are also on the screen they change, which is where they are quickest to
        reach. This is the copy you can read without being mid-draft.
      </p>
      {/* Stored here, not on the account, and it says so rather than letting
          somebody discover it by signing in on a laptop. */}
      <p className="mt-3 max-w-prose text-sm text-base-content/50">
        Kept in this browser rather than on your account, so a different device starts from
        the defaults.
      </p>

      <ul className="mt-4 flex flex-col">
        {rows.map((row) => (
          <SettingRow key={row.title} row={row} />
        ))}
      </ul>
    </section>
  );
}

export default function SettingsPage() {
  return (
    <PageShell>
      <SignedOut>
        <section className="max-w-2xl py-6">
          <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight">
            Nothing to set
            <br />
            until you are in.
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-base-content/70">
            How you make a pick, whether the numbers show, and how much the coach says — all
            of it waits behind the door.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a className="btn btn-primary" href="/sign-in">
              Sign in
            </a>
            <Link href="/sign-up" className="btn btn-outline">
              Ask for an invite
            </Link>
          </div>
        </section>
      </SignedOut>

      <Authenticated>
        <SettingsList />
      </Authenticated>
    </PageShell>
  );
}
