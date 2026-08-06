// The /coach HTTP action as a stream of prose. A plain fetch rather than a
// Convex call, so it carries the bearer token itself -- /coach spends the
// deployment's model key and rejects anonymous callers.
//
// Separate from the draft board because what a non-answer means is the part
// worth testing, and it is the same set of decisions the CLI makes in its own
// coach.ts. The site URL is a parameter rather than an import so this stays
// free of build-time env.

// The coach did not answer and the caller should say something deterministic
// instead.
export class CoachUnavailable extends Error {}

// 204: the server agrees this pick was forced and spent nothing on it. It owns
// the clamp, so it is allowed to disagree with the caller's reading of it.
export class CoachDeclined extends Error {}

// 429: you are inside your allowance for drafting and out of it for coaching.
// A subclass rather than a sibling, so every existing `instanceof
// CoachUnavailable` keeps falling back to the deterministic explanation without
// knowing this exists -- being out of coaching must not end a draft. Callers
// that want to say so branch on it first; the message is the server's own
// sentence, which is why nothing here writes one.
export class CoachQuotaExceeded extends CoachUnavailable {}

interface CoachRequest {
  site: string;
  token?: string | null;
  sessionId: string;
  pickIndex: number;
  minPackCards: number;
}

export async function* streamCoach({
  site,
  token,
  ...body
}: CoachRequest): AsyncGenerator<string> {
  const res = await fetch(`${site}/coach`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (res.status === 204) throw new CoachDeclined("pick was forced");

  // The server wrote a sentence for this one, so it is carried rather than
  // restated -- both clients show whatever it said, which is what keeps them
  // from drifting apart on wording that lives on the server.
  if (res.status === 429) {
    throw new CoachQuotaExceeded((await res.text().catch(() => "")) || "coaching is used up");
  }

  // 401 unauthenticated, 503 when the deployment has no model key.
  if (!res.ok || !res.body) throw new CoachUnavailable(`coach returned ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let said = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      said += text;
      yield text;
    }
    const tail = decoder.decode();
    if (tail) {
      said += tail;
      yield tail;
    }
  } finally {
    // Cancel rather than release: a caller that stops reading has abandoned the
    // answer, which is what happens when the player picks again mid-stream.
    await reader.cancel().catch(() => {});
  }

  // A 200 that says nothing is still a coach that did not answer, and it is the
  // shape a model call that produced no output actually takes: the status went
  // out long before the call failed, so there is no error code left for the
  // checks above to catch.
  if (!said.trim()) throw new CoachUnavailable("coach returned an empty answer");
}
