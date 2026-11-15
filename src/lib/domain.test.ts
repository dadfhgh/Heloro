import { afterEach, describe, expect, it, vi } from "vitest";
import { displayNameSchema, formatInboxTime, formatLastSeen, formatMessageDayLabel, formatMessageTime, initials, messageBodySchema, usernameSchema } from "./domain";

describe("usernameSchema", () => {
  it("normalizes usernames to lowercase", () => {
    expect(usernameSchema.parse("  HELORO_13 ")).toBe("heloro_13");
  });

  it("rejects too-short and unsupported usernames", () => {
    expect(usernameSchema.safeParse("ab").success).toBe(false);
    expect(usernameSchema.safeParse("hello-world").success).toBe(false);
  });
});

describe("messageBodySchema", () => {
  it("trims message whitespace", () => {
    expect(messageBodySchema.parse("  hello  ")).toBe("hello");
  });

  it("rejects empty and overly long messages", () => {
    expect(messageBodySchema.safeParse("   ").success).toBe(false);
    expect(messageBodySchema.safeParse("x".repeat(4001)).success).toBe(false);
  });
});

describe("displayNameSchema", () => {
  it("requires a non-empty display name", () => {
    expect(displayNameSchema.safeParse("  ").success).toBe(false);
    expect(displayNameSchema.parse(" Alex ")).toBe("Alex");
  });
});

describe("display helpers", () => {
  it("creates initials from a display name", () => {
    expect(initials("Alex Smith")).toBe("AS");
    expect(initials("")).toBe("H");
  });

  it("formats timestamps without throwing on invalid values", () => {
    expect(formatMessageTime("not-a-date")).toBe("");
    expect(formatInboxTime(null)).toBe("");
  });
});

describe("message day separators", () => {
  afterEach(() => vi.useRealTimers());

  it("shows day and month without the year for dates in the current year", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 15, 12, 0, 0));
    expect(formatMessageDayLabel(new Date(2026, 10, 14, 12, 0, 0).toISOString(), "ru")).toBe("14 ноября");
  });

  it("adds the year for dates from previous years", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 15, 12, 0, 0));
    expect(formatMessageDayLabel(new Date(2025, 10, 14, 12, 0, 0).toISOString(), "ru")).toBe("14 ноября 2025 г.");
  });

  it("does not replace dates with Today, Yesterday, or weekday labels", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 15, 12, 0, 0));
    expect(formatMessageDayLabel(new Date(2026, 10, 15, 12, 0, 0).toISOString(), "ru")).toBe("15 ноября");
  });

  it("uses an approximate label when exact last-seen time is hidden", () => {
    expect(formatLastSeen(null, "ru", true)).toBe("был(а) недавно");
  });

  it("keeps Telegram-style approximate privacy ranges", () => {
    expect(formatLastSeen(null, "ru", true, "within_week")).toBe("был(а) на этой неделе");
    expect(formatLastSeen(null, "ru", true, "within_month")).toBe("был(а) в этом месяце");
    expect(formatLastSeen(null, "ru", true, "long_ago")).toBe("был(а) давно");
  });
});
