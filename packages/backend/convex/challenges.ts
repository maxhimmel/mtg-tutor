import { ConvexError, v } from "convex/values";
import {
  dealDraft,
  diffDrafts,
  forkImpact,
  summarizeDiff,
} from "@mtg-tutor/core";
import type { DiffSide } from "@mtg-tutor/core";
import { internalAction, internalQuery, mutation, query } from "./_generated/server.js";
import type { Doc } from "./_generated/dataModel.js";
import { internal } from "./_generated/api.js";
import { challengeAccepted, challengeIssued } from "./analytics.js";
import { startSession } from "./draft.js";
import { storedPicks } from "./draftPicks.js";
import { requireCaller } from "./roles.js";
import { challengeInvite, challengeParty, ownedSession, replayFor } from "./sessions.js";
import { toSetData } from "./setData.js";

// Daring a friend to draft the packs you just drafted.
//
// The deal itself was already free: a draft is {seed, pickedNames} replayed and
// `draft.start` has always taken an optional seed, so dealing two people the
// same boosters needed no new engine. What this file adds is the offer, who may
// take it, and the one row that lets two people read each other's picks.
//
// LIVE POD, NOT REPLAYED PACKS. Handing the friend a recording of your 45 packs
// was prototyped and rejected: it aligns every row and makes their picks inert,
// because nothing they take changes what wheels back. That switches off signal
// reading and wheeling, which is most of what a draft teaches, and leaves a
// multiple-choice quiz with your answer key. So the two of them sit in separate
// pods off one seed, the packs are identical only until the wheel brings the
// first divergence round, and the comparison says out loud where it stops being
// one. See notes.md Ideas #8.

// Unverified text that lands on a page and in a subject line. Same treatment as
// access.ts gives a stranger's note, for the same reason.
const MAX = { fromName: 40, note: 280 };

/** What both the list and the landing page call the state. Derived, never stored. */
export type ChallengeState = "open" | "accepted" | "finished" | "revoked";

export function stateOf(challenge: Doc<"challenges">): ChallengeState {
  if (challenge.finishedAt) return "finished";
  if (challenge.revokedAt) return "revoked";
  if (challenge.acceptedAt) return "accepted";
  return "open";
}

/**
 * `finished` outranks `revoked` above, which looks like the wrong order until
 * you try the other one: revoking is illegal once accepted, so the only way to
 * hold both stamps is to revoke an open challenge that somebody was already
 * mid-draft on. Their draft still finished and the diff is still readable, and
 * calling that row "withdrawn" would hide a comparison both people can open.
 */

export const create = mutation({
  args: {
    sessionId: v.id("draftSessions"),
    fromName: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const caller = await requireCaller(ctx);
    const session = await ownedSession(ctx, args.sessionId);

    // You cannot dare somebody to beat a draft you have not taken. The lab
    // found this one by walking into it: a challenge issued mid-draft has no
    // second side to compare against and no honest way to describe itself.
    if (session.status !== "complete") {
      throw new ConvexError("Finish this draft before challenging anyone with it.");
    }

    // The set, format and seed are COPIED rather than read through the session
    // later. A challenge is an offer of a particular deal, and it should not
    // quietly become an offer of a different one.
    const challengeId = await ctx.db.insert("challenges", {
      challengerUserId: caller.userId,
      challengerSubject: caller.subject,
      challengerSessionId: session._id,
      setCode: session.setCode,
      format: session.format,
      seed: session.seed,
      fromName: args.fromName?.trim().slice(0, MAX.fromName) || undefined,
      note: args.note?.trim().slice(0, MAX.note) || undefined,
      createdAt: new Date().toISOString(),
    });

    // After the write, on a path that has committed -- see analytics.ts.
    await challengeIssued(ctx, {
      challengeId,
      setCode: session.setCode,
      format: session.format,
    });

    return challengeId;
  },
});

export const revoke = mutation({
  args: { challengeId: v.id("challenges") },
  handler: async (ctx, args) => {
    const caller = await requireCaller(ctx);
    const challenge = await ctx.db.get(args.challengeId);

    if (!challenge || challenge.challengerUserId !== caller.userId) {
      throw new ConvexError("That challenge is not yours to withdraw.");
    }
    // By now the friend has spent one of their three drafts for the day on it.
    // Taking the link back would not give that back, and it would strand a diff
    // both of them are entitled to.
    if (challenge.acceptedAt) {
      throw new ConvexError("Somebody has already taken this challenge.");
    }
    if (challenge.revokedAt) return;

    await ctx.db.patch(challenge._id, { revokedAt: new Date().toISOString() });
  },
});

