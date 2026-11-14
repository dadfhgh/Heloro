import { useState } from "react";
import { Plus, Trash2, WandSparkles } from "lucide-react";
import type { Locale } from "../../lib/i18n";
import "./BotVisualBuilder.css";

export type BotVisualRule = {
  id: string;
  event: "message" | "command";
  match: "equals" | "contains" | "starts_with" | "any";
  value: string;
  reply: string;
};

type Props = {
  locale: Locale;
  rules: BotVisualRule[];
  onChange: (rules: BotVisualRule[]) => void;
  onApply: (source: string) => void;
};

const starterRule = (): BotVisualRule => ({
  id: `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  event: "message",
  match: "equals",
  value: "/hello",
  reply: "Привет! Я бот HELORO.",
});

export function parseVisualRules(source: string): BotVisualRule[] | null {
  const prefix = "-- HELORO_VISUAL_BLOCKS_V1 ";
  const line = source.split("\n").find((item) => item.startsWith(prefix));
  if (!line) return null;
  try {
    const parsed: unknown = JSON.parse(line.slice(prefix.length));
    if (!Array.isArray(parsed)) return null;
    const valid = parsed.filter((item): item is BotVisualRule =>
      Boolean(item)
      && typeof item === "object"
      && typeof (item as BotVisualRule).id === "string"
      && ["message", "command"].includes((item as BotVisualRule).event)
      && ["equals", "contains", "starts_with", "any"].includes((item as BotVisualRule).match)
      && typeof (item as BotVisualRule).value === "string"
      && typeof (item as BotVisualRule).reply === "string"
    );
    return valid.length === parsed.length ? valid : null;
  } catch {
    return null;
  }
}

function luaString(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\r/g, "\\r").replace(/\n/g, "\\n").replace(/\t/g, "\\t")}"`;
}

export function generateLuaFromRules(rules: BotVisualRule[]): string {
  const clean = rules.map((rule) => ({
    ...rule,
    value: rule.event === "command" ? rule.value.trim().replace(/^\//, "").toLowerCase() : rule.value,
    reply: rule.reply.trim(),
  }));
  if (clean.length === 0) throw new Error("Добавь хотя бы одно правило.");
  if (clean.some((rule) => !rule.reply || rule.reply.length > 1000)) {
    throw new Error("У каждого правила должен быть ответ длиной от 1 до 1000 символов.");
  }
  if (clean.some((rule) => rule.event === "command" && !/^[a-zA-Z0-9_]{1,32}$/.test(rule.value))) {
    throw new Error("Имя команды должно содержать 1–32 латинских символа, цифры или подчёркивание.");
  }
  if (clean.some((rule) => rule.event === "message" && rule.match !== "any" && !rule.value.trim())) {
    throw new Error("Заполни условие для каждого правила сообщения.");
  }

  const messageRules = clean.filter((rule) => rule.event === "message");
  const commandRules = clean.filter((rule) => rule.event === "command");
  const lines = [
    "-- HELORO Visual Builder · Generated Lua 5.3",
    `-- HELORO_VISUAL_BLOCKS_V1 ${JSON.stringify(clean)}`,
    "",
  ];

  if (messageRules.length) {
    lines.push('bot.on("message", function(message)');
    lines.push('  local text = message.text or ""');
    for (const rule of messageRules) {
      let condition = "true";
      if (rule.match === "equals") condition = `text == ${luaString(rule.value)}`;
      if (rule.match === "contains") condition = `string.find(text, ${luaString(rule.value)}, 1, true) ~= nil`;
      if (rule.match === "starts_with") condition = `string.sub(text, 1, #${luaString(rule.value)}) == ${luaString(rule.value)}`;
      lines.push(`  if ${condition} then`);
      lines.push(`    bot.reply(message, ${luaString(rule.reply)})`);
      lines.push("  end");
    }
    lines.push("end)");
    lines.push("");
  }

  if (commandRules.length) {
    lines.push('bot.on("command", function(command, message)');
    for (const rule of commandRules) {
      lines.push(`  if command == ${luaString(rule.value)} then`);
      lines.push(`    bot.reply(message, ${luaString(rule.reply)})`);
      lines.push("  end");
    }
    lines.push("end)");
    lines.push("");
  }
  return lines.join("\n");
}

export default function BotVisualBuilder({ locale, rules, onChange, onApply }: Props) {
  const ru = locale === "ru";
  const [error, setError] = useState("");
  const addRule = () => {
    setError("");
    onChange([...rules, starterRule()]);
  };
  const updateRule = (index: number, patch: Partial<BotVisualRule>) => {
    setError("");
    onChange(rules.map((rule, i) => i === index ? { ...rule, ...patch } : rule));
  };
  const removeRule = (index: number) => {
    setError("");
    onChange(rules.filter((_, i) => i !== index));
  };

  function apply() {
    try {
      onApply(generateLuaFromRules(rules));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ru ? "Не удалось собрать Lua-скрипт." : "Could not generate the Lua script."));
    }
  }

  return (
    <section className="bot-visual-builder">
      <div className="bot-visual-intro">
        <div className="bot-visual-intro-icon"><WandSparkles size={18} /></div>
        <div>
          <strong>{ru ? "Собери логику из блоков" : "Build logic with blocks"}</strong>
          <p>{ru ? "Выбери событие, условие и ответ. HELORO соберёт из правил Lua-код." : "Choose an event, a condition and a reply. HELORO will generate Lua code from your rules."}</p>
        </div>
      </div>

      {rules.map((rule, index) => (
        <article className="bot-visual-rule" key={rule.id}>
          <div className="bot-visual-rule-head">
            <span>{ru ? `ПРАВИЛО ${index + 1}` : `RULE ${index + 1}`}</span>
            <button type="button" className="bot-visual-remove" onClick={() => removeRule(index)} aria-label={ru ? "Удалить правило" : "Remove rule"}><Trash2 size={15} /></button>
          </div>
          <label>
            <span>{ru ? "Когда происходит" : "When this happens"}</span>
            <select value={rule.event} onChange={(event) => updateRule(index, { event: event.target.value as BotVisualRule["event"], match: "equals" })}>
              <option value="message">{ru ? "Приходит сообщение" : "A message arrives"}</option>
              <option value="command">{ru ? "Вызывается команда" : "A command is called"}</option>
            </select>
          </label>

          {rule.event === "message" ? (
            <label>
              <span>{ru ? "Условие для текста" : "Message condition"}</span>
              <select value={rule.match} onChange={(event) => updateRule(index, { match: event.target.value as BotVisualRule["match"] })}>
                <option value="equals">{ru ? "Текст точно совпадает" : "Text matches exactly"}</option>
                <option value="contains">{ru ? "Текст содержит фразу" : "Text contains a phrase"}</option>
                <option value="starts_with">{ru ? "Текст начинается с фразы" : "Text starts with a phrase"}</option>
                <option value="any">{ru ? "Любое сообщение" : "Any message"}</option>
              </select>
            </label>
          ) : (
            <label>
              <span>{ru ? "Название команды" : "Command name"}</span>
              <input value={rule.value} onChange={(event) => updateRule(index, { value: event.target.value })} placeholder="help" maxLength={32} />
              <small>{ru ? "Пиши без слеша, например help." : "Without the slash, for example help."}</small>
            </label>
          )}

          {rule.event === "message" && rule.match !== "any" && (
            <label>
              <span>{ru ? "Искомый текст" : "Text to match"}</span>
              <input value={rule.value} onChange={(event) => updateRule(index, { value: event.target.value })} placeholder={ru ? "Например: привет" : "For example: hello"} maxLength={500} />
            </label>
          )}

          <label>
            <span>{ru ? "Тогда бот отвечает" : "Then the bot replies"}</span>
            <textarea rows={2} value={rule.reply} onChange={(event) => updateRule(index, { reply: event.target.value })} placeholder={ru ? "Напиши ответ бота…" : "Write the bot reply…"} maxLength={1000} />
            <small>{rule.reply.length}/1000</small>
          </label>
        </article>
      ))}

      <button type="button" className="bot-visual-add" onClick={addRule}><Plus size={16} />{ru ? "Добавить правило" : "Add rule"}</button>
      <button type="button" className="bot-visual-apply" onClick={apply} disabled={rules.length === 0}><WandSparkles size={16} />{ru ? "Собрать Lua-код" : "Generate Lua code"}</button>
      {error && <div className="bot-visual-error" role="alert">{error}</div>}
      <p className="bot-visual-footnote">{ru ? "Блоки создают обычный Lua-скрипт. Перед публикацией проверь его в тестовом запуске." : "Blocks generate a regular Lua script. Test it before publishing."}</p>
    </section>
  );
}
