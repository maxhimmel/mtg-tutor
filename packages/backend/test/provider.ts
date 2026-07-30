// A stand-in for the model provider, so the seam can be tested without spending
// tokens or depending on a network that is allowed to be slow.
//
// It speaks the OpenAI-compatible wire format because that is the branch
// LLM_PROVIDER=openai-compatible takes, and because the interesting failures --
// a rate limit, a stream that dies mid-answer -- are shaped by the wire, not by
// the SDK.

import { createServer, type Server } from "node:http";
import { once } from "node:events";

export type Behaviour =
  /** Streams these deltas, then finishes cleanly with a usage report. */
  | { kind: "text"; deltas: string[] }
  /** Rejects the request outright, the way an exhausted key or a bad model does. */
  | { kind: "reject"; status: number; message: string }
  /** Streams these deltas and then cuts the connection without finishing. */
  | { kind: "truncate"; deltas: string[] };

const chunk = (body: unknown) => `data: ${JSON.stringify(body)}\n\n`;

const delta = (content: string) =>
  chunk({
    id: "test",
    object: "chat.completion.chunk",
    created: 0,
    model: "test-model",
    choices: [{ index: 0, delta: { content }, finish_reason: null }],
  });

const finish = () =>
  chunk({
    id: "test",
    object: "chat.completion.chunk",
    created: 0,
    model: "test-model",
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    usage: { prompt_tokens: 11, completion_tokens: 3, total_tokens: 14 },
  });

export interface Provider {
  baseURL: string;
  /** How many completion requests arrived -- the SDK retries, and that matters. */
  calls: () => number;
  close: () => Promise<void>;
}

export async function startProvider(behaviour: Behaviour): Promise<Provider> {
  let calls = 0;

  const server: Server = createServer((req, res) => {
    calls += 1;

    if (behaviour.kind === "reject") {
      res.writeHead(behaviour.status, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: behaviour.message } }));
      return;
    }

    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    for (const d of behaviour.deltas) res.write(delta(d));

    if (behaviour.kind === "truncate") {
      // Destroy rather than end: a truncated answer is a connection that went
      // away mid-stream, which is not the same event as a clean close.
      //
      // The delay is load-bearing. Destroying in the same tick as the writes
      // loses the deltas entirely, and the SDK reads that as a request that
      // never started -- so it retries the whole call and the test measures
      // connection failure rather than truncation.
      setTimeout(() => res.destroy(), 50);
      return;
    }

    res.write(finish());
    res.write("data: [DONE]\n\n");
    res.end();
  });

  server.listen(0);
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected a TCP address from the stub provider");
  }

  return {
    baseURL: `http://127.0.0.1:${address.port}/v1`,
    calls: () => calls,
    close: async () => {
      server.closeAllConnections();
      server.close();
      await once(server, "close");
    },
  };
}