/**
 * Taking a challenge up: the friend's own draft, off the challenger's seed.
 *
 * The refusals are ordered the way the rest of the stack refuses -- who you are,
 * then whether this offer is takeable, then whether the deal still exists, then
 * the quota -- because only the last of those costs anything, and a person who
 * cannot take this challenge at all should not spend a draft finding out.
 */
export const accept = mutation({
  args: { challengeId: v.id("challenges") },
  handler: async (ctx, args) => {
    const caller = await requireCaller(ctx);
    const challenge = await challengeInvite(ctx, args.challengeId);

    if (challenge.challengerUserId === caller.userId) {
      throw new ConvexError("This is your own challenge -- you drafted these packs already.");
    }
    if (challenge.friendUserId) {
      // Including when it is this caller: `accept` deals a draft, so making it
      // idempotent would quietly hand somebody a second one. The landing page
      // sends them to the draft they already have.
      throw new ConvexError("Somebody has already taken this challenge.");
    }
    if (challenge.revokedAt) {
      throw new ConvexError("This challenge was withdrawn.");
    }

    // THE STALENESS GUARD, and it is a replay rather than a hash comparison.
    //
    // A challenge is a seed that outlives the moment it was made, so it meets a
    // re-ingested set far more often than a same-day draft does. Comparing
    // `sets.sourceHash` would be cheaper and would miss two real cases: the hash
    // is absent when a set is ingested with no artifact to hand, and unchanged
    // by `ingest-sets --force`, which re-crawls Scryfall under the same one.
    //
    // Replaying the challenger's own session asks the exact question instead --
    // would this seed still deal the packs they actually took from -- and it is
    // one ~46KB read on a path that runs once. Dealing the friend a pod that
    // cannot be compared to the challenger's is the failure this exists to
    // prevent, and it is silent: both drafts work, and the diff is nonsense.
    const challengerSession = await ctx.db.get(challenge.challengerSessionId);
    if (!challengerSession) {
      throw new ConvexError("The draft behind this challenge is gone.");
    }
    try {
      await replayFor(ctx, challengerSession);
    } catch {
      throw new ConvexError(
        `The ${challenge.setCode.toUpperCase()} card data has changed since this challenge ` +
          `was made, so these packs would no longer deal the same way. Ask for a new one.`,
      );
    }

    // Last, so everything above refuses for free. `startSession` runs the quota
    // inside this transaction, so a throw below rolls the token back with it.
    const sessionId = await startSession(ctx, caller, {
      setCode: challenge.setCode,
      format: challenge.format,
      seed: challenge.seed,
      challengeId: challenge._id,
      // The challenger's pod, not the friend's preference, and not negotiable.
      // The seed is shared, so a different pod deals a different forty-two --
      // and `samePack` would then be comparing two people who never saw the same
      // booster. Exactly the silent failure the staleness guard above exists to
      // prevent, arriving through a second door.
      pod: challengerSession.pod,
    });

    await ctx.db.patch(challenge._id, {
      friendUserId: caller.userId,
      friendSubject: caller.subject,
      friendSessionId: sessionId,
      acceptedAt: new Date().toISOString(),
    });

    await challengeAccepted(ctx, {
      challengeId: challenge._id,
      setCode: challenge.setCode,
      format: challenge.format,
      hoursSinceIssued: Math.round(
        (Date.now() - Date.parse(challenge.createdAt)) / (60 * 60 * 1000),
      ),
    });

    return sessionId;
  },
});

