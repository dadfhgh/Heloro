import { describe, expect, it } from "vitest";
import { buildAnalyticsPayload } from "./analytics";

describe("buildAnalyticsPayload", () => {
  it("keeps only approved properties for message events", () => {
    expect(buildAnalyticsPayload("message_send_succeeded", {
      locale: "ru",
      message_kind: "text",
      body: "private message content",
      conversation_id: "private-conversation-id",
      username: "private-name",
    })).toEqual({
      event: "message_send_succeeded",
      properties: {
        platform: "web",
        locale: "ru",
        message_kind: "text",
      },
    });
  });

  it("does not accept message properties on authentication events", () => {
    expect(buildAnalyticsPayload("login_completed", {
      locale: "en",
      message_kind: "media",
      email: "private@example.com",
    })).toEqual({
      event: "login_completed",
      properties: {
        platform: "web",
        locale: "en",
      },
    });
  });

  it("accepts only the predefined technical failure categories", () => {
    expect(buildAnalyticsPayload("message_send_failed", {
      failure_category: "backend",
      error: "private backend error details",
    })).toEqual({
      event: "message_send_failed",
      properties: {
        platform: "web",
        failure_category: "backend",
      },
    });
  });
});
