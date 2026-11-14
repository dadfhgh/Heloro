# HELORO Dual Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional, privacy-limited Amplitude + PostHog tracking to HELORO without changing production behavior until the owner explicitly enables analytics after privacy and residency checks.

**Architecture:** A single typed analytics module initializes both browser SDKs only when the explicit enable flag and every required provider setting are valid. It sends a small, typed set of successful product actions to Amplitude, technical failures to PostHog, and agreed lifecycle milestones to both. Supabase Auth UUID is the only analytics identity; logout resets both SDKs.

**Tech Stack:** React 19, TypeScript, Vite, Supabase Auth, `posthog-js@1`, `@amplitude/analytics-browser@2`, Vitest.

**Spec:** [HELORO Product Analytics & Data Blueprint](https://app.notion.com/p/418037b0bc0781599c3de3d7204717e9)

## Global Constraints

- `VITE_ANALYTICS_ENABLED` defaults to `false`; production remains silent until explicitly enabled.
- Require PostHog token + HTTPS host, Amplitude API key + explicit `EU` or `US` data zone before either SDK starts.
- PostHog host uses the verified EU ingestion host `https://eu.i.posthog.com`; no provider secrets/tokens are committed.
- Browser SDK package installation must use npm; do not manually edit dependency manifests.
- No autocapture, pageviews, pageleave events, form capture, network capture, session replay, or automatic URL enrichment.
- Amplitude uses `autocapture: false`, `disableCookies: true`, `identityStorage: "none"`, and disables IP/language/platform tracking options.
- PostHog uses in-memory persistence, disables autocapture/pageview/pageleave and session recording.
- Never send message contents, usernames, display names, emails, phone numbers, conversation/message IDs, private URLs, auth tokens, cookies, IPs, or precise location.
- Identify only with Supabase Auth UUID and reset on sign-out.
- Analytics failures must not delay or break authentication, profile, conversation, or messaging flows.
- Do not enable live collection, dashboards, experiments, or paid usage. Amplitude region and billing status remain to be checked.

## Review Focus

- Analytics flag is unset or false: app must behave exactly as before and send no events.
- Analytics flag is true but one provider key, host, or region is missing/invalid: both SDKs stay off.
- User signs in, refreshes, and signs out: identity is stable while authenticated and reset after logout, without duplicate identify calls.
- Supabase insert/RPC fails: app retains its existing error behavior and no private error text is transmitted.
- Message body contains arbitrary text or media metadata: no content, identifiers, or URLs are sent to analytics.

---

### Task 1: Install the official SDK dependencies

**Files:**
- Modify via npm: `package.json`, `package-lock.json`
- Temporary: `.github/workflows/install-analytics-deps.yml` (remove after bootstrap)

**Interfaces:**
- Produces: npm-managed dependencies `posthog-js@1` and `@amplitude/analytics-browser@2`.

- [ ] Run `npm install posthog-js@1 @amplitude/analytics-browser@2 --save` on a GitHub-hosted runner.
- [ ] Run `npm run build` against the unchanged application.
- [ ] Commit only the npm-generated manifest and lockfile; remove the temporary installer workflow before opening the implementation PR.

### Task 2: Implement a fail-closed, typed analytics client

**Files:**
- Create: `src/lib/analytics-config.ts`
- Create: `src/lib/analytics-config.test.ts`
- Create: `src/lib/analytics.ts`
- Modify: `.env.example`, `src/main.tsx`

**Interfaces:**
- `resolveAnalyticsConfig(env)` returns an enabled configuration only when the explicit flag and both providers' required settings are valid.
- `initializeAnalytics()` initializes the two SDKs at most once.
- `identifyAnalyticsUser(userId: string | null)` sets the Supabase UUID or resets both providers.
- `trackSharedMilestone(name, properties?)`, `trackProductEvent(name, properties?)`, and `trackEngineeringEvent(name, properties?)` route typed events to the agreed destinations.

- [ ] Write tests for disabled-by-default, valid dual configuration, missing credentials, missing host, and invalid Amplitude zone.
- [ ] Run the focused test and confirm RED because the resolver is not implemented.
- [ ] Implement the resolver and SDK wrappers with safe no-op behavior when disabled.
- [ ] Run focused tests and confirm GREEN.
- [ ] Add the environment variable names with empty values to `.env.example`; keep `VITE_ANALYTICS_ENABLED=false`.
- [ ] Initialize the analytics client once in `src/main.tsx`.

### Task 3: Instrument confirmed user actions and verify

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/features/auth/AuthScreen.tsx`
- Modify: `src/features/profile/ProfileSetup.tsx`
- Modify: `src/lib/messenger.ts`
- Create: `.github/workflows/analytics-verify.yml`

**Interfaces:**
- Supabase auth lifecycle calls `identifyAnalyticsUser(session.user.id)` and resets on logout.
- Successful sign-up with an immediate session and successful first profile setup emit milestone events without form data.
- Successful direct conversation RPC emits `direct_conversation_opened` without username or conversation ID.
- Successful text/media insert emits `message_send_succeeded` with only a safe message-kind category.
- Realtime incoming message emits `message_reply_received` with no sender/conversation/message IDs or body.
- Failed message operations emit a coarse technical failure category to PostHog only.

- [ ] Instrument only after the relevant Supabase operation succeeds.
- [ ] Ensure existing errors are rethrown unchanged; telemetry exceptions are swallowed.
- [ ] Add PR CI for `npm ci`, `npm test`, and `npm run build`.
- [ ] Run the full suite and production build via GitHub Actions.
- [ ] Review the final diff for sensitive properties and ensure no production secrets or environment values were committed.
- [ ] Open a pull request against `feat/heloro-presence-chat-dates-avatars`; do not merge or deploy to production.
