import { httpRouter } from "convex/server";
import { buildSystemPrompt, loadPrinciples } from "@mtg-tutor/core";
import { httpAction } from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel.js";
import { CoachUnavailableError, stream } from "./llm.js";

const http = httpRouter();

// Short, snappy per-pick coaching: this fires up to 45 times in one draft, so
// the whole budget goes to the answer rather than to thinking -- see the `fast`
// flag below, which llm.ts turns into thinking-disabled + low effort.
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

    let coaching: ReadableStream<Uint8Array>;
    try {
      coaching = stream({
        system: system(),
        userContent: context.userContent,
        maxTokens: MAX_TOKENS,
        fast: true,
      });
    } catch (e) {
      // Callers already fall back to the deterministic explanation, so say so
      // plainly rather than failing the draft. Only a misconfigured deployment
      // lands here -- once the stream opens, failures surface inline in the
      // body instead, because the response has already started.
      if (e instanceof CoachUnavailableError) {
        return new Response(`coaching unavailable: ${e.message}`, {
          status: 503,
          headers: cors,
        });
      }
      throw e;
    }

    return new Response(coaching, {
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
