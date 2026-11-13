import { useEffect, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import {
  BadgeCheck,
  ChevronRight,
  Flag,
  MessageCircle,
  Megaphone,
  Send,
  Trash2,
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
  getDiscussionMessages,
  sendChannelComment,
  sendDiscussionMessage,
  sendSupportMessage,
  submitContentReport,
  subscribeToOfficialInserts,
  type ChannelComment,
  type ChannelPost,
  type DiscussionMessage,
  type SupportMessage,
  type SupportThread,
} from "../../lib/official";
import { formatMessageTime, initials } from "../../lib/domain";
import type { Locale } from "../../lib/i18n";
import HeloroSPanel from "./HeloroSPanel";

type View = "news" | "discussion" | "support" | "admin";

type Props = {
  view: View;
  client: SupabaseClient;
  user: User;
  locale: Locale;
  roles: string[];
  onOpenDiscussion: () => void;
  onOpenNews: () => void;
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

  async function reportChannelContent(targetId: string) {
    const details = window.prompt(ru ? "Опишите причину жалобы (необязательно)." : "Describe the reason for this report (optional).");
    if (details === null) return;
    setBusy(true);
    setError("");
    try {
      await submitContentReport(client, "channel", targetId, "other", details);
      setError(ru ? "Жалоба отправлена модераторам." : "Report sent to moderators.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ru ? "Не удалось отправить жалобу." : "Could not submit report."));
    } finally {
      setBusy(false);
    }
  }
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
    if ((!canDeletePosts && !posts.some((post) => post.id === postId && post.author_id === user.id)) || !window.confirm(ru ? "Удалить публикацию для всех?" : "Delete this post for everyone?")) return;
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
              <button type="button" onClick={() => void reportChannelContent(post.id)} disabled={busy}><Flag size={13} /> {ru ? "Пожаловаться" : "Report"}</button>
              {(canDeletePosts || post.author_id === user.id) && (
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
                      <button className="system-delete-button" type="button" onClick={() => void reportChannelContent(item.id)} disabled={busy}>
                        <Flag size={12} /> {ru ? "Пожаловаться" : "Report"}
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

  async function reportDiscussionMessage(messageId: string) {
    const details = window.prompt(ru ? "Опишите причину жалобы (необязательно)." : "Describe the reason for this report (optional).");
    if (details === null) return;
    setBusy(true);
    setError("");
    try {
      await submitContentReport(client, "message", messageId, "other", details);
      setError(ru ? "Жалоба отправлена модераторам." : "Report sent to moderators.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ru ? "Не удалось отправить жалобу." : "Could not submit report."));
    } finally {
      setBusy(false);
    }
  }
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
                  <button className="system-delete-button" type="button" onClick={() => void reportDiscussionMessage(item.id)} disabled={busy}>
                    <Flag size={12} /> {ru ? "Пожаловаться" : "Report"}
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
  return <HeloroSPanel client={props.client} user={props.user} locale={props.locale} roles={roles} onOpenNews={props.onOpenNews} onOpenDiscussion={props.onOpenDiscussion} />;
}
