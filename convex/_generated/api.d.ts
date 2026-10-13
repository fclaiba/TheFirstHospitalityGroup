/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as auth from "../auth.js";
import type * as crons from "../crons.js";
import type * as files from "../files.js";
import type * as http from "../http.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_notify from "../lib/notify.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as lib_shift from "../lib/shift.js";
import type * as lib_validate from "../lib/validate.js";
import type * as me from "../me.js";
import type * as messages from "../messages.js";
import type * as notify from "../notify.js";
import type * as org from "../org.js";
import type * as push from "../push.js";
import type * as seed from "../seed.js";
import type * as seedData from "../seedData.js";
import type * as shifts from "../shifts.js";
import type * as staff from "../staff.js";
import type * as tasks from "../tasks.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  auth: typeof auth;
  crons: typeof crons;
  files: typeof files;
  http: typeof http;
  "lib/audit": typeof lib_audit;
  "lib/auth": typeof lib_auth;
  "lib/errors": typeof lib_errors;
  "lib/notify": typeof lib_notify;
  "lib/rateLimit": typeof lib_rateLimit;
  "lib/shift": typeof lib_shift;
  "lib/validate": typeof lib_validate;
  me: typeof me;
  messages: typeof messages;
  notify: typeof notify;
  org: typeof org;
  push: typeof push;
  seed: typeof seed;
  seedData: typeof seedData;
  shifts: typeof shifts;
  staff: typeof staff;
  tasks: typeof tasks;
}>;

export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
