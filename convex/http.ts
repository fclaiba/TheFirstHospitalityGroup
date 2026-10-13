// HTTP routes: health check for the uptime monitor and the deploy runbook (BLUEPRINT 9.7).
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

const http = httpRouter();

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } })),
});

export default http;
