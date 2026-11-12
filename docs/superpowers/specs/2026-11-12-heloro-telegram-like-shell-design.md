# HELORO Telegram-like Interface Foundation — Design

**Status:** User-directed implementation baseline, 2026-11-12.
**Intent:** Give HELORO a coherent, polished messenger shell with Telegram-familiar navigation and settings while retaining HELORO's own identity.
**Audience:** HELORO users, primarily on Android/mobile browsers.

## Goals

- Make the hamburger menu open a compact navigation drawer rather than jumping straight into settings.
- Provide a clear settings information architecture: Account, Notifications, Privacy, Devices, Appearance, Language, Chats, Storage and data, Help, HELORO PLUS, and staff-only HELORO S.
- Make light/dark/system appearance selection persist locally and apply throughout the app.
- Preserve RU/EN, existing account flows, personal chat, Heloro New, Support Heloro, complaint flow, verification marks, and staff permissions.
- Keep mobile navigation usable at narrow widths and respect reduced-motion preferences.
- Make unavailable server-backed sections visibly unavailable; no control may imply that a feature works when it is not implemented.

## Non-goals for this slice

- This is not a complete Telegram clone and does not copy Telegram branding, logos, artwork, or proprietary assets.
- Do not claim that calls, stories, polls, folders, media messages, message reactions, pinned messages, bot creation, communities, disappearing messages, AI features, or cross-device notification/device controls are implemented.
- Do not change database schemas or authentication behavior in this UI-foundation slice.
- Do not introduce a paid service, domain, dependency, plan upgrade, or paid integration.

## Approaches considered

1. Add more buttons to the current modal. Fast, but it would leave navigation and settings cramped, especially on phones.
2. Replace the current messenger with a different UI framework. Higher risk and unnecessary because the current React/Vite shell already works.
3. Extend the existing React shell with a dedicated navigation drawer, structured settings view, and persisted local appearance preference. **Selected** because it preserves the current code and backend, improves the whole app shell, and can be verified without pretending to ship server capabilities.

## Design decisions

- Platform remains React + TypeScript + Vite, with existing Lucide icons and CSS.
- HELORO keeps its H mark, blue/turquoise/white palette, and subtle gold accent; Telegram is UX reference only.
- Navigation actions with existing implementations (Messages, Contacts/Search, Settings, Support, and HELORO S for staff) are active.
- Calls, Stories, Saved Messages, Bots, and other not-yet-backed areas are displayed as explicitly forthcoming, disabled destinations rather than fake live features.
- Settings sections that depend on absent backend controls show a clear availability note. Account, language, Help, staff access, and appearance remain functional.
- Theme preference is versioned and stored in browser local storage; it is device-local, not synchronized to other devices.
- Future server-backed capabilities are separate deliverables with migrations, RLS, Realtime, abuse controls, and end-to-end tests.

## Follow-on capability groups

1. Core chat experience: folders, Saved Messages, pinning, reactions, polls, message search and formatting.
2. Media and presence: file/photo/video attachments, voice notes, round video messages, stories, and notification delivery.
3. Communities: groups, channels, threads, member roles/tags, and disappearing messages with moderation.
4. Bot platform: Bot Studio, no-code builder, isolated optional Lua runtime, granular permissions, revocation, anti-phishing, and audit logs. Bots must never receive passwords, sign-in codes, 2FA codes, or session tokens.
5. Calls and advanced Telegram-inspired updates: only after selecting and verifying free-compatible infrastructure and age-appropriate privacy/safety controls.

## Acceptance criteria

- Hamburger opens the navigation drawer and Escape/backdrop closes it.
- Existing working destinations still open the same existing views.
- Staff tools are not exposed to non-staff.
- Appearance preference supports light, dark, and system; preference survives reload and invalid/corrupt preference data safely falls back to system.
- Settings are navigable by keyboard and touch; small-screen layout remains readable.
- RU/EN labels are provided for all new navigation and settings content.
- Existing authentication, direct-message, official-space, and reporting logic is unchanged.
- Automated tests and production build pass; visual phone acceptance and two-account E2E remain separate checks.
