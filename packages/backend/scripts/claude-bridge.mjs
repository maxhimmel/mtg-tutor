// Answers the coach from the Claude Code CLI on this machine instead of from a
// paid API key. Dev only.
//
//   pnpm claude-bridge            # leave it running in its own terminal
//   pnpm claude-bridge --echo     # ...and print the answers as they stream
//   pnpm llm claude-cli           # point the dev deployment at it
//
// It narrates. A call is announced when it ARRIVES, named by the pick it is
// about, and again when it lands with what it cost -- because the useful moment
// is while you are waiting, and a log that only speaks afterwards is a log that
// cannot tell you a request never arrived. Which is the failure this bridge is
// most likely to have: the deployment not reaching this machine at all looks,
// from the app, exactly like a slow coach.
//
// Why a server at all: Convex functions run in a V8 isolate with no
// child_process, so nothing inside the deployment can shell out. The only seam
// that reaches this machine is an HTTP request, and llm.ts already knows how to
// speak to an OpenAI-compatible endpoint -- so the smallest thing that works is
// an endpoint that spawns `claude -p` per request. Nothing in the app learns
// about the CLI; this file is the only place that knows it exists.
//
// This is NOT a general OpenAI-compatible server. It implements exactly the
// request shape `llm.ts` sends, captured off the wire rather than read out of a
// spec, and refuses anything else loudly -- see `readRequest`. That is the
// point: a bridge that quietly accepts a shape it mishandles would answer with
// something plausible and wrong, which is the one outcome worth more than the
// tokens it saves.
//
// What it costs: your Claude subscription's usage window, not API credit.
// ANTHROPIC_API_KEY is scrubbed from the child's environment so a key set for
// other work cannot silently turn free calls into billed ones.
//
// Fidelity, and where it stops -- read this before trusting a local number:
//
//   Faithful. The prompt pair, the schema, streaming, the effort flag, and
//   truncation at max_tokens all cross unchanged, and a failure arrives as the
//   coach being unavailable exactly as a Groq daily cap does.
//
//   Not faithful. Token COUNTS are inflated: Claude Code wraps every prompt in
//   its own framing (~150 tokens on an empty call), so input totals here are
//   not comparable to what the same draft costs on Anthropic. bench-llm keys
//   its baselines and transcripts by provider name, so a `claude-cli` run is
//   already stored apart from a Groq or Anthropic one; keep it that way. Cache
//   WRITES are unreportable -- the openai-compatible provider reads only
//   `cached_tokens` -- so cacheWriteTokens is always absent on this provider.
//
// One process per request, deliberately. Keeping a session alive with
// --input-format stream-json would be faster and would carry conversation
// history between calls, and every call this app makes is a fresh single turn.
// A cheaper bridge that answers pick 12 while remembering pick 11 is answering
// a question the app never asked.

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
const PORT = Number(process.env.CLAUDE_BRIDGE_PORT ?? 8787);

// Off by default. The answers are the same ones on screen in the app, so
// echoing them is for the times the app is not what you are watching --
// tuning a prompt, or reading what the coach said about a pick you already
// clicked past.
const ECHO = process.argv.includes("--echo") || process.env.CLAUDE_BRIDGE_ECHO === "1";

// Read per call rather than once, so the tests can hand it a stub that emits a
// canned stream and records the arguments it was given -- which is the only way
// to assert what this file sends without spending a real call on every run.
const claudeBin = () => process.env.CLAUDE_BIN ?? "claude";

// Whole-call, not idle: a verdict with thinking enabled measured under 15s, so
// anything still running five minutes later is hung rather than slow, and a
// hung child holds the coach's connection open until something ends it.
const TIMEOUT_MS = 300_000;

// max_tokens has no equivalent on the CLI, so the budget is enforced here. The
// streaming path can only estimate -- the real count arrives after the answer
// does -- and four characters per token is the usual rough figure. A `length`
// finish from this provider therefore means "about here", where Anthropic's
// means "exactly here".
const CHARS_PER_TOKEN = 4;

// Claude Code writes per-directory state (auto-memory, session files) keyed by
// cwd, so one stable scratch directory keeps it from seeding a new one per
// call. Outside the repo on purpose: run it in the project and CLAUDE.md gets
// discovered and prepended to a prompt this app wrote deliberately.
const SCRATCH = join(tmpdir(), "mtg-tutor-claude-bridge");
mkdirSync(SCRATCH, { recursive: true });

