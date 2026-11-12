import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import {
  ArrowLeft,
  ArrowUp,
  CheckCheck,
  LogOut,
  Menu,
  MessageCircle,
  MoreHorizontal,
  PencilLine,
  Search,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  createDirectConversation,
  getInbox,
  getMessages,
  searchProfiles,
  sendMessage,
  subscribeToMessages,
} from "../../lib/messenger";
import { formatInboxTime, formatMessageTime, initials, messageBodySchema } from "../../lib/domain";
import type { InboxConversation, Message, Profile, PublicProfile } from "../../lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { t, type Locale } from "../../lib/i18n";

type Props = {
  client: SupabaseClient;
  user: User;
  profile: Profile;
  locale: Locale;
  onLocaleChange: (next: Locale) => void;
  isOwner: boolean;
};

function Avatar({ label, className = "" }: { label: string; className?: string }) {
  return <div className={`avatar ${className}`} aria-hidden="true">{initials(label)}</div>;
}

function EmptyChat({ locale }: { locale: Locale }) {
  return (
    <div className="empty-chat">
      <div className="empty-chat-icon"><MessageCircle size={28} /></div>
      <h2>{t(locale, "chatSelectTitle")}</h2>
      <p>{t(locale, "chatSelectDescription")}</p>
    </div>
  );
}

