import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ArrowLeft, Bot, Check, ChevronRight, Command, MessageCircle,
  Pause, Play, Plus, Search, Send, ShieldCheck, Trash2, X,
} from "lucide-react";
import type { Locale } from "../../lib/i18n";
import "./MessengerBots.css";

type BotProfile = {
  id: string;
  owner_id: string;
  username: string;
  display_name: string;
  description: string;
  welcome_message: string;
  avatar_url: string | null;
  allow_groups: boolean;
  privacy_mode: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type BotCommand = {
  id: string;
  bot_id: string;
  command_name: string;
  description: string;
  response_text: string;
  enabled: boolean;
  sort_order: number;
};

type BotMessage = {
  id: string;
  chat_id: string;
  sender_kind: "user" | "bot";
  sender_user_id: string | null;
  body: string;
  created_at: string;
};

type Props = {
  client: SupabaseClient;
  user: User;
  locale: Locale;
  onClose: () => void;
};

const botColumns = "id, owner_id, username, display_name, description, welcome_message, avatar_url, allow_groups, privacy_mode, is_active, created_at, updated_at";

export default function BotsHub({ client, user, locale, onClose }: Props) {
  const ru = locale === "ru";
  const [view, setView] = useState<"catalog" | "create" | "manage" | "chat">("catalog");
  const [tab, setTab] = useState<"all" | "mine">("all");
  const [bots, setBots] = useState<BotProfile[]>([]);
  const [selectedBot, setSelectedBot] = useState<BotProfile | null>(null);
  const [commands, setCommands] = useState<BotCommand[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const [messages, setMessages] = useState<BotMessage[]>([]);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newWelcome, setNewWelcome] = useState("");
  const [editName, setEditName] = useState("");
  const [editUsername, setEditUsername] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editWelcome, setEditWelcome] = useState("");
  const [commandName, setCommandName] = useState("");
  const [commandDescription, setCommandDescription] = useState("");
  const [commandResponse, setCommandResponse] = useState("");

  const ownBots = useMemo(() => bots.filter((bot) => bot.owner_id === user.id), [bots, user.id]);
  const visibleBots = useMemo(() => {
    const source = tab === "mine" ? ownBots : bots.filter((bot) => bot.is_active);
    const needle = query.trim().toLowerCase().replace(/^@/, "");
    return source.filter((bot) =>
      bot.display_name.toLowerCase().includes(needle) ||
      bot.username.toLowerCase().includes(needle) ||
      bot.description.toLowerCase().includes(needle)
    );
  }, [bots, ownBots, query, tab]);

  async function loadBots() {
    const { data, error: loadError } = await client.from("bots")
      .select(botColumns).order("created_at", { ascending: false }).limit(100);
    if (loadError) throw loadError;
    setBots((data ?? []) as BotProfile[]);
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadBots()
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : (ru ? "Не удалось загрузить каталог ботов." : "Could not load bots."));
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, user.id, ru]);

  async function loadCommands(botId: string) {
    const { data, error: commandError } = await client.from("bot_commands")
      .select("id, bot_id, command_name, description, response_text, enabled, sort_order")
      .eq("bot_id", botId).order("sort_order").order("command_name");
    if (commandError) throw commandError;
    setCommands((data ?? []) as BotCommand[]);
  }

  async function createBot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = newUsername.trim().replace(/^@/, "").toLowerCase();
    if (!/^[a-z][a-z0-9_]{0,28}bot$/.test(normalized) || normalized.length < 5 || normalized.length > 32) {
      setError(ru ? "Имя бота должно содержать 5–32 символа и заканчиваться на bot." : "The bot username must be 5–32 characters and end in bot.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { data, error: createError } = await client.rpc("create_user_bot", {
        p_display_name: newName.trim(),
        p_username: normalized,
        p_description: newDescription.trim(),
        p_welcome_message: newWelcome.trim(),
      });
      if (createError) throw createError;
      await loadBots();
      const { data: created, error: fetchError } = await client.from("bots").select(botColumns).eq("id", data).single();
      if (fetchError) throw fetchError;
      const bot = created as BotProfile;
      setSelectedBot(bot);
      setEditName(bot.display_name);
      setEditUsername(bot.username);
      setEditDescription(bot.description);
      setEditWelcome(bot.welcome_message);
      await loadCommands(bot.id);
      setView("manage");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setError(/duplicate|unique|23505|already taken/i.test(message)
        ? (ru ? "Этот @username уже занят." : "That @username is already taken.")
        : (message || (ru ? "Не удалось создать бота." : "Could not create the bot.")));
    } finally {
      setBusy(false);
    }
  }

  async function openManager(bot: BotProfile) {
    setSelectedBot(bot);
    setEditName(bot.display_name);
    setEditUsername(bot.username);
    setEditDescription(bot.description);
    setEditWelcome(bot.welcome_message);
    setError("");
    setBusy(true);
    try {
      await loadCommands(bot.id);
      setView("manage");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ru ? "Не удалось загрузить команды." : "Could not load commands."));
    } finally {
      setBusy(false);
    }
  }

  async function saveBot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedBot || selectedBot.owner_id !== user.id) return;
    const normalized = editUsername.trim().replace(/^@/, "").toLowerCase();
    if (!/^[a-z][a-z0-9_]{0,28}bot$/.test(normalized) || normalized.length < 5 || normalized.length > 32) {
      setError(ru ? "Имя бота должно заканчиваться на bot." : "The bot username must end in bot.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { data, error: saveError } = await client.from("bots").update({
        display_name: editName.trim(),
        username: normalized,
        description: editDescription.trim(),
        welcome_message: editWelcome.trim(),
        updated_at: new Date().toISOString(),
      }).eq("id", selectedBot.id).select(botColumns).single();
      if (saveError) throw saveError;
      setSelectedBot(data as BotProfile);
      setBots((current) => current.map((item) => item.id === selectedBot.id ? data as BotProfile : item));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setError(/duplicate|unique|23505|already taken/i.test(message)
        ? (ru ? "Этот @username уже занят." : "That @username is already taken.")
        : (message || (ru ? "Не удалось сохранить бота." : "Could not save the bot.")));
    } finally {
      setBusy(false);
    }
  }

  async function toggleBotActive() {
    if (!selectedBot || selectedBot.owner_id !== user.id) return;
    setBusy(true);
    const next = !selectedBot.is_active;
    const { data, error: updateError } = await client.from("bots")
      .update({ is_active: next, updated_at: new Date().toISOString() })
      .eq("id", selectedBot.id).select(botColumns).single();
    if (updateError) setError(updateError.message);
    else {
      setSelectedBot(data as BotProfile);
      setBots((current) => current.map((item) => item.id === selectedBot.id ? data as BotProfile : item));
    }
    setBusy(false);
  }

  async function updateBotOption(field: "allow_groups" | "privacy_mode", value: boolean) {
    if (!selectedBot || selectedBot.owner_id !== user.id) return;
    const { data, error: updateError } = await client.from("bots")
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq("id", selectedBot.id).select(botColumns).single();
    if (updateError) setError(updateError.message);
    else {
      setSelectedBot(data as BotProfile);
      setBots((current) => current.map((item) => item.id === selectedBot.id ? data as BotProfile : item));
    }
  }

  async function addCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedBot || selectedBot.owner_id !== user.id) return;
    const normalized = commandName.trim().replace(/^\//, "").toLowerCase();
    if (!/^[a-z][a-z0-9_]{0,31}$/.test(normalized) || normalized === "start" || normalized === "help") {
      setError(ru ? "Команда: латинские буквы, цифры и _. /start и /help зарезервированы." : "Use a–z, 0–9 and _. /start and /help are reserved.");
      return;
    }
    if (!commandResponse.trim() || commandResponse.trim().length > 4000) {
      setError(ru ? "Добавь ответ длиной до 4000 символов." : "Add a reply of up to 4000 characters.");
      return;
    }
    setBusy(true);
    setError("");
    const { error: insertError } = await client.from("bot_commands").insert({
      bot_id: selectedBot.id,
      command_name: normalized,
      description: commandDescription.trim(),
      response_text: commandResponse.trim(),
      sort_order: commands.length + 1,
    });
    if (insertError) setError(/duplicate|unique|23505/i.test(insertError.message)
      ? (ru ? "Такая команда уже существует." : "That command already exists.")
      : insertError.message);
    else {
      setCommandName("");
      setCommandDescription("");
      setCommandResponse("");
      await loadCommands(selectedBot.id);
    }
    setBusy(false);
  }

  async function toggleCommand(command: BotCommand) {
    const { error: updateError } = await client.from("bot_commands")
      .update({ enabled: !command.enabled, updated_at: new Date().toISOString() }).eq("id", command.id);
    if (updateError) setError(updateError.message);
    else if (selectedBot) await loadCommands(selectedBot.id);
  }

  async function deleteCommand(command: BotCommand) {
    if (command.command_name === "start" || command.command_name === "help") return;
    const { error: deleteError } = await client.from("bot_commands").delete().eq("id", command.id);
    if (deleteError) setError(deleteError.message);
    else if (selectedBot) await loadCommands(selectedBot.id);
  }

  async function openChat(bot: BotProfile) {
    if (bot.owner_id === user.id) {
      await openManager(bot);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { data: existing, error: findError } = await client.from("bot_chats")
        .select("id").eq("user_id", user.id).eq("bot_id", bot.id).maybeSingle();
      if (findError) throw findError;
      let nextChatId = existing?.id as string | undefined;
      if (!nextChatId) {
        const { data: created, error: insertError } = await client.from("bot_chats")
          .insert({ user_id: user.id, bot_id: bot.id }).select("id").single();
        if (insertError) throw insertError;
        nextChatId = created.id as string;
      }
      setSelectedBot(bot);
      setChatId(nextChatId);
      setMessages([]);
      setView("chat");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ru ? "Не удалось открыть чат с ботом." : "Could not open bot chat."));
    } finally {
      setBusy(false);
    }
  }

  async function loadMessages(id: string) {
    const { data, error: messageError } = await client.from("bot_messages")
      .select("id, chat_id, sender_kind, sender_user_id, body, created_at")
      .eq("chat_id", id).order("created_at").limit(300);
    if (messageError) setError(messageError.message);
    else setMessages((data ?? []) as BotMessage[]);
  }

  useEffect(() => {
    if (!chatId) return;
    void loadMessages(chatId);
    const channel = client.channel("bot-chat:" + chatId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "bot_messages", filter: "chat_id=eq." + chatId }, () => {
        void loadMessages(chatId);
      })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [client, chatId]);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!chatId || !draft.trim() || busy) return;
    const body = draft.trim();
    setDraft("");
    setBusy(true);
    setError("");
    const { error: sendError } = await client.rpc("send_bot_message", { p_chat_id: chatId, p_body: body });
    if (sendError) {
      setDraft(body);
      setError(sendError.message);
    } else {
      await loadMessages(chatId);
    }
    setBusy(false);
  }

  function backToCatalog() {
    setView("catalog");
    setSelectedBot(null);
    setChatId(null);
    setMessages([]);
    setError("");
    void loadBots().catch(() => undefined);
  }

  return (
    <div className="bots-hub-overlay">
      <section className="bots-hub-page" role="dialog" aria-modal="true" aria-label={ru ? "Боты HELORO" : "HELORO bots"}>
        <header className="bots-hub-header">
          {view === "catalog" ? (
            <button className="icon-button" type="button" onClick={onClose} aria-label={ru ? "Закрыть" : "Close"}><X size={20} /></button>
          ) : (
            <button className="icon-button" type="button" onClick={() => view === "chat" ? backToCatalog() : backToCatalog()} aria-label={ru ? "Назад" : "Back"}><ArrowLeft size={20} /></button>
          )}
          <div className="bots-hub-title">
            <strong>{view === "chat" && selectedBot ? selectedBot.display_name : (ru ? "Боты" : "Bots")}</strong>
            <small>{view === "manage" ? (ru ? "Управление ботом" : "Manage bot") : view === "create" ? (ru ? "Создание бота" : "Create a bot") : view === "chat" ? "@" + (selectedBot?.username ?? "") : (ru ? "Каталог и управление" : "Discover and manage")}</small>
          </div>
          {view === "catalog" && <button className="bots-create-top" type="button" onClick={() => { setError(""); setView("create"); }}><Plus size={17} />{ru ? "Создать" : "Create"}</button>}
        </header>

        {error && <div className="bots-error" role="alert">{error}<button type="button" onClick={() => setError("")} aria-label={ru ? "Скрыть ошибку" : "Dismiss error"}><X size={15} /></button></div>}

        {view === "catalog" && (
          <div className="bots-catalog">
            <label className="bots-search"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ru ? "Поиск ботов по имени или @username" : "Search bots by name or @username"} /></label>
            <div className="bots-tabs">
              <button type="button" className={tab === "all" ? "active" : ""} onClick={() => setTab("all")}>{ru ? "Все боты" : "All bots"}</button>
              <button type="button" className={tab === "mine" ? "active" : ""} onClick={() => setTab("mine")}>{ru ? "Мои боты" : "My bots"}{ownBots.length > 0 && <span>{ownBots.length}</span>}</button>
            </div>
            {loading ? <div className="bots-empty">{ru ? "Загрузка…" : "Loading…"}</div> : visibleBots.length === 0 ? (
              <div className="bots-empty">
                <span className="bots-empty-icon"><Bot size={27} /></span>
                <strong>{tab === "mine" ? (ru ? "У тебя пока нет ботов" : "You have no bots yet") : (ru ? "Боты не найдены" : "No bots found")}</strong>
                <p>{tab === "mine" ? (ru ? "Создай первого бота и настрой его команды." : "Create your first bot and configure its commands.") : (ru ? "Попробуй другое имя или создай собственного бота." : "Try another name or create your own bot.")}</p>
                {tab === "mine" && <button className="bots-primary" type="button" onClick={() => setView("create")}><Plus size={16} />{ru ? "Создать бота" : "Create bot"}</button>}
              </div>
            ) : (
              <div className="bots-list">
                {visibleBots.map((bot) => (
                  <article className="bots-list-item" key={bot.id}>
                    <button className="bots-list-main" type="button" onClick={() => void openChat(bot)}>
                      <span className="bots-avatar"><Bot size={21} /></span>
                      <span className="bots-list-copy"><strong>{bot.display_name}<span className="bots-badge">BOT</span></strong><small>@{bot.username}</small><span>{bot.description || (ru ? "Бот HELORO" : "HELORO bot")}</span></span>
                      <ChevronRight size={18} />
                    </button>
                    {bot.owner_id === user.id && <button className="bots-manage-shortcut" type="button" onClick={() => void openManager(bot)}>{ru ? "Управлять" : "Manage"}</button>}
                  </article>
                ))}
              </div>
            )}
            <p className="bots-security-note"><ShieldCheck size={14} />{ru ? "Бот видит только сообщения, которые отправлены ему. Пароли и коды входа ботам отправлять нельзя." : "A bot only receives messages sent to it. Never send passwords or sign-in codes to bots."}</p>
          </div>
        )}

        {view === "create" && (
          <form className="bots-form" onSubmit={createBot}>
            <div className="bots-form-intro"><span className="bots-large-avatar"><Bot size={29} /></span><div><strong>{ru ? "Новый бот" : "New bot"}</strong><p>{ru ? "Создай отдельный bot-аккаунт с собственным именем и командами." : "Create a separate bot account with its own profile and commands."}</p></div></div>
            <label>{ru ? "Название бота" : "Bot name"}<input required minLength={2} maxLength={64} value={newName} onChange={(event) => setNewName(event.target.value)} placeholder={ru ? "Например, Помощник" : "For example, Helper"} /></label>
            <label>@username<div className="bots-username-input"><span>@</span><input required minLength={5} maxLength={32} value={newUsername} onChange={(event) => setNewUsername(event.target.value.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9_]/g, "").slice(0, 32))} placeholder="my_helper_bot" autoCapitalize="none" autoCorrect="off" spellCheck={false} /></div><small>{ru ? "5–32 символа, латиница и цифры; имя должно заканчиваться на bot." : "5–32 characters, Latin letters and numbers; username must end in bot."}</small></label>
            <label>{ru ? "Описание" : "Description"}<textarea rows={3} maxLength={255} value={newDescription} onChange={(event) => setNewDescription(event.target.value)} placeholder={ru ? "Что умеет этот бот?" : "What does this bot do?"} /></label>
            <label>{ru ? "Приветствие / ответ на /start" : "Welcome message /start"}<textarea rows={3} maxLength={1000} value={newWelcome} onChange={(event) => setNewWelcome(event.target.value)} placeholder={ru ? "Привет! Отправь /help, чтобы увидеть команды." : "Hi! Send /help to see available commands."} /></label>
            <div className="bots-form-actions"><button className="bots-secondary" type="button" onClick={backToCatalog}>{ru ? "Отмена" : "Cancel"}</button><button className="bots-primary" type="submit" disabled={busy || newName.trim().length < 2 || newUsername.length < 5}>{busy ? (ru ? "Создание…" : "Creating…") : (ru ? "Создать бота" : "Create bot")}</button></div>
          </form>
        )}

        {view === "manage" && selectedBot && (
          <div className="bots-manage-view">
            <div className="bots-manage-profile"><span className="bots-large-avatar"><Bot size={30} /></span><div><strong>{selectedBot.display_name}</strong><small>@{selectedBot.username}</small><span className={selectedBot.is_active ? "bots-status-active" : "bots-status-off"}>{selectedBot.is_active ? (ru ? "Активен" : "Active") : (ru ? "Отключён" : "Disabled")}</span></div></div>
            <form className="bots-form bots-edit-form" onSubmit={saveBot}>
              <label>{ru ? "Название" : "Display name"}<input value={editName} onChange={(event) => setEditName(event.target.value)} minLength={2} maxLength={64} required /></label>
              <label>@username<div className="bots-username-input"><span>@</span><input value={editUsername} onChange={(event) => setEditUsername(event.target.value.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9_]/g, "").slice(0, 32))} minLength={5} maxLength={32} required /></div></label>
              <label>{ru ? "Описание" : "Description"}<textarea rows={3} maxLength={255} value={editDescription} onChange={(event) => setEditDescription(event.target.value)} /></label>
              <label>{ru ? "Ответ на /start" : "Welcome message"}<textarea rows={3} maxLength={1000} value={editWelcome} onChange={(event) => setEditWelcome(event.target.value)} /></label>
              <button className="bots-primary" type="submit" disabled={busy}>{ru ? "Сохранить профиль" : "Save profile"}</button>
            </form>
            <div className="bots-options">
              <label><span><strong>{ru ? "Разрешить добавление в группы" : "Allow adding to groups"}</strong><small>{ru ? "Возможность подключить бота к группе." : "Allow this bot to be added to groups."}</small></span><input type="checkbox" checked={selectedBot.allow_groups} onChange={(event) => void updateBotOption("allow_groups", event.target.checked)} /></label>
              <label><span><strong>{ru ? "Режим приватности" : "Privacy mode"}</strong><small>{ru ? "По умолчанию бот не должен читать все сообщения группы." : "By default, the bot should not read every group message."}</small></span><input type="checkbox" checked={selectedBot.privacy_mode} onChange={(event) => void updateBotOption("privacy_mode", event.target.checked)} /></label>
            </div>
            <div className="bots-commands-heading"><div><Command size={18} /><strong>{ru ? "Команды" : "Commands"}</strong></div><small>{ru ? "Пользователь отправляет /команду в чате с ботом." : "Users send /commands in the bot chat."}</small></div>
            <div className="bots-command-list">
              {commands.map((command) => (
                <div className="bots-command-item" key={command.id}>
                  <div><strong>/{command.command_name}</strong><small>{command.command_name === "help" ? (ru ? "Автоматический список команд" : "Automatic command list") : command.command_name === "start" ? (ru ? "Приветствие бота" : "Bot welcome message") : command.description}</small></div>
                  {command.command_name !== "start" && command.command_name !== "help" && <><button type="button" className="bots-icon-action" onClick={() => void toggleCommand(command)} aria-label={command.enabled ? (ru ? "Отключить" : "Disable") : (ru ? "Включить" : "Enable")}>{command.enabled ? <Pause size={15} /> : <Play size={15} />}</button><button type="button" className="bots-icon-action danger" onClick={() => void deleteCommand(command)} aria-label={ru ? "Удалить команду" : "Delete command"}><Trash2 size={15} /></button></>}
                </div>
              ))}
            </div>
            <form className="bots-add-command" onSubmit={addCommand}>
              <strong>{ru ? "Добавить команду" : "Add command"}</strong>
              <label>/{ru ? "Название команды" : "Command name"}<input required minLength={1} maxLength={32} value={commandName} onChange={(event) => setCommandName(event.target.value.toLowerCase().replace(/^\//, "").replace(/[^a-z0-9_]/g, "").slice(0, 32))} placeholder="status" /></label>
              <label>{ru ? "Краткое описание" : "Short description"}<input maxLength={100} value={commandDescription} onChange={(event) => setCommandDescription(event.target.value)} placeholder={ru ? "Показывает статус" : "Shows the current status"} /></label>
              <label>{ru ? "Ответ бота" : "Bot reply"}<textarea required rows={3} maxLength={4000} value={commandResponse} onChange={(event) => setCommandResponse(event.target.value)} placeholder={ru ? "Текст, который отправит бот" : "Text the bot will send"} /></label>
              <button className="bots-secondary" type="submit" disabled={busy}><Plus size={15} />{ru ? "Добавить команду" : "Add command"}</button>
            </form>
            <button className={selectedBot.is_active ? "bots-danger-action" : "bots-secondary"} type="button" disabled={busy} onClick={() => void toggleBotActive()}>{selectedBot.is_active ? (ru ? "Отключить бота" : "Disable bot") : (ru ? "Включить бота" : "Enable bot")}</button>
            <p className="bots-security-note"><ShieldCheck size={14} />{ru ? "Владелец видит настройки своего бота. Другие пользователи могут видеть только публичный профиль и команды активного бота." : "Owners manage their bots. Other users can only see the public profile and commands of active bots."}</p>
          </div>
        )}

        {view === "chat" && selectedBot && chatId && (
          <div className="bots-chat-view">
            <div className="bots-chat-profile"><span className="bots-avatar"><Bot size={20} /></span><span><strong>{selectedBot.display_name}</strong><small>@{selectedBot.username} · BOT</small></span><button type="button" onClick={() => void openManager(selectedBot)} disabled={selectedBot.owner_id !== user.id} aria-label={ru ? "Управление" : "Manage"}><ShieldCheck size={17} /></button></div>
            <div className="bots-chat-description">{selectedBot.description || (ru ? "Чат с ботом HELORO." : "HELORO bot chat.")}</div>
            <div className="bots-chat-messages">
              {messages.length === 0 && <div className="bots-chat-empty"><Bot size={25} /><p>{ru ? "Отправь /start, чтобы начать." : "Send /start to begin."}</p></div>}
              {messages.map((message) => <div key={message.id} className={message.sender_kind === "user" ? "bots-message bots-message-user" : "bots-message bots-message-bot"}><p>{message.body}</p><small>{new Date(message.created_at).toLocaleTimeString(ru ? "ru-RU" : "en-US", { hour: "2-digit", minute: "2-digit" })}</small></div>)}
            </div>
            <form className="bots-chat-composer" onSubmit={sendMessage}><input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={ru ? "Напишите боту или отправьте /команду…" : "Message the bot or send a /command…"} maxLength={4000} /><button type="submit" disabled={busy || !draft.trim()} aria-label={ru ? "Отправить" : "Send"}><Send size={18} /></button></form>
            <p className="bots-chat-note"><MessageCircle size={13} />{ru ? "Пока работают команды и заранее заданные ответы. Произвольный код ботов и Mini Apps — отдельный этап." : "Commands and configured replies are supported now. Arbitrary bot code and Mini Apps are a separate stage."}</p>
          </div>
        )}
      </section>
    </div>
  );
}
