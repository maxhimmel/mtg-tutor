import { defineApp } from "convex/server";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";

// The app's first Convex component, and it is here rather than hand-rolled
// because the one hard part of a daily quota is that consuming has to be
// transactional with the thing being paid for. A counter row patched next to
// an insert can charge for a draft that then fails to start; the component's
// consumption rolls back with the mutation it was called in.

const app = defineApp();
app.use(rateLimiter);
export default app;
