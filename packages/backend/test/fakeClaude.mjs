#!/usr/bin/env node
// A stand-in for the Claude Code CLI, so the bridge can be tested without
// spending a call on every run.
//
// It emits the shape `claude -p --output-format stream-json
// --include-partial-messages` really emits, captured from a live run rather
// than imagined -- including the two deltas that must never reach a player: a
// thinking_delta, which is the model's scratch work, and an input_json_delta,
// which is it filling in the structured-output tool.

import { writeFileSync } from "node:fs";

const args = process.argv.slice(2);
if (process.env.FAKE_CLAUDE_ARGV) writeFileSync(process.env.FAKE_CLAUDE_ARGV, JSON.stringify(args));

// Consumed rather than ignored: the bridge writes the prompt to stdin and
// closes it, and a child that never reads breaks the pipe instead of the test.
let prompt = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (c) => (prompt += c));

const say = (event) => process.stdout.write(JSON.stringify(event) + "\n");
const delta = (type, text) =>
  say({
    type: "stream_event",
    event: { type: "content_block_delta", index: 0, delta: { type, text } },
  });

const usage = {
  input_tokens: 10,
  cache_read_input_tokens: 5,
  cache_creation_input_tokens: 2,
  output_tokens: 3,
  output_tokens_details: { thinking_tokens: 1 },
};

process.stdin.on("end", async () => {
  say({ type: "system", subtype: "init", tools: [], model: "fake" });

  const mode = process.env.FAKE_CLAUDE_MODE ?? "ok";

  if (mode === "fail") {
    say({ type: "result", subtype: "error_during_execution", is_error: true, result: "usage limit reached" });
    process.exit(1);
  }

  if (mode === "long") {
    for (let i = 0; i < 20; i++) {
      delta("text_delta", "0123456789");
      await new Promise((r) => setTimeout(r, 5));
    }
    say({ type: "result", is_error: false, stop_reason: "end_turn", result: "x".repeat(200), usage });
    return;
  }

  if (args.includes("--json-schema")) {
    delta("thinking_delta", "weighing the two cards");
    delta("input_json_delta", '{"contextBestName":');
    say({
      type: "result",
      is_error: false,
      stop_reason: "tool_use",
      result: JSON.stringify({ contextBestName: "Lightning Bolt" }),
      structured_output: { contextBestName: "Lightning Bolt" },
      usage,
    });
    return;
  }

  delta("thinking_delta", "weighing the two cards");
  delta("text_delta", "Bolt ");
  delta("text_delta", "is better.");
  say({ type: "result", is_error: false, stop_reason: "end_turn", result: "Bolt is better.", usage });
});
