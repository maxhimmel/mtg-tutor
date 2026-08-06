import { httpRouter } from "convex/server";
import { ConvexError } from "convex/values";
import { COACH, buildSystemPrompt, isDecisionPick, loadPrinciples } from "@mtg-tutor/core";
import { httpAction } from "./_generated/server.js";
import { internal } from "./_generated/api.js";
import type { Id } from "./_generated/dataModel.js";
import { CoachUnavailableError, stream } from "./llm.js";
import { UNLIMITED, roleOf } from "./roles.js";

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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return new Response("not authenticated", { status: 401, headers: cors });
    }

    const body: unknown = await request.json();
    if (typeof body !== "object" || body === null) {
      return new Response("expected a JSON object", { status: 400, headers: cors });
    }

    const { sessionId, pickIndex, minPackCards } = body as Record<string, unknown>;
    if (typeof sessionId !== "string" || typeof pickIndex !== "number") {
      return new Response("expected { sessionId: string, pickIndex: number }", {
        status: 400,
        headers: cors,
      });
    }

    // The caller's threshold, clamped: 1 is "coach this pick whatever it cost
    // me" (the force button), and no client gets to demand coaching on packs
    // larger than any that exist.
    const minCards = Math.min(
      Math.max(typeof minPackCards === "number" ? minPackCards : COACH.minPackCards, 1),
      COACH.maxMinPackCards,
    );

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

    // The gate lives here, not only in the clients: this endpoint is what spends
    // the deployment's key, so it is the one place that can actually refuse.
    // 204 rather than an error -- there is nothing wrong, there is just nothing
    // to say about a pick you had no choice in, and both clients already know
    // how to fall back to the deterministic explanation.
    if (!isDecisionPick(context.cardsInPack, minCards)) {
      return new Response(null, { status: 204, headers: cors });
    }

    // After the 204 and before the stream: charging for a pick the server has
    // just refused to spend anything on would bill a refusal. The role comes
    // off the identity already in hand, so an exempt caller pays no round trip
    // at all -- which is the point of roles living on the token.
    if (!UNLIMITED.has(roleOf(identity))) {
      try {
        await ctx.runMutation(internal.quota.consumeCoach, {});
      } catch (e) {
        // 429 rather than reusing 503: this endpoint's statuses are how both
        // clients tell its outcomes apart -- 204 declined, 401 anonymous, 503
        // no model key -- and "you, today" is not "the deployment, at all".
        //
        // No Retry-After header. It would have to carry a number the refusal
        // contract does not: a ConvexError here holds a human string and
        // nothing else (sessions.ts), and the string already says when the
        // coach is back. A header nothing reads is not worth widening that for.
        return new Response(e instanceof ConvexError ? String(e.data) : "coaching is used up", {
          status: 429,
          headers: cors,
        });
      }
    }

    let coaching: ReadableStream<Uint8Array>;
    try {
      coaching = stream({
        system: system(),
        userContent: context.userContent,
        maxTokens: MAX_TOKENS,
        fast: true,
        // Runs from inside the stream pump, after this handler has already
        // returned its Response -- the only moment the cost of a streamed call
        // is knowable. Verified against the dev deployment that the action
        // context survives that far and the write commits.
        onUsage: (usage) =>
          ctx.runMutation(internal.metrics.record, {
            ...usage,
            area: "coach",
            sessionId: sessionId as Id<"draftSessions">,
            pickIndex,
          }),
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
