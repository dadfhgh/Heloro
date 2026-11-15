# HELORO multi-agent runtime (initial implementation)

## Implemented in source

- Ten specialist definitions, each with its own system prompt and responsibility.
- Each task is an independent model request with an isolated role prompt and task context.
- Provider adapter for OpenAI-compatible `/chat/completions` endpoints.
- Bounded batch scheduler (default concurrency: 2; maximum: 10).
- Structured results with explicit completed/failed status and timestamps.
- Unit tests for registry, role isolation, failure handling, ordering, and concurrency limits.

## Not implemented yet

- Agents do not run in the background merely because these files exist.
- No public HTTP endpoint, persistent task queue, scheduler, or deployment is enabled.
- Agents currently produce analysis/recommendations only. They have no direct GitHub, Supabase, Vercel, browser, or shell tools and cannot modify HELORO autonomously.
- No provider API key or paid model is included. A compatible model endpoint and a server-side secret are required before real inference can run.
- No credentials belong in source code, browser bundles, issues, or Notion.

## Ten roles

`coordinator`, `architect`, `frontend`, `backend`, `database`, `qa`, `security`, `design`, `devops`, `research`.

## Integration contract

Use `createOpenAICompatibleProvider` only in a trusted server runtime. Supply a provider base URL, a server-side API key, and a model identifier. Then call `runAgentTask` for one specialist or `runAgentBatch` for multiple independent tasks. Never pass the provider secret to frontend code.

## Safety gates before activation

1. Select a model provider with an explicit free-use allowance; verify current terms and limits first.
2. Configure the provider key only as a server-side secret. Do not paste it into chat or commit it.
3. Add authenticated task submission and authorization checks before exposing an endpoint.
4. Add a persistent queue, per-user quotas, request timeouts, cancellation, and audit-safe logs.
5. Add a restricted tool gateway with read-only defaults; require approval for writes, merges, production, live Supabase/Auth, or deployments.
6. Run provider-backed tests and a privacy review before enabling real users.

## Status

- Implemented in source: initial ten-agent registry and independent model-call runtime.
- Tested: pending GitHub CI on this branch.
- Deployed: no.
- Autonomous tool access: not implemented.
