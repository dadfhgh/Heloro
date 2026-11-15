import { getAgent, type AgentId } from "./registry";

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

export function createOpenAICompatibleProvider(config: OpenAICompatibleConfig): AgentProvider {
  const fetchImpl = config.fetchImpl ?? fetch;
  const baseUrl = config.baseUrl.replace(/\/+$/, "");

  return {
    async complete({ systemPrompt, userPrompt }) {
      if (!config.apiKey.trim()) throw new Error("Agent provider API key is not configured.");
      if (!config.model.trim()) throw new Error("Agent provider model is not configured.");

      const response = await fetchImpl(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.model,
          temperature: 0.2,
          max_tokens: 1200,
          signal: AbortSignal.timeout(45_000),
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });
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

export async function runAgentBatch(tasks: readonly AgentTask[], provider: AgentProvider, maxConcurrency = 2): Promise<AgentResult[]> {
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
