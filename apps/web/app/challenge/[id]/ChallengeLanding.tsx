"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AuthLoading, Authenticated, Unauthenticated, useMutation, useQuery } from "convex/react";
import { api } from "@mtg-tutor/backend";
import type { Id } from "@mtg-tutor/backend/dataModel";
import { PageNotice, PageShell } from "../../components/PageShell";
import { SetIcon } from "../../components/SetIcon";
import { challengeOpened, draftRefused } from "../../lib/analytics";
import { CopyLink } from "../../components/CopyLink";
import { humanError } from "../../lib/humanError";

/**
 * The page a link opens.
 *
 * Every state below is somewhere a real person lands, which is why they are
 * spelled out rather than collapsed into "this link does not work": a challenge
 * somebody else took, one you issued yourself, one you are already mid-draft on,
 * one whose set has moved. Told which, all of those have somewhere to go. Told
 * "broken", none of them do.
 *
 * Members only, by leaving `/challenge/*` off `unauthenticatedPaths` -- so a
 * signed-out visitor bounces through WorkOS and a signed-in non-member falls
 * through to the access-blocked path that already exists, rather than to a
 * second refusal written just for this.
 */
export function ChallengeLanding({ challengeId }: { challengeId: string }) {
  return (
    <>
      <AuthLoading>
        <PageNotice>Signing in…</PageNotice>
      </AuthLoading>
      <Unauthenticated>
        <PageNotice>Signing in…</PageNotice>
      </Unauthenticated>
      <Authenticated>
        <PageShell>
          <Landing challengeId={challengeId as Id<"challenges">} />
        </PageShell>
      </Authenticated>
    </>
  );
}

function Landing({ challengeId }: { challengeId: Id<"challenges"> }) {
  const invite = useQuery(api.challenges.invitation, { challengeId });
  const accept = useMutation(api.challenges.accept);
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Once per visit. `invitation` is a live query and re-answers whenever the row
  // is written to -- including by the accept below, which would otherwise report
  // the same arrival twice with two different outcomes.
  const counted = useRef(false);
  useEffect(() => {
    if (!invite || counted.current) return;
    counted.current = true;
    challengeOpened({
      challengeId,
      outcome: invite.mine
        ? "own"
        : invite.state === "finished"
          ? "finished"
          : invite.state === "revoked"
            ? "revoked"
            : invite.takenByMe
              ? "in-progress"
              : invite.state === "accepted"
                ? "taken"
                : "open",
    });
  }, [invite, challengeId]);

  if (invite === undefined) return <p className="text-base-content/60">Opening the link…</p>;

  const take = async () => {
    setBusy(true);
    setError(null);
    try {
      const sessionId = await accept({ challengeId });
      router.push(`/draft/${sessionId}`);
    } catch (e) {
      const message = humanError(e);
      setError(message);
      // Beside the thing that refused, and captured in the browser -- a backend
      // capture schedules inside the transaction the refusal just rolled back.
      // `via` rather than a second event name: same wall, different door.
      draftRefused({
        setCode: invite.setCode,
        format: invite.format,
        message,
        via: "challenge",
      });
      setBusy(false);
    }
  };

  const heading = invite.fromName
    ? `${invite.fromName} dared you to these packs.`
    : "Somebody dared you to these packs.";

  return (
    <section className="max-w-2xl py-4">
      <div className="mb-5 flex items-center gap-3">
        <SetIcon uri={invite.iconUri} className="size-10 text-base-content/50" />
        <div className="flex flex-col">
          <span className="font-display text-xl font-semibold leading-tight">
            {invite.setName ?? invite.setCode.toUpperCase()}
          </span>
          <span className="eyebrow">
            {invite.setCode.toUpperCase()} · {invite.format}
          </span>
        </div>
      </div>

      <Outcome invite={invite} heading={heading} busy={busy} onTake={take} />

      {invite.note && (
        <blockquote className="mt-5 border-l-2 border-base-content/20 pl-3 text-base italic text-base-content/70">
          {invite.note}
        </blockquote>
      )}

      {error && (
        <div role="alert" className="alert alert-warning mt-5">
          <span>{error}</span>
        </div>
      )}
    </section>
  );
}

