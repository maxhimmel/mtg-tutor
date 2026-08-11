"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Authenticated, useQuery } from "convex/react";
import { api } from "@mtg-tutor/backend";
import { PageShell } from "../components/PageShell";
import { SetIcon } from "../components/SetIcon";
import { SignedOut } from "../components/SignedOut";

export default function ChallengeIndex() {
  return (
    <PageShell>
      <SignedOut>
        <section className="max-w-2xl py-6">
          <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight">
            Draft the same packs.
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-base-content/70">
            Finish a draft, send a friend the link, and see where the two of you went
            different ways on the same cards.
          </p>
          {/* Both actions, for the same reason the landing page has both: there
              are two kinds of visitor here and only one of them can act on
              "Sign in". */}
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <a className="btn btn-primary" href="/sign-in">
              Sign in
            </a>
            <Link href="/sign-up" className="btn btn-outline">
              Ask for an invite
            </Link>
          </div>
          <p className="mt-4 text-sm text-base-content/60">
            Accounts are invite only while this is in beta.
          </p>
        </section>
      </SignedOut>

      <Authenticated>
        <ChallengeList />
      </Authenticated>
    </PageShell>
  );
}

/** What each state means for the person reading, which differs by side. */
function words(row: {
  side: "challenger" | "friend";
  state: "open" | "accepted" | "finished" | "revoked";
}): { label: string; tone: string } {
  if (row.state === "finished") return { label: "Ready to compare", tone: "badge-success" };
  if (row.state === "revoked") return { label: "Withdrawn", tone: "badge-ghost" };
  if (row.state === "accepted") {
    return row.side === "challenger"
      ? { label: "They are drafting", tone: "badge-warning" }
      : { label: "Your draft is unfinished", tone: "badge-warning" };
  }
  return { label: "Waiting for somebody", tone: "badge-ghost" };
}

function ChallengeList() {
  const rows = useQuery(api.challenges.mine, {});
  const sets = useQuery(api.sets.list);

  const icons = useMemo(
    () => new Map((sets ?? []).map((s) => [`${s.code}:${s.format}`, s])),
    [sets],
  );

  if (rows === undefined) {
    return <p className="text-base-content/60">Loading challenges…</p>;
  }

  if (rows.length === 0) {
    return (
      <section className="max-w-2xl py-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          No challenges yet
        </h1>
        <p className="mt-3 text-base-content/70">
          Finish a draft and you can dare a friend to the same packs. You both draft your
          own pod off one seed, so their picks change what wheels back to them — and the
          comparison says where the two drafts stopped being the same question.
        </p>
        <Link href="/review" className="btn btn-primary mt-6">
          Pick a finished draft
        </Link>
      </section>
    );
  }

  return (
    <>
      {/* The empty state explains what a challenge is and the populated one used
          to explain nothing, which is backwards: somebody with rows here is the
          one being asked to read a column of states. */}
      <div className="mb-5 flex flex-col gap-1.5">
        <h1 className="font-display text-2xl font-semibold tracking-tight">Challenges</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-base-content/60">
          Every link you have sent or taken up. Both of you open the same cards in pods of
          your own, and once you have both finished the two drafts go side by side.
        </p>
      </div>

      <div className="card overflow-x-auto border border-base-300 bg-base-200">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">
                <span className="eyebrow">Packs</span>
              </th>
              <th scope="col">
                <span className="eyebrow">Who</span>
              </th>
              <th scope="col">
                <span className="eyebrow">State</span>
              </th>
              <th scope="col">
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => {
              const set = icons.get(`${row.setCode}:${row.format}`);
              const state = words(row);

              return (
                <tr key={row.id} className="transition-colors hover:bg-base-300/40">
                  <th scope="row" className="font-normal">
                    <span className="flex items-center gap-3">
                      <SetIcon uri={set?.iconUri} className="size-6 text-base-content/50" />
                      <span className="flex flex-col">
                        <span className="font-display font-semibold leading-tight">
                          {set?.name ?? row.setCode.toUpperCase()}
                        </span>
                        {/* The set picker and the review list both name a
                            draftable thing as CODE · format. This slot held an
                            unlabelled date instead, which said neither which
                            format was played nor what the date was of -- and the
                            rows are newest-first anyway. */}
                        <span className="eyebrow">
                          {row.setCode.toUpperCase()} · {row.format}
                        </span>
                      </span>
                    </span>
                  </th>

                  <td className="whitespace-nowrap text-base-content/70">
                    {row.side === "challenger" ? (
                      /* No name to show unless one was typed: the backend can
                         learn neither a name nor an address, so "a friend" is
                         the honest word for whoever took the link. */
                      <>You dared {row.fromName ? "a friend" : "somebody"}</>
                    ) : (
                      <>{row.fromName ?? "A friend"} dared you</>
                    )}
                  </td>

                  <td className="whitespace-nowrap">
                    <span className={`badge badge-sm ${state.tone}`}>{state.label}</span>
                    {row.unread && (
                      <span className="badge badge-sm badge-primary ml-1.5">new</span>
                    )}
                  </td>

                  <td className="whitespace-nowrap">
                    <span className="flex justify-end gap-1.5">
                      {row.state === "finished" ? (
                        <Link
                          href={`/challenge/${row.id}/diff?from=list`}
                          className="btn btn-sm btn-primary w-[7.5rem]"
                        >
                          Compare
                        </Link>
                      ) : row.side === "friend" && row.yourSessionId ? (
                        /* Straight to the pod. A friend mid-draft wants the
                           board, not a page about the invitation. */
                        <Link
                          href={`/draft/${row.yourSessionId}`}
                          className="btn btn-sm btn-primary w-[7.5rem]"
                        >
                          Keep drafting
                        </Link>
                      ) : (
                        <Link
                          href={`/challenge/${row.id}`}
                          className="btn btn-sm btn-ghost w-[7.5rem]"
                        >
                          The link
                        </Link>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
