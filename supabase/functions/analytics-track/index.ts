import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

type AnalyticsEvent =
  | "signup_completed"
  | "login_completed"
  | "profile_completed"
  | "direct_conversation_opened"
  | "message_send_succeeded"
  | "message_reply_received"
  | "message_send_failed";

type SafeProperties = {
  platform?: "web";
  locale?: "ru" | "en";
  message_kind?: "text" | "media" | "sticker" | "gif";
  failure_category?: "validation" | "backend" | "upload" | "unknown";
};

const DESTINATIONS: Record<AnalyticsEvent, Array<"posthog" | "amplitude">> = {
  signup_completed: ["posthog", "amplitude"],
  login_completed: ["amplitude"],
  profile_completed: ["posthog", "amplitude"],
  direct_conversation_opened: ["posthog", "amplitude"],
  message_send_succeeded: ["posthog", "amplitude"],
  message_reply_received: ["posthog", "amplitude"],
  message_send_failed: ["posthog"],
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

function safeProperties(input: unknown): SafeProperties {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const raw = input as Record<string, unknown>;
  const safe: SafeProperties = {};

  if (raw.platform === "web") safe.platform = "web";
  if (raw.locale === "ru" || raw.locale === "en") safe.locale = raw.locale;
  if (raw.message_kind === "text" || raw.message_kind === "media" ||
      raw.message_kind === "sticker" || raw.message_kind === "gif") {
    safe.message_kind = raw.message_kind;
  }
  if (raw.failure_category === "validation" || raw.failure_category === "backend" ||
      raw.failure_category === "upload" || raw.failure_category === "unknown") {
    safe.failure_category = raw.failure_category;
  }
  return safe;
}

function providerConfig() {
  const enabled = Deno.env.get("ANALYTICS_ENABLED") === "true";
  const posthogToken = Deno.env.get("POSTHOG_PROJECT_TOKEN")?.trim() ?? "";
  const posthogHost = Deno.env.get("POSTHOG_HOST")?.trim() ?? "";
  const amplitudeKey = Deno.env.get("AMPLITUDE_API_KEY")?.trim() ?? "";
  const amplitudeZone = Deno.env.get("AMPLITUDE_SERVER_ZONE")?.trim().toUpperCase() ?? "";

  const posthogReady = posthogToken.length > 0 && posthogHost === "https://eu.i.posthog.com";
  const amplitudeReady = amplitudeKey.length > 0 &&
    (amplitudeZone === "EU" || amplitudeZone === "US");

  return {
    enabled,
    posthogReady,
    posthogToken,
    posthogHost,
    amplitudeReady,
    amplitudeKey,
    amplitudeEndpoint: amplitudeZone === "EU"
      ? "https://api.eu.amplitude.com/2/httpapi"
      : "https://api2.amplitude.com/2/httpapi",
  };
}

async function capturePostHog(
  config: ReturnType<typeof providerConfig>,
  userId: string,
  event: AnalyticsEvent,
  properties: SafeProperties,
): Promise<boolean> {
  const response = await fetch(config.posthogHost + "/i/v0/e/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: config.posthogToken,
      distinct_id: userId,
      event,
      properties: { ...properties, $process_person_profile: false },
      timestamp: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(5000),
  });
  return response.ok;
}

async function captureAmplitude(
  config: ReturnType<typeof providerConfig>,
  userId: string,
  event: AnalyticsEvent,
  properties: SafeProperties,
): Promise<boolean> {
  const response = await fetch(config.amplitudeEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      api_key: config.amplitudeKey,
      events: [{
        user_id: userId,
        event_type: event,
        event_properties: properties,
        time: Date.now(),
      }],
    }),
    signal: AbortSignal.timeout(5000),
  });
  return response.ok;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  const accessToken = authorization.slice("Bearer ".length).trim();
  if (!accessToken || accessToken.length > 8192) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  let publishableKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!publishableKey) {
    try {
      const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}");
      publishableKey = typeof keys.default === "string" ? keys.default : "";
    } catch {
      publishableKey = "";
    }
  }
  if (!supabaseUrl || !publishableKey) {
    return jsonResponse({ error: "service_unavailable" }, 503);
  }

  const authClient = createClient(supabaseUrl, publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);
  if (authError || !authData.user?.id) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const contentLength = Number(request.headers.get("Content-Length") ?? "0");
  if (contentLength > 4096) return jsonResponse({ error: "payload_too_large" }, 413);

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 4096) return jsonResponse({ error: "payload_too_large" }, 413);
    body = JSON.parse(raw);
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonResponse({ error: "invalid_payload" }, 400);
  }

  const payload = body as Record<string, unknown>;
  const event = payload.event;
  if (typeof event !== "string" || !(event in DESTINATIONS)) {
    return jsonResponse({ error: "event_not_allowed" }, 400);
  }

  const typedEvent = event as AnalyticsEvent;
  const properties = safeProperties(payload.properties);
  const config = providerConfig();

  // Analytics is explicitly opt-in and fail-closed. Missing settings never trigger provider requests.
  if (!config.enabled || !config.posthogReady || !config.amplitudeReady) {
    return jsonResponse({ ok: true, sent: false, reason: "analytics_disabled_or_unconfigured" }, 202);
  }

  const destinations = DESTINATIONS[typedEvent];
  const tasks: Array<Promise<boolean>> = [];
  if (destinations.includes("posthog")) {
    tasks.push(capturePostHog(config, authData.user.id, typedEvent, properties));
  }
  if (destinations.includes("amplitude")) {
    tasks.push(captureAmplitude(config, authData.user.id, typedEvent, properties));
  }

  const results = await Promise.allSettled(tasks);
  const sent = results.length > 0 && results.every((result) => result.status === "fulfilled" && result.value);
  return jsonResponse({ ok: true, sent }, 202);
});
