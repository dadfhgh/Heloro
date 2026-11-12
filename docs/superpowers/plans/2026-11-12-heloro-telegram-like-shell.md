# HELORO Telegram-like UI Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement the plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a polished Telegram-familiar navigation/settings shell and persistent appearance preference to HELORO without misrepresenting backend features.

**Architecture:** Keep the existing React/Vite messenger and CSS. Add a small versioned preference helper, a dedicated navigation/settings component, and explicit theme state at the app root. Existing server-backed screens remain unchanged.

**Tech Stack:** React 19, TypeScript, Vite, Lucide React, Vitest, plain CSS.

**Spec:** `docs/superpowers/specs/2026-11-12-heloro-telegram-like-shell-design.md`

## Global Constraints

- Preserve HELORO branding and the RU/EN language switch.
- No Telegram logos, brand assets, proprietary artwork, or copied code.
- Do not add paid services, dependencies, domains, or plans.
- Do not expose placeholder controls as implemented functionality.
- Do not change Supabase schema, policies, auth, or message behavior in this slice.
- Keep mobile-first behavior and `prefers-reduced-motion`.

## Review Focus

- Corrupt or unknown local preference data must fall back to system theme.
- Storage may be unavailable or throw; the messenger must remain usable.
- Keyboard Escape and backdrop clicks close the drawer without triggering nested controls.
- Non-staff users must not see HELORO S navigation.
- Narrow mobile screens must not overflow horizontally.
- English and Russian labels must stay consistent.

---

### Task 1: Versioned appearance preference helper

**Files:**
- Create: `src/lib/preferences.test.ts`
- Create: `src/lib/preferences.ts`

**Interfaces:**
- `ThemePreference = "system" | "light" | "dark"`
- `parseThemePreference(raw: string | null): ThemePreference`
- `serializeThemePreference(theme: ThemePreference): string`

- [ ] Add tests for the default, valid values, corrupt JSON, unknown version/value, and round-trip serialization.
- [ ] Run the focused test and verify it fails because the helper is absent.
- [ ] Implement the parser/serializer with a versioned payload and safe fallback.
- [ ] Run the focused test and then the full `npm test` suite.

### Task 2: App-level theme state

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/features/messenger/MessengerApp.tsx`

**Interfaces:**
- Pass `theme: ThemePreference` and `onThemeChange(next: ThemePreference): void` to MessengerApp.
- Apply the resolved theme on the document root; persist the selected preference safely.

- [ ] Add the state and storage wiring.
- [ ] Run TypeScript build and tests.

### Task 3: Navigation drawer and structured settings

**Files:**
- Create: `src/features/messenger/MessengerNavigation.tsx`
- Modify: `src/features/messenger/MessengerApp.tsx`

**Interfaces:**
- Drawer active routes: Messages, Contacts/Search, Settings, Help/Support and staff-only HELORO S.
- Forthcoming destinations are visibly disabled.
- Settings categories: Account, Notifications, Privacy, Devices, Appearance, Language, Chats, Storage and data, Help, HELORO PLUS, HELORO S.
- Existing sign-out, locale switch, support navigation, and staff-only routing stay functional.

- [ ] Add accessible drawer and settings view components.
- [ ] Wire existing actions to existing handlers; do not create fake server controls.
- [ ] Run TypeScript build and all tests.

### Task 4: Responsive light/dark design

**Files:**
- Modify: `src/styles.css`

- [ ] Style drawer, navigation items, settings sections, availability notes, and theme controls.
- [ ] Add dark theme coverage for the messenger, settings, menus, and modal surfaces.
- [ ] Verify mobile breakpoints, focus indicators, and reduced motion.

### Task 5: Verification and handoff

**Files:** no additional application files.

- [ ] Run all automated tests.
- [ ] Run `npm run build`.
- [ ] Review the diff and ensure server-dependent features are clearly marked as not yet available.
- [ ] Open a PR and inspect the exact CI results before merging.
- [ ] After successful merge, verify GitHub Pages deployment and update Notion with evidence and remaining blockers.
