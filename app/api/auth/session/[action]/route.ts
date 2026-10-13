import { NextResponse } from "next/server";
import { authConfigured, convexToken, jwks } from "@/lib/auth/session-server";

// Session token endpoints (ADR 0003, from OSCURA): the Convex client fetches short-lived tokens; Convex reads the JWKS.
export async function GET(_req: Request, ctx: RouteContext<"/api/auth/session/[action]">) {
  const { action } = await ctx.params;
  if (!authConfigured()) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  if (action === "jwks") return NextResponse.json(await jwks(), { headers: { "Cache-Control": "public, max-age=300" } });
  if (action === "token") {
    const token = await convexToken();
    // Signed out is a normal answer, not an error: 200 with a null token keeps consoles clean.
    return NextResponse.json(token ?? { token: null, exp: 0 }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}
