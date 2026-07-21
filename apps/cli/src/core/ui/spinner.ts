import * as p from "@clack/prompts";

// @clack/prompts registers five permanent process listeners
// (uncaughtExceptionMonitor, unhandledRejection, SIGINT, SIGTERM, exit) every
// time spinner() is called, and never removes them. Creating one per pick trips
// Node's 10-listener MaxListenersExceededWarning partway through a draft, so we
// share a single instance. Safe because spinners are always sequential here —
// never nested or concurrent.
let shared: ReturnType<typeof p.spinner> | undefined;

export function spinner() {
  return (shared ??= p.spinner());
}
