// JS budget gate (BLUEPRINT 6.6, 15): initial JS per route = the <script src> chunks in the server HTML, gzip-compressed.
// Prefetched chunks for other routes are excluded. Usage: npm run build && npx next start -p 3200, then
//   node scripts/measure-budgets.mjs http://localhost:3200
import { gzipSync } from "node:zlib";

const base = process.argv[2] ?? "http://localhost:3100";
const BUDGETS = [
  { path: "/", label: "public: landing", kb: 150 },
  { path: "/registro", label: "public: registration", kb: 150 },
  { path: "/pase/demo", label: "pass route", kb: 150 },
  { path: "/staff/door", label: "door scanner (zxing-wasm lazy)", kb: 250 },
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
  const html = await (await fetch(base + path)).text();
  // nomodule polyfills are only fetched by legacy browsers.
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