/**
 * Every challenge the caller is on either side of, newest first.
 *
 * This IS the inbox. A notifications table would be a second record of a thing
 * these rows already say, and `useQuery` is reactive, so the unread badge needs
 * no polling and no extra plumbing -- it is a count over this answer.
 */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const caller = await requireCaller(ctx);

    const [issued, taken] = await Promise.all([
      ctx.db
        .query("challenges")
        .withIndex("by_challenger", (q) => q.eq("challengerUserId", caller.userId))
        .order("desc")
        .take(50),
      ctx.db
        .query("challenges")
        .withIndex("by_friend", (q) => q.eq("friendUserId", caller.userId))
        .order("desc")
        .take(50),
    ]);

    const rows = [...issued, ...taken].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return rows.map((c) => ({
      id: c._id,
      side: c.challengerUserId === caller.userId ? ("challenger" as const) : ("friend" as const),
      state: stateOf(c),
      setCode: c.setCode,
      format: c.format,
      fromName: c.fromName,
      note: c.note,
      createdAt: c.createdAt,
      acceptedAt: c.acceptedAt,
      finishedAt: c.finishedAt,
      // Only ever the caller's own session, so the row can link to the draft
      // instead of to a page that tells them to go and find it.
      yourSessionId:
        c.challengerUserId === caller.userId ? c.challengerSessionId : c.friendSessionId,
      // What the badge counts. Only the challenger has something to be told:
      // the friend was present when their own draft ended.
      unread: c.challengerUserId === caller.userId && c.finishedAt != null && c.challengerSeenAt == null,
    }));
  },
});

/**
 * The challenge a draft was dealt by, if it was dealt by one.
 *
 * Exists because the results screen had no way to know. A friend who took a
 * link finished their forty-two picks, built their forty, and was handed the
 * solo completion screen -- same page, same buttons, no mention of the person
 * who dared them and no way to the comparison that had already unlocked. The
 * challenge was reachable from the list, the landing page and an email, and
 * from none of them was it reachable from the screen they were standing on.
 *
 * Off `session.challengeId`, which `accept` stamps and `create` deliberately
 * does not: a session can be dared out to any number of friends, so "the
 * challenge this draft belongs to" is only a question with one answer on the
 * receiving side. That is the side that needed answering. The challenger is
 * told by the badge and the email, both of which already exist.
 *
 * One get on one document, and reactive -- so a challenger who happens to be
 * reading their own results is not what this serves, but a friend whose row is
 * written to while they build does not have to refetch anything.
 */
export const forSession = query({
  args: { sessionId: v.id("draftSessions") },
  handler: async (ctx, args) => {
    const session = await ownedSession(ctx, args.sessionId);
    if (!session.challengeId) return null;

    const challenge = await ctx.db.get(session.challengeId);
    // A dangling id must read as "no challenge" rather than throw. This query
    // sits on the screen somebody's draft ends on.
    if (!challenge) return null;

    return {
      id: challenge._id,
      state: stateOf(challenge),
      fromName: challenge.fromName,
    };
  },
});

/**
 * Both drafts, row by row.
 *
 * Reads `draftPicks` and NEVER replays, which buys two things. Their score is
 * the one they were actually shown -- scored against THEIR pool, which is the
 * entire point of comparing two people rather than two attempts -- and a replay
 * could only offer raw power. And the comparison survives a re-ingest, unlike
 * `review.load`, which matters far more here because a challenge is a seed that
 * outlives its moment.
 *
 * It costs ~180KB of rows for the two of them, against `review.load`'s measured
 * 218KB, once per view. Convex bills whole documents so `poolBefore` is paid for
 * either way -- but it is not RETURNED, because the braid's colours are a fold
 * over each picked card's own `colors`, which are already in its row's pack.
 *
 * Names only. The art and rules text join in the browser against the
 * `sets.cardText` it reads once per visit, the same way the draft board does --
 * which also means a card dropped by a re-ingest renders as a name instead of
 * throwing.
 */