export default function MessengerApp({ client, user, profile, locale, onLocaleChange, isOwner }: Props) {
  const [inbox, setInbox] = useState<InboxConversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [chatFilter, setChatFilter] = useState<"all" | "personal">("all");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeConversation = useMemo(
    () => inbox.find((item) => item.conversation_id === activeId) ?? null,
    [inbox, activeId],
  );

  const visibleInbox = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const base = chatFilter === "personal" ? inbox : inbox;
    if (!query) return base;
    return base.filter((item) =>
      (item.display_name || "").toLocaleLowerCase().includes(query) ||
      (item.username || "").toLocaleLowerCase().includes(query) ||
      (item.last_message || "").toLocaleLowerCase().includes(query),
    );
  }, [inbox, search, chatFilter]);

  async function refreshInbox(selectId?: string) {
    const updated = await getInbox();
    setInbox(updated);
    if (selectId) setActiveId(selectId);
    else if (activeId && !updated.some((item) => item.conversation_id === activeId)) setActiveId(null);
  }

  useEffect(() => {
    let active = true;
    setLoadingInbox(true);
    getInbox()
      .then((items) => { if (active) setInbox(items); })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : t(locale, "inboxLoadFailed"));
      })
      .finally(() => { if (active) setLoadingInbox(false); });
    return () => { active = false; };
  }, [locale]);

  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    let active = true;
    setLoadingMessages(true);
    setError("");
    getMessages(activeId)
      .then((items) => { if (active) setMessages(items); })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : t(locale, "messagesLoadFailed"));
      })
      .finally(() => { if (active) setLoadingMessages(false); });

    const channel = subscribeToMessages(activeId, (incoming) => {
      setMessages((current) => current.some((item) => item.id === incoming.id) ? current : [...current, incoming]);
      void refreshInbox();
    });
    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [activeId, client, locale]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    const normalized = search.trim();
    if (normalized.replace(/^@/, "").length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    let active = true;
    setSearching(true);
    const timeout = window.setTimeout(() => {
      searchProfiles(normalized, user.id)
        .then((items) => { if (active) setResults(items); })
        .catch((cause: unknown) => {
          if (active) setError(cause instanceof Error ? cause.message : t(locale, "searchFailed"));
        })
        .finally(() => { if (active) setSearching(false); });
    }, 220);
    return () => { active = false; window.clearTimeout(timeout); };
  }, [search, user.id, locale]);

  useEffect(() => {
    if (!showSettings) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setShowSettings(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [showSettings]);

  useEffect(() => {
    if (showSearch) searchInputRef.current?.focus();
  }, [showSearch]);

  async function startConversation(target: PublicProfile) {
    setError("");
    try {
      const conversationId = await createDirectConversation(target.username);
      await refreshInbox(conversationId);
      setSearch("");
      setResults([]);
      setShowSearch(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t(locale, "conversationCreateFailed"));
    }
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = messageBodySchema.safeParse(draft);
    if (!parsed.success || !activeId) return;
    setSending(true);
    setError("");
    const currentDraft = parsed.data;
    setDraft("");
    try {
      const saved = await sendMessage(activeId, user.id, currentDraft);
      setMessages((current) => current.some((item) => item.id === saved.id) ? current : [...current, saved]);
      await refreshInbox();
    } catch (cause) {
      setDraft(currentDraft);
      setError(cause instanceof Error ? cause.message : t(locale, "messageSendFailed"));
    } finally {
      setSending(false);
    }
  }

  async function signOut() {
    const { error: signOutError } = await client.auth.signOut();
    if (signOutError) setError(signOutError.message);
    else setShowSettings(false);
  }

  function openSearch() {
    setShowSearch(true);
    setSearch("");
    setResults([]);
  }

  return (
    <main className={`messenger-stage ${activeConversation ? "chat-selected" : ""}`}>
      <div className="messenger-shell">
        <aside className="inbox-panel">
          <header className="inbox-topbar">
            <button
              className="icon-button menu-button"
              title={t(locale, "settings")}
              aria-label={t(locale, "settings")}
              onClick={() => setShowSettings(true)}
            >
              <Menu size={21} />
            </button>
            <div className="brand-lockup"><div className="brand-symbol">H</div><span>HELORO</span></div>
            <button
              className="icon-button compose-button"
              title={t(locale, "inboxStartConversation")}
              aria-label={t(locale, "inboxStartConversation")}
              onClick={openSearch}
            >
              <PencilLine size={19} />
            </button>
          </header>

          <div className="inbox-search-area">
            <label className="telegram-search">
              <Search size={18} />
              <input
                ref={searchInputRef}
                value={search}
                onChange={(event) => { setSearch(event.target.value); setShowSearch(true); }}
                onFocus={() => setShowSearch(true)}
                placeholder={t(locale, "inboxSearchPlaceholder")}
                aria-label={t(locale, "inboxSearchPlaceholder")}
              />
              {search && (
                <button className="clear-search" onClick={() => { setSearch(""); setResults([]); }} aria-label={t(locale, "inboxClear")}>
                  <X size={15} />
                </button>
              )}
            </label>
          </div>

          <div className="chat-filter-tabs" role="tablist" aria-label={t(locale, "inboxTitle")}>
            <button type="button" role="tab" aria-selected={chatFilter === "all"} className={chatFilter === "all" ? "active" : ""} onClick={() => setChatFilter("all")}>
              {t(locale, "chatAll")}
            </button>
            <button type="button" role="tab" aria-selected={chatFilter === "personal"} className={chatFilter === "personal" ? "active" : ""} onClick={() => setChatFilter("personal")}>
              {t(locale, "chatPersonal")}
            </button>
          </div>

          <section className="conversation-list">
            {showSearch && search.trim().length > 1 ? (
              <>
                <div className="section-label">{t(locale, "inboxPeople")}</div>
                {searching ? (
                  <p className="muted small-copy">{t(locale, "inboxSearching")}</p>
                ) : results.length === 0 ? (
                  <p className="muted small-copy">{t(locale, "inboxNoResults")}</p>
                ) : results.map((person) => (
                  <button className="person-result" key={person.id} onClick={() => void startConversation(person)}>
                    <Avatar label={person.display_name || person.username} />
                    <span><strong>{person.display_name || person.username}</strong><small>@{person.username}</small></span>
                    <MessageCircle size={17} />
                  </button>
                ))}
                <button className="cancel-search" onClick={() => { setShowSearch(false); setSearch(""); setResults([]); }}>
                  {t(locale, "inboxBack")}
                </button>
              </>
            ) : (
              <>
                {loadingInbox ? (
                  <div className="list-placeholder"><span /><span /><span /><span /></div>
                ) : visibleInbox.length === 0 ? (
                  <div className="inbox-empty">
                    <div className="inbox-empty-icon"><MessageCircle size={21} /></div>
                    <strong>{t(locale, "inboxEmptyTitle")}</strong>
                    <p>{t(locale, "inboxEmptyDescription")}</p>
                    <button onClick={openSearch}>{t(locale, "inboxFindSomeone")}</button>
                  </div>
                ) : visibleInbox.map((item) => {
                  const label = item.display_name || item.username;
                  return (
                    <button
                      className={`conversation-item ${activeId === item.conversation_id ? "selected" : ""}`}
                      key={item.conversation_id}
                      onClick={() => { setActiveId(item.conversation_id); setShowSearch(false); }}
                    >
                      <Avatar label={label} />
                      <span className="conversation-copy">
                        <span className="conversation-title-line">
                          <strong>{label}</strong>
                          <time>{formatInboxTime(item.last_message_at)}</time>
                        </span>
                        <span className="conversation-preview-line">
                          <small>{item.last_message || t(locale, "inboxSayHello")}</small>
                          {item.last_message && <CheckCheck className="preview-check" size={15} />}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </>
            )}
          </section>

          <footer className="inbox-profile">
            <Avatar label={profile.display_name} className="profile-avatar" />
            <span className="profile-summary">
              <strong>{profile.display_name}</strong>
              <small>@{profile.username}</small>
            </span>
            {isOwner && <span className="owner-mini-mark" title={t(locale, "ownerRole")}><ShieldCheck size={15} /></span>}
            <button className="icon-button profile-menu-button" title={t(locale, "settings")} aria-label={t(locale, "settings")} onClick={() => setShowSettings(true)}>
              <Settings2 size={18} />
            </button>
          </footer>
        </aside>

        <section className="conversation-panel">
          {activeConversation ? (
            <>
              <header className="chat-header">
                <button className="icon-button mobile-back" aria-label={t(locale, "inboxBack")} onClick={() => setActiveId(null)}>
                  <ArrowLeft size={20} />
                </button>
                <Avatar label={activeConversation.display_name || activeConversation.username} className="chat-header-avatar" />
                <div className="chat-person">
                  <strong>{activeConversation.display_name || activeConversation.username}</strong>
                  <small>@{activeConversation.username}</small>
                </div>
                <div className="chat-header-actions">
                  <button className="icon-button" aria-label={t(locale, "chatSearch")} title={t(locale, "chatSearch")} onClick={() => openSearch()}>
                    <Search size={20} />
                  </button>
                  <button className="icon-button" aria-label={t(locale, "chatOptions")} title={t(locale, "chatOptions")} onClick={() => setError(t(locale, "chatOptionsUnavailable"))}>
                    <MoreHorizontal size={21} />
                  </button>
                </div>
              </header>
              <div className="message-stream">
                <div className="chat-date-pill">{t(locale, "chatConversationLabel")}</div>
                {loadingMessages ? (
                  <div className="message-loading">{t(locale, "chatLoading")}</div>
                ) : messages.length === 0 ? (
                  <div className="first-message">
                    <div className="first-message-icon"><MessageCircle size={20} /></div>
                    <strong>{t(locale, "chatFirstMessageTitle")}</strong>
                    <p>{t(locale, "chatFirstMessageDescription")}</p>
                  </div>
                ) : messages.map((message) => {
                  const mine = message.sender_id === user.id;
                  return (
                    <div className={`message-row ${mine ? "mine" : "theirs"}`} key={message.id}>
                      <div className="message-bubble">
                        <p>{message.body}</p>
                        <span>{formatMessageTime(message.created_at)} {mine && <CheckCheck size={13} />}</span>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
              {error && <div className="inline-error" role="alert">{error}<button onClick={() => setError("")} aria-label={t(locale, "dismiss")}><X size={14} /></button></div>}
              <form className="composer" onSubmit={handleSend}>
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={t(locale, "messagePlaceholder")}
                  aria-label={t(locale, "messagePlaceholder")}
                  maxLength={4000}
                />
                <button type="submit" disabled={sending || !draft.trim()} aria-label={t(locale, "messageSend")} className="send-button">
                  {sending ? <span className="button-spinner" /> : <ArrowUp size={20} />}
                </button>
              </form>
              <div className="chat-footnote"><ShieldCheck size={13} /> {t(locale, "messageSecurityNote")}</div>
            </>
          ) : (
            <EmptyChat locale={locale} />
          )}
        </section>
      </div>

      {error && !activeConversation && <div className="global-error" role="alert">{error}<button onClick={() => setError("")} aria-label={t(locale, "dismiss")}><X size={14} /></button></div>}

      {showSettings && (
        <div className="settings-overlay" onClick={() => setShowSettings(false)}>
          <section className="settings-card glass-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(event) => event.stopPropagation()}>
            <div className="settings-heading">
              <h2 id="settings-title">{t(locale, "settingsTitle")}</h2>
              <button className="icon-button" onClick={() => setShowSettings(false)} aria-label={t(locale, "settingsClose")}><X size={18} /></button>
            </div>
            <div className="settings-account">
              <Avatar label={profile.display_name} />
              <span><strong>{profile.display_name}</strong><small>@{profile.username}</small></span>
            </div>
            {isOwner && <div className="settings-owner"><ShieldCheck size={15} /><span>{t(locale, "ownerRole")}</span></div>}
            <div className="settings-row">
              <span>{t(locale, "language")}</span>
              <div className="settings-language" role="group" aria-label={t(locale, "language")}>
                <button type="button" className={locale === "ru" ? "active" : ""} aria-pressed={locale === "ru"} onClick={() => onLocaleChange("ru")}>{t(locale, "languageRu")}</button>
                <button type="button" className={locale === "en" ? "active" : ""} aria-pressed={locale === "en"} onClick={() => onLocaleChange("en")}>{t(locale, "languageEn")}</button>
              </div>
            </div>
            <button className="settings-signout" onClick={() => void signOut()}><LogOut size={16} /> {t(locale, "settingsSignOut")}</button>
          </section>
        </div>
      )}
    </main>
  );
}
