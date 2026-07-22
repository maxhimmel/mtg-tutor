import { httpRouter } from "convex/server";
import { buildSystemPrompt, loadPrinciples } from "@mtg-tutor/core";
import { httpAction } from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel.js";

const http = httpRouter();

// Deliberately raw fetch rather than @anthropic-ai/sdk: the SDK reaches for
// node:fs in its credential loader, which the V8 runtime that HTTP actions run
// in cannot provide, and http.ts cannot opt into "use node". A streaming
// passthrough only needs the SSE text deltas anyway.
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// Short, snappy per-pick coaching: this fires up to 45 times in one draft, so
// the whole budget goes to the answer rather than to thinking. Kept in step
// with apps/cli's ANTHROPIC config.
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
const MAX_TOKENS = 400;

// The principles corpus is byte-identical on every call, so cache it: only the
// first pick of a draft pays to write it, the rest read it cheaply.
let systemPrompt: string | undefined;
const system = () => (systemPrompt ??= buildSystemPrompt(loadPrinciples()));

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Anthropic streams SSE. Pull out the text deltas, tolerating chunk boundaries
// that split a line in half.
function textDeltas(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  // Drained with an explicit pump in start() rather than pull(). With pull(),
  // the response body reached the client but the stream never terminated and
  // the connection hung open; pumping to completion here closes it reliably.
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = body.getReader();
      let buffer = "";

      const emit = (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // keep the trailing partial line

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;

          try {
            const event = JSON.parse(payload);
            if (event.type === "content_block_delta" && event.delta?.type === "text_delta") {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          } catch {
            // A malformed line is not worth killing the stream over.
          }
        }
      };

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          emit(decoder.decode(value, { stream: true }));
        }
        emit(decoder.decode());
      } catch (e) {
        controller.enqueue(
          encoder.encode(`\n[coaching interrupted: ${e instanceof Error ? e.message : e}]`),
        );
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });
}

http.route({
  path: "/coach",
  method: "OPTIONS",
  handler: httpAction(async () => new Response(null, { status: 204, headers: cors })),
});

// Streams coaching for a single pick as plain text. One endpoint serves both
// the browser and the CLI -- both just read the body as it arrives.
http.route({
  path: "/coach",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    // This endpoint spends the deployment's Anthropic key, so it is checked
    // before anything else. draft.coachContext re-checks ownership of the
    // specific session; identity propagates through ctx.runQuery.
    if (!(await ctx.auth.getUserIdentity())) {
      return new Response("not authenticated", { status: 401, headers: cors });
    }

    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) {
      return new Response("expected a JSON object", { status: 400, headers: cors });
    }

    const { sessionId, pickIndex } = body as Record<string, unknown>;
    if (typeof sessionId !== "string" || typeof pickIndex !== "number") {
      return new Response("expected { sessionId: string, pickIndex: number }", {
        status: 400,
        headers: cors,
      });
    }

    // Resolve the pick before checking config, so a bad session id reports as a
    // bad session rather than being masked by a missing key.
    let context;
    try {
      context = await ctx.runQuery(internal.draft.coachContext, {
        sessionId: sessionId as Id<"draftSessions">,
        pickIndex,
      });
    } catch (e) {
      return new Response(e instanceof Error ? e.message : String(e), {
        status: 404,
        headers: cors,
      });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // Callers already fall back to the deterministic explanation, so say so
      // plainly rather than failing the draft.
      return new Response("coaching unavailable: ANTHROPIC_API_KEY is not set", {
        status: 503,
        headers: cors,
      });
    }

    const upstream = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        stream: true,
        thinking: { type: "disabled" },
        output_config: { effort: "low" },
        system: [{ type: "text", text: system(), cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: context.userContent }],
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      return new Response(`coaching failed: ${upstream.status} ${detail}`.trim(), {
        status: 502,
        headers: cors,
      });
    }

    return new Response(textDeltas(upstream.body), {
      status: 200,
      headers: {
        ...cors,
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }),
});

export default http;
