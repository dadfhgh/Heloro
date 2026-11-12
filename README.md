# HELORO

HELORO is an Android-first messenger foundation built with React, TypeScript, Vite and Supabase.

## Current scope

- Email/password authentication through Supabase Auth
- Profile setup with a unique `@username`
- Private one-to-one conversations
- Server-persisted text messages
- Realtime incoming-message updates
- PostgreSQL Row Level Security (RLS) for profiles, conversations, memberships and messages
- Responsive glassmorphism interface with reduced-motion support

## Status

The source code and database migration are committed. A Supabase project has **not** been provisioned or connected by this repository. The app will show a setup screen until its own Supabase URL and publishable key are configured. Do not treat the app as an operational messenger until the backend migration, environment variables, auth URLs, build and two-account tests are complete.

## Setup

1. Create a Supabase project for HELORO.
2. Open the SQL Editor and run the migration at `supabase/migrations/202611120001_init_heloro.sql`.
3. In Supabase Authentication settings, enable email/password sign-up and configure the allowed redirect URLs for local and deployed app origins.
4. Copy `.env.example` to `.env.local` and set:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
5. Install dependencies and start the app:

```bash
npm install
npm run dev
```

## Checks

```bash
npm test
npm run build
```

## Security notes

- Only the Supabase publishable key belongs in browser configuration. Never expose a Supabase secret or legacy `service_role` key in client code.
- RLS is enabled on every exposed application table. Conversation creation is performed by a constrained database function.
- Realtime subscriptions are scoped to the active conversation and removed on unmount.
- Before public release, run Supabase database/RLS tests, test with two separate accounts, configure email delivery and redirects, and review abuse-reporting, blocking, rate-limits and privacy requirements.

## Engineering conventions

Small focused modules, strict TypeScript, runtime validation at boundaries, explicit error states, pure domain validation, accessible controls, and reduced-motion-aware interactions. Keep secrets out of Git and keep long-term product decisions in Notion; source code stays in GitHub.
