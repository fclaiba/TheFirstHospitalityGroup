// JS budget gate (BLUEPRINT 6.6, 15), ported from OSCURA: initial JS per route = the <script src> chunks in the server
// HTML, gzip-compressed, minus the framework runtime shared by every route. Usage: npm run build && npx next start -p
// 3300, then node scripts/measure-budgets.mjs http://localhost:3300
import { gzipSync } from "node:zlib";

const base = process.argv[2] ?? "http://localhost:3300";
const STAFF = 170;
const MANAGE = 230;
const BUDGETS = [
  { path: "/", label: "public: landing", kb: 120 },
  { path: "/login", label: "public: sign in", kb: 150 },
  { path: "/today", label: "staff: today", kb: STAFF },
  { path: "/tasks", label: "staff: tasks", kb: STAFF },
  { path: "/schedule", label: "staff: schedule", kb: STAFF },
  { path: "/menu", label: "staff: menu", kb: STAFF },
  { path: "/section", label: "staff: section", kb: STAFF },
  { path: "/bar", label: "staff: bar", kb: STAFF },
  { path: "/lead/floor", label: "lead: floor", kb: STAFF },
  { path: "/lead/pass", label: "lead: pass", kb: STAFF },
  { path: "/manage", label: "manage: shift", kb: STAFF },
  { path: "/manage/close", label: "manage: close", kb: STAFF },
  { path: "/manage/schedule", label: "manage: schedule", kb: MANAGE },
  { path: "/company", label: "company: venues", kb: MANAGE },
  { path: "/company/org", label: "company: org chart", kb: MANAGE },
];

const cache = new Map();
async function gz(url) {
  if (!cache.has(url)) {
    const body = Buffer.from(await (await fetch(url)).arrayBuffer());
    cache.set(url, gzipSync(body, { level: 9 }).length);
  }
  return cache.get(url);
}

async function scripts(path) {
  const html = await (await fetch(base + path, { redirect: "manual" })).text();
  const tags = [...html.matchAll(/<script([^>]*)>/g)].map((m) => m[1]).filter((a) => !/nomodule/i.test(a));
  return [...new Set(tags.map((a) => /src="([^"]+\.js[^"]*)"/.exec(a)?.[1]).filter(Boolean).map((s) => new URL(s, base).href))];
}

// Framework runtime (React, React DOM, Next router) = the chunks of a page with no client components.
const framework = new Set(await scripts("/legal/terms"));
let frameworkBytes = 0;
for (const src of framework) frameworkBytes += await gz(src);
console.log(`info  framework runtime (React, Next)                ${(frameworkBytes / 1024).toFixed(1).padStart(7)} KB gz, shared by every route`);

let failed = false;
for (const b of BUDGETS) {
  const srcs = await scripts(b.path);
  let total = 0;
  let own = 0;
  for (const src of srcs) {
    const n = await gz(src);
    total += n;
    if (!framework.has(src)) own += n;
  }
  const kb = own / 1024;
  const ok = kb <= b.kb;
  failed ||= !ok;
  console.log(`${ok ? "PASS" : "FAIL"}  ${b.label.padEnd(44)} route ${kb.toFixed(1).padStart(6)} KB gz, first load ${(total / 1024).toFixed(1)} KB  (route budget ${b.kb} KB)`);
}
process.exit(failed ? 1 : 0);