type Invite = NonNullable<ReturnType<typeof useQuery<typeof api.challenges.invitation>>>;

function Outcome({
  invite,
  heading,
  busy,
  onTake,
}: {
  invite: Invite;
  heading: string;
  busy: boolean;
  onTake: () => void;
}) {
  const Title = ({ children }: { children: React.ReactNode }) => (
    <h1 className="font-display text-3xl font-semibold leading-[1.1] tracking-tight">
      {children}
    </h1>
  );
  const Body = ({ children }: { children: React.ReactNode }) => (
    <p className="mt-4 text-lg leading-relaxed text-base-content/70">{children}</p>
  );

  // Your own link. Not an error -- the challenger opens it to check it works,
  // and telling them it is not theirs would be both wrong and baffling.
  if (invite.mine) {
    return (
      <>
        <Title>This is your link.</Title>
        <Body>
          Send it to somebody. They open the same cards you did, in a pod of their own — and
          you will be told when they finish.
        </Body>
        <div className="mt-7 flex flex-wrap gap-3">
          <CopyLink challengeId={invite.id} where="landing" />
          <Link href="/challenge" className="btn btn-ghost">
            Your challenges
          </Link>
        </div>
      </>
    );
  }

  if (invite.state === "revoked") {
    return (
      <>
        <Title>This challenge was withdrawn.</Title>
        <Body>
          Whoever sent it took it back before anybody drafted it. Nothing is lost — ask
          them for a fresh one.
        </Body>
        <Out />
      </>
    );
  }

  // You took it and have not finished. The draft is the only thing you want.
  if (invite.takenByMe && invite.state !== "finished") {
    return (
      <>
        <Title>You are already drafting this.</Title>
        <Body>
          You took this challenge up and have not finished the forty-two picks yet. Your
          pod is where you left it.
        </Body>
        <Link
          href={invite.yourSessionId ? `/draft/${invite.yourSessionId}` : "/challenge"}
          className="btn btn-primary mt-7"
        >
          Back to your draft
        </Link>
      </>
    );
  }

  if (invite.state === "finished") {
    return (
      <>
        <Title>This one is done.</Title>
        <Body>Both drafts are in. Read them side by side.</Body>
        <Link href={`/challenge/${invite.id}/diff`} className="btn btn-primary mt-7">
          Compare the two drafts
        </Link>
      </>
    );
  }

  // Somebody else got there first. A challenge is one-to-one on purpose: two
  // people drafting it would be two pods to compare against one, and the screen
  // answers a question about a pair.
  if (invite.state === "accepted") {
    return (
      <>
        <Title>Somebody else took this one.</Title>
        <Body>
          A challenge is between two people, so the link is spent. Ask for another if you
          want a go at the same packs.
        </Body>
        <Out />
      </>
    );
  }

  return (
    <>
      <Title>{heading}</Title>
      <Body>
        You will draft the same forty-two cards they opened, in a pod of your own — so what
        you take still changes what wheels back to you. When you finish, the two drafts go
        side by side.
      </Body>
      <div className="mt-7 flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={busy} onClick={onTake}>
          {busy ? "Dealing…" : "Draft these packs"}
        </button>
        <Link href="/" className="link link-hover text-sm text-base-content/60">
          Not now →
        </Link>
      </div>
      <p className="mt-4 text-sm text-base-content/60">
        This uses one of your drafts for today.
      </p>
    </>
  );
}

function Out() {
  return (
    <div className="mt-7 flex flex-wrap gap-3">
      <Link href="/" className="btn btn-primary">
        Draft a set
      </Link>
      <Link href="/challenge" className="btn btn-ghost">
        Your challenges
      </Link>
    </div>
  );
}
