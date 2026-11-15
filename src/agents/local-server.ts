import { randomBytes, timingSafeEqual, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { getAgent, HELORO_AGENTS, type AgentId } from "./registry.js";
import { createOllamaProvider, runAgentBatch, runAgentTask, type AgentTask } from "./runtime.js";

const PORT = Number.parseInt(process.env.HELORO_AGENT_PORT ?? "8787", 10);
if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65535) {
  throw new Error("HELORO_AGENT_PORT must be a valid port between 1024 and 65535.");
}

const MODEL = process.env.HELORO_AGENT_MODEL ?? "qwen2.5-coder:3b";
const OLLAMA_BASE_URL = "http://127.0.0.1:11434/v1";
const API_TOKEN = randomBytes(32).toString("hex");
const provider = createOllamaProvider({ baseUrl: OLLAMA_BASE_URL, model: MODEL });
const allowedHosts = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const requestTimes: number[] = [];
const MAX_REQUESTS_PER_MINUTE = 10;
const MAX_BODY_BYTES = 32 * 1024;

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(JSON.stringify(value));
}

function isLoopbackRequest(request: IncomingMessage): boolean {
  const host = request.headers.host?.toLowerCase() ?? "";
  const remoteAddress = request.socket.remoteAddress ?? "";
  return allowedHosts.has(host)
    && !request.headers.origin
    && ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remoteAddress);
}

function isAuthorized(request: IncomingMessage): boolean {
  const authorization = request.headers.authorization ?? "";
  if (!authorization.startsWith("Bearer ")) return false;

  const candidate = Buffer.from(authorization.slice(7));
  const expected = Buffer.from(API_TOKEN);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function enforceRateLimit(): void {
  const now = Date.now();
  while (requestTimes.length > 0 && now - requestTimes[0] >= 60_000) requestTimes.shift();
  if (requestTimes.length >= MAX_REQUESTS_PER_MINUTE) {
    throw new HttpError(429, "Local agent API rate limit reached. Try again in a minute.");
  }
  requestTimes.push(now);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const contentType = request.headers["content-type"]?.split(";")[0]?.trim().toLowerCase();
  if (contentType !== "application/json") throw new HttpError(415, "Content-Type must be application/json.");

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += data.length;
    if (totalBytes > MAX_BODY_BYTES) throw new HttpError(413, "Request body is too large.");
    chunks.push(data);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new HttpError(400, "Request body must contain valid JSON.");
  }
}

function validateTask(value: unknown): AgentTask {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, "Each task must be a JSON object.");
  }

  const task = value as Record<string, unknown>;
  if (typeof task.agentId !== "string" || !getAgent(task.agentId)) {
    throw new HttpError(400, "Unknown agentId. Request GET /v1/agents for the supported roles.");
  }
  if (typeof task.instruction !== "string" || task.instruction.trim().length === 0 || task.instruction.length > 4_000) {
    throw new HttpError(400, "instruction must contain 1–4000 characters.");
  }
  const projectContext = task.projectContext ?? "";
  if (typeof projectContext !== "string" || projectContext.length > 10_000) {
    throw new HttpError(400, "projectContext must be a string of at most 10000 characters.");
  }

  return {
    id: randomUUID(),
    agentId: task.agentId as AgentId,
    instruction: task.instruction.trim(),
    projectContext,
  };
}

async function checkOllama(): Promise<{ available: boolean; modelInstalled: boolean }> {
  try {
    const response = await fetch("http://127.0.0.1:11434/api/tags", {
      signal: AbortSignal.timeout(3_000),
    });
    if (!response.ok) return { available: false, modelInstalled: false };

    const payload: unknown = await response.json();
    const models = payload && typeof payload === "object"
      ? (payload as { models?: unknown }).models
      : undefined;
    const modelInstalled = Array.isArray(models)
      && models.some((item) => item && typeof item === "object"
        && (item as { name?: unknown }).name === MODEL);
    return { available: true, modelInstalled };
  } catch {
    return { available: false, modelInstalled: false };
  }
}

const server = createServer(async (request, response) => {
  try {
    if (!isLoopbackRequest(request)) throw new HttpError(403, "Only local requests without a browser Origin are accepted.");

    const url = new URL(request.url ?? "/", `http://127.0.0.1:${PORT}`);

    if (request.method === "GET" && url.pathname === "/health") {
      const ollama = await checkOllama();
      sendJson(response, 200, {
        service: "HELORO local agent runner",
        ready: ollama.available && ollama.modelInstalled,
        ollamaAvailable: ollama.available,
        model: MODEL,
        modelInstalled: ollama.modelInstalled,
        agents: HELORO_AGENTS.length,
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/agents") {
      sendJson(response, 200, {
        agents: HELORO_AGENTS.map(({ id, name, mission }) => ({ id, name, mission })),
      });
      return;
    }

    if (!isAuthorized(request)) throw new HttpError(401, "Missing or invalid local API token.");

    if (request.method === "POST" && url.pathname === "/v1/tasks/run") {
      enforceRateLimit();
      const body = await readJson(request);
      const task = validateTask(body);
      const result = await runAgentTask(task, provider);
      sendJson(response, result.status === "completed" ? 200 : 502, result);
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/tasks/batch") {
      enforceRateLimit();
      const body = await readJson(request);
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new HttpError(400, "Request body must be an object containing a tasks array.");
      }
      const tasksValue = (body as { tasks?: unknown }).tasks;
      if (!Array.isArray(tasksValue) || tasksValue.length < 1 || tasksValue.length > 10) {
        throw new HttpError(400, "tasks must contain between 1 and 10 independent agent tasks.");
      }

      const tasks = tasksValue.map(validateTask);
      // One local model and limited RAM: intentionally process one agent at a time.
      const results = await runAgentBatch(tasks, provider, 1);
      const allCompleted = results.every((result) => result.status === "completed");
      sendJson(response, allCompleted ? 200 : 207, { results });
      return;
    }

    throw new HttpError(404, "Endpoint not found.");
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Unexpected local agent error.";
    sendJson(response, status, { error: message });
  }
});

server.requestTimeout = 15 * 60 * 1000;
server.headersTimeout = 30_000;
server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(`HELORO local agent runner: http://127.0.0.1:${PORT}\n`);
  process.stdout.write(`Local API token (keep private): ${API_TOKEN}\n`);
  process.stdout.write(`Model: ${MODEL}\n`);
  process.stdout.write("Bound to loopback only. No remote network access or cloud inference.\n");
});

function shutdown(): void {
  server.close(() => process.exit(0));
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
