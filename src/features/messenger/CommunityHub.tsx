import { useEffect, useRef, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, ImagePlus, MessageCircle, Megaphone, Send, Users, X, Check } from "lucide-react";
import type { Locale } from "../../lib/i18n";
import { searchProfiles } from "../../lib/messenger";
import type { PublicProfile } from "../../lib/types";

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
type Props = { client: SupabaseClient; user: User; locale: Locale; contacts?: PublicProfile[]; initialRoomId?: string | null; initialCreateKind?: "group" | "channel" | null; onRoomsChanged?: () => void; onClose: () => void };

function RoomAvatar({ room }: { room: Room }) {
  return <div className="community-avatar">{room.avatar_url ? <img src={room.avatar_url} alt="" /> : room.kind === "channel" ? <Megaphone size={19} /> : <Users size={19} />}</div>;
}

export default function CommunityHub({ client, user, locale, contacts = [], initialRoomId = null, initialCreateKind = null, onRoomsChanged, onClose }: Props) {
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
  const [memberSearch, setMemberSearch] = useState("");
  const [memberResults, setMemberResults] = useState<PublicProfile[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<PublicProfile[]>([]);
  const [createStep, setCreateStep] = useState<"members" | "details" | "visibility">(initialCreateKind === "group" ? "members" : "details");
  const [isPublic, setIsPublic] = useState(false);
  const [createAvatarFile, setCreateAvatarFile] = useState<File | null>(null);
  const [createAvatarPreview, setCreateAvatarPreview] = useState<string | null>(null);
  const createAvatarInput = useRef<HTMLInputElement>(null);
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
    if (!createAvatarFile) {
      setCreateAvatarPreview(null);
      return;
    }
    const previewUrl = URL.createObjectURL(createAvatarFile);
    setCreateAvatarPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [createAvatarFile]);

  function chooseCreateAvatar(file?: File) {
    if (!file) return;
    const supportedTypes = ["image/png", "image/jpeg", "image/webp"];
    if (!supportedTypes.includes(file.type) || file.size < 1 || file.size > 3 * 1024 * 1024) {
      setError(ru ? "Выбери PNG, JPEG или WebP размером до 3 МБ." : "Choose a PNG, JPEG or WebP image up to 3 MB.");
      if (createAvatarInput.current) createAvatarInput.current.value = "";
      return;
    }
    setCreateAvatarFile(file);
    setError("");
  }

  function toggleSelectedMember(item: PublicProfile) {
    setSelectedMembers((current) => {
      if (current.some((selected) => selected.id === item.id)) {
        return current.filter((selected) => selected.id !== item.id);
      }
      return current.length >= 99 ? current : [...current, item];
    });
  }

  function renderMemberPicker(title: string, helper: string) {
    const normalizedSearch = memberSearch.trim().replace(/^@/, "");
    const people = normalizedSearch.length >= 2 ? memberResults : contacts;
    return (
      <section className="community-member-picker">
        <label>{title}</label>
        <input
          value={memberSearch}
          onChange={(event) => setMemberSearch(event.target.value)}
          maxLength={64}
          placeholder={ru ? "Поиск по имени или @username" : "Search by name or @username"}
        />
        {selectedMembers.length > 0 && (
          <div className="community-selected-members">
            {selectedMembers.map((item) => (
              <button type="button" key={item.id} onClick={() => toggleSelectedMember(item)}>
                @{item.username}<X size={13} />
              </button>
            ))}
          </div>
        )}
        <div className="community-contact-list">
          {people.length === 0 ? (
            <p>{normalizedSearch.length >= 2
              ? (ru ? "Никого не нашли. Проверь username." : "No users found. Check the username.")
              : (ru ? "Здесь появятся недавние собеседники. Найди человека через поиск." : "Recent chats will appear here. Search for someone to add.")}</p>
          ) : people.map((item) => {
            const selected = selectedMembers.some((member) => member.id === item.id);
            return (
              <button
                type="button"
                className={"community-contact-item" + (selected ? " selected" : "")}
                key={item.id}
                onClick={() => toggleSelectedMember(item)}
                aria-pressed={selected}
              >
                <span className="community-contact-avatar">
                  {item.avatar_url ? <img src={item.avatar_url} alt="" /> : (item.display_name || item.username).trim().slice(0, 1).toUpperCase()}
                </span>
                <span className="community-contact-copy">
                  <strong>{item.display_name || item.username}</strong>
                  <small>@{item.username}</small>
                </span>
                <span className="community-contact-check">{selected ? <Check size={17} /> : null}</span>
              </button>
            );
          })}
        </div>
        <small className="community-member-count">
          {ru ? "Выбрано: " + selectedMembers.length : "Selected: " + selectedMembers.length} · {helper}
        </small>
      </section>
    );
  }

  function advanceToVisibility(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim().length < 2) return;
    setError("");
    setCreateStep("visibility");
  }

  useEffect(() => {
    const query = memberSearch.trim();
    if (query.replace(/^@/, "").length < 2) {
      setMemberResults([]);
      return;
    }
    let active = true;
    const timeout = window.setTimeout(() => {
      searchProfiles(query, user.id)
        .then((items) => {
          if (active) setMemberResults(items.filter((item) => !selectedMembers.some((selected) => selected.id === item.id)));
        })
        .catch(() => { if (active) setMemberResults([]); });
    }, 220);
    return () => { active = false; window.clearTimeout(timeout); };
  }, [memberSearch, user.id, selectedMembers]);

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
    if (!createKind || name.trim().length < 2) return;

    const normalizedUsername = username.trim().replace(/^@/, "").toLowerCase();
    if (createKind === "channel" && isPublic && !/^[a-z][a-z0-9_]{4,31}$/.test(normalizedUsername)) {
      setError(ru
        ? "Для публичного канала нужен @username: 5–32 символа, латинские буквы, цифры или _."
        : "A public channel needs a username: 5–32 characters, using a–z, 0–9 and _.");
      return;
    }

    const isRoomPublic = createKind === "channel" && isPublic;
    const handle = isRoomPublic
      ? normalizedUsername
      : "private_" + createKind + "_" + crypto.randomUUID().replace(/-/g, "").slice(0, 12);

    setBusy(true);
    setError("");
    try {
      const { data, error: createError } = await client.rpc("create_community_room_v2", {
        p_kind: createKind,
        p_name: name.trim(),
        p_username: handle,
        p_description: description.trim(),
        p_member_ids: selectedMembers.map((item) => item.id),
        p_is_public: isRoomPublic,
      });
      if (createError) throw createError;
      if (typeof data !== "string") throw new Error("The community could not be created.");

      let avatarUrl: string | null = null;
      let avatarWarning = "";
      if (createAvatarFile) {
        const extension = createAvatarFile.type === "image/png" ? "png"
          : createAvatarFile.type === "image/jpeg" ? "jpg" : "webp";
        const path = data + "/" + crypto.randomUUID() + "." + extension;
        const storage = client.storage.from("community-avatars");
        const { error: uploadError } = await storage.upload(path, createAvatarFile, {
          contentType: createAvatarFile.type,
          cacheControl: "3600",
          upsert: false,
        });
        if (uploadError) {
          avatarWarning = ru
            ? "Сообщество создано, но фото не загрузилось. Его можно добавить позже."
            : "The community was created, but its photo could not be uploaded. You can add it later.";
        } else {
          const uploadedUrl = storage.getPublicUrl(path).data.publicUrl;
          const { error: updateError } = await client.from("community_rooms")
            .update({ avatar_url: uploadedUrl, updated_at: new Date().toISOString() })
            .eq("id", data);
          if (updateError) {
            await storage.remove([path]);
            avatarWarning = ru
              ? "Сообщество создано, но фото не сохранилось. Его можно добавить позже."
              : "The community was created, but its photo could not be saved. You can add it later.";
          } else {
            avatarUrl = uploadedUrl;
          }
        }
      }

      const nextRoom: Room = {
        id: data,
        kind: createKind,
        name: name.trim(),
        username: handle,
        description: description.trim(),
        avatar_url: avatarUrl,
        created_by: user.id,
        is_public: isRoomPublic,
        updated_at: new Date().toISOString(),
      };

      setCreateKind(null);
      setCreateStep("details");
      setIsPublic(false);
      setName("");
      setUsername("");
      setDescription("");
      setMemberSearch("");
      setMemberResults([]);
      setSelectedMembers([]);
      setCreateAvatarFile(null);
      if (createAvatarInput.current) createAvatarInput.current.value = "";
      setRoom(nextRoom);
      setMemberRole("owner");
      setMessages([]);
      setError(avatarWarning);
      onRoomsChanged?.();
    } catch (cause) {
      const failure = cause as { code?: string; message?: string };
      if (failure.code === "23505" || /already taken|duplicate key/i.test(failure.message || "")) {
        setError(ru ? "Этот @username уже занят. Выбери другой." : "That @username is already taken. Choose another.");
      } else {
        setError(failure.message || (ru ? "Не удалось создать." : "Could not create."));
      }
    } finally {
      setBusy(false);
    }
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
            {createKind === "group" && (
              <div className="community-member-picker">
                <label>{ru ? "Добавить участников" : "Add members"}</label>
                <input
                  value={memberSearch}
                  onChange={(event) => setMemberSearch(event.target.value)}
                  maxLength={64}
                  placeholder={ru ? "Найти по @username или имени" : "Find by @username or name"}
                />
                {selectedMembers.length > 0 && (
                  <div className="community-selected-members">
                    {selectedMembers.map((item) => (
                      <button type="button" key={item.id} onClick={() => setSelectedMembers((current) => current.filter((selected) => selected.id !== item.id))}>
                        @{item.username}<X size={13} />
                      </button>
                    ))}
                  </div>
                )}
                {memberSearch.trim().length > 1 && (
                  <div className="community-member-results">
                    {memberResults.length === 0
                      ? <p>{ru ? "Ничего не найдено" : "No users found"}</p>
                      : memberResults.map((item) => (
                        <button type="button" key={item.id} onClick={() => { setSelectedMembers((current) => current.length >= 99 || current.some((selected) => selected.id === item.id) ? current : [...current, item]); setMemberSearch(""); setMemberResults([]); }}>
                          <span><strong>{item.display_name}</strong><small>@{item.username}</small></span><Check size={15} />
                        </button>
                      ))}
                  </div>
                )}
                <small className="community-member-count">{ru ? `Выбрано: ${selectedMembers.length}` : `Selected: ${selectedMembers.length}`}</small>
              </div>
            )}
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
