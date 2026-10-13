import { NextResponse } from "next/server";

/** Uptime probe (BLUEPRINT 9.7). Checks the web tier and, when configured, one Convex HTTP endpoint. */
export async function GET() {
  const site = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  let convex: "ok" | "down" | "not_configured" = "not_configured";
  if (site) {
    try {
      const res = await fetch(`${site}/health`, { cache: "no-store", signal: AbortSignal.timeout(3000) });
      convex = res.ok ? "ok" : "down";
    } catch {
      convex = "down";
    }
  }
  const ok = convex !== "down";
  return NextResponse.json({ ok, web: "ok", convex, at: new Date().toISOString() }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
