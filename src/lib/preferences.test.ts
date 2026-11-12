import { describe, expect, it } from "vitest";
import { parseThemePreference, serializeThemePreference } from "./preferences";

describe("theme preference persistence", () => {
  it("defaults to system when no saved preference exists", () => {
    expect(parseThemePreference(null)).toBe("system");
  });

  it.each(["system", "light", "dark"] as const)("reads the %s theme", (theme) => {
    expect(parseThemePreference(JSON.stringify({ version: 1, theme }))).toBe(theme);
  });

  it("falls back to system for corrupt JSON", () => {
    expect(parseThemePreference("{not-json")).toBe("system");
  });

  it("falls back to system for unknown versions and values", () => {
    expect(parseThemePreference(JSON.stringify({ version: 2, theme: "dark" }))).toBe("system");
    expect(parseThemePreference(JSON.stringify({ version: 1, theme: "purple" }))).toBe("system");
  });

  it("serializes the versioned preference", () => {
    expect(JSON.parse(serializeThemePreference("dark"))).toEqual({ version: 1, theme: "dark" });
  });

  it("round-trips supported themes", () => {
    for (const theme of ["system", "light", "dark"] as const) {
      expect(parseThemePreference(serializeThemePreference(theme))).toBe(theme);
    }
  });
});
