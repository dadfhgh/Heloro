# HELORO multi-agent runtime

## Free local mode

HELORO can use a local Ollama model without an API key, paid model, payment card, or cloud inference account.

1. Install Ollama on a supported Windows PC.
2. Download the coding model: `ollama pull qwen2.5-coder:1.5b` (about 986 MB).
3. Start Ollama; its local OpenAI-compatible API is `http://127.0.0.1:11434/v1`.
4. In the HELORO repository, run `npm run agents:local`.
5. The runner prints a random local API token. Keep it private; it is regenerated every time the runner starts.

The local server:
- binds only to `127.0.0.1:8787` and refuses requests with a browser Origin;
- requires its temporary token for POST task requests;
- accepts up to 10 tasks per batch and runs them sequentially to protect low-memory PCs;
- limits requests to 10 per minute and JSON bodies to 32 KB;
- has no public internet endpoint, no persistent queue, and no cloud model integration.

The Ollama adapter accepts only loopback URLs, sends no Authorization header, and uses `qwen2.5-coder:1.5b` by default. Keep Ollama's port 11434 bound to loopback; never expose it to the public internet.

## Local runner API

- `GET http://127.0.0.1:8787/health` — checks Ollama and the selected model.
- `GET http://127.0.0.1:8787/v1/agents` — lists the ten specialist roles.
- `POST http://127.0.0.1:8787/v1/tasks/run` — run one agent task.
- `POST http://127.0.0.1:8787/v1/tasks/batch` — run 1–10 independent tasks sequentially.

The task JSON shape is:

```json
{
  "agentId": "architect",
  "instruction": "Review the HELORO authentication architecture.",
  "projectContext": "Only include the minimum relevant, non-secret project context."
}
```

All requests to POST endpoints require `Authorization: Bearer <local-token>`. The token is printed only to the local terminal and must not be saved in Git, Notion, or chat. This API intentionally has no CORS support and is for local scripts/PowerShell only; a hosted HELORO website cannot access a developer PC's localhost server.

## Ten independent specialist roles

`coordinator`, `architect`, `frontend`, `backend`, `database`, `qa`, `security`, `design`, `devops`, `research`.

Each role has a separate system prompt and each task is an independent model request. All ten roles share one local model binary to keep the setup free and lightweight; they are not ten separate model installations.

## Boundaries

- The local runner can reason over task text supplied to it. It does not yet have direct GitHub, Supabase, Vercel, browser, or shell tools and cannot edit repository files autonomously.
- Tasks and results are held in process memory only; stopping the server clears the in-memory execution state.
- The local server runs only while the PC and Ollama are running.
- No provider credentials, API keys, paid services, production changes, or deployments are included.

## Status

- Implemented: ten role prompts, isolated model calls, local Ollama adapter, loopback-only task API, token protection, request limits, and batch execution.
- Tested: CI verification pending for the latest local-server commit.
- Deployed: no.
- Autonomous repository/tool access: not implemented.
