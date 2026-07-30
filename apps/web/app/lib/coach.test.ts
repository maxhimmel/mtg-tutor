import { afterEach, describe, expect, it, vi } from "vitest";
import { CoachDeclined, CoachUnavailable, streamCoach } from "./coach";

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
});
