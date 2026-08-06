"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@mtg-tutor/backend";
import { humanError } from "../lib/humanError";

// The only thing on this app a signed-out stranger can do, so it says what it
// is for rather than looking like a sign-up form that happens not to work.
export function RequestAccess() {
  const request = useMutation(api.access.requestAccess);
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (sent) {
    return (
      <p className="mt-7 text-base-content/70">
        Asked. If it is a yes you will get an invitation link by email — there is no
        account waiting for you until then, so nothing to check back on here.
      </p>
    );
  }

  async function submit(form: FormData) {
    setError(null);
    setSending(true);
    try {
      await request({
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        note: String(form.get("note") ?? "") || undefined,
      });
      setSent(true);
    } catch (e) {
      setError(humanError(e));
    } finally {
      setSending(false);
    }
  }

  return (
    <form action={submit} className="mt-7 flex max-w-md flex-col gap-3">
      <input
        name="name"
        required
        autoComplete="name"
        placeholder="Your name"
        className="input w-full"
        aria-label="Your name"
      />
      <input
        name="email"
        type="email"
        required
        autoComplete="email"
        placeholder="Your email"
        className="input w-full"
        aria-label="Your email"
      />
      {/* Optional, and the only field that ever changes an answer: the rest is
          how to reach you, this is why anyone would. */}
      <input
        name="note"
        placeholder="How do we know each other? (optional)"
        className="input w-full"
        aria-label="How do we know each other"
      />

      {error && (
        <div role="alert" className="alert alert-warning">
          <span>{error}</span>
        </div>
      )}

      <button type="submit" className="btn btn-primary self-start" disabled={sending}>
        {sending && <span className="loading loading-spinner loading-xs" />}
        Ask for an invite
      </button>
    </form>
  );
}
