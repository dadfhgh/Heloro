import { supabase } from "./supabase";

export type AnalyticsEvent =
  | "signup_completed"
  | "login_completed"
  | "profile_completed"
  | "direct_conversation_opened"
  | "message_send_succeeded"
  | "message_reply_received"
  | "message_send_failed";

export type AnalyticsPayload = {
  event: AnalyticsEvent;
  properties: {
    platform: "web";
    locale?: "ru" | "en";
    message_kind?: "text" | "media" | "sticker" | "gif";
    failure_category?: "validation" | "backend" | "upload" | "unknown";
  };
};

const messageEvents = new Set<AnalyticsEvent>([
  "message_send_succeeded",
  "message_reply_received",
]);

export function buildAnalyticsPayload(
  event: AnalyticsEvent,
  input: Record<string, unknown> = {},
): AnalyticsPayload {
  const properties: AnalyticsPayload["properties"] = { platform: "web" };

  if (input.locale === "ru" || input.locale === "en") {
    properties.locale = input.locale;
  }
  if (messageEvents.has(event) &&
      (input.message_kind === "text" || input.message_kind === "media" ||
       input.message_kind === "sticker" || input.message_kind === "gif")) {
    properties.message_kind = input.message_kind;
  }
  if (event === "message_send_failed" &&
      (input.failure_category === "validation" || input.failure_category === "backend" ||
       input.failure_category === "upload" || input.failure_category === "unknown")) {
    properties.failure_category = input.failure_category;
  }

  return { event, properties };
}

const analyticsEnabled = import.meta.env.VITE_ANALYTICS_ENABLED === "true";

/**
 * Best-effort event relay. It never blocks or changes HELORO's primary operation.
 * The server verifies the Supabase JWT and supplies the pseudonymous user ID.
 */
export function trackAnalyticsEvent(
  event: AnalyticsEvent,
  properties: Record<string, unknown> = {},
): void {
  if (!analyticsEnabled || !supabase) return;

  const payload = buildAnalyticsPayload(event, properties);
  try {
    void supabase.functions
      .invoke("analytics-track", { body: payload })
      .then(() => undefined)
      .catch(() => undefined);
  } catch {
    // Analytics must never break authentication, profile, chat, or messaging.
  }
}
