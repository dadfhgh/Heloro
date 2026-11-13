import { useEffect, useState, type FormEvent } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Check, Code2, History, Play, Save, Send, ShieldCheck, Upload, X } from "lucide-react";
import type { Locale } from "../../lib/i18n";
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

export default function BotLuaStudio({ client, botId, locale }: Props) {
  const ru = locale === "ru";
  const [source, setSource] = useState(starter);
  const [script, setScript] = useState<ScriptRow | null>(null);
  const [versions, setVersions] = useState<ScriptVersion[]>([]);
  const [testMessage, setTestMessage] = useState("/hello");
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

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

  async function save(publish: boolean) {
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
    setTesting(true);
    setError("");
    setResult(null);
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
      setResult(data as RunResult);
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : (ru ? "Тестовый запуск пока недоступен." : "The test runner is not available yet."));
    } finally {
      setTesting(false);
    }
  }

  return (
    <section className="bot-lua-studio">
      <div className="bot-lua-heading">
        <div className="bot-lua-heading-icon"><Code2 size={20} /></div>
        <div className="bot-lua-heading-copy">
          <strong>{ru ? "Lua Bot Studio" : "Lua Bot Studio"}</strong>
          <small>{ru ? "Основной редактор скриптов · Lua 5.3" : "Primary scripting editor · Lua 5.3"}</small>
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

      <div className="bot-lua-editor-wrap">
        <div className="bot-lua-editor-toolbar">
          <span><span className="bot-lua-live-dot" /> main.lua</span>
          <span>Lua 5.3</span>
        </div>
        <textarea
          className="bot-lua-editor"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          aria-label={ru ? "Редактор Lua" : "Lua editor"}
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder="-- Write your bot script here"
          maxLength={16000}
        />
        <div className="bot-lua-editor-footer">
          <span>{source.split("\n").length} {ru ? "строк" : "lines"}</span>
          <span>{new TextEncoder().encode(source).length.toLocaleString()} / 16 000 bytes</span>
        </div>
      </div>

      <div className="bot-lua-snippets">
        {snippets.map((snippet) => (
          <button key={snippet.label} type="button" onClick={() => setSource((current) => current.trim() ? current + "\n\n" + snippet.code : snippet.code)}>
            + {snippet.label}
          </button>
        ))}
        <button type="button" onClick={() => setSource(starter)}>{ru ? "Сбросить шаблон" : "Reset template"}</button>
      </div>

      <div className="bot-lua-actions">
        <button type="button" className="bot-lua-secondary" disabled={saving || loading} onClick={() => void save(false)}>
          <Save size={15} />{ru ? "Сохранить" : "Save draft"}
        </button>
        <button type="button" className="bot-lua-publish" disabled={saving || loading} onClick={() => void save(true)}>
          <Upload size={15} />{ru ? "Опубликовать" : "Publish"}
        </button>
      </div>

      <form className="bot-lua-test" onSubmit={testScript}>
        <div className="bot-lua-test-heading">
          <div><Play size={16} /><strong>{ru ? "Тестовый запуск" : "Test run"}</strong></div>
          <span>{ru ? "Без отправки реальным пользователям" : "No real users receive test messages"}</span>
        </div>
        <label>
          {ru ? "Входящее сообщение" : "Incoming test message"}
          <div className="bot-lua-test-input">
            <input value={testMessage} maxLength={1000} onChange={(event) => setTestMessage(event.target.value)} placeholder="/hello" />
            <button type="submit" disabled={testing || !testMessage.trim()}><Send size={15} />{testing ? (ru ? "Тест…" : "Running…") : (ru ? "Запустить" : "Run")}</button>
          </div>
        </label>
      </form>

      {error && <div className="bot-lua-error" role="alert"><X size={15} />{error}</div>}
      {result && (
        <div className="bot-lua-output">
          <div className="bot-lua-output-title"><Check size={15} />{result.ok ? (ru ? "Тест завершён" : "Test completed") : (ru ? "Результат теста" : "Test result")}</div>
          {result.replies?.map((reply, index) => <pre key={index}>{reply}</pre>)}
          {result.logs?.map((log, index) => <pre className="bot-lua-log" key={index}>{log}</pre>)}
          {result.error && <pre className="bot-lua-error-line">{result.error}</pre>}
          {typeof result.instruction_count === "number" && <small>{result.instruction_count.toLocaleString()} {ru ? "инструкций" : "instructions"}</small>}
        </div>
      )}

      <div className="bot-lua-api-note">
        <ShieldCheck size={16} />
        <p>{ru
          ? "Скрипты запускаются на сервере с лимитом инструкций. Lua не получает доступ к файлам, сети, ключам или внутренним данным HELORO."
          : "Scripts run server-side with an instruction budget. Lua has no access to files, network, keys or HELORO internal data."}</p>
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
