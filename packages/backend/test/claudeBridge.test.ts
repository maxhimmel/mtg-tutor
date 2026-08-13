// What the bridge sends to the CLI and what it hands back, checked against a
// stub rather than against a real call.
//
// The mapping is the whole risk of this feature. A bridge that dropped the
// system prompt, or forwarded the model's thinking as if it were the answer,
// would still produce fluent coaching -- and nothing downstream could tell the
// difference. So the assertions here are mostly about what must NOT be in the
// output.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import {
  claudeArgs,
  finishOf,
  readRequest,
  server,
  toOpenAIUsage,
} from "../scripts/claude-bridge.mjs";

const FAKE = fileURLToPath(new URL("./fakeClaude.mjs", import.meta.url));

let origin: string;

beforeAll(async () => {
  process.env.CLAUDE_BIN = FAKE;
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (typeof address === "string" || address === null) throw new Error("no port");
  origin = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  delete process.env.CLAUDE_BIN;
  delete process.env.FAKE_CLAUDE_MODE;
  await new Promise((resolve) => server.close(resolve));
});

async function post(body: unknown) {
  return fetch(`${origin}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const ask = (extra: Record<string, unknown> = {}) => ({
  model: "sonnet",
  max_tokens: 400,
  messages: [
    { role: "system", content: "You are a draft coach." },
    { role: "user", content: "Which card?" },
  ],
  ...extra,
});

describe("claudeArgs", () => {
  it("replaces the CLI's own system prompt rather than appending to it", () => {
    const args = claudeArgs({ system: "You are a draft coach." });
    expect(args).toContain("--system-prompt");
    expect(args[args.indexOf("--system-prompt") + 1]).toBe("You are a draft coach.");
    // --append-system-prompt would leave Claude Code's own instructions in
    // front of this app's, which is a different model answering.
    expect(args).not.toContain("--append-system-prompt");
  });

  it("leaves the child with no tools, no skills and no settings", () => {
    const args = claudeArgs({});
    expect(args[args.indexOf("--tools") + 1]).toBe("");
    expect(args[args.indexOf("--setting-sources") + 1]).toBe("");
    expect(args).toContain("--disable-slash-commands");
    expect(args).toContain("--strict-mcp-config");
    // Nothing here needs permission to do anything, so nothing here should be
    // asking to skip the checks.
    expect(args).not.toContain("--dangerously-skip-permissions");
    expect(args).not.toContain("--allow-dangerously-skip-permissions");
  });

  it("sends effort only when the caller asked to go fast", () => {
    expect(claudeArgs({})).not.toContain("--effort");
    expect(claudeArgs({ effort: "low" })).toContain("--effort");
  });

  it("passes the schema through as JSON", () => {
    const schema = { type: "object", properties: { a: { type: "string" } } };
    const args = claudeArgs({ schema });
    expect(JSON.parse(args[args.indexOf("--json-schema") + 1])).toEqual(schema);
  });
});

describe("readRequest", () => {
  it("refuses a conversation, because this app never sends one", () => {
    expect(() =>
      readRequest(
        ask({
          messages: [
            { role: "user", content: "one" },
            { role: "assistant", content: "two" },
            { role: "user", content: "three" },
          ],
        }),
      ),
    ).toThrow(/one system message and one user message/);
  });

  it("refuses tools and unknown response formats rather than ignoring them", () => {
    expect(() => readRequest(ask({ tools: [{ name: "x" }] }))).toThrow(/Tool calling/);
    expect(() => readRequest(ask({ response_format: { type: "json_object" } }))).toThrow(
      /json_schema/,
    );
  });
});

describe("toOpenAIUsage", () => {
  it("reports the whole input, with the cached share broken out", () => {
    const usage = toOpenAIUsage(
      {
        input_tokens: 10,
        cache_read_input_tokens: 5,
        cache_creation_input_tokens: 2,
        output_tokens: 3,
        output_tokens_details: { thinking_tokens: 1 },
      },
      0,
    );
    // Anthropic's input_tokens excludes both cache lines; OpenAI's
    // prompt_tokens includes everything that was paid for.
    expect(usage.prompt_tokens).toBe(17);
    expect(usage.prompt_tokens_details.cached_tokens).toBe(5);
    expect(usage.completion_tokens).toBe(3);
    expect(usage.completion_tokens_details.reasoning_tokens).toBe(1);
  });
});

describe("finishOf", () => {
  it("calls a truncated answer truncated, whichever side noticed", () => {
    expect(finishOf("end_turn", false)).toBe("stop");
    expect(finishOf("tool_use", false)).toBe("stop");
    expect(finishOf("max_tokens", false)).toBe("length");
    expect(finishOf("end_turn", true)).toBe("length");
  });
});

describe("streaming", () => {
  it("forwards the answer and nothing the model was thinking", async () => {
    const res = await post(ask({ stream: true }));
    const body = await res.text();
    expect(body).toContain("Bolt ");
    expect(body).toContain("is better.");
    expect(body).not.toContain("weighing the two cards");
    expect(body).toContain("data: [DONE]");
  });

  it("reports what the call cost on the last chunk", async () => {
    const res = await post(ask({ stream: true }));
    const chunks = (await res.text())
      .split("\n\n")
      .filter((line) => line.startsWith("data: ") && !line.includes("[DONE]"))
      .map((line) => JSON.parse(line.slice("data: ".length)));
    const last = chunks[chunks.length - 1];
    expect(last.choices[0].finish_reason).toBe("stop");
    expect(last.usage.prompt_tokens).toBe(17);
  });

  it("stops at max_tokens instead of streaming past it", async () => {
    process.env.FAKE_CLAUDE_MODE = "long";
    const res = await post(ask({ stream: true, max_tokens: 5 }));
    const body = await res.text();
    delete process.env.FAKE_CLAUDE_MODE;

    const text = body
      .split("\n\n")
      .filter((line) => line.startsWith("data: ") && !line.includes("[DONE]"))
      .map((line) => JSON.parse(line.slice("data: ".length)))
      .map((chunk) => chunk.choices[0].delta.content ?? "")
      .join("");
    // Five tokens of budget at four characters each. The estimate is the point:
    // the real count only arrives after the answer does.
    expect(text).toHaveLength(20);
    expect(body).toContain('"finish_reason":"length"');
  });
});

describe("structured output", () => {
  it("answers with the object and none of the tool call that built it", async () => {
    const res = await post(
      ask({
        response_format: {
          type: "json_schema",
          json_schema: { name: "response", strict: true, schema: { type: "object" } },
        },
      }),
    );
    const body = await res.json();
    expect(JSON.parse(body.choices[0].message.content)).toEqual({
      contextBestName: "Lightning Bolt",
    });
    expect(body.choices[0].finish_reason).toBe("stop");
  });
});

describe("failure", () => {
  it("answers a failed call with a status, so the SDK reads it as unavailable", async () => {
    process.env.FAKE_CLAUDE_MODE = "fail";
    const res = await post(ask({}));
    delete process.env.FAKE_CLAUDE_MODE;
    expect(res.status).toBe(502);
    expect((await res.json()).error.message).toContain("usage limit reached");
  });

  it("refuses a shape it would have to guess at", async () => {
    const res = await post(ask({ messages: [{ role: "user", content: "hi" }, { role: "user", content: "again" }] }));
    expect(res.status).toBe(400);
  });
});
