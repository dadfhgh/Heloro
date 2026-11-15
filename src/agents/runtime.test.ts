import { describe, expect, it, vi } from "vitest";
import { HELORO_AGENTS } from "./registry";
import { runAgentBatch, runAgentTask, type AgentProvider, type AgentTask } from "./runtime";

describe("HELORO agent registry", () => {
  it("defines ten distinct specialist agents", () => {
    expect(HELORO_AGENTS).toHaveLength(10);
    expect(new Set(HELORO_AGENTS.map((agent) => agent.id)).size).toBe(10);
    expect(HELORO_AGENTS.every((agent) => agent.systemPrompt.length > 100)).toBe(true);
  });
});

describe("agent execution", () => {
  it("gives each agent its own role prompt and task context", async () => {
    const complete = vi.fn(async ({ systemPrompt, userPrompt }: { systemPrompt: string; userPrompt: string }) =>
      `${systemPrompt.includes("Frontend Engineer") ? "frontend" : "other"}: ${userPrompt.includes("HELORO mobile UI")}`);
    const provider: AgentProvider = { complete };
    const result = await runAgentTask({
      id: "task-1", agentId: "frontend", instruction: "Review the mobile UI.", projectContext: "HELORO mobile UI",
    }, provider);
    expect(result.status).toBe("completed");
    expect(result.output).toBe("frontend: true");
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it("returns a failed result for an unknown agent", async () => {
    const provider: AgentProvider = { complete: vi.fn(async () => "unused") };
    const result = await runAgentTask({
      id: "task-2", agentId: "not-an-agent" as AgentTask["agentId"], instruction: "Do not run.", projectContext: "",
    }, provider);
    expect(result.status).toBe("failed");
    expect(result.error).toBe("Unknown HELORO agent.");
  });

  it("runs a batch with bounded concurrency and preserves input order", async () => {
    let active = 0;
    let peak = 0;
    const provider: AgentProvider = {
      async complete({ userPrompt }) {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return userPrompt.match(/Task ID: (.+)/)?.[1] ?? "missing";
      },
    };
    const tasks: AgentTask[] = [
      { id: "a", agentId: "architect", instruction: "A", projectContext: "" },
      { id: "b", agentId: "qa", instruction: "B", projectContext: "" },
      { id: "c", agentId: "security", instruction: "C", projectContext: "" },
    ];
    const results = await runAgentBatch(tasks, provider, 2);
    expect(results.map((result) => result.output)).toEqual(["a", "b", "c"]);
    expect(peak).toBeLessThanOrEqual(2);
    expect(peak).toBe(2);
  });

  it("rejects concurrency outside the supported range", async () => {
    await expect(runAgentBatch([], { complete: async () => "" }, 0)).rejects.toThrow(
      "maxConcurrency must be an integer between 1 and 10.",
    );
  });
});

describe("local Ollama provider", () => {
  it("uses the local OpenAI-compatible endpoint without sending an API key", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ choices: [{ message: { content: "local response" } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const { createOllamaProvider } = await import("./runtime");
    const provider = createOllamaProvider({ fetchImpl });
    const result = await provider.complete({ systemPrompt: "specialist", userPrompt: "task" });

    expect(result).toBe("local response");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:11434/v1/chat/completions");
    expect((init?.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(String(init?.body)) as { model: string; messages: Array<{ content: string }> };
    expect(body.model).toBe("qwen2.5-coder:3b");
    expect(body.messages.map((message) => message.content)).toEqual(["specialist", "task"]);
  });

  it("refuses remote hosts so local prompts are not sent to another service", async () => {
    const { createOllamaProvider } = await import("./runtime");
    expect(() => createOllamaProvider({ baseUrl: "https://example.com/v1" })).toThrow(
      "Ollama provider only accepts localhost URLs to keep prompts on this device.",
    );
  });

  it("reports local server failures without exposing request contents", async () => {
    const fetchImpl = vi.fn(async () => new Response("unavailable", { status: 503 }));
    const { createOllamaProvider } = await import("./runtime");
    const provider = createOllamaProvider({ fetchImpl });
    await expect(provider.complete({ systemPrompt: "secret prompt", userPrompt: "private task" })).rejects.toThrow(
      "Agent provider returned HTTP 503.",
    );
  });
});
