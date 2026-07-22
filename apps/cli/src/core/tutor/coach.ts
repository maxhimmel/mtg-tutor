import { CONVEX_SITE_URL } from "../config.js";
import { accessToken } from "../auth/session.js";

// Per-pick coaching now comes from the deployment's /coach HTTP action rather
// than a local Anthropic client, so the CLI and the web app get byte-identical
// coaching from one prompt and one key. This is a plain fetch, not a Convex
// call, so it carries the bearer token itself.
export class CoachUnavailable extends Error {}

export async function* streamCoach(
  sessionId: string,
  pickIndex: number,
): AsyncGenerator<string> {
  const res = await fetch(`${CONVEX_SITE_URL}/coach`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${await accessToken()}`,
    },
    body: JSON.stringify({ sessionId, pickIndex }),
  });

  // 503 when the deployment has no Anthropic key, 401 if the token lapsed
  // mid-draft. Either way the caller falls back to deterministic feedback.
  if (!res.ok || !res.body) {
    throw new CoachUnavailable((await res.text().catch(() => "")) || `coach returned ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      yield decoder.decode(value, { stream: true });
    }
    const tail = decoder.decode();
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}
