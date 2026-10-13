// Loads the preview engine on demand: it bundles every Convex module, so it stays out of the routes' first load.
// Convex warns when its functions load in a browser (a guard against shipping server code by mistake); preview mode
// does it on purpose (ADR 0018), so the documented opt-out is set first, only here.
let engine: Promise<typeof import("./engine")> | null = null;
export const loadEngine = () => {
  if (typeof window !== "undefined") (window as { __convexAllowFunctionsInBrowser?: boolean }).__convexAllowFunctionsInBrowser = true;
  return (engine ??= import("./engine"));
};
