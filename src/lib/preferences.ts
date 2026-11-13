export type ThemePreference = "system" | "light" | "dark";

const PREFERENCE_VERSION = 1;

export function parseThemePreference(raw: string | null): ThemePreference {
  if (!raw) return "system";

  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === "object" &&
      value !== null &&
      "version" in value &&
      "theme" in value &&
      value.version === PREFERENCE_VERSION &&
      (value.theme === "system" || value.theme === "light" || value.theme === "dark")
    ) {
      return value.theme;
    }
  } catch {
    // Invalid local preference data must never prevent the app from loading.
  }

  return "system";
}

export function serializeThemePreference(theme: ThemePreference): string {
  return JSON.stringify({ version: PREFERENCE_VERSION, theme });
}
