import { describe, expect, it } from "vitest";
import { generateLuaFromRules, parseVisualRules, type BotVisualRule } from "./BotVisualBuilder";

const rules: BotVisualRule[] = [
  {
    id: "hello-message",
    event: "message",
    match: "contains",
    value: "привет",
    reply: "Привет!\nРад тебя видеть.",
  },
  {
    id: "help-command",
    event: "command",
    match: "equals",
    value: "/HELP",
    reply: "Команды: /start и /help",
  },
];

describe("HELORO visual bot builder", () => {
  it("generates message and command event handlers", () => {
    const source = generateLuaFromRules(rules);

    expect(source).toContain('bot.on("message", function(message)');
    expect(source).toContain('string.find(text, "привет", 1, true) ~= nil');
    expect(source).toContain('bot.on("command", function(command, message)');
    expect(source).toContain('if command == "help" then');
  });

  it("escapes quotes and line breaks in generated Lua strings", () => {
    const source = generateLuaFromRules([{
      ...rules[0],
      value: 'say "hello"',
      reply: "Line one\nLine two",
    }]);

    expect(source).toContain('say \\"hello\\"');
    expect(source).toContain('Line one\\nLine two');
  });

  it("stores enough metadata to restore visual rules from generated Lua", () => {
    const source = generateLuaFromRules(rules);
    expect(parseVisualRules(source)).toEqual([
      rules[0],
      { ...rules[1], value: "help" },
    ]);
  });

  it("rejects empty rules and invalid command names", () => {
    expect(() => generateLuaFromRules([])).toThrow();
    expect(() => generateLuaFromRules([{
      ...rules[1],
      value: "bad-command",
    }])).toThrow();
  });
});
