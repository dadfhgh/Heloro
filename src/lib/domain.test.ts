import { describe, expect, it } from "vitest";
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

describe("chat date and presence labels", () => {
  const now = new Date(2026, 10, 14, 10, 0, 0);

  it("labels the first message of each local calendar day", () => {
    expect(formatMessageDayLabel(new Date(2026, 10, 14, 0, 1).toISOString(), "ru", now)).toBe("Сегодня");
    expect(formatMessageDayLabel(new Date(2026, 10, 13, 23, 59).toISOString(), "ru", now)).toBe("Вчера");
    expect(formatMessageDayLabel(new Date(2026, 10, 12, 12, 0).toISOString(), "en", now)).toContain("November");
  });

  it("formats a visible last-seen timestamp in the local calendar", () => {
    expect(formatLastSeen(new Date(2026, 10, 13, 18, 30).toISOString(), "ru", now)).toContain("вчера");
    expect(formatLastSeen(new Date(2026, 10, 14, 9, 45).toISOString(), "en", now)).toContain("today");
  });

  it("does not show a timestamp that is implausibly in the future", () => {
    expect(formatLastSeen(new Date(2026, 10, 14, 12, 0).toISOString(), "ru", now)).toBe("");
  });
});
