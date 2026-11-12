import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import {
  BadgeCheck,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  MessageCircle,
  Megaphone,
  Send,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createChannelPost,
  deleteChannelComment,
  deleteChannelPost,
  deleteDiscussionMessage,
  getChannelComments,
  getChannelPosts,
  getNewsChannel,
  getOrCreateSupportThread,
  getSupportMessages,
  getSupportThreads,
  getDiscussionMessages,
  getUserReports,
  sendChannelComment,
  sendDiscussionMessage,
  sendSupportMessage,
  setVerificationBadge,
  subscribeToOfficialInserts,
  updateReportStatus,
  type BadgeType,
  type ChannelComment,
  type ChannelPost,
  type DiscussionMessage,
  type SupportMessage,
  type SupportThread,
  type UserReport,
} from "../../lib/official";
import { searchProfiles } from "../../lib/messenger";
import { formatMessageTime, initials } from "../../lib/domain";
import type { PublicProfile } from "../../lib/types";
import type { Locale } from "../../lib/i18n";

type View = "news" | "discussion" | "support" | "admin";

type Props = {
  view: View;
  client: SupabaseClient;
  user: User;
  locale: Locale;
  roles: string[];
  onOpenDiscussion: () => void;
};

function Avatar({ label }: { label: string }) {
  return <div className="avatar system-avatar" aria-hidden="true">{initials(label)}</div>;
}

function SystemComposer({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <form className="composer system-composer" onSubmit={onSubmit}>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        maxLength={4000}
      />
      <button className="send-button" type="submit" disabled={disabled || !value.trim()} aria-label="Send">
        <Send size={17} />
      </button>
    </form>
  );
}