function childEnv() {
  const env = { ...process.env };
  // An API key here would spend money, which is the one thing this exists to
  // avoid. Without it the CLI falls back to the OAuth login `claude` already
  // has -- verified by `apiKeySource: "none"` in its init event.
  delete env.ANTHROPIC_API_KEY;
  // Set when the bridge is started from inside a Claude Code session, which
  // would otherwise hand the child a parent session to attach to.
  for (const key of Object.keys(env)) if (key.startsWith("CLAUDE_CODE_")) delete env[key];
  return env;
}

/**
 * The whole translation from an HTTP request to a command line, in one place
 * so a test can read it.
 *
 * The first six flags are what keeps the child from behaving like an agent.
 * Our calls are one prompt in, one answer out: no tools, no skills, no MCP
 * servers, and no settings file that could add any of them back. A coach that
 * had picked up this repo's CLAUDE.md, or a skill, would answer well and answer
 * as something other than the app.
 */
export function claudeArgs({ system, model, effort, schema }) {
  const args = [
    "-p",
    "--tools",
    "",
    "--setting-sources",
    "",
    "--disable-slash-commands",
    "--strict-mcp-config",
    "--no-session-persistence",
    // stream-json for every call, streamed or not: the same parser then reads
    // both, and the final `result` event carries the usage either way.
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--verbose",
  ];
  // A system prompt REPLACES Claude Code's own, which is the difference between
  // asking the model this app's question and asking a coding agent to answer it.
  if (system) args.push("--system-prompt", system);
  if (model) args.push("--model", model);
  // Sent only when the caller asked for it, so the `fast` flag means the same
  // thing here as it does on Anthropic: less thinking, not none.
  if (effort) args.push("--effort", effort);
  if (schema) args.push("--json-schema", JSON.stringify(schema));
  return args;
}

/**
 * Runs one prompt through `claude -p` and reports what came back.
 *
 * `onText` receives text as it arrives and returns false to stop the call --
 * which is how the token budget is enforced, since killing the child is the
 * only way to stop paying for an answer that has already run past its limit.
 * `register` is handed the same stop, for the caller that learns its answer is
 * no longer wanted: a player who leaves mid-pick should stop costing usage the
 * moment the connection drops.
 */
export function ask({ system, prompt, model, effort, schema, onText, register }) {
  return new Promise((resolve, reject) => {
    const child = spawn(claudeBin(), claudeArgs({ system, model, effort, schema }), {
      cwd: SCRATCH,
      env: childEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    let settled = false;
    let stopped = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };

    const stop = () => {
      stopped = true;
      child.kill("SIGTERM");
    };
    register?.(stop);

    const timer = setTimeout(() => {
      stop();
      finish(reject, new Error(`claude produced nothing in ${TIMEOUT_MS / 1000}s`));
    }, TIMEOUT_MS);

    let text = "";
    let structured;
    let usage;
    let stopReason;
    let failure;
    let stderr = "";
    let buffer = "";

    child.stdin.on("error", () => {});
    child.stdin.end(prompt);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        let event;
        try {
          event = JSON.parse(line);
        } catch {
          // The CLI prints the odd non-JSON line (update notices); the stream
          // is the contract, so anything unparseable is not one of ours.
          continue;
        }

        if (event.type === "stream_event") {
          const inner = event.event;
          // text_delta only. A thinking_delta is the model reasoning and an
          // input_json_delta is it filling in the structured-output tool --
          // forwarding either would put the model's scratch work in front of a
          // player as if it were coaching.
          if (inner?.type === "content_block_delta" && inner.delta?.type === "text_delta") {
            const piece = inner.delta.text ?? "";
            text += piece;
            if (onText && !stopped && onText(piece) === false) stop();
          }
          continue;
        }

        if (event.type === "result") {
          usage = event.usage;
          stopReason = event.stop_reason;
          structured = event.structured_output;
          if (event.is_error) failure = event.result || event.subtype || "claude reported an error";
          else if (typeof event.result === "string") text = event.result;
        }
      }
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => (stderr += chunk));

    child.on("error", (e) =>
      finish(
        reject,
        new Error(
          e.code === "ENOENT"
            ? `\`${claudeBin()}\` is not on PATH -- install the Claude Code CLI to use this provider.`
            : e.message,
        ),
      ),
    );

    child.on("close", (code) => {
      // A kill is this bridge stopping the call on purpose, so whatever arrived
      // before it is the answer rather than a failure.
      if (!stopped && (failure || code !== 0)) {
        finish(
          reject,
          new Error(failure || stderr.trim() || `claude exited with code ${code}`),
        );
        return;
      }
      finish(resolve, { text, structured, usage, stopReason, stopped });
    });
  });
}

