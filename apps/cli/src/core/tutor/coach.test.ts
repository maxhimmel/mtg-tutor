import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../config.js", () => ({ CONVEX_SITE_URL: "https://example.convex.site" }));
vi.mock("../auth/session.js", () => ({ accessToken: async () => "test-token" }));

const { CoachUnavailable, streamCoach } = await import("./coach.js");

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
  for await (const chunk of streamCoach("session", 0)) out.push(chunk);
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
  // the caller would otherwise render an empty explanation as if it were advice.
  it("treats an empty 200 as the coach being unavailable", async () => {
    respond({ status: 200, chunks: [] });
    await expect(collect()).rejects.toBeInstanceOf(CoachUnavailable);
  });

  it("reports an error status as the coach being unavailable", async () => {
    respond({ status: 503, chunks: ["coaching unavailable: no key"] });
    await expect(collect()).rejects.toBeInstanceOf(CoachUnavailable);
  });
});
