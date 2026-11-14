# HELORO Dual Analytics Implementation Plan

**Goal:** Add optional, privacy-limited Amplitude + PostHog event analytics without making the app dependent on analytics availability or collecting private communications.

**Architecture:** The browser sends a small allowlisted event envelope through the existing Supabase client to a Supabase Edge Function. The function requires a valid Supabase JWT, obtains the authenticated user's Supabase Auth UUID itself, validates the event and its properties, then forwards the event to Amplitude and/or PostHog over HTTPS using server-side secrets. No provider SDKs or provider keys are needed in the browser.

**Tech Stack:** React 19, TypeScript, Vite, existing `@supabase/supabase-js`, Supabase Edge Functions (Deno), native `fetch`, Vitest.

**Spec:** [HELORO Product Analytics & Data Blueprint](https://app.notion.com/p/418037b0bc0781599c3de3d7204717e9)

## Global Constraints

- Frontend gate: `VITE_ANALYTICS_ENABLED=false` by default. If unset or false, HELORO makes no analytics requests.
- Server gate: `ANALYTICS_ENABLED` must be exactly `true`; all provider configuration must also be present before any provider request occurs.
- Function `analytics-track` uses `verify_jwt=true` and separately verifies the access token with Supabase Auth `getUser()`.
- The server—not the client payload—supplies the person identifier from the verified Supabase Auth UUID.
- PostHog ingestion is restricted to the verified EU host `https://eu.i.posthog.com`.
- Amplitude ingestion requires an explicit data zone, `EU` or `US`, and uses the matching HTTP V2 endpoint. Do not set it until the real Amplitude project residency is confirmed.
- No autocapture, pageviews, form capture, network capture, session replay, automatic URL enrichment, or client-side provider SDKs.
- Never send message bodies, post/comment/support/report text, usernames, display names, emails, phone numbers, conversation/message IDs, private URLs, auth tokens, cookies, IPs, or precise location.
- Only `platform`, `locale`, `message_kind`, and `failure_category` are allowed properties, each with a small enumerated value set.
- Analytics requests are best-effort and cannot delay or break authentication, profile, conversation, or messaging flows.
- No paid tiers, add-ons, auto-reload, cards or pay-as-you-go. No production collection until notice/consent, audience age handling, retention, region and Free-plan restrictions are checked.

## Event Routing

| Event | Amplitude | PostHog |
| --- | --- | --- |
| `signup_completed` | Yes | Yes |
| `login_completed` | Yes | No |
| `profile_completed` | Yes | Yes |
| `direct_conversation_opened` | Yes | Yes |
| `message_send_succeeded` | Yes | Yes |
| `message_reply_received` | Yes | Yes |
| `message_send_failed` | No | Yes |

## Implementation Status — 2026-11-15

- **Implemented / deployed:** Supabase Edge Function `analytics-track`, version 2, status ACTIVE, `verify_jwt=true`. The function is read-only with respect to HELORO tables and makes no database writes.
- **Implemented in branch:** `src/lib/analytics.ts`, payload contract tests, signup/login/profile/chat event calls, and `supabase/functions/analytics-track/index.ts`.
- **Fail-closed:** The browser flag in `.env.example` is `false`. Supabase function configuration is treated as disabled unless `ANALYTICS_ENABLED=true` and both provider configurations are present. No provider secrets were added to Git or Notion.
- **Not tested:** Full frontend build, Vitest suite, browser-to-function request, and provider ingestion. GitHub-hosted checks have not returned a run for this draft branch; local npm registry access is unavailable in this execution environment.
- **Not enabled:** No production analytics event has intentionally been sent. PostHog's EU host is verified. Amplitude project residency, project API key and actual billing plan remain Unknown. The connected project context showed 2M event quota but is not proof of the active billing tier.
- **Outstanding:** Review privacy notice/consent and age protections for HELORO's audience; verify Amplitude region and Free-plan billing; add Edge Function secrets securely; only then enable both flags in the intended environment and test with two test accounts.

## Required Server Secrets (values must be added in Supabase Dashboard, never in Git/Notion)

- `ANALYTICS_ENABLED=false` until the privacy and residency checks are completed.
- `POSTHOG_PROJECT_TOKEN` — existing PostHog project token.
- `POSTHOG_HOST=https://eu.i.posthog.com`.
- `AMPLITUDE_API_KEY` — API key for the existing Amplitude project.
- `AMPLITUDE_SERVER_ZONE` — `EU` or `US`, based on the verified project setting.

Frontend environment:
- `VITE_ANALYTICS_ENABLED=false` in `.env.example`; change only in the target deployment environment after the checks above.

## Review Focus

- Missing/false frontend flag: app behaves exactly as before and sends no analytics request.
- Missing/false server flag or either provider configuration: function returns an accepted-but-not-sent response and makes no provider requests.
- Missing/invalid Supabase JWT: function returns 401; never accepts a client-supplied user ID.
- Unknown event or unknown property values: reject the event or drop the unsupported property.
- Authentication, profile save, conversation RPC and message insert failures continue to use their existing app behavior even if the analytics relay fails.
- Private message text and IDs must not appear in request payloads or provider properties.

