import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { World } from "./support/engine";

let w: World;
beforeEach(async () => {
  w = await World.create();
});
afterEach(() => vi.useRealTimers());
const paginationOpts = { numItems: 10, cursor: null };
const instructions = {
  en: "Inspect and replace the damaged service tray.",
  es: "Revisa y reemplaza la bandeja de servicio dañada.",
};
async function create(user = "ana.p") {
  await w.as("maria.m");
  return w.m<{ actionId: string }>("actions:create", {
    venueId: w.venue("v1")._id,
    assigneeId: w.user(user)._id,
    instructions,
    dueAt: Date.now() + 3600_000,
  });
}
async function transition(
  actionId: string,
  revision: number,
  command: string,
  note = "Observed the completed work at the station.",
  extra = {},
) {
  return w.m("actions:transition", {
    actionId,
    revision,
    command,
    note,
    ...extra,
  });
}
describe("accountable operational follow-up", () => {
  it("lets the immediate lead read escalation evidence but reserves approval to managers", async () => {
    const { actionId } = await create();
    await w.as("luis.c");
    const action = await w.q<{ canManage: boolean }>("actions:get", {
      actionId,
    });
    expect(action.canManage).toBe(false);
    expect(
      await w.code("actions:transition", {
        actionId,
        revision: 1,
        command: "cancel",
        note: "Lead attempting to cancel.",
      }),
    ).toBe("FORBIDDEN");
  });
  it("keeps work across shifts, requires evidence and independent verification, and audits every transition", async () => {
    const { actionId } = await create();
    await w.as("ana.p");
    await transition(actionId, 1, "start");
    expect(
      await w.code("actions:transition", {
        actionId,
        revision: 2,
        command: "submit",
        note: "",
      }),
    ).toBe("INVALID_INPUT");
    await transition(
      actionId,
      2,
      "submit",
      "Replaced the damaged tray and inspected the station.",
    );
    expect(
      await w.code("actions:transition", {
        actionId,
        revision: 3,
        command: "verify",
        note: "Checked it myself.",
      }),
    ).toBe("FORBIDDEN");
    await w.as("maria.m");
    await transition(
      actionId,
      3,
      "return",
      "Inspect the replacement handle before the next service.",
    );
    await w.as("ana.p");
    await transition(
      actionId,
      4,
      "submit",
      "Inspected the replacement handle; it is secure.",
    );
    await w.as("maria.m");
    await transition(actionId, 5, "verify");
    const action = await w.q<{ state: string; canManage: boolean }>(
      "actions:get",
      { actionId },
    );
    expect(action.state).toBe("verified");
    expect(
      await w.code("actions:transition", {
        actionId,
        revision: 6,
        command: "cancel",
        note: "No longer needed.",
      }),
    ).toBe("INVALID_TRANSITION");
    const history = await w.q<{ page: unknown[] }>("actions:history", {
      actionId,
      paginationOpts,
    });
    expect(history.page).toHaveLength(6);
    expect(
      w.rows("auditLogs").filter((a) => a.entityId === actionId),
    ).toHaveLength(6);
  });
  it("rejects peers, unrelated leaders, foreign venues and foreign companies", async () => {
    const { actionId } = await create();
    await w.as("tom.b");
    expect(await w.qcode("actions:get", { actionId })).toBe("FORBIDDEN");
    expect(await w.qcode("actions:history", { actionId, paginationOpts })).toBe(
      "FORBIDDEN",
    );
    expect(
      await w.code("actions:create", {
        venueId: w.venue("v1")._id,
        assigneeId: w.user("ana.p")._id,
        instructions,
        dueAt: Date.now() + 3600_000,
      }),
    ).toBe("FORBIDDEN");
    await w.as("james.k");
    expect(await w.qcode("actions:get", { actionId })).toBe("VENUE_FORBIDDEN");
    await w.as("maria.m");
    expect(
      await w.code("actions:create", {
        venueId: w.venue("v1")._id,
        assigneeId: w.user("maria.m")._id,
        instructions,
        dueAt: Date.now() + 3600_000,
      }),
    ).toBe("FORBIDDEN");
    const target = w.user("ana.p");
    target.companyId = "companies:foreign";
    expect(
      await w.code("actions:transition", {
        actionId,
        revision: 1,
        command: "reassign",
        note: "New owner for follow-up.",
        assigneeId: target._id,
        dueAt: Date.now() + 3600_000,
      }),
    ).toBe("FORBIDDEN");
  });
  it("refuses stale saves and preserves reassignment evidence", async () => {
    const { actionId } = await create();
    await transition(
      actionId,
      1,
      "reassign",
      "Tom will inspect this station before service.",
      { assigneeId: w.user("tom.b")._id, dueAt: Date.now() + 7200_000 },
    );
    expect(
      await w.code("actions:transition", {
        actionId,
        revision: 1,
        command: "cancel",
        note: "Outdated request.",
      }),
    ).toBe("VERSION_STALE");
    await w.as("ana.p");
    expect(await w.qcode("actions:get", { actionId })).toBe("FORBIDDEN");
    await w.as("tom.b");
    await transition(actionId, 2, "start");
    await transition(actionId, 3, "submit");
    await w.as("maria.m");
    await transition(actionId, 4, "verify");
    expect(
      w
        .rows("operatingActionEvents")
        .filter((e) => e.actionId === actionId)
        .map((e) => e.command),
    ).toEqual(["created", "reassign", "start", "submit", "verify"]);
  });
  it("deduplicates a submitted-close source without mutating that report", async () => {
    const report = w
      .rows("closeReports")
      .find((r) => r.status === "submitted")!;
    expect(report).toBeTruthy();
    report.openItems = ["Check the tray before dinner."];
    await w.as("maria.m");
    const args = {
      venueId: report.venueId,
      assigneeId: w.user("ana.p")._id,
      instructions,
      dueAt: Date.now() + 3600_000,
      sourceShiftId: report.shiftId,
      sourceItem: 0,
    };
    const before = structuredClone(report);
    const a = await w.m<{ actionId: string }>("actions:create", args);
    const b = await w.m<{ actionId: string }>("actions:create", args);
    expect(b.actionId).toBe(a.actionId);
    expect(w.rows("closeReports").find((r) => r._id === report._id)).toEqual(
      before,
    );
    expect(await w.code("actions:create", { ...args, sourceItem: 9 })).toBe(
      "INVALID_INPUT",
    );
  });
  it("paginates own work and never returns a peer's action", async () => {
    await w.as("maria.m");
    for (let i = 0; i < 12; i++)
      await w.m("actions:create", {
        venueId: w.venue("v1")._id,
        assigneeId: w.user(i === 0 ? "tom.b" : "ana.p")._id,
        instructions,
        dueAt: Date.now() + 3600_000,
      });
    await w.as("ana.p");
    let cursor: string | null = null;
    const ids: string[] = [];
    for (let n = 0; n < 5; n++) {
      const result: {
        page: Array<{ _id: string }>;
        isDone: boolean;
        continueCursor: string;
      } = await w.q("actions:list", {
        venueId: w.venue("v1")._id,
        scope: "mine",
        archive: false,
        paginationOpts: { numItems: 3, cursor },
      });
      ids.push(...result.page.map((a) => a._id));
      if (result.isDone) break;
      cursor = result.continueCursor;
    }
    expect(new Set(ids).size).toBe(11);
    expect(
      await w.qcode("actions:list", {
        venueId: w.venue("v1")._id,
        scope: "supervised",
        archive: false,
        paginationOpts,
      }),
    ).toBe("FORBIDDEN");
  });
  it("escalates overdue work once per stage, preserves deadline and stops after closure", async () => {
    const { actionId } = await create();
    const dueAt = Number(w.rows("operatingActions")[0]!.dueAt);
    vi.useFakeTimers();
    vi.setSystemTime(dueAt + 1);
    await w.m("actions:sweep");
    const state = await w.q<{ reasons: Array<{ key: string }> }>(
      "reports:venueState",
      { venueId: w.venue("v1")._id },
    );
    expect(state.reasons.some((r) => r.key === "actionsOverdue")).toBe(true);
    const count = () =>
      w
        .rows("operatingActionEvents")
        .filter((e) => e.actionId === actionId && e.command === "escalated")
        .length;
    expect(count()).toBe(1);
    await w.m("actions:sweep");
    expect(count()).toBe(1);
    vi.setSystemTime(dueAt + 24 * 3600_000 + 1);
    await w.m("actions:sweep");
    expect(count()).toBe(2);
    vi.setSystemTime(dueAt + 48 * 3600_000 + 1);
    await w.m("actions:sweep");
    expect(count()).toBe(3);
    expect(w.rows("operatingActions")[0]!.dueAt).toBe(dueAt);
    await transition(
      actionId,
      1,
      "cancel",
      "The item was replaced by an approved maintenance plan.",
    );
    vi.setSystemTime(dueAt + 96 * 3600_000);
    await w.m("actions:sweep");
    expect(count()).toBe(3);
  });
});