function NewsChannel({
  client,
  user,
  locale,
  canPublish,
  canDeletePosts,
  canModerate,
  onOpenDiscussion,
}: Omit<Props, "view" | "roles"> & { canPublish: boolean; canDeletePosts: boolean; canModerate: boolean }) {
  const ru = locale === "ru";
  const [channelId, setChannelId] = useState("");
  const [posts, setPosts] = useState<ChannelPost[]>([]);
  const [expandedPost, setExpandedPost] = useState<string | null>(null);
  const [comments, setComments] = useState<ChannelComment[]>([]);
  const [postDraft, setPostDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getNewsChannel(client)
      .then(async (channel) => {
        if (!active) return;
        setChannelId(channel.id);
        const items = await getChannelPosts(client, channel.id);
        if (active) setPosts(items);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : (ru ? "Не удалось загрузить канал." : "Could not load the channel.")));
    return () => { active = false; };
  }, [client, ru]);

  useEffect(() => {
    if (!channelId) return;
    const channel = subscribeToOfficialInserts<ChannelPost>(
      client,
      "channel_posts",
      `channel_id=eq.${channelId}`,
      (post) => setPosts((current) => current.some((item) => item.id === post.id) ? current : [post, ...current]),
      () => {
        void getChannelPosts(client, channelId).then(setPosts).catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : (ru ? "Не удалось обновить канал." : "Could not refresh the channel."));
        });
      },
    );
    return () => { void client.removeChannel(channel); };
  }, [client, channelId]);

  useEffect(() => {
    if (!expandedPost) {
      setComments([]);
      return;
    }
    let active = true;
    getChannelComments(client, expandedPost)
      .then((items) => { if (active) setComments(items); })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Comments could not be loaded."));
    const channel = subscribeToOfficialInserts<ChannelComment>(
      client,
      "channel_comments",
      `post_id=eq.${expandedPost}`,
      (comment) => setComments((current) => current.some((item) => item.id === comment.id) ? current : [...current, comment]),
      () => {
        void getChannelComments(client, expandedPost).then(setComments).catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : (ru ? "Не удалось обновить комментарии." : "Could not refresh comments."));
        });
      },
    );
    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [client, expandedPost]);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!channelId || !postDraft.trim()) return;
    setBusy(true);
    setError("");
    try {
      const post = await createChannelPost(client, channelId, user.id, postDraft);
      setPosts((current) => current.some((item) => item.id === post.id) ? current : [post, ...current]);
      setPostDraft("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ru ? "Не удалось опубликовать новость." : "Could not publish the post."));
    } finally {
      setBusy(false);
    }
  }

  async function comment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!expandedPost || !commentDraft.trim()) return;
    setBusy(true);
    setError("");
    try {
      const item = await sendChannelComment(client, expandedPost, user.id, commentDraft);
      setComments((current) => current.some((row) => row.id === item.id) ? current : [...current, item]);
      setCommentDraft("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ru ? "Не удалось отправить комментарий." : "Could not send the comment."));
    } finally {
      setBusy(false);
    }
  }

  async function removePost(postId: string) {
    if (!canDeletePosts || !window.confirm(ru ? "Удалить публикацию для всех?" : "Delete this post for everyone?")) return;
    setBusy(true);
    setError("");
    try {
      await deleteChannelPost(client, postId);
      setPosts((current) => current.filter((post) => post.id !== postId));
      if (expandedPost === postId) setExpandedPost(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ru ? "Не удалось удалить публикацию." : "Could not delete the post."));
    } finally {
      setBusy(false);
    }
  }

  async function removeComment(commentId: string) {
    if (!window.confirm(ru ? "Удалить комментарий для всех?" : "Delete this comment for everyone?")) return;
    setBusy(true);
    setError("");
    try {
      await deleteChannelComment(client, commentId);
      setComments((current) => current.filter((item) => item.id !== commentId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ru ? "Не удалось удалить комментарий." : "Could not delete the comment."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="special-panel">
      <header className="chat-header">
        <Avatar label="Heloro New" />
        <div className="chat-person">
          <strong>Heloro New <BadgeCheck className="system-verified-mark" size={15} /></strong>
          <small>{ru ? "Официальный канал HELORO" : "Official HELORO channel"}</small>
        </div>
        <div className="chat-header-actions">
          <button className="icon-button" onClick={onOpenDiscussion} title={ru ? "Обсуждение" : "Discussion"} aria-label={ru ? "Обсуждение" : "Discussion"}>
            <MessageCircle size={19} />
          </button>
        </div>
      </header>
      <div className="special-stream">
        <div className="system-description">{ru ? "Новости, обновления и важные объявления." : "News, updates and important announcements."}</div>
        {canPublish && (
          <form className="system-publish-form" onSubmit={publish}>
            <textarea value={postDraft} onChange={(event) => setPostDraft(event.target.value)} placeholder={ru ? "Новая публикация…" : "Write a new post…"} maxLength={4000} />
            <button className="primary-button" type="submit" disabled={busy || !postDraft.trim()}>{ru ? "Опубликовать" : "Publish"}</button>
          </form>
        )}
        {error && <p className="system-error" role="alert">{error}</p>}
        {posts.length === 0 ? (
          <div className="system-empty"><Megaphone size={24} /><strong>{ru ? "Пока нет публикаций" : "No posts yet"}</strong><span>{ru ? "Новые объявления появятся здесь." : "New announcements will appear here."}</span></div>
        ) : posts.map((post) => (
          <article className="system-post-card" key={post.id}>
            {post.is_pinned && <span className="system-pinned">{ru ? "Закреплено" : "Pinned"}</span>}
            <p>{post.body}</p>
            <div className="system-post-meta">
              <time>{formatMessageTime(post.created_at)}</time>
              <button onClick={() => setExpandedPost((current) => current === post.id ? null : post.id)}>
                <MessageCircle size={14} /> {expandedPost === post.id ? (ru ? "Скрыть комментарии" : "Hide comments") : (ru ? "Комментарии" : "Comments")}
              </button>
              <button onClick={onOpenDiscussion}><ChevronRight size={14} /> {ru ? "Обсуждение" : "Discussion"}</button>
              {canDeletePosts && (
                <button className="system-delete-button" type="button" onClick={() => void removePost(post.id)} disabled={busy}>
                  <Trash2 size={13} /> {ru ? "Удалить" : "Delete"}
                </button>
              )}
            </div>
            {expandedPost === post.id && (
              <div className="system-comments">
                {comments.length === 0 ? <span className="muted small-copy">{ru ? "Комментариев пока нет." : "No comments yet."}</span> : comments.map((item) => (
                  <div className="system-comment" key={item.id}>
                    <strong>{item.user_id === user.id ? (ru ? "Вы" : "You") : (ru ? "Участник" : "Member")}</strong>
                    <p>{item.body}</p>
                    <div className="system-comment-meta">
                      <time>{formatMessageTime(item.created_at)}</time>
                      {(item.user_id === user.id || canModerate) && (
                        <button className="system-delete-button" type="button" onClick={() => void removeComment(item.id)} disabled={busy}>
                          <Trash2 size={12} /> {ru ? "Удалить для всех" : "Delete for everyone"}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <SystemComposer value={commentDraft} onChange={setCommentDraft} onSubmit={comment} placeholder={ru ? "Написать комментарий…" : "Write a comment…"} disabled={busy} />
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function DiscussionChat({ client, user, locale, roles }: Omit<Props, "view" | "onOpenDiscussion">) {
  const ru = locale === "ru";
  const canModerate = roles.some((role) => role === "owner" || role === "admin" || role === "moderator");
  const [messages, setMessages] = useState<DiscussionMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getDiscussionMessages(client)
      .then((items) => { if (active) setMessages(items); })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load discussion."));
    const channel = subscribeToOfficialInserts<DiscussionMessage>(
      client,
      "channel_discussion_messages",
      undefined,
      (item) => setMessages((current) => current.some((row) => row.id === item.id) ? current : [...current, item]),
      () => {
        void getDiscussionMessages(client).then(setMessages).catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : (ru ? "Не удалось обновить обсуждение." : "Could not refresh discussion."));
        });
      },
    );
    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [client]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim()) return;
    setBusy(true);
    setError("");
    try {
      const item = await sendDiscussionMessage(client, user.id, draft);
      setMessages((current) => current.some((row) => row.id === item.id) ? current : [...current, item]);
      setDraft("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ru ? "Не удалось отправить сообщение." : "Could not send message."));
    } finally {
      setBusy(false);
    }
  }

  async function removeMessage(messageId: string) {
    if (!window.confirm(ru ? "Удалить сообщение для всех участников?" : "Delete this message for everyone?")) return;
    setBusy(true);
    setError("");
    try {
      await deleteDiscussionMessage(client, messageId);
      setMessages((current) => current.filter((item) => item.id !== messageId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ru ? "Не удалось удалить сообщение." : "Could not delete the message."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="special-panel">
      <header className="chat-header">
        <Avatar label="Heloro New" />
        <div className="chat-person"><strong>Heloro New</strong><small>{ru ? "Общий чат обсуждений" : "Public discussion chat"}</small></div>
      </header>
      <div className="special-stream">
        <div className="system-description">{ru ? "Общий чат для обсуждения новостей HELORO." : "A group chat to discuss HELORO news."}</div>
        {messages.length === 0 ? <div className="system-empty"><MessageCircle size={23} /><strong>{ru ? "Начните обсуждение" : "Start the discussion"}</strong></div> : messages.map((item) => (
          <div className={`system-message-row ${item.user_id === user.id ? "mine" : ""}`} key={item.id}>
            <div className="system-message-bubble">
              <strong>{item.user_id === user.id ? (ru ? "Вы" : "You") : (ru ? "Участник" : "Member")}</strong>
              <p>{item.body}</p>
              <div className="system-message-meta">
                <time>{formatMessageTime(item.created_at)}</time>
                {(item.user_id === user.id || canModerate) && (
                  <button className="system-delete-button" type="button" onClick={() => void removeMessage(item.id)} disabled={busy}>
                    <Trash2 size={12} /> {ru ? "Удалить для всех" : "Delete for everyone"}
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
        {error && <p className="system-error" role="alert">{error}</p>}
      </div>
      <SystemComposer value={draft} onChange={setDraft} onSubmit={send} placeholder={ru ? "Сообщение в обсуждение…" : "Message the discussion…"} disabled={busy} />
    </div>
  );
}

function SupportChat({ client, user, locale }: Omit<Props, "view" | "roles" | "onOpenDiscussion">) {
  const ru = locale === "ru";
  const [thread, setThread] = useState<SupportThread | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getOrCreateSupportThread(client, user.id)
      .then(async (value) => {
        if (!active) return;
        setThread(value);
        const items = await getSupportMessages(client, value.id);
        if (active) setMessages(items);
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : (ru ? "Не удалось открыть поддержку." : "Could not open support.")));
    return () => { active = false; };
  }, [client, user.id, ru]);

  useEffect(() => {
    if (!thread) return;
    const channel = subscribeToOfficialInserts<SupportMessage>(client, "support_messages", `thread_id=eq.${thread.id}`, (item) => {
      setMessages((current) => current.some((row) => row.id === item.id) ? current : [...current, item]);
    });
    return () => { void client.removeChannel(channel); };
  }, [client, thread]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!thread || !draft.trim()) return;
    setBusy(true);
    setError("");
    try {
      const item = await sendSupportMessage(client, thread.id, user.id, draft);
      setMessages((current) => current.some((row) => row.id === item.id) ? current : [...current, item]);
      setDraft("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ru ? "Не удалось отправить сообщение." : "Could not send the message."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="special-panel">
      <header className="chat-header">
        <Avatar label="Support Heloro" />
        <div className="chat-person"><strong>Support Heloro</strong><small>{ru ? "Личная поддержка" : "Private support"}</small></div>
      </header>
      <div className="special-stream">
        <div className="system-description">{ru ? "Опишите проблему. Ответ команды появится в этом чате." : "Describe the issue. The support team will reply in this chat."}</div>
        {messages.length === 0 ? <div className="system-empty"><MessageCircle size={23} /><strong>{ru ? "Напишите в поддержку" : "Message support"}</strong></div> : messages.map((item) => (
          <div className={`system-message-row ${item.sender_id === user.id ? "mine" : ""}`} key={item.id}>
            <div className="system-message-bubble">
              <strong>{item.sender_id === user.id ? (ru ? "Вы" : "You") : "Support Heloro"}</strong>
              <p>{item.body}</p>
              <time>{formatMessageTime(item.created_at)}</time>
            </div>
          </div>
        ))}
        {error && <p className="system-error" role="alert">{error}</p>}
      </div>
      <SystemComposer value={draft} onChange={setDraft} onSubmit={send} placeholder={ru ? "Сообщение в поддержку…" : "Message support…"} disabled={busy || !thread} />
    </div>
  );
}

function HeloroSPanel({ client, user, locale, roles }: Omit<Props, "view" | "onOpenDiscussion">) {
  const ru = locale === "ru";
  const [tab, setTab] = useState<"reports" | "support" | "verification">("reports");
  const [reports, setReports] = useState<UserReport[]>([]);
  const [threads, setThreads] = useState<SupportThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<SupportThread | null>(null);
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([]);
  const [reply, setReply] = useState("");
  const [targetQuery, setTargetQuery] = useState("");
  const [targetResults, setTargetResults] = useState<PublicProfile[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<PublicProfile | null>(null);
  const [badgeType, setBadgeType] = useState<BadgeType>("blue");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canManageBadges = roles.includes("owner") || roles.includes("admin");

  useEffect(() => {
    let active = true;
    if (tab === "reports") {
      getUserReports(client).then((items) => { if (active) setReports(items); }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load reports."));
    }
    if (tab === "support") {
      getSupportThreads(client).then((items) => { if (active) setThreads(items); }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load support threads."));
    }
    return () => { active = false; };
  }, [client, tab]);

  useEffect(() => {
    if (tab !== "reports") return;
    const channel = client.channel("heloro:staff:reports")
      .on("postgres_changes", { event: "*", schema: "public", table: "user_reports" }, () => {
        void getUserReports(client)
          .then(setReports)
          .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not refresh reports."));
      })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [client, tab]);

  useEffect(() => {
    if (tab !== "support") return;
    const channel = client.channel("heloro:staff:support-threads")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_threads" }, () => {
        void getSupportThreads(client)
          .then(setThreads)
          .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not refresh support threads."));
      })
      .subscribe();
    return () => { void client.removeChannel(channel); };
  }, [client, tab]);

  useEffect(() => {
    if (!selectedThread) {
      setSupportMessages([]);
      return;
    }
    let active = true;
    getSupportMessages(client, selectedThread.id)
      .then((items) => { if (active) setSupportMessages(items); })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load support messages."));
    const channel = subscribeToOfficialInserts<SupportMessage>(client, "support_messages", `thread_id=eq.${selectedThread.id}`, (item) => {
      setSupportMessages((current) => current.some((row) => row.id === item.id) ? current : [...current, item]);
    });
    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [client, selectedThread]);

  useEffect(() => {
    const query = targetQuery.trim();
    if (query.length < 2 || !canManageBadges) {
      setTargetResults([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      searchProfiles(query, user.id)
        .then((items) => { if (active) setTargetResults(items); })
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Search failed."));
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [client, targetQuery, user.id, canManageBadges]);

  async function replyToSupport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedThread || !reply.trim()) return;
    setBusy(true);
    try {
      const item = await sendSupportMessage(client, selectedThread.id, user.id, reply);
      setSupportMessages((current) => current.some((row) => row.id === item.id) ? current : [...current, item]);
      setReply("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send reply.");
    } finally {
      setBusy(false);
    }
  }

  async function changeReport(report: UserReport, status: UserReport["status"]) {
    setBusy(true);
    try {
      await updateReportStatus(client, report.id, status);
      setReports((current) => current.map((item) => item.id === report.id ? { ...item, status } : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update report.");
    } finally {
      setBusy(false);
    }
  }

  async function saveBadge() {
    if (!selectedTarget || !canManageBadges) return;
    setBusy(true);
    setError("");
    try {
      await setVerificationBadge(client, selectedTarget.id, user.id, badgeType);
      setSelectedTarget(null);
      setTargetQuery("");
      setTargetResults([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update verification.");
    } finally {
      setBusy(false);
    }
  }

  const roleLabel = roles.includes("owner") ? "HELORO Owner" : roles.includes("admin") ? "Admin" : "Moderator";
  const pendingCount = useMemo(() => reports.filter((report) => report.status === "open" || report.status === "reviewing").length, [reports]);

  return (
    <div className="special-panel admin-panel">
      <header className="chat-header">
        <div className="system-admin-icon"><ShieldCheck size={19} /></div>
        <div className="chat-person"><strong>HELORO S</strong><small>{roleLabel}</small></div>
      </header>
      <div className="special-stream">
        <div className="system-description">{ru ? "Закрытая панель поддержки и модерации." : "Private support and moderation workspace."}</div>
        <div className="system-tabs">
          <button className={tab === "reports" ? "active" : ""} onClick={() => setTab("reports")}><CircleAlert size={14} /> {ru ? "Жалобы" : "Reports"} {pendingCount > 0 && <span>{pendingCount}</span>}</button>
          <button className={tab === "support" ? "active" : ""} onClick={() => setTab("support")}><MessageCircle size={14} /> {ru ? "Поддержка" : "Support"}</button>
          {canManageBadges && <button className={tab === "verification" ? "active" : ""} onClick={() => setTab("verification")}><BadgeCheck size={14} /> {ru ? "Галочки" : "Badges"}</button>}
        </div>
        {error && <p className="system-error" role="alert">{error}</p>}
        {tab === "reports" && (
          <div className="admin-list">
            {reports.length === 0 ? <div className="system-empty"><CheckCircle2 size={24} /><strong>{ru ? "Жалоб пока нет" : "No reports yet"}</strong></div> : reports.map((report) => (
              <article className="admin-item" key={report.id}>
                <div className="admin-item-top"><strong>{ru ? "Жалоба" : "Report"} · {report.reason}</strong><span>{report.status}</span></div>
                <small>{ru ? "Отправитель" : "Reporter"}: {report.reporter_id.slice(0, 8)} · {ru ? "Аккаунт" : "Account"}: {report.reported_user_id.slice(0, 8)}</small>
                {report.details && <p>{report.details}</p>}
                <div className="admin-actions">
                  <button disabled={busy || report.status === "reviewing"} onClick={() => void changeReport(report, "reviewing")}>{ru ? "В работу" : "Review"}</button>
                  <button disabled={busy || report.status === "resolved"} onClick={() => void changeReport(report, "resolved")}>{ru ? "Решено" : "Resolve"}</button>
                  <button disabled={busy || report.status === "dismissed"} onClick={() => void changeReport(report, "dismissed")}>{ru ? "Отклонить" : "Dismiss"}</button>
                </div>
              </article>
            ))}
          </div>
        )}
        {tab === "support" && (
          <div className="admin-support-layout">
            <div className="admin-thread-list">
              {threads.length === 0 ? <p className="muted small-copy">{ru ? "Обращений пока нет." : "No support threads yet."}</p> : threads.map((thread) => (
                <button key={thread.id} className={selectedThread?.id === thread.id ? "active" : ""} onClick={() => setSelectedThread(thread)}>
                  <UserRound size={15} /><span>{thread.user_id.slice(0, 8)}</span><small>{formatMessageTime(thread.updated_at)}</small>
                </button>
              ))}
            </div>
            <div className="admin-support-conversation">
              {!selectedThread ? <p className="muted small-copy">{ru ? "Выберите обращение." : "Select a support thread."}</p> : (
                <>
                  {supportMessages.map((item) => (
                    <div className={`system-message-row ${item.sender_id === user.id ? "mine" : ""}`} key={item.id}>
                      <div className="system-message-bubble"><strong>{item.sender_id === user.id ? (ru ? "Вы" : "You") : (ru ? "Пользователь" : "User")}</strong><p>{item.body}</p><time>{formatMessageTime(item.created_at)}</time></div>
                    </div>
                  ))}
                  <SystemComposer value={reply} onChange={setReply} onSubmit={replyToSupport} placeholder={ru ? "Ответить пользователю…" : "Reply to user…"} disabled={busy} />
                </>
              )}
            </div>
          </div>
        )}
        {tab === "verification" && canManageBadges && (
          <div className="verification-manager">
            <p className="muted small-copy">{ru ? "Найдите аккаунт и назначьте тип подтверждения. Галочки видны другим пользователям." : "Find an account and assign a verification type. Badges are public."}</p>
            <input value={targetQuery} onChange={(event) => setTargetQuery(event.target.value)} placeholder={ru ? "Имя или @username" : "Name or @username"} />
            {targetResults.map((target) => (
              <button key={target.id} className={`verification-target ${selectedTarget?.id === target.id ? "active" : ""}`} onClick={() => setSelectedTarget(target)}>
                <span><strong>{target.display_name || target.username}</strong><small>@{target.username}</small></span>
                <Check size={15} />
              </button>
            ))}
            {selectedTarget && (
              <div className="verification-editor">
                <strong>{selectedTarget.display_name || selectedTarget.username}</strong>
                <select value={badgeType} onChange={(event) => setBadgeType(event.target.value as BadgeType)}>
                  <option value="blue">{ru ? "Синяя — подтверждённая личность" : "Blue — verified identity"}</option>
                  <option value="gold">{ru ? "Золотая — официальная организация" : "Gold — official organization"}</option>
                  <option value="creator">{ru ? "Красно-белая — автор" : "Red-white — creator"}</option>
                </select>
                <button className="primary-button" disabled={busy} onClick={() => void saveBadge()}>{ru ? "Сохранить" : "Save"}</button>
              </div>
            )}
          </div>
        )}
        <div className="admin-privacy-note">
          {ru ? "Личные переписки пользователей здесь не открываются. Доступ к ним требует отдельного служебного основания, аудита и дополнительной серверной защиты." : "Personal user chats are not exposed here. Any exceptional access needs a documented case, audit trail and additional server-side controls."}
        </div>
      </div>
    </div>
  );
}

export default function OfficialPanels(props: Props) {
  const roles = props.roles;
  if (props.view === "news") {
    return (
      <NewsChannel
        {...props}
        canPublish={roles.includes("owner") || roles.includes("admin")}
        canDeletePosts={roles.includes("owner") || roles.includes("admin")}
        canModerate={roles.some((role) => role === "owner" || role === "admin" || role === "moderator")}
      />
    );
  }
  if (props.view === "discussion") {
    return <DiscussionChat {...props} />;
  }
  if (props.view === "support") {
    return <SupportChat {...props} />;
  }
  if (roles.length === 0) return null;
  return <HeloroSPanel {...props} />;
}
