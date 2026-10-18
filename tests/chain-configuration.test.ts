import { beforeEach, expect, test } from "vitest";
import { findChainCycle } from "../lib/domain/chain";
import { World } from "./support/engine";

let w: World;
beforeEach(async () => { w = await World.create(); await w.as("owner"); });
const name = { en: "Service runner", es: "Runner de servicio" };
const settings = () => ({ venueId: w.venue("v1")._id, position: "runner", reportsTo: "expo", previousReportsTo: null, localName: name, previousLocalName: null });

test("detects complete default/override cycles and accepts valid cross-area reporting", () => {
  expect(findChainCycle({})).toBeNull();
  expect(findChainCycle({ runner: "expo" })).toBeNull();
  expect(findChainCycle({ captain: "busser" })).toEqual(["captain", "busser", "captain"]);
  expect(findChainCycle({ owner: "owner" })).toEqual(["owner", "owner"]);
  expect(findChainCycle({ captain: "expo", expo: "server" })).not.toBeNull();
});
test("legacy chain updates reject a cycle before changing configuration or audit", async () => {
  const before = JSON.stringify(w.rows("chainOverrides"));
  const audit = w.rows("auditLogs").length;
  expect(await w.code("org:setChainOverride", {venueId:w.venue("v1")._id,position:"captain",reportsTo:"busser"})).toBe("INVALID_INPUT");
  expect(JSON.stringify(w.rows("chainOverrides"))).toBe(before);
  expect(w.rows("auditLogs")).toHaveLength(audit);
});
test("position names and chain save atomically, reject stale edits, and restore defaults", async () => {
  const initial = settings();
  await w.m("org:setPositionSettings", initial);
  expect(w.venue("v1").localNames).toContainEqual({position:"runner",name});
  expect(w.rows("chainOverrides")).toContainEqual(expect.objectContaining({position:"runner",reportsTo:"expo"}));
  const audit = w.rows("auditLogs").length;
  expect(await w.code("org:setPositionSettings", {...initial,localName:{en:"Wrong overwrite",es:"Cambio incorrecto"}})).toBe("VERSION_STALE");
  expect(w.venue("v1").localNames).toContainEqual({position:"runner",name});
  expect(w.rows("auditLogs")).toHaveLength(audit);
  await w.m("org:setPositionSettings", {...initial,previousReportsTo:"expo",previousLocalName:name,reportsTo:null,localName:null});
  expect(w.venue("v1").localNames.find((item:{position:string})=>item.position==="runner")).toBeUndefined();
  expect(w.rows("chainOverrides").find((item)=>item.position==="runner")).toBeUndefined();
  expect(w.rows("auditLogs")).toHaveLength(audit+2);
});
test("a rejected circular combined save leaves the existing name, override and audit intact", async () => {
  const before = JSON.stringify(w.venue("v1"));
  const rows = JSON.stringify(w.rows("chainOverrides"));
  const audit = w.rows("auditLogs").length;
  expect(await w.code("org:setPositionSettings", {...settings(),position:"captain",reportsTo:"busser"})).toBe("INVALID_INPUT");
  expect(JSON.stringify(w.venue("v1"))).toBe(before);
  expect(JSON.stringify(w.rows("chainOverrides"))).toBe(rows);
  expect(w.rows("auditLogs")).toHaveLength(audit);
});
test("position configuration remains corporate-only and validates bilingual names", async () => {
  await w.as("maria.m");
  expect(await w.code("org:setPositionSettings", settings())).toBe("FORBIDDEN");
  await w.as("owner");
  expect(await w.code("org:setPositionSettings", {...settings(),localName:{en:"Only one language",es:""}})).toBe("INVALID_INPUT");
});
