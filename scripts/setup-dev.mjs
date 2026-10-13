// Local setup helper (ADR 0006, 0008). Generates the auth keys and the bridge secret and writes them to .env.local if missing.
// It never contacts Convex: it prints the `npx convex env set` commands to run once a deployment is linked.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { generateKeyPairSync, randomBytes } from "node:crypto";

const file = ".env.local";
const current = existsSync(file) ? readFileSync(file, "utf8") : "";
const has = (k) => new RegExp(`^${k}=.+`, "m").test(current);

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const values = {
  NEXT_PUBLIC_SITE_URL: "http://localhost:3300",
  SITE_URL: "http://localhost:3300",
  AUTH_ISSUER: "http://localhost:3300",
  AUTH_PRIVATE_KEY: Buffer.from(privateKey.export({ type: "pkcs8", format: "pem" })).toString("base64"),
  AUTH_PUBLIC_KEY: Buffer.from(publicKey.export({ type: "spki", format: "pem" })).toString("base64"),
  AUTH_BRIDGE_SECRET: randomBytes(32).toString("base64url"),
};

const added = Object.entries(values).filter(([k]) => !has(k));
if (added.length) {
  writeFileSync(file, `${current.trimEnd()}\n\n# Added by scripts/setup-dev.mjs\n${added.map(([k, v]) => `${k}=${v}`).join("\n")}\n`.trimStart());
  console.log(`Wrote ${added.length} values to ${file}: ${added.map(([k]) => k).join(", ")}`);
} else {
  console.log(`${file} already has every development value.`);
}

const env = Object.fromEntries((existsSync(file) ? readFileSync(file, "utf8") : "").split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
console.log(`
When you link your Convex deployment (npx convex dev), set the backend variables there too:
  npx convex env set AUTH_ISSUER http://localhost:3300
  npx convex env set AUTH_BRIDGE_SECRET ${env.AUTH_BRIDGE_SECRET ?? "<from .env.local>"}
  npx convex env set SITE_URL http://localhost:3300
  npx convex env set OWNER_EMAILS you@example.com,partner@example.com
  npx convex env set RESEND_API_KEY <key>          (optional: without it emails are logged)
Then seed:  npx convex run seed:dev
Until then the app runs in preview mode (no NEXT_PUBLIC_CONVEX_URL).`);
