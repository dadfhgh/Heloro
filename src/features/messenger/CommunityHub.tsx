import { useEffect, useRef, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, ImagePlus, MessageCircle, Megaphone, Plus, Send, Users, X } from "lucide-react";
import { searchProfiles } from "../../lib/messenger";
import type { PublicProfile } from "../../lib/types";
import type { Locale } from "../../lib/i18n";

type Room = {
  id: string;
  kind: "group" | "channel";
  name: string;
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
  const [rooms, setRooms] = useState<Room[]>([]);
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
  const [memberQuery, setMemberQuery] = useState("");
  const [memberResults, setMemberResults] = useState<PublicProfile[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<PublicProfile[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const avatarInput = useRef<HTMLInputElement>(null);
  const messagesEnd = useRef<HTMLDivElement>(null);

  async function loadRooms() {
    const { data, error: loadError } = await client.from("community_rooms")
      .select("id, kind, name, description, avatar_url, created_by, is_public, updated_at")
      .order("updated_at", { ascending: false });
    if (loadError) throw loadError;
    const next = (data ?? []) as Room[];
    setRooms(next);
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
    if (memberQuery.trim().replace(/^@/, "").length < 2 || !createKind || createKind !== "group") {
      setMemberResults([]);
      return;
    }
    let active = true;
    setSearchBusy(true);
    const timer = window.setTimeout(() => {
      searchProfiles(memberQuery, user.id).then((items) => { if (active) setMemberResults(items); })
        .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Search failed."); })
        .finally(() => { if (active) setSearchBusy(false); });
    }, 250);
    return () => { active = false; window.clearTimeout(timer); };
  }, [memberQuery, createKind, user.id]);

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

  async function joinChannel() {
    if (!room || room.kind !== "channel") return;
    setBusy(true); setError("");
    try {
      const { error: joinError } = await client.rpc("join_community_channel", { target_room_id: room.id });
      if (joinError) throw joinError;
      setMemberRole("member");
      await loadMessages(room.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ru ? "Не удалось подписаться." : "Could not subscribe."));
    } finally { setBusy(false); }
  }

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createKind || name.trim().length < 2) return;
    if (createKind === "group" && selectedMembers.length === 0) {
      setError(ru ? "Добавьте хотя бы одного участника." : "Add at least one member.");
      return;
    }
    setBusy(true); setError("");
    try {
      const { data, error: createError } = await client.rpc("create_community_room", {
        p_kind: createKind, p_name: name.trim(), p_description: description.trim(),
        p_member_ids: createKind === "group" ? selectedMembers.map((person) => person.id) : [],
      });
      if (createError) throw createError;
      if (typeof data !== "string") throw new Error("The community could not be created.");
      const nextRoom: Room = {
        id: data, kind: createKind, name: name.trim(), description: description.trim(),
        avatar_url: null, created_by: user.id, is_public: createKind === "channel", updated_at: new Date().toISOString(),
      };
      setRooms((current) => [nextRoom, ...current]);
      setCreateKind(null); setName(""); setDescription(""); setSelectedMembers([]); setMemberQuery("");
      setRoom(nextRoom); setMemberRole("owner"); setMessages([]); onRoomsChanged?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ru ? "Не удалось создать." : "Could not create."));
    } finally { setBusy(false); }
  }

  function toggleMember(person: PublicProfile) {
    setSelectedMembers((current) => current.some((item) => item.id === person.id)
      ? current.filter((item) => item.id !== person.id) : [...current, person].slice(0, 99));
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
      setRooms((current) => current.map((item) => item.id === room.id ? updated : item));
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
    <div className="community-overlay" onClick={onClose}>
      <section className="community-panel" role="dialog" aria-modal="true" aria-label={ru ? "Группы и каналы" : "Groups and channels"} onClick={(event) => event.stopPropagation()}>
        <header className="community-header">
          {(room || createKind) && <button className="icon-button" type="button" onClick={() => { setRoom(null); setMemberRole(null); setCreateKind(null); setError(""); }} aria-label={ru ? "Назад" : "Back"}><ArrowLeft size={19} /></button>}
          <div><strong>{room ? room.name : createKind ? (createKind === "group" ? (ru ? "Новая группа" : "New group") : (ru ? "Новый канал" : "New channel")) : (ru ? "Группы и каналы" : "Groups and channels")}</strong><small>{room ? (room.kind === "group" ? (ru ? "Группа" : "Group") : (ru ? "Канал" : "Channel")) : (ru ? "Сообщества HELORO" : "HELORO communities")}</small></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label={ru ? "Закрыть" : "Close"}><X size={19} /></button>
        </header>

        {createKind ? (
          <form className="community-create-form" onSubmit={createRoom}>
            <label>{ru ? "Название" : "Name"}<input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={64} required placeholder={createKind === "group" ? (ru ? "Например, Друзья" : "For example, Friends") : (ru ? "Название канала" : "Channel name")} /></label>
            <label>{ru ? "Описание" : "Description"}<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={3} placeholder={ru ? "Кратко расскажите о сообществе" : "Describe the community"} /></label>
            {createKind === "group" && <>
              <label>{ru ? "Добавить участников" : "Add members"}<input value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} placeholder="@username" /></label>
              {searchBusy && <small className="community-muted">{ru ? "Поиск…" : "Searching…"}</small>}
              <div className="community-member-results">{memberResults.filter((person) => !selectedMembers.some((item) => item.id === person.id)).map((person) => (
                <button type="button" key={person.id} onClick={() => toggleMember(person)}><span>{person.display_name || person.username}<small>@{person.username}</small></span><Plus size={16} /></button>
              ))}</div>
              {selectedMembers.length > 0 && <div className="community-selected-members">{selectedMembers.map((person) => <button type="button" key={person.id} onClick={() => toggleMember(person)}>{person.display_name || person.username} <X size={12} /></button>)}</div>}
            </>}
            {createKind === "channel" && <p className="community-muted">{ru ? "Публичный канал: пользователи смогут найти его и подписаться. Публиковать смогут владелец и назначенные администраторы." : "Public channel: people can discover and subscribe. Only the owner and assigned admins can publish."}</p>}
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
              <div className="community-join"><p>{ru ? "Подпишитесь, чтобы читать публикации канала." : "Subscribe to read channel posts."}</p><button className="community-primary" type="button" onClick={() => void joinChannel()} disabled={busy}>{ru ? "Подписаться" : "Subscribe"}</button></div>
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
          <div className="community-list-view">
            <div className="community-create-actions">
              <button type="button" onClick={() => { setCreateKind("group"); setError(""); }}><Users size={18} /><span>{ru ? "Создать группу" : "Create group"}</span><Plus size={16} /></button>
              <button type="button" onClick={() => { setCreateKind("channel"); setError(""); }}><Megaphone size={18} /><span>{ru ? "Создать канал" : "Create channel"}</span><Plus size={16} /></button>
            </div>
            <div className="community-section-title">{ru ? "Мои сообщества и каналы" : "My communities and channels"}</div>
            {loading ? <p className="community-muted">{ru ? "Загрузка…" : "Loading…"}</p> : rooms.length === 0 ? <div className="community-empty"><Users size={24} /><span>{ru ? "Здесь появятся созданные вами группы и каналы." : "Your groups and channels will appear here."}</span></div> : rooms.map((item) => (
              <button className="community-room-row" type="button" key={item.id} onClick={() => void openRoom(item)}>
                <RoomAvatar room={item} /><span><strong>{item.name}</strong><small>{item.kind === "group" ? (ru ? "Группа" : "Group") : (ru ? "Публичный канал" : "Public channel")}</small></span><ArrowLeft className="community-row-arrow" size={16} />
              </button>
            ))}
          </div>
        )}
        {error && <p className="community-error" role="alert">{error}</p>}
      </section>
    </div>
  );
}
