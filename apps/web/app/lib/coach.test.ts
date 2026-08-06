import { afterEach, describe, expect, it, vi } from "vitest";
import { CoachDeclined, CoachQuotaExceeded, CoachUnavailable, streamCoach } from "./coach";

const body = (chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });

const respond = (init: ResponseInit & { chunks?: string[] }) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(init.chunks ? body(init.chunks) : null, init)),
  );
};

const collect = async () => {
  const out: string[] = [];
  const request = {
    site: "https://example.convex.site",
    token: "test-token",
    sessionId: "session",
    pickIndex: 0,
    minPackCards: 5,
  };
  for await (const chunk of streamCoach(request)) out.push(chunk);
  return out.join("");
};

afterEach(() => vi.unstubAllGlobals());

describe("streamCoach", () => {
  it("yields the coaching as it arrives", async () => {
    respond({ status: 200, chunks: ["Take ", "the removal."] });
    await expect(collect()).resolves.toBe("Take the removal.");
  });

  // The shape a model call that produced no output actually takes: the 200 went
  // out before anyone knew the call would fail, so the status cannot say so and
  // the board would otherwise leave the panel blank for the rest of the pick.
  it("treats an empty 200 as the coach being unavailable", async () => {
    respond({ status: 200, chunks: [] });
    await expect(collect()).rejects.toBeInstanceOf(CoachUnavailable);
  });

  it("treats a 200 of only whitespace as the coach being unavailable", async () => {
    respond({ status: 200, chunks: ["  ", "\n"] });
    await expect(collect()).rejects.toBeInstanceOf(CoachUnavailable);
  });

  it("reports an error status as the coach being unavailable", async () => {
    respond({ status: 503, chunks: ["coaching unavailable: no key"] });
    await expect(collect()).rejects.toBeInstanceOf(CoachUnavailable);
  });

  // Distinct from unavailable: the server spent nothing here on purpose, and the
  // board says so rather than falling back as if something went wrong.
  it("reports a 204 as the server declining to coach a forced pick", async () => {
    respond({ status: 204 });
    await expect(collect()).rejects.toBeInstanceOf(CoachDeclined);
  });

  // The board tells this apart to say so once, but everything downstream of it
  // -- the fallback to the deterministic explanation -- must keep working
  // without knowing the difference. Hence a subclass, asserted as one.
  it("reports a 429 as the quota being spent, and still as unavailable", async () => {
    respond({ status: 429, chunks: ["You have asked the coach a lot today."] });
    await expect(collect()).rejects.toBeInstanceOf(CoachQuotaExceeded);
    await expect(collect()).rejects.toBeInstanceOf(CoachUnavailable);
  });

  // The sentence lives on the server so the CLI and the browser cannot word it
  // differently; a client that invented its own would hide that.
  it("carries the server's own wording for a 429", async () => {
    respond({ status: 429, chunks: ["It is back in about 3 hours."] });
    await expect(collect()).rejects.toThrow("It is back in about 3 hours.");
  });
});
