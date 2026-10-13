/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as audit from "../audit.js";
import type * as auth from "../auth.js";
import type * as close from "../close.js";
import type * as crons from "../crons.js";
import type * as files from "../files.js";
import type * as floor from "../floor.js";
import type * as http from "../http.js";
import type * as inventory from "../inventory.js";
import type * as lib_audit from "../lib/audit.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_errors from "../lib/errors.js";
import type * as lib_notify from "../lib/notify.js";
import type * as lib_rateLimit from "../lib/rateLimit.js";
import type * as lib_shift from "../lib/shift.js";
import type * as lib_stockReport from "../lib/stockReport.js";
import type * as lib_validate from "../lib/validate.js";
import type * as me from "../me.js";
import type * as menu from "../menu.js";
import type * as messages from "../messages.js";
import type * as notify from "../notify.js";
import type * as org from "../org.js";
import type * as pay from "../pay.js";
import type * as push from "../push.js";
import type * as reports from "../reports.js";
import type * as requests from "../requests.js";
import type * as rules from "../rules.js";
import type * as schedule from "../schedule.js";
import type * as seed from "../seed.js";
import type * as seedData from "../seedData.js";
import type * as shifts from "../shifts.js";
import type * as staff from "../staff.js";
import type * as tableNotes from "../tableNotes.js";
import type * as tasks from "../tasks.js";
import type * as today from "../today.js";
import type * as warnings from "../warnings.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  audit: typeof audit;
  auth: typeof auth;
  close: typeof close;
  crons: typeof crons;
  files: typeof files;
  floor: typeof floor;
  http: typeof http;
  inventory: typeof inventory;
  "lib/audit": typeof lib_audit;
  "lib/auth": typeof lib_auth;
  "lib/errors": typeof lib_errors;
  "lib/notify": typeof lib_notify;
  "lib/rateLimit": typeof lib_rateLimit;
  "lib/shift": typeof lib_shift;
  "lib/stockReport": typeof lib_stockReport;
  "lib/validate": typeof lib_validate;
  me: typeof me;
  menu: typeof menu;
  messages: typeof messages;
  notify: typeof notify;
  org: typeof org;
  pay: typeof pay;
  push: typeof push;
  reports: typeof reports;
  requests: typeof requests;
  rules: typeof rules;
  schedule: typeof schedule;
  seed: typeof seed;
  seedData: typeof seedData;
  shifts: typeof shifts;
  staff: typeof staff;
  tableNotes: typeof tableNotes;
  tasks: typeof tasks;
  today: typeof today;
  warnings: typeof warnings;
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
