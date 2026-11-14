import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  BookOpen, Blocks, Check, Code2, History, Play, Save, Send,
  ShieldCheck, Upload, X,
} from "lucide-react";
import type { Locale } from "../../lib/i18n";
import BotVisualBuilder, { parseVisualRules, type BotVisualRule } from "./BotVisualBuilder";
import "./BotLuaStudio.css";

type Props = {
  client: SupabaseClient;
  botId: string;
  locale: Locale;
};

type ScriptRow = {
  source_code: string;
  draft_version: number;
  published_version: number | null;
  is_published: boolean;
  published_at: string | null;
  updated_at: string;
};

type ScriptVersion = {
  version: number;
  created_at: string;
};

type RunResult = {
  ok?: boolean;
  replies?: string[];
  logs?: string[];
  error?: string;
  instruction_count?: number;
};

type Diagnostic = {
  kind: "error" | "warning" | "info";
  text: string;
};

const starter = `-- HELORO Bot Studio · Lua 5.3
-- This example replies when someone sends /hello.

bot.on("message", function(message)
  if message.text == "/hello" then
    bot.reply(message, "Привет! Я бот HELORO.")
  end
end)

bot.on("command", function(command, message)
  if command == "start" then
    bot.reply(message, "Привет! Напиши /hello.")
  end
end)
`;

const snippets = [
  { label: "Ответ на сообщение", code: `bot.on("message", function(message)
  bot.reply(message, "Ты написал: " .. message.text)
end)` },
  { label: "Команда", code: `bot.on("command", function(command, message)
  if command == "hello" then
    bot.reply(message, "Привет!")
  end
end)` },
];

const modules = [
  {
    label: "Приветствие",
    description: "Ответ на /start",
    code: `bot.on("command", function(command, message)
  if command == "start" then
    bot.reply(message, "Добро пожаловать! Напиши /help.")
  end
end)`,
  },
  {
    label: "Мини-справка",
    description: "Ответ на /help",
    code: `bot.on("command", function(command, message)
  if command == "help" then
    bot.reply(message, "Команды: /start, /help")
  end
end)`,
  },
  {
    label: "Ответ по слову",
    description: "Реакция на слово «привет»",
    code: `bot.on("message", function(message)
  local text = string.lower(message.text or "")
  if string.find(text, "привет", 1, true) then
    bot.reply(message, "И тебе привет!")
  end
end)`,
  },
  {
    label: "Журнал событий",
    description: "Запись события в тестовый лог",
    code: `bot.on("message", function(message)
  bot.log("Получено сообщение от " .. (message.username or "user"))
end)`,
  },
];

const luaKeywords = new Set([
  "and", "break", "do", "else", "elseif", "end", "false", "for", "function",
  "if", "in", "local", "nil", "not", "or", "repeat", "return", "then", "true",
  "until", "while",
]);