export const diff = query({
  args: { challengeId: v.id("challenges") },
  handler: async (ctx, args) => {
    const { challenge, side } = await challengeParty(ctx, args.challengeId);

    // Without this the challenger could read their friend's picks while the
    // friend was still making them.
    if (!challenge.finishedAt || !challenge.friendSessionId) {
      throw new ConvexError("That draft is not finished yet.");
    }

    const mineFirst = side === "challenger";
    const [challengerRows, friendRows, challengerSession, friendSession] = await Promise.all([
      storedPicks(ctx, challenge.challengerSessionId),
      storedPicks(ctx, challenge.friendSessionId),
      ctx.db.get(challenge.challengerSessionId),
      ctx.db.get(challenge.friendSessionId),
    ]);

    const toSide = (r: Doc<"draftPicks">): DiffSide => ({
      pickIndex: r.pickIndex,
      packNo: r.packNo,
      pickNo: r.pickNo,
      pack: r.pack.map((c) => ({ name: c.name, colors: c.colors })),
      pickedName: r.pickedName,
      score: r.score.score,
      grade: r.score.grade,
    });

    // "Yours" is whoever is reading. The same challenge read from both sides is
    // the same comparison with the columns swapped, and neither person should
    // have to work out which one they are.
    const rows = diffDrafts(
      (mineFirst ? challengerRows : friendRows).map(toSide),
      (mineFirst ? friendRows : challengerRows).map(toSide),
    );
    const tally = summarizeDiff(rows);

    // The set's name and symbol, so the masthead can say which format this was
    // without the client fetching `sets.list` for two fields. ~433 bytes beside
    // the 138KB of rows above.
    const setDoc = await ctx.db
      .query("sets")
      .withIndex("by_code_and_format", (q) =>
        q.eq("code", challenge.setCode).eq("format", challenge.format),
      )
      .unique();

    return {
      id: challenge._id,
      side,
      setCode: challenge.setCode,
      format: challenge.format,
      setName: setDoc?.name,
      iconUri: setDoc?.iconUri,
      fromName: challenge.fromName,
      finishedAt: challenge.finishedAt,
      rows,
      tally,
      // What each of you kept, which is a different comparison from what each of
      // you took -- two people can draft nearly the same cards and register two
      // different decks.
      //
      // No deck list, for the reason the schema gives: which cards are in the
      // deck is the maindeck half of splitPool, and a stored copy would be free
      // to disagree with the picks. So this is the two facts the picks cannot
      // carry -- what was set aside, and how many basics were run -- and the
      // browser rebuilds both forties from the rows it already has. Two small
      // documents against the 138KB of picks already on the wire.
      //
      // `basicLands` is undefined until somebody locks their 40 in. Finishing a
      // draft and building a deck are separate acts, and the challenge unlocks
      // on the first, so the comparison has to be able to say "not yet".
      yourDeck: deckOf(mineFirst ? challengerSession : friendSession),
      theirDeck: deckOf(mineFirst ? friendSession : challengerSession),
      // Only ever the caller's own, and only so the deck comparison can send
      // somebody to build the forty it is waiting on rather than to the list of
      // every draft they have ever taken.
      yourSessionId: mineFirst ? challenge.challengerSessionId : challenge.friendSessionId,
    };
  },
});

const deckOf = (session: Doc<"draftSessions"> | null) => ({
  sideboard: session?.sideboard ?? [],
  basicLands: session?.build?.basicLands,
});

/**
 * What each fork actually cost, by running the pod again without it.
 *
 * Split from `diff` rather than folded into it because it is the one part that
 * reads the set (~46KB) and the one part that can fail: the counterfactual
 * replays, so a re-ingested set throws where the diff itself would not. Asked
 * for separately, the braid draws without weights instead of taking the screen
 * down with it.
 */
