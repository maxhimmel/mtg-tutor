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
        <p className="text-sm text-base-content/70">
          Send this to somebody. They draft your exact packs, and you will be told when
          they finish.
        </p>
        <CopyLink challengeId={challengeId} where={where} />
      </div>
    );
  }

  if (!open) {
    return (
      <button className="btn btn-sm btn-outline w-full" onClick={() => setOpen(true)}>
        Challenge a friend to these packs
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
