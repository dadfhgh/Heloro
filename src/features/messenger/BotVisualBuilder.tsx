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

const newRuleId = () => `rule-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const starterRule = (): BotVisualRule => ({
  id: newRuleId(),
  event: "message",
  match: "contains",
  value: "привет",
  reply: "И тебе привет!",
});

const quickTemplates: Array<{ title: string; description: string; rule: Omit<BotVisualRule, "id"> }> = [
  { title: "Приветствие /start", description: "Первое сообщение нового чата", rule: { event: "command", match: "equals", value: "start", reply: "Привет! Я бот HELORO. Напиши /help, чтобы увидеть команды." } },
  { title: "Команда /help", description: "Показывает возможности бота", rule: { event: "command", match: "equals", value: "help", reply: "Я отвечаю на команды и сообщения. Напиши /start, чтобы начать." } },
  { title: "Ответ по слову", description: "Например, когда пишут «привет»", rule: { event: "message", match: "contains", value: "привет", reply: "И тебе привет! Чем могу помочь?" } },
];

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
  const addTemplate = (rule: Omit<BotVisualRule, "id">) => {
    setError("");
    onChange([...rules, { ...rule, id: newRuleId() }]);
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
          <strong>{ru ? "Настрой ответы без программирования" : "Set up replies without programming"}</strong>
          <p>{ru ? "Выбери готовый вариант или создай правило: что получит бот и как он ответит." : "Choose a ready-made option or create a rule: what the bot receives and how it replies."}</p>
        </div>
      </div>

      <div className="bot-visual-templates">
        <div className="bot-visual-section-title">{ru ? "Быстрый старт" : "Quick start"}</div>
        <div className="bot-visual-template-grid">
          {quickTemplates.map((template) => (
            <button type="button" key={template.title} onClick={() => addTemplate(template.rule)}>
              <strong>{template.title}</strong>
              <small>{template.description}</small>
              <span>{ru ? "Добавить" : "Add"}</span>
            </button>
          ))}
        </div>
      </div>

      {rules.length === 0 && (
        <div className="bot-visual-empty">
          <strong>{ru ? "Пока нет правил" : "No rules yet"}</strong>
          <p>{ru ? "Нажми на шаблон выше или добавь своё правило." : "Choose a template above or add your own rule."}</p>
        </div>
      )}

      {rules.map((rule, index) => (
        <article className="bot-visual-rule" key={rule.id}>
          <div className="bot-visual-rule-head">
            <span>{ru ? `ПРАВИЛО ${index + 1}` : `RULE ${index + 1}`}</span>
            <button type="button" className="bot-visual-remove" onClick={() => removeRule(index)} aria-label={ru ? "Удалить правило" : "Remove rule"}><Trash2 size={15} /></button>
          </div>
          <label>
            <span>{ru ? "Когда происходит" : "When this happens"}</span>
            <select value={rule.event} onChange={(event) => { const nextEvent = event.target.value as BotVisualRule["event"]; updateRule(index, { event: nextEvent, match: "equals", value: nextEvent === "command" ? "help" : "привет" }); }}>
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
      <details className="bot-visual-advanced">
        <summary>{ru ? "Дополнительно: открыть Lua-код" : "Advanced: open Lua code"}</summary>
        <button type="button" className="bot-visual-apply" onClick={apply} disabled={rules.length === 0}><WandSparkles size={16} />{ru ? "Открыть Lua-код" : "Open Lua code"}</button>
      </details>
      {error && <div className="bot-visual-error" role="alert">{error}</div>}
      <p className="bot-visual-footnote">{ru ? "Не нужно писать код: правила можно сразу протестировать и сохранить. Перед публикацией тест обязателен." : "No coding is required: test and save rules directly. A successful test is required before publishing."}</p>
    </section>
  );
}
