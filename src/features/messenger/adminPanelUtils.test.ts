import { describe, expect, it } from "vitest";
import {
  adminErrorMessage,
  escapeAdminLikePattern,
  isMissingAdminBackendError,
  normalizeAdminSearch,
} from "./adminPanelUtils";

describe("admin panel utilities", () => {
  it("keeps underscores in @usernames", () => {
    expect(normalizeAdminSearch("  @epic_sans  ")).toBe("epic_sans");
  });

  it("escapes LIKE metacharacters without deleting valid characters", () => {
    expect(escapeAdminLikePattern("epic_sans%")).toBe("epic\\_sans\\%");
  });

  it("recognizes missing admin backend functions and tables", () => {
    expect(isMissingAdminBackendError({ code: "PGRST202", message: "Function not found" })).toBe(true);
    expect(isMissingAdminBackendError({ code: "42P01", message: "relation does not exist" })).toBe(true);
    expect(isMissingAdminBackendError({ code: "42501", message: "permission denied" })).toBe(false);
  });

  it("explains missing backend migrations in the active language", () => {
    expect(adminErrorMessage({ code: "PGRST202" }, "Не удалось загрузить.", "ru"))
      .toContain("миграции Supabase отсутствуют");
    expect(adminErrorMessage({ code: "PGRST202" }, "Could not load.", "en"))
      .toContain("Required Supabase migrations are missing");
  });

  it("maps server permission errors to a clear message", () => {
    expect(adminErrorMessage({ code: "42501" }, "Не удалось.", "ru"))
      .toBe("Недостаточно прав для этого действия.");
  });

  it("uses the fallback when an error has no useful message", () => {
    expect(adminErrorMessage({}, "Could not load.", "en")).toBe("Could not load.");
  });
});