// Anthropic counts the cached parts of a prompt separately; OpenAI's
// prompt_tokens is the whole input with the cached share broken out beside it.
// Cache WRITES have nowhere to go in this shape and are folded into the
// uncached remainder, which is the honest place for them: they were paid for.
export function toOpenAIUsage(usage, fallbackOutput) {
  const input = usage?.input_tokens ?? 0;
  const cacheRead = usage?.cache_read_input_tokens ?? 0;
  const cacheWrite = usage?.cache_creation_input_tokens ?? 0;
  const output = usage?.output_tokens ?? fallbackOutput;
  return {
    prompt_tokens: input + cacheRead + cacheWrite,
    completion_tokens: output,
    total_tokens: input + cacheRead + cacheWrite + output,
    prompt_tokens_details: { cached_tokens: cacheRead },
    completion_tokens_details: {
      reasoning_tokens: usage?.output_tokens_details?.thinking_tokens ?? 0,
    },
  };
}

// tool_use is how the CLI delivers structured output, so it is a completed
// answer here rather than a request to run something.
export const finishOf = (stopReason, truncated) =>
  truncated || stopReason === "max_tokens" ? "length" : "stop";

/**
 * The one request shape this app sends, and nothing else.
 *
 * Rejecting the rest is the whole safety story: a bridge that accepted a
 * multi-turn conversation and flattened it, or took a tool definition and
 * ignored it, would answer anyway -- and an answer to a question that was
 * quietly altered is indistinguishable from a good one until it is believed.
 */
export function readRequest(body) {
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const system = messages.filter((m) => m.role === "system");
  const user = messages.filter((m) => m.role === "user");
  if (system.length > 1 || user.length !== 1 || system.length + user.length !== messages.length) {
    throw new Error(
      "This bridge serves one system message and one user message, which is all mtg-tutor sends.",
    );
  }
  if (typeof user[0].content !== "string") {
    throw new Error("Expected the user message content to be a string.");
  }
  if (body.tools || body.functions) {
    throw new Error("Tool calling is not bridged; nothing in mtg-tutor asks for it.");
  }

  const format = body.response_format;
  if (format && format.type !== "json_schema") {
    throw new Error(`Unsupported response_format "${format.type}"; only json_schema is bridged.`);
  }

  return {
    id: `claude-bridge-${Date.now()}`,
    system: system[0]?.content,
    prompt: user[0].content,
    model: typeof body.model === "string" && body.model ? body.model : undefined,
    effort: body.reasoning_effort,
    schema: format?.json_schema?.schema,
    maxTokens: typeof body.max_tokens === "number" ? body.max_tokens : undefined,
    stream: body.stream === true,
  };
}

// Colour is switched off when stdout is not a terminal, so a redirected log is
// plain text rather than escape codes, and by NO_COLOR because that is the
// convention and this is somebody else's terminal.
const COLOUR =
  (Boolean(process.stdout.isTTY) || process.env.FORCE_COLOR === "1") && !process.env.NO_COLOR;
const paint = (code) => (text) => (COLOUR ? `\u001b[${code}m${text}\u001b[0m` : String(text));
const dim = paint(2);
const bold = paint(1);
const green = paint(32);
const red = paint(31);
const yellow = paint(33);
const cyan = paint(36);

const clock = () => new Date().toTimeString().slice(0, 8);
const secs = (ms) => `${(ms / 1000).toFixed(1)}s`;
const count = (n) => n.toLocaleString("en-US");

// One glyph in a fixed column is what makes a screen of these scannable: the
// eye finds the failures without reading a word. The colour lives here and not
// in the words beside it, so a line has one thing shouting rather than three.
const MARK = {
  start: cyan("▶"),
  stop: green("✓"),
  length: yellow("✂"),
  cancelled: yellow("⊘"),
  failed: red("✗"),
};

// `stop` and `length` are the wire's words for these, and neither says what
// happened to anyone reading a terminal.
const OUTCOME = { stop: "answered", length: "cut at max_tokens", cancelled: "cancelled" };

