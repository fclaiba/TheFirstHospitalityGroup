// First-paint preferences (BLUEPRINT 6.3): `<largeText 0|1>.<theme>` in a cookie, read by the root layout.
export const PREFS_COOKIE = "tf_prefs";

export function parsePrefs(raw: string | undefined): { largeText: boolean; theme: "system" | "light" | "dark" } {
  const [large, theme] = (raw ?? "").split(".");
  return { largeText: large === "1", theme: theme === "light" || theme === "dark" ? theme : "system" };
}