function highlightLua(source: string) {
  const parts = source.split(/(--[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b(?:and|break|do|else|elseif|end|false|for|function|if|in|local|nil|not|or|repeat|return|then|true|until|while)\b|\b(?:bot|print|string|math|table|utf8)\b|\b\d+(?:\.\d+)?\b)/g);
  return parts.map((token, index) => {
    let className = "";
    if (token.startsWith("--")) className = "bot-lua-token-comment";
    else if (token.startsWith('"') || token.startsWith("'")) className = "bot-lua-token-string";
    else if (luaKeywords.has(token)) className = "bot-lua-token-keyword";
    else if (/^(bot|print|string|math|table|utf8)$/.test(token)) className = "bot-lua-token-builtin";
    else if (/^\d/.test(token)) className = "bot-lua-token-number";
    return className ? <span className={className} key={index}>{token}</span> : token;
  });
}

function inspectScript(source: string, ru: boolean): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const bytes = new TextEncoder().encode(source).length;
  if (bytes === 0) diagnostics.push({ kind: "error", text: ru ? "Скрипт пустой." : "The script is empty." });
  if (bytes > 16000) diagnostics.push({ kind: "error", text: ru ? "Превышен лимит 16 000 байт." : "The 16,000-byte source limit is exceeded." });

  const events = [...source.matchAll(/bot\.on\s*\(\s*["']([^"']+)["']/g)].map((match) => match[1]);
  const messageCount = events.filter((event) => event === "message").length;
  const commandCount = events.filter((event) => event === "command").length;
  const unsupported = events.filter((event) => event !== "message" && event !== "command");
  if (unsupported.length) diagnostics.push({ kind: "error", text: ru ? `Неизвестное событие: ${unsupported[0]}. Доступны message и command.` : `Unknown event: ${unsupported[0]}. Use message or command.` });
  if (messageCount > 12 || commandCount > 12) diagnostics.push({ kind: "error", text: ru ? "Для одного события разрешено не более 12 обработчиков." : "At most 12 handlers are allowed for one event." });
  if (!events.length) diagnostics.push({ kind: "warning", text: ru ? "Не найден bot.on(...). Скрипт не будет реагировать на сообщения." : "No bot.on(...) handler was found. The script will not react to messages." });

  const blockedApis = ["require", "io", "os", "debug", "package", "dofile", "loadfile", "collectgarbage"];
  const blockedFound = blockedApis.find((name) => new RegExp(`\\\\b${name}\\\\b`).test(source));
  if (blockedFound) diagnostics.push({ kind: "warning", text: ru ? `API «${blockedFound}» отключён в безопасной песочнице.` : `The ${blockedFound} API is disabled in the secure sandbox.` });

  if (!diagnostics.length) diagnostics.push({ kind: "info", text: ru ? "Базовые проверки пройдены. Полную проверку синтаксиса выполни через тестовый запуск." : "Basic checks passed. Run the test runner for full syntax validation." });
  return diagnostics;
}

function diagnosticIcon(kind: Diagnostic["kind"]) {
  if (kind === "error") return <X size={13} />;
  if (kind === "warning") return <ShieldCheck size={13} />;
  return <Check size={13} />;
}

export default function BotLuaStudio({ client, botId, locale }: Props) {
  const ru = locale === "ru";
  const highlightRef = useRef<HTMLPreElement | null>(null);
  const [source, setSource] = useState(starter);
  const [script, setScript] = useState<ScriptRow | null>(null);
  const [versions, setVersions] = useState<ScriptVersion[]>([]);
  const [testMessage, setTestMessage] = useState("/hello");
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [lastTestedSource, setLastTestedSource] = useState("");
  const [editorMode, setEditorMode] = useState<"code" | "blocks">("code");
  const [visualRules, setVisualRules] = useState<BotVisualRule[]>([]);
  const [blockNotice, setBlockNotice] = useState("");
  const [modulesOpen, setModulesOpen] = useState(false);

  const diagnostics = useMemo(() => inspectScript(source, ru), [source, ru]);
  const canPublish = lastTestedSource === source && source.trim().length > 0;

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      const { data, error: loadError } = await client
        .from("bot_scripts")
        .select("source_code, draft_version, published_version, is_published, published_at, updated_at")
        .eq("bot_id", botId)
        .maybeSingle();
      if (!active) return;
      if (loadError) {
        setError(ru
          ? "Хранилище скриптов ещё не подключено. Для него нужна миграция Bot Studio."
          : "Script storage is not connected yet. The Bot Studio database migration is required.");
      } else if (data) {
        const row = data as ScriptRow;
        setScript(row);
        setSource(row.source_code);
        const parsed = parseVisualRules(row.source_code);
        if (parsed) setVisualRules(parsed);
      }
      const history = await client.from("bot_script_versions")
        .select("version, created_at")
        .eq("bot_id", botId)
        .order("version", { ascending: false })
        .limit(8);
      if (!active) return;
      if (!history.error) setVersions((history.data ?? []) as ScriptVersion[]);
      setLoading(false);
    }
    void load().catch((cause: unknown) => {
      if (active) {
        setError(cause instanceof Error ? cause.message : (ru ? "Не удалось открыть редактор." : "Could not open the editor."));
        setLoading(false);
      }
    });
    return () => { active = false; };
  }, [client, botId, ru]);

  function updateSource(next: string) {
    setSource(next);
    setLastTestedSource("");
    setResult(null);
  }

  function openBlocks() {
    const parsed = parseVisualRules(source);
    if (parsed) {
      setVisualRules(parsed);
      setBlockNotice("");
    } else if (source.trim()) {
      setBlockNotice(ru
        ? "Текущий Lua-код не преобразуется в блоки автоматически. Он останется нетронутым, пока ты не соберёшь и не применишь новые блоки."
        : "Existing Lua code is not converted into blocks automatically. It stays untouched until you generate and apply new blocks.");
    }
    setEditorMode("blocks");
  }

  function applyGeneratedSource(generated: string) {
    updateSource(generated);
    setEditorMode("code");
    setBlockNotice(ru ? "Код собран из визуальных блоков. Проверь его перед публикацией." : "Lua was generated from visual blocks. Test it before publishing.");
    setError("");
  }

  async function save(publish: boolean) {
    if (editorMode !== "code") {
      setError(ru ? "Сначала собери Lua-код из блоков." : "Generate Lua code from the blocks first.");
      return;
    }
    if (publish && !canPublish) {
      setError(ru ? "Перед публикацией успешно протестируй именно эту версию скрипта." : "Successfully test this exact script version before publishing.");
      return;
    }
    if (!source.trim() || new TextEncoder().encode(source).length > 16000) {
      setError(ru ? "Скрипт должен содержать от 1 до 16 000 байт." : "The script must contain 1 to 16,000 bytes.");
      return;
    }
    setSaving(true);
    setError("");
    setResult(null);
    try {
      const { data, error: saveError } = await client.rpc("save_bot_script", {
        p_bot_id: botId,
        p_source_code: source,
        p_publish: publish,
      });
      if (saveError) throw saveError;
      const saved = Array.isArray(data) ? data[0] : data;
      const next: ScriptRow = {
        source_code: source,
        draft_version: Number(saved?.draft_version ?? script?.draft_version ?? 1),
        published_version: saved?.published_version == null ? null : Number(saved.published_version),
        is_published: Boolean(saved?.is_published),
        published_at: saved?.published_at ?? null,
        updated_at: new Date().toISOString(),
      };
      setScript(next);
      const history = await client.from("bot_script_versions")
        .select("version, created_at")
        .eq("bot_id", botId)
        .order("version", { ascending: false })
        .limit(8);
      if (!history.error) setVersions((history.data ?? []) as ScriptVersion[]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ru ? "Не удалось сохранить скрипт." : "Could not save the script."));
    } finally {
      setSaving(false);
    }
  }

  async function testScript(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (editorMode !== "code") {
      setError(ru ? "Сначала собери Lua-код из блоков." : "Generate Lua code from the blocks first.");
      return;
    }
    setTesting(true);
    setError("");
    setResult(null);
    setLastTestedSource("");
    try {
      const { data, error: invokeError } = await client.functions.invoke("run-bot-lua", {
        body: {
          action: "test",
          bot_id: botId,
          source_code: source,
          test_message: testMessage,
        },
      });
      if (invokeError) throw invokeError;
      const tested = data as RunResult;
      setResult(tested);
      if (tested.ok) setLastTestedSource(source);
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : (ru ? "Тестовый запуск пока недоступен." : "The test runner is not available yet."));
    } finally {
      setTesting(false);
    }
  }

  function insertModule(code: string) {
    updateSource((source.trim() ? source.trimEnd() + "\n\n" : "") + code + "\n");
  }

  return (
    <section className="bot-lua-studio">
      <div className="bot-lua-heading">
        <div className="bot-lua-heading-icon"><Code2 size={20} /></div>
        <div className="bot-lua-heading-copy">
          <strong>HELORO Script Studio</strong>
          <small>{ru ? "Lua 5.3 · визуальные блоки · тестовая консоль" : "Lua 5.3 · visual blocks · test console"}</small>
        </div>
        <span className="bot-lua-status">
          {script?.is_published
            ? (ru ? "Опубликован" : "Published")
            : (ru ? "Черновик" : "Draft")}
        </span>
      </div>

      <div className="bot-lua-version-row">
        <span>{ru ? "Черновик" : "Draft"} v{script?.draft_version ?? 0}</span>
        <span>{script?.published_version
          ? (ru ? `Опубликован v${script.published_version}` : `Published v${script.published_version}`)
          : (ru ? "Нет опубликованной версии" : "No published version")}</span>
      </div>

      <div className="bot-lua-mode-tabs" role="tablist" aria-label={ru ? "Режим редактора" : "Editor mode"}>
        <button type="button" role="tab" aria-selected={editorMode === "code"} className={editorMode === "code" ? "is-active" : ""} onClick={() => setEditorMode("code")}><Code2 size={14} />{ru ? "Lua-код" : "Lua code"}</button>
        <button type="button" role="tab" aria-selected={editorMode === "blocks"} className={editorMode === "blocks" ? "is-active" : ""} onClick={openBlocks}><Blocks size={14} />{ru ? "Блоки" : "Blocks"}</button>
      </div>

      {editorMode === "code" ? (
        <>
          <div className="bot-lua-editor-wrap">
            <div className="bot-lua-editor-toolbar">
              <span><span className="bot-lua-live-dot" /> main.lua</span>
              <span>Lua 5.3</span>
            </div>
            <div className="bot-lua-code-surface">
              <pre className="bot-lua-highlight" ref={highlightRef} aria-hidden="true">{highlightLua(source)}</pre>
              <textarea
                className="bot-lua-editor"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                autoComplete="off"
                aria-label={ru ? "Редактор Lua" : "Lua editor"}
                value={source}
                onChange={(event) => updateSource(event.target.value)}
                onScroll={(event) => {
                  if (highlightRef.current) {
                    highlightRef.current.scrollTop = event.currentTarget.scrollTop;
                    highlightRef.current.scrollLeft = event.currentTarget.scrollLeft;
                  }
                }}
                placeholder="-- Write your bot script here"
                maxLength={16000}
              />
            </div>
            <div className="bot-lua-editor-footer">
              <span>{source.split("\n").length} {ru ? "строк" : "lines"}</span>
              <span>{new TextEncoder().encode(source).length.toLocaleString()} / 16 000 bytes</span>
            </div>
          </div>

          <div className="bot-lua-snippets">
            {snippets.map((snippet) => (
              <button key={snippet.label} type="button" onClick={() => insertModule(snippet.code)}>+ {snippet.label}</button>
            ))}
            <button type="button" onClick={() => updateSource(starter)}>{ru ? "Сбросить шаблон" : "Reset template"}</button>
          </div>

          <details className="bot-lua-modules" open={modulesOpen} onToggle={(event) => setModulesOpen(event.currentTarget.open)}>
            <summary><BookOpen size={15} />{ru ? "Библиотека модулей и примеров" : "Module and example library"}</summary>
            <p>{ru ? "Это готовые фрагменты Lua. Они вставляются в текущий файл; require и загрузка внешних модулей в песочнице отключены." : "These are reusable Lua snippets. They are inserted into the current file; require and external module loading are disabled in the sandbox."}</p>
            <div className="bot-lua-module-list">
              {modules.map((module) => (
                <button type="button" key={module.label} onClick={() => insertModule(module.code)}>
                  <strong>{ru ? module.label : module.label}</strong>
                  <small>{ru ? module.description : module.description}</small>
                </button>
              ))}
            </div>
          </details>

          <div className="bot-lua-diagnostics" aria-live="polite">
            <div className="bot-lua-diagnostics-title">{ru ? "Быстрые проверки" : "Quick checks"}</div>
            {diagnostics.map((item, index) => (
              <div key={index} className={`bot-lua-diagnostic is-${item.kind}`}>{diagnosticIcon(item.kind)}<span>{item.text}</span></div>
            ))}
          </div>
        </>
      ) : (
        <>
          {blockNotice && <div className="bot-lua-block-notice">{blockNotice}</div>}
          <BotVisualBuilder
            locale={locale}
            rules={visualRules}
            onChange={setVisualRules}
            onApply={applyGeneratedSource}
          />
          <div className="bot-lua-block-note">{ru ? "Пока ты не нажмёшь «Собрать Lua-код», текущий файл и сохранённый скрипт не меняются." : "Your current file and saved script stay unchanged until you generate Lua code."}</div>
        </>
      )}

      <div className="bot-lua-actions">
        <button type="button" className="bot-lua-secondary" disabled={saving || loading || editorMode !== "code"} onClick={() => void save(false)}>
          <Save size={15} />{ru ? "Сохранить черновик" : "Save draft"}
        </button>
        <button type="button" className="bot-lua-publish" disabled={saving || loading || editorMode !== "code" || !canPublish} onClick={() => void save(true)}>
          <Upload size={15} />{ru ? "Опубликовать" : "Publish"}
        </button>
      </div>

      {!canPublish && editorMode === "code" && (
        <div className="bot-lua-publish-hint">{ru ? "Сначала запусти успешный тест текущей версии — тогда публикация разблокируется." : "Run a successful test of the current version to enable publishing."}</div>
      )}

      <form className="bot-lua-test" onSubmit={testScript}>
        <div className="bot-lua-test-heading">
          <div><Play size={16} /><strong>{ru ? "Тестовая консоль" : "Test console"}</strong></div>
          <span>{ru ? "Тест не отправляет сообщения реальным пользователям" : "Tests do not send messages to real users"}</span>
        </div>
        <label>
          {ru ? "Входящее сообщение" : "Incoming test message"}
          <div className="bot-lua-test-input">
            <input value={testMessage} maxLength={1000} onChange={(event) => setTestMessage(event.target.value)} placeholder="/hello" disabled={editorMode !== "code"} />
            <button type="submit" disabled={testing || loading || editorMode !== "code" || !testMessage.trim()}><Send size={15} />{testing ? (ru ? "Тест…" : "Running…") : (ru ? "Запустить" : "Run")}</button>
          </div>
        </label>
      </form>

      {error && <div className="bot-lua-error" role="alert"><X size={15} />{error}</div>}
      {result && (
        <div className="bot-lua-output">
          <div className="bot-lua-output-title">
            {result.ok ? <Check size={15} /> : <X size={15} />}
            {result.ok ? (ru ? "Тест завершён" : "Test completed") : (ru ? "Ошибка теста" : "Test failed")}
          </div>
          {result.replies?.map((reply, index) => <pre key={index}>{reply}</pre>)}
          {result.logs?.map((log, index) => <pre className="bot-lua-log" key={index}>{log}</pre>)}
          {result.error && <pre className="bot-lua-error-line">{result.error}</pre>}
          {typeof result.instruction_count === "number" && <small>{result.instruction_count.toLocaleString()} {ru ? "инструкций" : "instructions"}</small>}
          {result.ok && lastTestedSource === source && <small>{ru ? "Проверена именно текущая версия кода." : "This exact code version was tested."}</small>}
        </div>
      )}

      <div className="bot-lua-api-note">
        <ShieldCheck size={16} />
        <p>{ru
          ? "Скрипты запускаются на сервере с ограничением инструкций и ответов, без доступа к файлам, сети и ключам. Жёсткий лимит памяти пока не реализован: публичный production-запуск непроверенных скриптов закрыт."
          : "Scripts run server-side with instruction and reply limits, without file, network or secret access. A hard memory quota is not implemented yet, so public production execution of untrusted scripts remains disabled."}</p>
      </div>

      {versions.length > 0 && (
        <details className="bot-lua-history">
          <summary><History size={15} />{ru ? "История версий" : "Version history"} ({versions.length})</summary>
          {versions.map((version) => <div key={version.version}>v{version.version}<time>{new Date(version.created_at).toLocaleString(ru ? "ru-RU" : "en-US")}</time></div>)}
        </details>
      )}
      {loading && <div className="bot-lua-loading">{ru ? "Загружаю скрипт…" : "Loading script…"}</div>}
    </section>
  );
}