let calls = 0;
const kb = (bytes) => `${(bytes / 1024).toFixed(1)}KB`;

// An echoed answer is a block of prose in the middle of a column of records, so
// it is dimmed and gutter-marked to read as quoted rather than as more log.
const quoted = (n, text) => dim(text.replace(/\n/g, `\n${gutter(n)}`));

/**
 * Both lines of a call, in the same columns.
 *
 * Fixed-width fields first and the sentence last, because a ragged right edge
 * is readable and a ragged middle is not. The em-dash inside a situation line
 * is why the separator here is a middle dot: the same glyph doing duty as
 * punctuation and as a field boundary is what made the first version of this
 * hard to read.
 */
const tag = (n) => `#${String(n).padStart(2, "0")}`;

const line = (n, mark, area, rest) =>
  `${dim(clock())} ${dim(tag(n))} ${mark} ${bold(area.padEnd(7))} ${rest}`;

// Echoed prose sits under the call it came from, with the number in the same
// column the record above uses. Without it, two overlapping calls produce two
// blocks of text and no way to tell which said what -- and overlapping is not
// exotic here, the review fires its calls together.
const gutter = (n) => `${" ".repeat(9)}${dim(`${tag(n)} │`)} `;

/**
 * What this call is FOR, inferred from its shape rather than told.
 *
 * The app sends nothing that names the area, and it should not start: the whole
 * design is that nothing upstream knows this bridge exists. The three shapes
 * map cleanly today -- the coach streams, the verdict is the only schema, and
 * the review frames are the only plain text -- so the label is worth having.
 * It is a label and not a fact: a second streaming caller would wear the coach's
 * name until this line is taught otherwise.
 */
const areaOf = (req) => (req.stream ? "coach" : req.schema ? "verdict" : "frame");

// Every prompt this app writes opens with `situationLine`, which says which
// pick is being asked about -- so one line of the body is a better name for a
// call than any id the wire carries.
function situation(prompt) {
  const first = prompt.split("\n", 1)[0] ?? "";
  const line = first.startsWith("Situation: ") ? first.slice("Situation: ".length) : first;
  return line.length > 72 ? `${line.slice(0, 71)}…` : line;
}

const envelope = (req, extra) => ({
  id: req.id,
  created: Math.floor(Date.now() / 1000),
  model: req.model ?? "claude",
  ...extra,
});

function sendJSON(res, status, payload) {
  const text = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(text),
  });
  res.end(text);
}

// The AI SDK turns any non-2xx into an APICallError, which llm.ts already
// treats as the coach being unavailable -- the same path a Groq daily cap
// takes. So a failure here reaches the player as "no coaching this pick"
// rather than as a stack trace, and the message travels with it.
const sendError = (res, status, message) =>
  sendJSON(res, status, { error: { message, type: "claude_bridge_error" } });

async function completion(res, request, started, n) {
  const budget = request.maxTokens ? request.maxTokens * CHARS_PER_TOKEN : Infinity;

  if (!request.stream) {
    const result = await ask(request);
    let content = request.schema
      ? JSON.stringify(result.structured ?? JSON.parse(result.text))
      : result.text;
    // The real output count is in hand here, so the budget is enforced against
    // it rather than against an estimate. Truncating rather than erroring is
    // the point: a JSON body cut mid-object is exactly what the app sees in
    // production when a verdict runs long, and it fails the same way.
    const overBudget = (result.usage?.output_tokens ?? 0) > (request.maxTokens ?? Infinity);
    if (overBudget) content = content.slice(0, budget);

    const finish = finishOf(result.stopReason, overBudget);
    sendJSON(
      res,
      200,
      envelope(request, {
        object: "chat.completion",
        choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: finish }],
        usage: toOpenAIUsage(result.usage, Math.ceil(content.length / CHARS_PER_TOKEN)),
      }),
    );
    // Nothing streamed, so there was nothing to echo as it went.
    if (ECHO) console.log(`${gutter(n)}${quoted(n, content)}`);
    return { finish, usage: result.usage };
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const chunk = (extra) =>
    res.write(`data: ${JSON.stringify(envelope(request, { object: "chat.completion.chunk", ...extra }))}\n\n`);

  let sent = 0;
  let ttft;
  let truncated = false;
  let cancelled = false;
  let stopChild = () => {};
  // A player who moves on mid-pick: the answer stops being wanted, so it stops
  // being generated, and the log says so rather than reporting a call that
  // looks like every other one.
  res.on("close", () => {
    if (!res.writableFinished) cancelled = true;
    stopChild();
  });
  const result = await ask({
    ...request,
    register: (stop) => (stopChild = stop),
    onText: (piece) => {
      ttft ??= Date.now() - started;
      const room = budget - sent;
      const text = piece.length > room ? piece.slice(0, room) : piece;
      if (text) {
        sent += text.length;
        if (ECHO) {
          if (sent === text.length) process.stdout.write(gutter(n));
          process.stdout.write(quoted(n, text));
        }
        chunk({ choices: [{ index: 0, delta: { content: text } }] });
      }
      if (piece.length >= room) {
        truncated = true;
        return false;
      }
      return true;
    },
  });

  if (ECHO && sent > 0) process.stdout.write("\n");
  const finish = finishOf(result.stopReason, truncated);
  chunk({
    choices: [{ index: 0, delta: {}, finish_reason: finish }],
    usage: toOpenAIUsage(result.usage, Math.ceil(sent / CHARS_PER_TOKEN)),
  });
  res.write("data: [DONE]\n\n");
  res.end();
  return { finish, usage: result.usage, ttft, cancelled };
}

