"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import { CopyLink } from "./CopyLink";
import { humanError } from "../lib/humanError";

/**
 * Daring somebody to the draft you just finished.
 *
 * Two steps rather than one, and the second is the point: making the link is
 * cheap and sending it is the thing that matters, so the button does not
 * disappear into a toast -- it becomes the URL, sitting there until it has been
 * copied somewhere.
 *
 * Deliberately no name field for the recipient. The backend can learn neither a
 * name nor an address, there is no friend list and no directory, and everybody
 * in a private beta already knows each other -- so the connection is a link,
 * sent out of band. `fromName` is the one thing worth asking for, because a
 * stranger's link that says who it is from is a different object from one that
 * does not.
 */
export function ChallengeAFriend({
  sessionId,
  where,
}: {
  sessionId: Id<"draftSessions">;
  where: string;
}) {
  const create = useMutation(api.challenges.create);
  const [open, setOpen] = useState(false);
  const [fromName, setFromName] = useState("");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (challengeId) {
    return (
      <div className="flex flex-col gap-2">
        {/* "Your exact packs" was the word here and it is the one claim this
            feature is built to avoid making. They are dealt the same cards off
            the same seed, in a pod of their own -- which is why their picks
            still change what wheels back to them, and why the comparison has to
            say per pick whether the two of you were looking at the same
            shelf. The sender should be told the same thing the receiver is. */}
        <p className="text-sm leading-relaxed text-base-content/70">
          Send this to somebody. They open the same cards you did, in a pod of their own —
          and you will be told when they finish.
        </p>
        <CopyLink challengeId={challengeId} where={where} />
      </div>
    );
  }

  if (!open) {
    // Not "challenge a friend to these packs", which is the same sentence and
    // three words too long: it wrapped onto a second line in the results rail
    // and sat there as a two-line block under a one-line button. The packs are
    // what the panel it opens says first, so the label does not have to.
    return (
      <button className="btn btn-sm btn-outline w-full" onClick={() => setOpen(true)}>
        Challenge a friend
      </button>
    );
  }

  const make = async () => {
    setBusy(true);
    setError(null);
    try {
      const id = await create({ sessionId, fromName: fromName.trim() || undefined });
      setChallengeId(id);
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {/* What the link is, before asking for anything. The button that opens
          this used to go straight to a name field, so the one moment somebody
          decides whether to send it was also the moment they had least idea what
          they were sending. It is also where "these packs" went. */}
      <p className="text-sm leading-relaxed text-base-content/70">
        A link that deals somebody the same cards you just drafted. When they finish, you
        get the two drafts side by side.
      </p>
      <label className="flex flex-col gap-1">
        <span className="eyebrow">Who is it from?</span>
        <input
          value={fromName}
          onChange={(e) => setFromName(e.currentTarget.value)}
          maxLength={40}
          placeholder="Your name — optional"
          className="input input-sm w-full"
        />
      </label>
      <button className="btn btn-sm btn-primary w-full" disabled={busy} onClick={make}>
        {busy ? "Making the link…" : "Make the link"}
      </button>
      {error && <span className="text-xs text-error">{error}</span>}
    </div>
  );
}
