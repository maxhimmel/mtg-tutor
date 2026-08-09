"use client";

import { useState } from "react";
import { challengeLinkCopied } from "../lib/analytics";

/**
 * A challenge link, and a way to get it out of the app.
 *
 * The readable, selectable URL is not decoration beside the button. The
 * clipboard API is unavailable over plain http and refuses in some browsers
 * without a gesture it recognises, and a copy button that silently does nothing
 * is worse than no button at all -- the visible URL is what makes that failure
 * survivable rather than baffling.
 */
export function CopyLink({ challengeId, where }: { challengeId: string; where: string }) {
  const [copied, setCopied] = useState(false);

  // Read at click time rather than at render: this component is rendered on the
  // server first, where there is no origin to read.
  const url = () => `${window.location.origin}/challenge/${challengeId}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
    // Captured whether or not the clipboard obliged: the fact worth having is
    // that somebody reached for the link. Issuing one is not sending it, and
    // the gap between those is a step nothing else in the funnel can see.
    challengeLinkCopied({ challengeId, where });
  };

  return (
    <span className="flex w-full max-w-lg items-center gap-2">
      <input
        readOnly
        defaultValue={`/challenge/${challengeId}`}
        ref={(el) => {
          if (el && typeof window !== "undefined") el.value = url();
        }}
        aria-label="Challenge link"
        onFocus={(e) => e.currentTarget.select()}
        className="input input-sm flex-1 font-mono text-xs"
      />
      <button className="btn btn-sm btn-primary" onClick={copy}>
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}
