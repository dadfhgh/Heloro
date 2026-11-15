# HELORO multi-agent runtime

## Local free mode (recommended for development)

HELORO can use a local Ollama server without an API key, paid model, or cloud inference account.

1. Install Ollama on the Windows PC.
2. Download the small coding model: `ollama pull qwen2.5-coder:3b`.
3. Start Ollama; its local OpenAI-compatible API is `http://127.0.0.1:11434/v1`.
4. On the trusted local server only, create the provider with `createOllamaProvider()`.
5. Run batches with `runAgentBatch(tasks, provider, 1)` initially. One local model serves all ten isolated specialist prompts, sequentially, to reduce RAM/VRAM pressure.

The Ollama adapter:
- sends requests only to `localhost` / `127.0.0.1` / `[::1]`;
- does not send an Authorization header or API key;
- uses the installed local model `qwen2.5-coder:3b` by default;
- enforces a local request timeout and rejects remote base URLs.

The local Ollama API does not require authentication. Keep it bound to loopback; never expose port 11434 to the public internet.

## Ten independent specialist roles

`coordinator`, `architect`, `frontend`, `backend`, `database`, `qa`, `security`, `design`, `devops`, `research`.

Each role has a separate system prompt and each task is sent as an independent model request. They share one local model binary to keep the setup free and lightweight; they are not ten separate model installations.

## Other provider option

`createOpenAICompatibleProvider` supports a remote OpenAI-compatible endpoint only when a server-side API key is provided. It is not enabled by default, and HELORO's local free mode does not use it.

## Not implemented yet

- No agent is running in the background merely because the source code exists.
- No production HTTP endpoint, persistent task queue, scheduler, or deployment is enabled.
- Agents currently return analysis/recommendations only. They have no direct GitHub, Supabase, Vercel, browser, or shell tools and cannot modify HELORO autonomously.
- Running Ollama on a PC makes that PC the inference host; turning it off stops agent inference. A deployed website cannot reach a developer's localhost server.
- No credentials, provider API keys, or paid services are included.

## Safety gates before activation

1. Keep the local Ollama port bound to loopback.
2. Add authenticated task submission before exposing any agent endpoint.
3. Add a persistent queue, per-user quotas, cancellation, and audit-safe logs if background processing is needed.
4. Add a restricted tool gateway with read-only defaults; require approval for writes, merges, production, live Supabase/Auth, or deployments.
5. Validate local model performance and privacy before enabling real users.

## Status

- Implemented in source: ten specialist definitions, independent model-call runtime, bounded scheduler, and local Ollama adapter.
- Tested: automated CI must pass on the latest commit.
- Deployed: no.
- Autonomous tool access: not implemented.
