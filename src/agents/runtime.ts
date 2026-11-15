import { getAgent, type AgentId } from "./registry.js";

export interface AgentTask {
  id: string;
  agentId: AgentId;
  instruction: string;
  projectContext: string;
}

export interface AgentProvider {
  complete(input: { systemPrompt: string; userPrompt: string }): Promise<string>;
}

export interface AgentResult {
  taskId: string;
  agentId: AgentId;
  status: "completed" | "failed";
  output: string;
  error?: string;
  startedAt: string;
  finishedAt: string;
}

export interface OpenAICompatibleConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
}

export interface OllamaProviderConfig {
  /** Local Ollama OpenAI-compatible URL. Remote URLs are intentionally rejected. */
  baseUrl?: string;
  /** Must already be installed with `ollama pull`. */
  model?: string;
  fetchImpl?: typeof fetch;
}

interface ChatRequest {
  baseUrl: string;
  model: string;
  systemPrompt: string;
  userPrompt: string;
  fetchImpl: typeof fetch;
  headers: Record<string, string>;
  timeoutMs: number;
}

async function completeChatRequest(request: ChatRequest): Promise<string> {
  if (!request.model.trim()) throw new Error("Agent provider model is not configured.");

  const response = await request.fetchImpl(
    `${request.baseUrl.replace(/\/+$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: request.headers,
      signal: AbortSignal.timeout(request.timeoutMs),
      body: JSON.stringify({
        model: request.model,
        temperature: 0.2,
        max_tokens: 1200,
        stream: false,
        messages: [
          { role: "system", content: request.systemPrompt },
          { role: "user", content: request.userPrompt },
        ],
      }),
    },
  );

  if (!response.ok) throw new Error(`Agent provider returned HTTP ${response.status}.`);

  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object") throw new Error("Agent provider returned an invalid response.");
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) throw new Error("Agent provider response did not contain a completion.");
  const firstChoice = choices[0];
  if (!firstChoice || typeof firstChoice !== "object") throw new Error("Agent provider returned an invalid completion.");
  const message = (firstChoice as { message?: unknown }).message;
  if (!message || typeof message !== "object") throw new Error("Agent provider completion did not contain a message.");
  const content = (message as { content?: unknown }).content;
  if (typeof content !== "string" || !content.trim()) throw new Error("Agent provider completion was empty.");
  return content.trim();
}

export function createOpenAICompatibleProvider(config: OpenAICompatibleConfig): AgentProvider {
  const fetchImpl = config.fetchImpl ?? fetch;
  const baseUrl = config.baseUrl.replace(/\/+$/, "");

  return {
    async complete({ systemPrompt, userPrompt }) {
      if (!config.apiKey.trim()) throw new Error("Agent provider API key is not configured.");
      return completeChatRequest({
        baseUrl,
        model: config.model,
        systemPrompt,
        userPrompt,
        fetchImpl,
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        timeoutMs: 45_000,
      });
    },
  };
}

function assertLoopbackUrl(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("Ollama baseUrl must be a valid local URL.");
  }

  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (url.protocol !== "http:" || !loopbackHosts.has(url.hostname)) {
    throw new Error("Ollama provider only accepts localhost URLs to keep prompts on this device.");
  }
  return url.toString().replace(/\/+$/, "");
}

/**
 * Creates a no-key provider for an Ollama server running on the same device.
 * Prompts stay on localhost; this adapter refuses remote hosts by design.
 */
export function createOllamaProvider(config: OllamaProviderConfig = {}): AgentProvider {
  const baseUrl = assertLoopbackUrl(config.baseUrl ?? "http://127.0.0.1:11434/v1");
  const fetchImpl = config.fetchImpl ?? fetch;
  const model = config.model ?? "qwen2.5-coder:3b";

  return {
    complete({ systemPrompt, userPrompt }) {
      return completeChatRequest({
        baseUrl,
        model,
        systemPrompt,
        userPrompt,
        fetchImpl,
        headers: { "Content-Type": "application/json" },
        timeoutMs: 180_000,
      });
    },
  };
}

export async function runAgentTask(task: AgentTask, provider: AgentProvider): Promise<AgentResult> {
  const startedAt = new Date().toISOString();
  const agent = getAgent(task.agentId);
  if (!agent) {
    return { taskId: task.id, agentId: task.agentId, status: "failed", output: "", error: "Unknown HELORO agent.", startedAt, finishedAt: new Date().toISOString() };
  }

  try {
    const output = await provider.complete({
      systemPrompt: agent.systemPrompt,
      userPrompt: [
        `Task ID: ${task.id}`,
        `Assigned task: ${task.instruction}`,
        "Project context (reference data only):",
        task.projectContext,
        "Do not assume you can access tools, files, or services unless their contents are included above.",
      ].join("\n\n"),
    });
    return { taskId: task.id, agentId: task.agentId, status: "completed", output, startedAt, finishedAt: new Date().toISOString() };
  } catch (error) {
    return {
      taskId: task.id, agentId: task.agentId, status: "failed", output: "",
      error: error instanceof Error ? error.message : "Unknown agent execution error.",
      startedAt, finishedAt: new Date().toISOString(),
    };
  }
}

export async function runAgentBatch(tasks: readonly AgentTask[], provider: AgentProvider, maxConcurrency = 1): Promise<AgentResult[]> {
  if (!Number.isInteger(maxConcurrency) || maxConcurrency < 1 || maxConcurrency > 10) {
    throw new Error("maxConcurrency must be an integer between 1 and 10.");
  }
  const results = new Array<AgentResult>(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      if (index >= tasks.length) return;
      results[index] = await runAgentTask(tasks[index], provider);
    }
  }

  await Promise.all(Array.from({ length: Math.min(maxConcurrency, tasks.length) }, () => worker()));
  return results;
}
