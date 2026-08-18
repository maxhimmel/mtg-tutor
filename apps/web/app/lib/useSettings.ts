"use client";

import { createContext, useContext } from "react";
import { COACH, DEFAULT_POD } from "@mtg-tutor/core";
import type { OfferedPod } from "@mtg-tutor/core";
import type { SettingSurface } from "./analytics";

export type SetView = "grid" | "list";

/**
 * Which of the two ways of making a pick the player is drafting under.
 *
 * Nothing on the server knows this setting exists, and nothing needs to: a
 * stored pick that carries a defense went through the challenge and one that
 * does not did not, so which way a pick was made is already recorded per pick.
 * That is what makes switching mid-draft nearly free -- there is no claim about
 * a whole draft to keep true.
 */
export type PickCeremony = "challenge" | "passive";

/** Named for what the player does, not for how either one is built. */
export const PICK_CEREMONIES: readonly { id: PickCeremony; label: string; blurb: string }[] = [
  {
    id: "challenge",
    label: "Challenge",
    blurb: "Say why first, then defend it against one other card from the pack",
  },
  {
    id: "passive",
    label: "Just pick",
    blurb: "Take the card; the coach explains it afterwards",
  },
];

/**
 * Which shape the challenge comparison is read in.
 *
 * The screen has five sections and one instrument, and the question nobody could
 * answer from a mock-up is whether that instrument should be a panel you scroll
 * past or something that never leaves. These are whole answers rather than
 * switches: each decides where the braid lives AND where the score lives,
 * because those two are the only things on the page that could be permanent and
 * they compete for the same edges.
 *
 * FOUR WERE TRIED AND TWO ARE HERE. `spine` and `tower` both spent the left edge
 * on the braid stood on end, and the drawing did not survive the rotation -- see
 * the header of `Spine.tsx`, which is kept for exactly that reason. What they
 * did establish is that PERMANENCE was the good idea and the rotation was not,
 * which is what `console` is: the same braid, still lying down, pinned across
 * the top, with the left edge given to the verdict instead. That is why both
 * survivors are here rather than one -- `ribbon` is the page as it shipped, and
 * a layout that beats nothing has not been shown to beat anything.
 *
 * Kept as a setting rather than as page state so a reader can live in one for a
 * week -- which is the only way to find out which survives contact with a real
 * comparison -- and so the choice comes through the one door every other setting
 * does, which is what puts it in `setting_changed` without a new event name
 * being minted for a layout that may not last the month.
 */
export type DiffLayout = "ribbon" | "console";

export const DIFF_LAYOUTS: readonly { id: DiffLayout; label: string; blurb: string }[] = [
  {
    id: "ribbon",
    label: "Ribbon",
    blurb: "Everything full width, stacked in reading order",
  },
  {
    id: "console",
    label: "Console",
    blurb: "The score pinned down the left, the braid pinned across the top",
  },
];

/**
 * Which table you sit at.
 *
 * `legacy` is deliberately absent. It is what an absent `draftSessions.pod`
 * means -- the cardValue + colorBias bot every draft before pods was dealt by --
 * and it stays reachable so none of those strand. Nobody chooses it.
 *
 * Unlike every other setting here, this one is COPIED ONTO THE SESSION at
 * `draft.start` and cannot change after. The bots decide what wheels, so a draft
 * that switched pods halfway would stop replaying. Decision #13's argument for
 * keeping pickCeremony out of the database does not carry: that is per-pick and
 * already recorded per pick, and this one decides the deal.
 */
// A POD ID IS A STORAGE KEY AND THE LABEL IS THE PRODUCT, and keeping those two
// apart is what lets a pod be refitted without anything a person reads changing.
// `table` and `sharks` are still real -- every draft that stored one replays
// against it -- and neither is offered any more, exactly as `legacy` is not.
// "A real table" goes on meaning the current best fit of how people actually
// pick, which is the only thing the label ever claimed.
export type Pod = OfferedPod;

export const PODS: readonly { id: Pod; label: string; blurb: string }[] = [
  {
    id: "table2",
    label: "A real table",
    blurb: "Seven drafters fitted to how people actually pick, disagreements and all",
  },
  {
    id: "sharks2",
    label: "Sharks",
    blurb: "The same, fitted to drafters who went 3-0. Good cards wheel less",
  },
];

