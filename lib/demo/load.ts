// Loads the preview engine on demand: it bundles every Convex module, so it stays out of the routes' first load.
let engine: Promise<typeof import("./engine")> | null = null;
export const loadEngine = () => (engine ??= import("./engine"));
