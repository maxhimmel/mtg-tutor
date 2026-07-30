import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stream, type UsageReport } from "../convex/llm.js";
import { startProvider, type Behaviour, type Provider } from "./provider.js";

// The failures worth testing all arrive while the response is already open, so
// what they produce is a body -- never a status code. Everything here reads that
// body the way the browser and the CLI do.
async function drain(body: ReadableStream<Uint8Array>): Promise<string> {
  const decoder = new TextDecoder();
  let out = "";
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    out += decoder.decode(chunk, { stream: true });
  }
  return out + decoder.decode();
}

let provider: Provider | undefined;
let rejections: unknown[] = [];

const onUnhandled = (reason: unknown) => rejections.push(reason);

beforeEach(() => {
  rejections = [];
  process.on("unhandledRejection", onUnhandled);
  process.env.LLM_PROVIDER = "openai-compatible";
  process.env.LLM_API_KEY = "test-key";
  process.env.LLM_MODEL = "test-model";
});

afterEach(async () => {
  process.off("unhandledRejection", onUnhandled);
  await provider?.close();
  provider = undefined;
});

async function coach(behaviour: Behaviour) {
  provider = await startProvider(behaviour);
  process.env.LLM_BASE_URL = provider.baseURL;

  const usage: UsageReport[] = [];
  const body = await drain(
    stream({
      system: "You are a draft coach.",
      userContent: "Which card should I take?",
      maxTokens: 64,
      fast: true,
      onUsage: (u) => void usage.push(u),
    }),
  );
  // A rejection raised on the last turn of the pump has not been delivered yet
  // when drain() returns, so give the microtask queue a chance to run before any
  // test concludes there were none.
  await new Promise((resolve) => setImmediate(resolve));
  return { body, usage };
}

describe("stream", () => {
  it("streams the answer and reports what it cost", async () => {
    const { body, usage } = await coach({
      kind: "text",
      deltas: ["Take ", "the removal ", "spell."],
    });

    expect(body).toBe("Take the removal spell.");
    expect(usage).toHaveLength(1);
    expect(usage[0]).toMatchObject({
      inputTokens: 11,
      outputTokens: 3,
      finishReason: "stop",
      model: "test-model",
    });
    expect(rejections).toEqual([]);
  });

  // The state an exhausted key produces. The player is owed an explanation in
  // the body, because the 200 went out long before anyone knew the call would
  // fail.
  //
  // 401 rather than the 429 a spent daily allowance actually returns: the SDK
  // retries a 429 twice with backoff and lands in exactly this state six
  // seconds later, so the slower status tests the SDK's retry policy rather
  // than anything this file decides.
  it("says so in the body when the provider refuses the call", async () => {
    const { body, usage } = await coach({
      kind: "reject",
      status: 401,
      message: "Invalid API Key",
    });

    expect(body).toContain("[coaching interrupted:");
    expect(body).toContain("Invalid API Key");
    // Nothing was generated, so there is no cost to record -- and a usage row of
    // zeroes would be worse than none, since the benchmark averages over rows.
    expect(usage).toEqual([]);
    expect(rejections).toEqual([]);
  });

  it("keeps the partial answer when the stream dies mid-sentence", async () => {
    const { body } = await coach({
      kind: "truncate",
      deltas: ["Take the removal"],
    });

    expect(body).toContain("Take the removal");
    expect(body).toContain("[coaching interrupted:");
    expect(rejections).toEqual([]);
  });
});