export interface Settings {
  // Whether hovering a card mid-draft shows what 17Lands knows about it. Off is
  // drafting blind: the card is just a card, and the numbers wait for the
  // review. Named for the prop it feeds -- CardTile and useCardHover both take
  // `showStats`, and a setting whose name is the name of the thing it sets is
  // one indirection fewer to hold.
  showStats: boolean;
  // Smallest pack the AI coach will comment on. Below it the pick is forced and
  // the deterministic explanation is shown instead, spending no tokens.
  coachMinPackCards: number;
  // What happens between choosing a card and the pick landing. Read at the
  // moment a card is chosen, so it is switchable mid-draft: picks already made
  // keep whatever they recorded and only the next one changes.
  pickCeremony: PickCeremony;
  // How the set picker draws its formats. The grid is for browsing -- one
  // plate per set, scanned by symbol. The list is for comparing them against
  // each other, which is a different job and is why it sorts.
  setView: SetView;
  // Which shape the challenge comparison is read in.
  diffLayout: DiffLayout;
  // Which pod the NEXT draft is dealt against. Read once, at draft.start, and
  // stored on the session -- changing it later cannot affect a draft in flight.
  pod: Pod;
}

export const DEFAULT_SETTINGS: Settings = {
  showStats: true,
  coachMinPackCards: COACH.minPackCards,
  // The challenge, because it is the one with no evidence behind it yet. A mode
  // nobody is put in teaches nobody anything, and which of the two teaches
  // better is the question this pair of flows exists to answer.
  pickCeremony: "challenge",
  setView: "grid",
  // The console, which is the finding rather than the safe answer. It defaulted
  // to the ribbon while the layouts were being compared, so that every reading
  // of a pinned one was a reading somebody had chosen and the numbers meant
  // something. That comparison is over: an instrument you cannot scroll past is
  // better than one you can, and defaulting to the older shape now would mean
  // almost nobody ever sees the one that won -- a default is not a neutral
  // position, it is the answer for everybody who never opens the control.
  diffLayout: "console",
  // From core, so the CLI deals the same table. The reasoning for which one is
  // on DEFAULT_POD itself.
  pod: DEFAULT_POD,
};

export const SETTINGS_KEY = "mtg-tutor:settings";

/**
 * What localStorage is holding, brought up to the current shape.
 *
 * `showStats` was called `guiderails` until August 2026 -- a word from an early
 * session that the app then had to teach, in its own glossary entry, to explain
 * what amounted to a checkbox. Renaming the field alone would read the old key
 * as absent and quietly hand the numbers back to everyone who had turned them
 * off, which is precisely the group who chose deliberately.
 *
 * The old key wins only where the new one is missing, so this cannot undo a
 * choice made since the rename. Safe to delete once nobody is carrying a
 * settings blob written before then; until it goes, it costs one read on mount.
 *
 * `diffLayout` is the other direction: a value that was OFFERED and is not any
 * more. Anyone who tried `spine` or `tower` has one of them written down, and a
 * stored layout the switcher no longer lists is a reader stranded on a page with
 * no control that can move them off it -- the switcher would show two buttons,
 * neither pressed. So an unrecognised layout falls back to the default rather
 * than being trusted, which also makes retiring the next one free.
 */
export function storedSettings(raw: string): Partial<Settings> {
  const { guiderails, ...rest } = JSON.parse(raw) as Partial<Settings> & {
    guiderails?: boolean;
  };

  // DELETED, not set to undefined. The provider spreads this over the defaults,
  // and a key that is present carrying `undefined` overwrites the default with
  // nothing rather than falling through to it -- which would leave the layout
  // unset instead of back on the default.
  if (
    rest.diffLayout !== undefined &&
    !DIFF_LAYOUTS.some((layout) => layout.id === rest.diffLayout)
  ) {
    delete rest.diffLayout;
  }

  // Same treatment, and it will matter the first time a pod is retired: a
  // stored value the switcher no longer lists leaves a reader on a control with
  // nothing pressed. Also catches "legacy" written by hand, which must never
  // reach draft.start -- the mutation would refuse it, but later rather than
  // here.
  if (rest.pod !== undefined && !PODS.some((pod) => pod.id === rest.pod)) {
    delete rest.pod;
  }

  return typeof guiderails === "boolean" && rest.showStats === undefined
    ? { ...rest, showStats: guiderails }
    : rest;
}

export interface SettingsContextValue {
  settings: Settings;
  // `where` is required rather than defaulted so that a surface added later
  // cannot report itself as whichever one happened to be the default -- see
  // settingChanged for what the breakdown is for.
  update: (patch: Partial<Settings>, where: SettingSurface) => void;
}

export const SettingsContext = createContext<SettingsContextValue | null>(null);

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within a SettingsProvider");
  return ctx;
}
