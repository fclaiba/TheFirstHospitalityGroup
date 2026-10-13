#!/usr/bin/env node
// Fails CI when a money field appears in the data model or the shared schemas (ADR 0018).
// Scope: convex/schema.ts and schemas/**/*.ts. Skips quietly until those files exist (Sprint 0).
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const BANNED = /\b(price|prices|priceCents|cost|costCents|avgCost\w*|sales|netSales\w*|revenue|amount|amountCents|cents|salary|wage|wages|payRate|rateCents|tipAmount|tips?Cents|comp(s)?Cents|void(s)?Cents)\b/i;
const ALLOW = /no-money-allow/; // put this comment on a line that must mention a word legitimately

function files(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".ts") ? [p] : [];
  });
}

const targets = [...(existsSync("convex/schema.ts") ? ["convex/schema.ts"] : []), ...files("schemas")];
if (targets.length === 0) {
  console.log("no-money-check: nothing to check yet");
  process.exit(0);
}
const hits = [];
for (const f of targets) {
  readFileSync(f, "utf8").split("\n").forEach((line, i) => {
    if (BANNED.test(line) && !ALLOW.test(line)) hits.push(`${f}:${i + 1}: ${line.trim()}`);
  });
}
if (hits.length) {
  console.error("no-money-check failed (ADR 0018). Money fields found:\n" + hits.join("\n"));
  process.exit(1);
}
console.log(`no-money-check: ${targets.length} files clean`);