export const forkImpacts = query({
  args: {
    challengeId: v.id("challenges"),
    /**
     * The forks to weigh, from the diff the caller is already holding.
     *
     * Passed in rather than recomputed, and measured rather than assumed:
     * re-deriving them here meant reading both drafts' rows a SECOND time, and
     * `pnpm bench-io --challenge` priced that at 163KB against the 138KB the
     * diff itself costs -- so opening one comparison read every row twice.
     * Handed the forks, this needs the seed, the caller's own pick list and the
     * card pool, which is one session document and the set.
     *
     * Client input, and safely so: the worst a wrong index or a made-up name
     * buys is a wrong number in the asker's own bars. `challengeParty` still
     * decides whether they may be here at all, and the replay bounds the rest.
     */
    forks: v.array(v.object({ pickIndex: v.number(), theirs: v.string() })),
  },
  handler: async (ctx, args) => {
    const { challenge, side } = await challengeParty(ctx, args.challengeId);
    if (!challenge.finishedAt || !challenge.friendSessionId) return null;
    if (args.forks.length === 0) return [];

    const mine =
      side === "challenger" ? challenge.challengerSessionId : challenge.friendSessionId;

    // The pick list off the session document -- one row of a few hundred bytes,
    // rather than the forty-two pick rows it could also be read from.
    const mineSession = await ctx.db.get(mine);
    if (!mineSession) return null;

    // A replay apiece, and a caller could otherwise ask for thousands. Forty-two
    // is every pick in a draft, so nothing legitimate is refused.
    const forks = args.forks.slice(0, 42);

    const setDoc = await ctx.db
      .query("sets")
      .withIndex("by_code_and_format", (q) =>
        q.eq("code", challenge.setCode).eq("format", challenge.format),
      )
      .unique();
    if (!setDoc) return null;

    const cardsDoc = await ctx.db
      .query("setCards")
      .withIndex("by_code_and_format", (q) =>
        q.eq("code", setDoc.code).eq("format", setDoc.format),
      )
      .unique();
    if (!cardsDoc) return null;

    try {
      const set = toSetData(cardsDoc);
      return forks.map((f) =>
        forkImpact(dealDraft(set, challenge.seed), challenge.seed, mineSession.pickedNames, f.pickIndex, f.theirs),
      );
    } catch {
      // The set has moved since this was drafted, so the counterfactual cannot
      // be run. Not an error the reader can act on -- the diff beside it is
      // still entirely valid, because it never replayed.
      return null;
    }
  },
});

/** The challenge row, for the notify action, which has no database of its own. */
export const forNotify = internalQuery({
  args: { challengeId: v.id("challenges") },
  handler: async (ctx, args) => await ctx.db.get(args.challengeId),
});

/**
 * Telling the challenger their friend is done.
 *
 * The in-app half needs none of this -- `challenges.mine` is reactive, so the
 * badge lights up on its own. This is the nudge that reaches somebody who is not
 * looking at the app, and it is the only part of the feature that can be
 * unconfigured and still leave the rest working.
 *
 * TWO THINGS HAVE TO BE TRUE FOR IT TO SEND, and neither is code:
 *
 *  1. A VERIFIED SENDING DOMAIN. `access.notifyOwner` sends from Resend's shared
 *     `onboarding@resend.dev`, which delivers only to the Resend account
 *     owner's own address -- fine for "somebody wants in", useless for mailing a
 *     friend. Hence `RESEND_FROM`, and no default: guessing a sender that
 *     silently fails to deliver is worse than not sending.
 *  2. `WORKOS_API_KEY`, because the backend cannot otherwise learn an email
 *     address at all. Identity carries `subject`, `role` and `org_id` and
 *     nothing else, and there is no users table (decision #2), so the WorkOS
 *     Management API is the only door from a subject to an address.
 *
 * Unset means logged and skipped, exactly as access.ts treats it. Nothing here
 * throws: this runs after the friend's last pick has already committed, and
 * failing to send an email must never look like failing to finish a draft.
 */
export const notifyChallenger = internalAction({
  args: { challengeId: v.id("challenges") },
  handler: async (ctx, args) => {
    const challenge = await ctx.runQuery(internal.challenges.forNotify, {
      challengeId: args.challengeId,
    });
    if (!challenge) return;

    const key = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM;
    const workos = process.env.WORKOS_API_KEY;
    const appUrl = process.env.APP_URL;

    if (!key || !from || !workos || !appUrl) {
      console.info(
        `Challenge ${challenge._id} finished; not emailing (unconfigured: ` +
          `${[!key && "RESEND_API_KEY", !from && "RESEND_FROM", !workos && "WORKOS_API_KEY", !appUrl && "APP_URL"]
            .filter(Boolean)
            .join(", ")}).`,
      );
      return;
    }

    const to = await addressOf(challenge.challengerSubject, workos);
    if (!to) return;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `Your ${challenge.setCode.toUpperCase()} challenge came back`,
        text: [
          `Somebody drafted your ${challenge.setCode.toUpperCase()} packs.`,
          "",
          `See where you two went different ways:`,
          // Stamped, and it is the only door that says the app was not already
          // open -- see `diff_viewed.from` in app/lib/analytics.ts.
          `${appUrl}/challenge/${challenge._id}/diff?from=email`,
        ].join("\n"),
      }),
    });

    if (!response.ok) {
      console.error(`Could not email the challenger: ${response.status} ${await response.text()}`);
    }
  },
});

