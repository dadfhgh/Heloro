import { useEffect, useRef, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, ImagePlus, MessageCircle, Megaphone, Send, Users } from "lucide-react";
import type { Locale } from "../../lib/i18n";

type Room = {
  id: string;
  kind: "group" | "channel";
  name: string;
  username: string;
  description: string;
  avatar_url: string | null;
  created_by: string;
  is_public: boolean;
  updated_at: string;
};
type RoomMessage = { id: string; room_id: string; sender_id: string; body: string; created_at: string };
type Props = { client: SupabaseClient; user: User; locale: Locale; initialRoomId?: string | null; initialCreateKind?: "group" | "channel" | null; onRoomsChanged?: () => void; onClose: () => void };

function RoomAvatar({ room }: { room: Room }) {
  return <div className="community-avatar">{room.avatar_url ? <img src={room.avatar_url} alt="" /> : room.kind === "channel" ? <Megaphone size={19} /> : <Users size={19} />}</div>;
}

export default function CommunityHub({ client, user, locale, initialRoomId = null, initialCreateKind = null, onRoomsChanged, onClose }: Props) {
  const ru = locale === "ru";
  const [room, setRoom] = useState<Room | null>(null);
  const [memberRole, setMemberRole] = useState<string | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createKind, setCreateKind] = useState<"group" | "channel" | null>(initialCreateKind);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [username, setUsername] = useState("");
  const avatarInput = useRef<HTMLInputElement>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);

  async function loadRooms() {
    const { data, error: loadError } = await client.from("community_rooms")
      .select("id, kind, name, username, description, avatar_url, created_by, is_public, updated_at")
      .order("updated_at", { ascending: false });
    if (loadError) throw loadError;
    const next = (data ?? []) as Room[];
    return next;
  }

  async function loadMessages(roomId: string) {
    const { data, error: loadError } = await client.from("community_room_messages")
      .select("id, room_id, sender_id, body, created_at")
      .eq("room_id", roomId).order("created_at", { ascending: true }).limit(100);
    if (loadError) throw loadError;
    setMessages((data ?? []) as RoomMessage[]);
  }

  useEffect(() => {
    let active = true;
    setLoading(true);
    loadRooms().then((loaded) => {
      if (!active) return;
      if (initialRoomId) {
        const selected = loaded.find((item) => item.id === initialRoomId);
        if (selected) void openRoom(selected);
      }
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : (ru ? "Не удалось загрузить сообщества." : "Could not load communities."));
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [client, ru, initialRoomId]);


  useEffect(() => {
    if (!room || !memberRole) { setMessages([]); return; }
    let active = true;
    loadMessages(room.id).catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load messages."); });
    const channel = client.channel("community-room-" + room.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "community_room_messages", filter: "room_id=eq." + room.id }, (payload) => {
        const item = payload.new as RoomMessage;
        setMessages((current) => current.some((row) => row.id === item.id) ? current : [...current, item]);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "community_room_messages" }, () => {
        void loadMessages(room.id);
      }).subscribe();
    return () => { active = false; void client.removeChannel(channel); };
  }, [client, room, memberRole]);

  useEffect(() => { messagesEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages]);

  async function openRoom(nextRoom: Room) {
    setError("");
    setRoom(nextRoom);
    setMemberRole(null);
    setMessages([]);
    const { data, error: membershipError } = await client.from("community_room_members")
      .select("role").eq("room_id", nextRoom.id).eq("user_id", user.id).maybeSingle();
    if (membershipError) { setError(membershipError.message); return; }
    setMemberRole((data?.role as string | undefined) ?? null);
  }

  async function joinPublicRoom() {
    if (!room || !room.is_public) return;
    setBusy(true); setError("");
    try {
      const { error: joinError } = await client.rpc("join_public_community_room", { target_room_id: room.id });
      if (joinError) throw joinError;
      setMemberRole("member");
      await loadMessages(room.id);
      onRoomsChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ru ? "Не удалось вступить." : "Could not join."));
    } finally { setBusy(false); }
  }

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedUsername = username.trim().replace(/^@/, "").toLowerCase();
    if (!createKind || name.trim().length < 2) return;
    if (!/^[a-z][a-z0-9_]{4,31}$/.test(normalizedUsername)) {
      setError(ru
        ? "Адрес должен начинаться с латинской буквы и содержать 5–32 символа: a–z, 0–9 или _."
        : "The handle must start with a Latin letter and contain 5–32 characters: a–z, 0–9 or _.");
      return;
    }
    setBusy(true); setError("");
    try {
      const { data, error: createError } = await client.rpc("create_community_room", {
        p_kind: createKind, p_name: name.trim(), p_username: normalizedUsername,
        p_description: description.trim(), p_member_ids: [],
      });
      if (createError) throw createError;
      if (typeof data !== "string") throw new Error("The community could not be created.");
      const nextRoom: Room = {
        id: data, kind: createKind, name: name.trim(), username: normalizedUsername,
        description: description.trim(), avatar_url: null, created_by: user.id,
        is_public: true, updated_at: new Date().toISOString(),
      };
      setCreateKind(null); setName(""); setUsername(""); setDescription("");
      setRoom(nextRoom); setMemberRole("owner"); setMessages([]); onRoomsChanged?.();
    } catch (cause) {
      const failure = cause as { code?: string; message?: string };
      if (failure.code === "23505" || /already taken|duplicate key/i.test(failure.message || "")) {
        setError(ru ? "Этот @username уже занят. Выбери другой." : "That @username is already taken. Choose another.");
      } else {
        setError(failure.message || (ru ? "Не удалось создать." : "Could not create."));
      }
    } finally { setBusy(false); }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!room || !memberRole || !draft.trim()) return;
    setBusy(true); setError("");
    try {
      const { data, error: sendError } = await client.from("community_room_messages")
        .insert({ room_id: room.id, sender_id: user.id, body: draft.trim() })
        .select("id, room_id, sender_id, body, created_at").single();
      if (sendError) throw sendError;
      setMessages((current) => current.some((item) => item.id === data.id) ? current : [...current, data as RoomMessage]);
      setDraft("");
      await loadRooms();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ru ? "Не удалось отправить сообщение." : "Could not send message."));
    } finally { setBusy(false); }
  }

  async function changeRoomAvatar(file?: File) {
    if (!file || !room || !memberRole || !["owner", "admin"].includes(memberRole)) return;
    const extensions: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
    const extension = extensions[file.type];
    if (!extension || file.size < 1 || file.size > 3 * 1024 * 1024) {
      setError(ru ? "Выберите PNG, JPEG или WebP до 3 МБ." : "Choose a PNG, JPEG or WebP image up to 3 MB.");
      return;
    }
    setBusy(true); setError("");
    const path = room.id + "/" + crypto.randomUUID() + "." + extension;
    const storage = client.storage.from("community-avatars");
    try {
      const { error: uploadError } = await storage.upload(path, file, { contentType: file.type, cacheControl: "3600", upsert: false });
      if (uploadError) throw uploadError;
      const url = storage.getPublicUrl(path).data.publicUrl;
      const { error: updateError } = await client.from("community_rooms").update({ avatar_url: url, updated_at: new Date().toISOString() }).eq("id", room.id);
      if (updateError) { await storage.remove([path]); throw updateError; }
      const updated = { ...room, avatar_url: url };
      setRoom(updated);
      onRoomsChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ru ? "Не удалось изменить аватар." : "Could not update avatar."));
    } finally {
      setBusy(false);
      if (avatarInput.current) avatarInput.current.value = "";
    }
  }

  async function deleteMessage(item: RoomMessage) {
    if (!room || !window.confirm(ru ? "Удалить сообщение для всех?" : "Delete this message for everyone?")) return;
    const { error: deleteError } = await client.from("community_room_messages").delete().eq("id", item.id);
    if (deleteError) setError(deleteError.message);
    else setMessages((current) => current.filter((message) => message.id !== item.id));
  }

  return (
    <section className="community-embedded" aria-label={ru ? "Переписка сообщества" : "Community conversation"}>
      <div className="community-panel community-pane">
        <header className="community-header">
          <button className="icon-button" type="button" onClick={onClose} aria-label={ru ? "Назад к чатам" : "Back to chats"}><ArrowLeft size={19} /></button>
          <div><strong>{room ? room.name : (createKind === "group" ? (ru ? "Новая группа" : "New group") : (ru ? "Новый канал" : "New channel"))}</strong><small>{room ? `@${room.username}` : (ru ? "Создание сообщества" : "Create a community")}</small></div>
        </header>

        {createKind ? (
          <form className="community-create-form" onSubmit={createRoom}>
            <label>{ru ? "Название" : "Name"}<input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={64} required placeholder={createKind === "group" ? (ru ? "Например, Друзья" : "For example, Friends") : (ru ? "Название канала" : "Channel name")} /></label>
            <label>{ru ? "Описание" : "Description"}<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={3} placeholder={ru ? "Кратко расскажите о сообществе" : "Describe the community"} /></label>
            <label>{ru ? "Ссылка / имя пользователя" : "Public link / username"}
              <div className="community-username-field"><span>@</span><input value={username} onChange={(event) => setUsername(event.target.value.replace(/^@/, "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 32))} minLength={5} maxLength={32} pattern="[a-z][a-z0-9_]{4,31}" required autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder={createKind === "group" ? "my_group" : "my_channel"} /></div>
            </label>
            <p className="community-muted">{ru ? "Ты автоматически станешь владельцем и первым участником. По @username другие смогут найти открытую группу или канал и вступить." : "You automatically become the owner and first member. People can find the public group or channel by its @username and join."}</p>
            <button className="community-primary" type="submit" disabled={busy || name.trim().length < 2}>{busy ? (ru ? "Создание…" : "Creating…") : (ru ? "Создать" : "Create")}</button>
          </form>
        ) : room ? (
          <div className="community-room-view">
            <div className="community-room-summary">
              <RoomAvatar room={room} />
              <div><strong>{room.name}</strong><p>{room.description || (ru ? "Без описания" : "No description")}</p></div>
              {memberRole && ["owner", "admin"].includes(memberRole) && <>
                <input ref={avatarInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => void changeRoomAvatar(event.target.files?.[0])} />
                <button className="icon-button" type="button" onClick={() => avatarInput.current?.click()} disabled={busy} title={ru ? "Изменить аватар" : "Change avatar"} aria-label={ru ? "Изменить аватар" : "Change avatar"}><ImagePlus size={18} /></button>
              </>}
            </div>
            {!memberRole ? (
              <div className="community-join"><p>{room.kind === "group" ? (ru ? "Вступи в группу, чтобы читать и отправлять сообщения." : "Join this group to read and send messages.") : (ru ? "Подпишись, чтобы читать публикации канала." : "Subscribe to read channel posts.")}</p><button className="community-primary" type="button" onClick={() => void joinPublicRoom()} disabled={busy}>{room.kind === "group" ? (ru ? "Вступить в группу" : "Join group") : (ru ? "Подписаться" : "Subscribe")}</button></div>
            ) : (
              <>
                <div className="community-message-list">
                  {messages.length === 0 ? <div className="community-empty"><MessageCircle size={24} /><span>{ru ? "Пока нет сообщений" : "No messages yet"}</span></div> : messages.map((item) => (
                    <article className={"community-message " + (item.sender_id === user.id ? "mine" : "")} key={item.id}>
                      {item.sender_id !== user.id && <small>{ru ? "Участник" : "Member"}</small>}
                      <p>{item.body}</p><footer><time>{new Date(item.created_at).toLocaleTimeString(ru ? "ru-RU" : "en-US", { hour: "2-digit", minute: "2-digit" })}</time>
                      {(item.sender_id === user.id || ["owner", "admin"].includes(memberRole)) && <button type="button" onClick={() => void deleteMessage(item)}>{ru ? "Удалить" : "Delete"}</button>}</footer>
                    </article>
                  ))}
                  <div ref={messagesEnd} />
                </div>
                {(room.kind === "group" || ["owner", "admin"].includes(memberRole)) ? (
                  <form className="community-composer" onSubmit={sendMessage}><input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={4000} placeholder={ru ? "Сообщение…" : "Message…"} /><button type="submit" disabled={busy || !draft.trim()} aria-label={ru ? "Отправить" : "Send"}><Send size={18} /></button></form>
                ) : <p className="community-muted community-readonly">{ru ? "Публиковать в этом канале может только администрация." : "Only channel admins can publish here."}</p>}
              </>
            )}
          </div>
        ) : (
          <div className="community-room-view">
            <div className="community-empty">
              <MessageCircle size={24} />
              <span>{loading ? (ru ? "Открываем чат…" : "Opening chat…") : (ru ? "Не удалось найти это сообщество." : "This community could not be found.")}</span>
              {!loading && <button className="community-primary" type="button" onClick={onClose}>{ru ? "Назад к чатам" : "Back to chats"}</button>}
            </div>
          </div>
        )}

        {error && <p className="community-error" role="alert">{error}</p>}
      </div>
    </section>
  );
}