export const server = createServer((req, res) => {
  if (req.method === "GET") {
    sendJSON(res, 200, { status: "ok", scratch: SCRATCH });
    return;
  }
  if (req.method !== "POST" || !req.url?.endsWith("/chat/completions")) {
    sendError(res, 404, `No route for ${req.method} ${req.url}`);
    return;
  }

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    let request;
    try {
      request = readRequest(JSON.parse(body));
    } catch (e) {
      sendError(res, 400, e.message);
      return;
    }

    const started = Date.now();
    const area = areaOf(request);
    // Two lines a few seconds apart are only a pair if something says so, and
    // review fires calls that overlap. The number is what pairs them.
    const n = (calls += 1);
    const size = Buffer.byteLength(request.prompt) + Buffer.byteLength(request.system ?? "");
    // Announced before the child is even spawned, so a request that arrives and
    // then hangs still says who it was.
    console.log(
      line(n, MARK.start, area, `${situation(request.prompt)} ${dim(`· ${kb(size)} in`)}`),
    );
    try {
      const stats = await completion(res, request, started, n);
      const outcome = stats.cancelled ? "cancelled" : stats.finish;
      const parts = [
        secs(Date.now() - started),
        stats.ttft === undefined ? null : `${secs(stats.ttft)} to first token`,
      ];
      const usage = stats.usage;
      const cached = usage?.cache_read_input_tokens ?? 0;
      const input = (usage?.input_tokens ?? 0) + cached + (usage?.cache_creation_input_tokens ?? 0);
      // A killed child never reports what it had spent, and "0 in / 0 out"
      // would read as a call that cost nothing rather than one whose cost is
      // unknown. Say nothing instead.
      if (input > 0) {
        parts.push(
          `${count(input)} in${cached ? ` (${count(cached)} cached)` : ""} · ${count(usage.output_tokens ?? 0)} out`,
        );
      }
      console.log(
        line(
          n,
          MARK[outcome] ?? MARK.stop,
          area,
          `${OUTCOME[outcome] ?? outcome} ${dim(`· ${parts.filter(Boolean).join(" · ")}`)}`,
        ),
      );
    } catch (e) {
      console.error(
        line(n, MARK.failed, area, `failed ${dim(`· ${secs(Date.now() - started)}`)}`),
        `\n${" ".repeat(16)}${e.message}`,
      );
      // A stream that has already begun cannot become an error response. llm.ts
      // reads a short body as partial coaching, which is what the player sees.
      if (res.headersSent) res.end();
      else sendError(res, 502, e.message);
    }
  });
});

// Only when run as a command. The tests import the mapping above and must not
// take a port to do it.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, HOST, () => {
    console.log(`${bold("claude-bridge")} ${dim("·")} http://${HOST}:${PORT}/v1`);
    console.log(`  switch on   pnpm llm claude-cli   ${dim("(groq / anthropic to go back)")}`);
    console.log(
      `  answers     ${ECHO ? "echoed as they stream" : `not echoed          ${dim("(--echo prints them)")}`}`,
    );
    console.log(dim("  waiting for a call…\n"));
  });
}
