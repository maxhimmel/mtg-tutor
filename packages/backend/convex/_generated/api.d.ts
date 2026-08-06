/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as cardText from "../cardText.js";
import type * as draft from "../draft.js";
import type * as draftPicks from "../draftPicks.js";
import type * as http from "../http.js";
import type * as iobench from "../iobench.js";
import type * as llm from "../llm.js";
import type * as metrics from "../metrics.js";
import type * as migrations from "../migrations.js";
import type * as quota from "../quota.js";
import type * as review from "../review.js";
import type * as roles from "../roles.js";
import type * as sessions from "../sessions.js";
import type * as setData from "../setData.js";
import type * as sets from "../sets.js";
import type * as stats from "../stats.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  auth: typeof auth;
  cardText: typeof cardText;
  draft: typeof draft;
  draftPicks: typeof draftPicks;
  http: typeof http;
  iobench: typeof iobench;
  llm: typeof llm;
  metrics: typeof metrics;
  migrations: typeof migrations;
  quota: typeof quota;
  review: typeof review;
  roles: typeof roles;
  sessions: typeof sessions;
  setData: typeof setData;
  sets: typeof sets;
  stats: typeof stats;
  validators: typeof validators;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  rateLimiter: import("@convex-dev/rate-limiter/_generated/component.js").ComponentApi<"rateLimiter">;
};