/**
 * A WorkOS user id to an email address.
 *
 * Raw fetch rather than `@workos-inc/node`, which is only in the web tree via
 * authkit-nextjs and would need `"use node"` here for one GET. Same trade
 * access.ts makes with Resend.
 */
async function addressOf(subject: string, apiKey: string): Promise<string | null> {
  const response = await fetch(`https://api.workos.com/user_management/users/${subject}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!response.ok) {
    console.error(`Could not resolve ${subject} to an address: ${response.status}`);
    return null;
  }

  const body = (await response.json()) as { email?: unknown };
  return typeof body.email === "string" ? body.email : null;
}

/**
 * How many finished challenges the caller has not looked at.
 *
 * Its own query rather than a count over `mine`, because this one is subscribed
 * from the masthead on EVERY page and `mine` carries a row's worth of detail per
 * challenge. Only the challenger index is read: the friend was present when
 * their own draft ended and has nothing to be told.
 *
 * It still reads the rows -- Convex bills documents, and counting them means
 * fetching them -- which is fine at a private beta's handful and would not be at
 * a thousand. The fix then is a denormalized counter on a row of its own, the
 * `setStatsMeta` pattern: if a value exists only to be watched, it belongs
 * somewhere small enough to watch cheaply. Not worth the second copy today.
 */
export const unread = query({
  args: {},
  handler: async (ctx) => {
    const caller = await requireCaller(ctx);
    const rows = await ctx.db
      .query("challenges")
      .withIndex("by_challenger", (q) => q.eq("challengerUserId", caller.userId))
      .take(50);

    return rows.filter((c) => c.finishedAt != null && c.challengerSeenAt == null).length;
  },
});

/** That the challenger has read the finished diff. Idempotent, and only theirs. */
export const markSeen = mutation({
  args: { challengeId: v.id("challenges") },
  handler: async (ctx, args) => {
    const caller = await requireCaller(ctx);
    const challenge = await ctx.db.get(args.challengeId);

    if (!challenge || challenge.challengerUserId !== caller.userId) return;
    if (challenge.challengerSeenAt) return;

    await ctx.db.patch(challenge._id, { challengerSeenAt: new Date().toISOString() });
  },
});

/**
 * The offer, for whoever is holding the link.
 *
 * Answers for a signed-in stranger, because that is the whole point of a link
 * -- see `challengeInvite`. It says what the deal is and what has become of it,
 * and deliberately nothing about either draft: the picks are behind
 * `challengeParty`, and the person reading this page has not drafted yet.
 */
export const invitation = query({
  args: { challengeId: v.id("challenges") },
  handler: async (ctx, args) => {
    const caller = await requireCaller(ctx);
    const challenge = await challengeInvite(ctx, args.challengeId);

    const setDoc = await ctx.db
      .query("sets")
      .withIndex("by_code_and_format", (q) =>
        q.eq("code", challenge.setCode).eq("format", challenge.format),
      )
      .unique();

    const mine = challenge.challengerUserId === caller.userId;

    return {
      id: challenge._id,
      state: stateOf(challenge),
      setCode: challenge.setCode,
      format: challenge.format,
      setName: setDoc?.name,
      iconUri: setDoc?.iconUri,
      fromName: challenge.fromName,
      note: challenge.note,
      createdAt: challenge.createdAt,
      // Your own link, which is a state rather than an error: the challenger
      // opens it to check it works, and telling them it is not theirs would be
      // both wrong and confusing.
      mine,
      takenByMe: challenge.friendUserId === caller.userId,
      // Your own session, when it is yours -- so "you are already drafting this"
      // can be a link rather than an instruction to go and look for it. Not a
      // cross-user read: it is only ever returned to the person who owns it.
      yourSessionId:
        challenge.friendUserId === caller.userId ? challenge.friendSessionId : undefined,
      // Deliberately no staleness hint. Only a replay answers whether this seed
      // still deals the packs the challenger drafted from, `accept` does that
      // replay and refuses in a sentence, and a cheaper guess here would either
      // read the challenger's session for a field or warn about a hash that is
      // unchanged by `ingest-sets --force`. One honest answer, at the one moment
      // it decides anything.
    };
  },
});
