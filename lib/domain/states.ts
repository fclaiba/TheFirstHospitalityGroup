// States, not scores (ADR 0027, BLUEPRINT 2.6). Leaders see names and states; venues have one overall state with the
// reasons in words. No percentages are ever returned to staff screens.
import type { ConfirmState, VenueState, WarningState } from "./types";

/** A reason is a copy key (`states.reason.<key>`) with values to fill in, plus the names behind it. */
export type Reason = { key: string; count?: number; names?: string[]; level: Exclude<VenueState, "on_track"> };

export type VenueInputs = {
  hasOverdueActions?: boolean;
  /** Shifts that ended without a submitted close (last 7 days). */
  closesMissing: number;
  /** Auto-closed shifts not yet reviewed. */
  autoClosed: number;
  /** People who have not confirmed the current published week (names). */
  unconfirmed: string[];
  /** People who have not confirmed within 24 h of publishing (names). */
  lateConfirmations: string[];
  /** Side-work runs late in the live shift. */
  lateRuns: number;
  /** Open bar shortages marked Out. */
  shortagesOut: number;
  /** Open bar shortages marked Low. */
  shortagesLow: number;
  /** People in the Review warning state (names). */
  reviews: string[];
  /** Warning proposals waiting more than 24 h. */
  staleProposals: number;
  /** Tipped shifts over the side-work limit this week. */
  overSideWork: number;
};

export const EMPTY_VENUE_INPUTS: VenueInputs = {
  closesMissing: 0,
  autoClosed: 0,
  unconfirmed: [],
  lateConfirmations: [],
  lateRuns: 0,
  shortagesOut: 0,
  shortagesLow: 0,
  reviews: [],
  staleProposals: 0,
  overSideWork: 0,
};

/**
 * On track / Needs attention / Action required (BLUEPRINT 2.9). Action required: a missing close, an auto-closed
 * shift, a bottle out, confirmations late past 24 h, or a person in Review. Needs attention: anything else pending.
 */
export function venueState(i: VenueInputs): { state: VenueState; reasons: Reason[] } {
  const reasons: Reason[] = [];
  const add = (cond: boolean, r: Reason) => cond && reasons.push(r);
  add(!!i.hasOverdueActions, { key: "actionsOverdue", level: "action_required" });
  add(i.closesMissing > 0, { key: "closeMissing", count: i.closesMissing, level: "action_required" });
  add(i.autoClosed > 0, { key: "autoClosed", count: i.autoClosed, level: "action_required" });
  add(i.lateConfirmations.length > 0, { key: "confirmationsLate", count: i.lateConfirmations.length, names: i.lateConfirmations, level: "action_required" });
  add(i.shortagesOut > 0, { key: "shortagesOut", count: i.shortagesOut, level: "action_required" });
  add(i.reviews.length > 0, { key: "peopleInReview", count: i.reviews.length, names: i.reviews, level: "action_required" });
  const pendingOnly = i.unconfirmed.filter((n) => !i.lateConfirmations.includes(n));
  add(pendingOnly.length > 0, { key: "confirmationsPending", count: pendingOnly.length, names: pendingOnly, level: "needs_attention" });
  add(i.lateRuns > 0, { key: "sideWorkLate", count: i.lateRuns, level: "needs_attention" });
  add(i.shortagesLow > 0, { key: "shortagesLow", count: i.shortagesLow, level: "needs_attention" });
  add(i.staleProposals > 0, { key: "proposalsWaiting", count: i.staleProposals, level: "needs_attention" });
  add(i.overSideWork > 0, { key: "sideWorkOverLimit", count: i.overSideWork, level: "needs_attention" });
  const state: VenueState = reasons.some((r) => r.level === "action_required") ? "action_required" : reasons.length ? "needs_attention" : "on_track";
  return { state, reasons };
}

export const VENUE_STATE_ORDER: VenueState[] = ["on_track", "needs_attention", "action_required"];

/** Worst first, for lists of venues. */
export const byUrgency = (a: { state: VenueState }, b: { state: VenueState }) => VENUE_STATE_ORDER.indexOf(b.state) - VENUE_STATE_ORDER.indexOf(a.state);

/** A person as leaders see them: warning state and confirmation state, never a score. */
export type PersonState = { warnings: WarningState; confirmation: ConfirmState; reasons: string[] };

export function personState(input: { warnings: WarningState; pendingConfirmations: number; latePending: boolean; lateRuns: number }): PersonState {
  const confirmation: ConfirmState = input.pendingConfirmations === 0 ? "confirmed" : input.latePending ? "late" : "pending";
  const reasons: string[] = [];
  if (input.warnings !== "up_to_date") reasons.push(`warnings.${input.warnings}`);
  if (confirmation !== "confirmed") reasons.push(`confirm.${confirmation}`);
  if (input.lateRuns > 0) reasons.push("sideWorkLate");
  return { warnings: input.warnings, confirmation, reasons };
}

/** Whether a confirmation is late: published more than 24 h ago and not confirmed. */
export const CONFIRM_LATE_MS = 24 * 3600_000;
export const isConfirmLate = (publishedAt: number, now: number) => now - publishedAt > CONFIRM_LATE_MS;
