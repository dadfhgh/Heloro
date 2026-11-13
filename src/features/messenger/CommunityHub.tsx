import { useEffect, useRef, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowLeft, ImagePlus, MessageCircle, Megaphone, Send, Users, X, Check, PencilLine, ChevronRight, Trash2, ShieldCheck } from "lucide-react";
import type { Locale } from "../../lib/i18n";
import { searchProfiles } from "../../lib/messenger";
import type { PublicProfile } from "../../lib/types";
import { canDeleteCommunityMessage, EMPTY_COMMUNITY_ADMIN_PERMISSIONS, hasCommunityPermission, type CommunityAdminPermissions } from "../../lib/communityPermissions";

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
type RoomAdminEntry = {
  user_id: string;
  role: "owner" | "admin";
  joined_at: string;
  admin_permissions: Partial<CommunityAdminPermissions> | null;
  promoted_by: string | null;
  promoted_at: string | null;
  profile: PublicProfile | null;
  promoter: PublicProfile | null;
};
type Props = { client: SupabaseClient; user: User; locale: Locale; contacts?: PublicProfile[]; initialRoomId?: string | null; initialCreateKind?: "group" | "channel" | null; onRoomsChanged?: () => void; onClose: () => void };

function RoomAvatar({ room, className = "" }: { room: Room; className?: string }) {
  return <div className={`community-avatar ${className}`.trim()}>{room.avatar_url ? <img src={room.avatar_url} alt="" /> : room.kind === "channel" ? <Megaphone size={19} /> : <Users size={19} />}</div>;
}

function roomMemberLabel(kind: Room["kind"], count: number | null, ru: boolean) {
  if (count === null) return ru ? (kind === "channel" ? "Канал" : "Группа") : (kind === "channel" ? "Channel" : "Group");
  if (!ru) return `${count} ${kind === "channel" ? (count === 1 ? "subscriber" : "subscribers") : (count === 1 ? "member" : "members")}`;
  const value = Math.abs(count) % 100;
  const last = value % 10;
  const noun = kind === "channel"
    ? (value > 10 && value < 20 ? "подписчиков" : last === 1 ? "подписчик" : last >= 2 && last <= 4 ? "подписчика" : "подписчиков")
    : (value > 10 && value < 20 ? "участников" : last === 1 ? "участник" : last >= 2 && last <= 4 ? "участника" : "участников");
  return `${count} ${noun}`;
}

export default function CommunityHub({ client, user, locale, contacts = [], initialRoomId = null, initialCreateKind = null, onRoomsChanged, onClose }: Props) {
  const ru = locale === "ru";
  const [room, setRoom] = useState<Room | null>(null);
  const [memberRole, setMemberRole] = useState<string | null>(null);
  const [myAdminPermissions, setMyAdminPermissions] = useState<Partial<CommunityAdminPermissions>>(EMPTY_COMMUNITY_ADMIN_PERMISSIONS);
  const [adminManagementOpen, setAdminManagementOpen] = useState(false);
  const [roomAdmins, setRoomAdmins] = useState<RoomAdminEntry[]>([]);
  const [eligibleAdminMembers, setEligibleAdminMembers] = useState<PublicProfile[]>([]);
  const [editingAdminId, setEditingAdminId] = useState<string | null>(null);
  const [permissionsDraft, setPermissionsDraft] = useState<CommunityAdminPermissions>(EMPTY_COMMUNITY_ADMIN_PERMISSIONS);
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [showRoomInfo, setShowRoomInfo] = useState(false);
  const [memberCount, setMemberCount] = useState<number | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createKind, setCreateKind] = useState<"group" | "channel" | null>(initialCreateKind);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [username, setUsername] = useState("");
  const [roomUsernameDraft, setRoomUsernameDraft] = useState("");
  const [roomNameDraft, setRoomNameDraft] = useState("");
  const [roomDescriptionDraft, setRoomDescriptionDraft] = useState("");
  const [roomEditing, setRoomEditing] = useState(false);
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
  const canChangeRoomInfo = hasCommunityPermission(memberRole, myAdminPermissions, "change_info");
  const canDeleteRoomMessages = hasCommunityPermission(memberRole, myAdminPermissions, "delete_messages");
  const canManageRoomAdmins = hasCommunityPermission(memberRole, myAdminPermissions, "manage_admins");
  const canPostChannelMessages = hasCommunityPermission(memberRole, myAdminPermissions, "post_messages");

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
    if (!/^[a-z][a-z0-9_]{4,31}$/.test(username.trim().replace(/^@/, "").toLowerCase())) {
      setError(ru ? "Укажи @username: 5–32 символа, латинские буквы, цифры и _." : "Enter a @username: 5–32 characters, using a–z, 0–9 and _.");
      return;
    }
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
    if (!room) { setMemberCount(null); return; }
    let active = true;
    setMemberCount(null);
    void client.from("community_room_members")
      .select("user_id", { count: "exact", head: true })
      .eq("room_id", room.id)
      .then(({ count, error: countError }) => {
        if (active) setMemberCount(countError ? null : (count ?? 0));
      });
    return () => { active = false; };
  }, [client, room?.id]);

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
    setRoomEditing(false);
    setShowRoomInfo(false);
    setRoomUsernameDraft(nextRoom.username);
    setRoomNameDraft(nextRoom.name);
    setRoomDescriptionDraft(nextRoom.description);
    setRoom(nextRoom);
    setMemberRole(null);
    setMyAdminPermissions(EMPTY_COMMUNITY_ADMIN_PERMISSIONS);
    setAdminManagementOpen(false);
    setEditingAdminId(null);
    setMessages([]);
    const { data, error: membershipError } = await client.from("community_room_members")
      .select("role, admin_permissions").eq("room_id", nextRoom.id).eq("user_id", user.id).maybeSingle();
    if (membershipError) { setError(membershipError.message); return; }
    setMemberRole((data?.role as string | undefined) ?? null);
    setMyAdminPermissions((data?.admin_permissions as Partial<CommunityAdminPermissions> | null) ?? EMPTY_COMMUNITY_ADMIN_PERMISSIONS);
  }

  async function joinPublicRoom() {
    if (!room || !room.is_public) return;
    setBusy(true); setError("");
    try {
      const { error: joinError } = await client.rpc("join_public_community_room", { target_room_id: room.id });
      if (joinError) throw joinError;
      setMemberRole("member");
      setMyAdminPermissions(EMPTY_COMMUNITY_ADMIN_PERMISSIONS);
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
    if (!/^[a-z][a-z0-9_]{4,31}$/.test(normalizedUsername)) {
      setError(ru
        ? "Username должен содержать 5–32 символа: латинские буквы, цифры и _."
        : "Username must be 5–32 characters, using a–z, 0–9 and _.");
      return;
    }

    const isRoomPublic = createKind === "channel" && isPublic;
    const handle = normalizedUsername;

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
      setRoomEditing(false);
      setDescription("");
      setMemberSearch("");
      setMemberResults([]);
      setSelectedMembers([]);
      setCreateAvatarFile(null);
      if (createAvatarInput.current) createAvatarInput.current.value = "";
      setRoom(nextRoom);
      setShowRoomInfo(false);
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

  async function saveRoomDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!room || !canChangeRoomInfo) return;
    const nextName = roomNameDraft.trim();
    const nextDescription = roomDescriptionDraft.trim();
    const normalized = roomUsernameDraft.trim().replace(/^@/, "").toLowerCase();
    if (nextName.length < 2 || nextName.length > 64) {
      setError(ru ? "Название должно содержать от 2 до 64 символов." : "Name must be between 2 and 64 characters.");
      return;
    }
    if (nextDescription.length > 255) {
      setError(ru ? "Описание должно быть не длиннее 255 символов." : "Description must be 255 characters or fewer.");
      return;
    }
    if (!/^[a-z][a-z0-9_]{4,31}$/.test(normalized)) {
      setError(ru ? "Username: 5–32 символа, латинские буквы, цифры и _." : "Username: 5–32 characters, using a–z, 0–9 and _.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { data, error: updateError } = await client.from("community_rooms")
        .update({ name: nextName, username: normalized, description: nextDescription, updated_at: new Date().toISOString() })
        .eq("id", room.id)
        .select("id, name, username, description")
        .single();
      if (updateError) throw updateError;
      if (!data) throw new Error("Community details were not saved.");
      setRoom({ ...room, name: data.name, username: data.username, description: data.description });
      setRoomNameDraft(data.name);
      setRoomUsernameDraft(data.username);
      setRoomDescriptionDraft(data.description);
      setRoomEditing(false);
      onRoomsChanged?.();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setError(/duplicate|unique|already taken|23505/i.test(message)
        ? (ru ? "Этот @username уже занят. Выбери другой." : "That @username is already taken. Choose another.")
        : (message || (ru ? "Не удалось сохранить информацию о сообществе." : "Could not save community details.")));
    } finally {
      setBusy(false);
    }
  }

  async function changeRoomAvatar(file?: File) {
    if (!file || !room || !canChangeRoomInfo) return;
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

  async function deleteRoom() {
    if (!room || room.created_by !== user.id || memberRole !== "owner") return;
    const roomLabel = room.kind === "channel" ? (ru ? "канал" : "channel") : (ru ? "группу" : "group");
    const confirmed = window.confirm(ru
      ? `Удалить ${roomLabel} «${room.name}»? Все сообщения, участники и ссылка сообщества будут удалены. Это действие нельзя отменить.`
      : `Delete the ${roomLabel} “${room.name}”? All messages, members and its public link will be removed. This cannot be undone.`);
    if (!confirmed) return;

    setBusy(true);
    setError("");
    try {
      const { data, error: deleteError } = await client.from("community_rooms")
        .delete()
        .eq("id", room.id)
        .eq("created_by", user.id)
        .select("id")
        .maybeSingle();
      if (deleteError) throw deleteError;
      if (!data) throw new Error(ru ? "Удаление запрещено: проверь, что ты владелец сообщества." : "Delete was not allowed. Check that you own this community.");
      setShowRoomInfo(false);
      setRoom(null);
      setMemberRole(null);
      setMessages([]);
      onRoomsChanged?.();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ru ? "Не удалось удалить сообщество." : "Could not delete the community."));
    } finally {
      setBusy(false);
    }
  }

  async function deleteMessage(item: RoomMessage) {
    if (!room || busy) return;
    const confirmed = window.confirm(ru ? "Удалить сообщение для всех?" : "Delete this message for everyone?");
    if (!confirmed) return;
    setBusy(true);
    setError("");
    try {
      const { data, error: deleteError } = await client.from("community_room_messages")
        .delete().eq("id", item.id).select("id").maybeSingle();
      if (deleteError) throw deleteError;
      if (!data) throw new Error(ru ? "Сообщение не найдено или удаление запрещено." : "Message not found or delete not allowed.");
      setMessages((current) => current.filter((message) => message.id !== item.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ru ? "Не удалось удалить сообщение." : "Could not delete the message."));
    } finally {
      setBusy(false);
    }
  }

  async function loadAdminManagement() {
    if (!room || !canManageRoomAdmins) return;
    setAdminBusy(true);
    setAdminError("");
    setAdminManagementOpen(true);
    try {
      const { data, error: membersError } = await client.from("community_room_members")
        .select("user_id, role, joined_at, admin_permissions, promoted_by, promoted_at")
        .eq("room_id", room.id)
        .order("joined_at", { ascending: true });
      if (membersError) throw membersError;
      const rows = (data ?? []) as Array<{
        user_id: string;
        role: string;
        joined_at: string;
        admin_permissions: Partial<CommunityAdminPermissions> | null;
        promoted_by: string | null;
        promoted_at: string | null;
      }>;
      const profileIds = [...new Set(rows.flatMap((row) => [row.user_id, row.promoted_by].filter((id): id is string => Boolean(id))))];
      const { data: profiles, error: profilesError } = profileIds.length
        ? await client.from("profiles").select("id, username, display_name, avatar_url").in("id", profileIds)
        : { data: [], error: null };
      if (profilesError) throw profilesError;
      const byId = new Map<string, PublicProfile>(
        (profiles ?? []).map((profile) => [profile.id as string, profile as PublicProfile]),
      );
      setRoomAdmins(rows
        .filter((row) => row.role === "owner" || row.role === "admin")
        .map((row) => ({ ...row, role: row.role as "owner" | "admin", profile: byId.get(row.user_id) ?? null, promoter: row.promoted_by ? byId.get(row.promoted_by) ?? null : null })));
      setEligibleAdminMembers(rows
        .filter((row) => row.role === "member")
        .map((row) => byId.get(row.user_id))
        .filter((profile): profile is PublicProfile => Boolean(profile)));
      setAdminManagementOpen(true);
    } catch (cause) {
      setAdminError(cause instanceof Error ? cause.message : (ru ? "Не удалось загрузить администраторов." : "Could not load administrators."));
    } finally {
      setAdminBusy(false);
    }
  }

  function editAdminPermissions(userId: string) {
    const existing = roomAdmins.find((entry) => entry.user_id === userId);
    setEditingAdminId(userId);
    setPermissionsDraft({
      ...EMPTY_COMMUNITY_ADMIN_PERMISSIONS,
      ...(existing?.admin_permissions ?? {}),
    });
    setAdminError("");
  }

  async function saveAdminPermissions() {
    if (!room || !editingAdminId || adminBusy) return;
    setAdminBusy(true);
    setAdminError("");
    try {
      const { error: saveError } = await client.rpc("set_community_admin_permissions", {
        p_room_id: room.id,
        p_user_id: editingAdminId,
        p_permissions: permissionsDraft,
      });
      if (saveError) throw saveError;
      setEditingAdminId(null);
      setPermissionsDraft(EMPTY_COMMUNITY_ADMIN_PERMISSIONS);
      await loadAdminManagement();
    } catch (cause) {
      setAdminError(cause instanceof Error ? cause.message : (ru ? "Не удалось сохранить права администратора." : "Could not save administrator permissions."));
    } finally {
      setAdminBusy(false);
    }
  }

  async function removeCommunityAdmin(userId: string) {
    if (!room || adminBusy || userId === user.id) return;
    const confirmed = window.confirm(ru ? "Снять права администратора у этого участника?" : "Remove administrator rights from this member?");
    if (!confirmed) return;
    setAdminBusy(true);
    setAdminError("");
    try {
      const { error: removeError } = await client.rpc("remove_community_admin", {
        p_room_id: room.id,
        p_user_id: userId,
      });
      if (removeError) throw removeError;
      setEditingAdminId(null);
      await loadAdminManagement();
    } catch (cause) {
      setAdminError(cause instanceof Error ? cause.message : (ru ? "Не удалось снять права администратора." : "Could not remove administrator rights."));
    } finally {
      setAdminBusy(false);
    }
  }

  return (
    <section className="community-embedded" aria-label={ru ? "Переписка сообщества" : "Community conversation"}>
      <div className="community-panel community-pane">
        <header className="community-header">
          <button
            className="icon-button"
            type="button"
            onClick={() => {
              if (showRoomInfo) {
                setShowRoomInfo(false);
              } else if (createKind === "group" && createStep === "details") {
                setCreateStep("members");
                setError("");
              } else if (createKind === "channel" && createStep === "visibility") {
                setCreateStep("details");
                setError("");
              } else {
                onClose();
              }
            }}
            aria-label={ru ? "Назад" : "Back"}
          ><ArrowLeft size={19} /></button>
          {room ? (
            <button className="community-header-room" type="button" onClick={() => setShowRoomInfo(true)} aria-label={ru ? "Открыть информацию о сообществе" : "Open community info"}>
              <RoomAvatar room={room} />
              <span>
                <strong>{room.name}</strong>
                <small>{roomMemberLabel(room.kind, memberCount, ru)}{!room.is_public ? (ru ? " · Частное" : " · Private") : ""}</small>
              </span>
              <ChevronRight size={18} />
            </button>
          ) : (
            <div>
              <strong>{createKind === "group" ? (ru ? "Новая группа" : "New group") : (ru ? "Новый канал" : "New channel")}</strong>
              <small>{createKind === "group"
                ? (createStep === "members" ? (ru ? "Добавить участников" : "Add members") : (ru ? "Название и фото" : "Name and photo"))
                : (createStep === "details" ? (ru ? "Название и описание" : "Name and description") : (ru ? "Тип канала" : "Channel type"))}</small>
            </div>
          )}
        </header>

        {createKind === "group" && createStep === "members" ? (
          <div className="community-create-members">
            <div className="community-create-intro">
              <strong>{ru ? "Выберите участников" : "Choose members"}</strong>
              <p>{ru ? "Добавьте людей из недавних чатов или найдите их по username. Группу можно создать и без приглашений." : "Pick people from recent chats or search by username. You can also create the group without inviting anyone."}</p>
            </div>
            {renderMemberPicker(ru ? "Контакты" : "Contacts", ru ? "Выберите участников" : "Select members")}
            <div className="community-create-footer">
              <button className="community-primary" type="button" onClick={() => { setCreateStep("details"); setError(""); }}>
                {ru ? "Далее" : "Next"}{selectedMembers.length > 0 ? " · " + selectedMembers.length : ""}
              </button>
            </div>
          </div>
        ) : createKind && createStep === "details" ? (
          <form className="community-create-form" onSubmit={createKind === "group" ? createRoom : advanceToVisibility}>
            <div className="community-photo-row">
              <input
                ref={createAvatarInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                hidden
                onChange={(event) => chooseCreateAvatar(event.target.files?.[0])}
              />
              <button
                className="community-avatar-picker"
                type="button"
                onClick={() => createAvatarInput.current?.click()}
                aria-label={ru ? "Добавить фото" : "Add photo"}
              >
                {createAvatarPreview ? <img src={createAvatarPreview} alt="" /> : <ImagePlus size={27} />}
              </button>
              <div>
                <strong>{ru ? "Фото сообщества" : "Community photo"}</strong>
                <small>{ru ? "Необязательно · PNG, JPEG или WebP до 3 МБ" : "Optional · PNG, JPEG or WebP up to 3 MB"}</small>
              </div>
            </div>
            <label>{ru ? "Название" : "Name"}
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                minLength={2}
                maxLength={64}
                required
                placeholder={createKind === "group" ? (ru ? "Название группы" : "Group name") : (ru ? "Название канала" : "Channel name")}
              />
            </label>
            {createKind === "channel" && (
              <label>{ru ? "Описание" : "Description"}
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder={ru ? "О чём этот канал?" : "What is this channel about?"}
                />
              </label>
            )}
            <label>{ru ? "Ссылка сообщества" : "Community username"}
              <div className="community-username-field">
                <span>@</span>
                <input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9_]/g, "").slice(0, 32))} minLength={5} maxLength={32} pattern="[a-z][a-z0-9_]{4,31}" required autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder={createKind === "group" ? "my_group" : "my_channel"} />
              </div>
              <small className="community-muted">{ru ? "5–32 символа: латинские буквы, цифры и _" : "5–32 characters: a–z, 0–9 and _"}</small>
            </label>
            {createKind === "group" && (
              <p className="community-muted">
                {ru
                  ? "Участников: " + selectedMembers.length + ". Группа будет закрытой — добавлять людей сможете вы и администраторы."
                  : "Members: " + selectedMembers.length + ". The group will be private; you and admins can add people."}
              </p>
            )}
            <div className="community-create-footer">
              {createKind === "group" ? (
                <button className="community-primary" type="submit" disabled={busy || name.trim().length < 2 || !/^[a-z][a-z0-9_]{4,31}$/.test(username.trim().replace(/^@/, "").toLowerCase())}>
                  {busy ? (ru ? "Создание…" : "Creating…") : (ru ? "Создать группу" : "Create group")}
                </button>
              ) : (
                <button className="community-primary" type="submit" disabled={name.trim().length < 2}>
                  {ru ? "Далее" : "Next"}
                </button>
              )}
            </div>
          </form>
        ) : createKind === "channel" && createStep === "visibility" ? (
          <form className="community-create-form community-channel-visibility" onSubmit={createRoom}>
            <div className="community-create-intro">
              <strong>{ru ? "Какой будет канал?" : "Choose channel type"}</strong>
              <p>{ru ? "Публичный канал можно найти в поиске. Частный доступен только приглашённым участникам." : "Public channels can be found in search. Private channels are only accessible to invited members."}</p>
            </div>
            <div className="community-visibility-options">
              <label className={"community-visibility-option" + (isPublic ? " active" : "")}>
                <input type="radio" name="channel-visibility" checked={isPublic} onChange={() => setIsPublic(true)} />
                <span>
                  <strong>{ru ? "Публичный канал" : "Public channel"}</strong>
                  <small>{ru ? "Любой сможет найти его по ссылке и подписаться" : "Anyone can find it by its username and subscribe"}</small>
                </span>
              </label>
              <label className={"community-visibility-option" + (!isPublic ? " active" : "")}>
                <input type="radio" name="channel-visibility" checked={!isPublic} onChange={() => setIsPublic(false)} />
                <span>
                  <strong>{ru ? "Частный канал" : "Private channel"}</strong>
                  <small>{ru ? "Только вы приглашаете подписчиков" : "Only people you invite can subscribe"}</small>
                </span>
              </label>
            </div>
            {!isPublic && (
              <p className="community-muted">{ru ? "Канал не будет отображаться в поиске. Его участниками станут только приглашённые люди." : "This channel will not appear in search. Only invited people will be subscribers."}</p>
            )}
            {renderMemberPicker(ru ? "Добавить подписчиков" : "Add subscribers", ru ? "Выбранные люди будут подписаны сразу" : "Selected people will be subscribed immediately")}
            <div className="community-create-footer">
              <button className="community-secondary" type="button" onClick={() => { setCreateStep("details"); setError(""); }}>
                {ru ? "Назад" : "Back"}
              </button>
              <button className="community-primary" type="submit" disabled={busy || name.trim().length < 2 || (isPublic && !/^[a-z][a-z0-9_]{4,31}$/.test(username.trim().replace(/^@/, "").toLowerCase()))}>
                {busy ? (ru ? "Создание…" : "Creating…") : (ru ? "Создать канал" : "Create channel")}
              </button>
            </div>
          </form>
        ) : room ? (
          <div className="community-room-view">
            {!memberRole ? (
              <div className="community-join"><p>{room.kind === "group" ? (ru ? "Вступи в группу, чтобы читать и отправлять сообщения." : "Join this group to read and send messages.") : (ru ? "Подпишись, чтобы читать публикации канала." : "Subscribe to read channel posts.")}</p><button className="community-primary" type="button" onClick={() => void joinPublicRoom()} disabled={busy}>{room.kind === "group" ? (ru ? "Вступить в группу" : "Join group") : (ru ? "Подписаться" : "Subscribe")}</button></div>
            ) : (
              <>
                <div className="community-message-list">
                  {messages.length === 0 ? <div className="community-empty"><MessageCircle size={24} /><span>{ru ? "Пока нет сообщений" : "No messages yet"}</span></div> : messages.map((item) => (
                    <article className={"community-message " + (item.sender_id === user.id ? "mine" : "")} key={item.id}>
                      {item.sender_id !== user.id && <small>{ru ? "Участник" : "Member"}</small>}
                      <p>{item.body}</p><footer><time>{new Date(item.created_at).toLocaleTimeString(ru ? "ru-RU" : "en-US", { hour: "2-digit", minute: "2-digit" })}</time>
                      {canDeleteCommunityMessage(memberRole, myAdminPermissions, item.sender_id, user.id) && <button type="button" onClick={() => void deleteMessage(item)}>{ru ? "Удалить" : "Delete"}</button>}</footer>
                    </article>
                  ))}
                  <div ref={messagesEnd} />
                </div>
                {(room.kind === "group" || canPostChannelMessages) ? (
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

        {showRoomInfo && room && (
          <section className="community-info-screen" role="dialog" aria-modal="true" aria-label={ru ? "Информация о сообществе" : "Community information"}>
            <header className="community-info-header">
              <button className="icon-button" type="button" onClick={() => { setShowRoomInfo(false); setRoomEditing(false); setError(""); }} aria-label={ru ? "Назад к чату" : "Back to chat"}><ArrowLeft size={20} /></button>
              <strong>{ru ? "Информация" : "Information"}</strong>
              {canChangeRoomInfo ? (
                <button className="icon-button" type="button" onClick={() => { setRoomNameDraft(room.name); setRoomUsernameDraft(room.username); setRoomDescriptionDraft(room.description); setRoomEditing((current) => !current); setError(""); }} aria-label={ru ? "Изменить информацию" : "Edit information"} title={ru ? "Изменить информацию" : "Edit information"}><PencilLine size={19} /></button>
              ) : <span className="community-info-header-spacer" />}
            </header>
            <div className="community-info-scroll">
              <div className="community-info-hero">
                <div className="community-info-avatar-wrap">
                  <RoomAvatar room={room} className="community-info-avatar" />
                  {canChangeRoomInfo && (
                    <>
                      <input ref={avatarInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => void changeRoomAvatar(event.target.files?.[0])} />
                      <button className="community-info-avatar-edit" type="button" onClick={() => avatarInput.current?.click()} disabled={busy} aria-label={ru ? "Изменить фото сообщества" : "Change community photo"}><ImagePlus size={19} /></button>
                    </>
                  )}
                </div>
                <h1>{room.name}</h1>
                <p>{roomMemberLabel(room.kind, memberCount, ru)}{!room.is_public ? (ru ? " · Частное сообщество" : " · Private community") : (ru ? " · Публичное" : " · Public")}</p>
              </div>
              <div className="community-info-section">
                <div className="community-info-section-label">{ru ? "Ссылка" : "Link"}</div>
                <div className="community-info-detail">
                  <strong>@{room.username}</strong>
                  <small>{room.is_public
                    ? (ru ? "Публичное имя сообщества" : "Public community username")
                    : (ru ? "Имя сообщества · Доступ остаётся закрытым" : "Community username · Access remains private")}</small>
                </div>
              </div>
              <div className="community-info-section">
                <div className="community-info-section-label">{ru ? "Тип" : "Type"}</div>
                <div className="community-info-detail">
                  <strong>{room.kind === "channel" ? (ru ? "Канал" : "Channel") : (ru ? "Группа" : "Group")}</strong>
                  <small>{room.is_public
                    ? (ru ? "Открыто для поиска и вступления" : "Discoverable and open to join")
                    : (ru ? "Закрытое сообщество" : "Private community")}</small>
                </div>
              </div>
              {room.description.trim() && (
                <div className="community-info-section">
                  <div className="community-info-section-label">{ru ? "Описание" : "Description"}</div>
                  <div className="community-info-detail"><p>{room.description}</p></div>
                </div>
              )}
              {roomEditing && canChangeRoomInfo && (
                <form className="community-room-edit community-info-edit community-details-edit" onSubmit={saveRoomDetails}>
                  <label>{ru ? "Название" : "Name"}
                    <input className="community-details-input" value={roomNameDraft} onChange={(event) => setRoomNameDraft(event.target.value.slice(0, 64))} minLength={2} maxLength={64} required />
                  </label>
                  <label>{ru ? "Ссылка сообщества (@username)" : "Community username"}
                    <div className="community-username-field"><span>@</span><input value={roomUsernameDraft} onChange={(event) => setRoomUsernameDraft(event.target.value.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9_]/g, "").slice(0, 32))} minLength={5} maxLength={32} pattern="[a-z][a-z0-9_]{4,31}" required autoCapitalize="none" autoCorrect="off" spellCheck={false} /></div>
                  </label>
                  <label>{ru ? "Описание" : "Description"}
                    <textarea className="community-details-textarea" value={roomDescriptionDraft} onChange={(event) => setRoomDescriptionDraft(event.target.value.slice(0, 255))} maxLength={255} rows={4} placeholder={ru ? "Расскажите о группе или канале" : "Describe this group or channel"} />
                    <small className="community-details-counter">{roomDescriptionDraft.length}/255</small>
                  </label>
                  <div className="community-room-edit-actions">
                    <button className="community-secondary" type="button" onClick={() => { setRoomEditing(false); setRoomNameDraft(room.name); setRoomUsernameDraft(room.username); setRoomDescriptionDraft(room.description); setError(""); }}>{ru ? "Отмена" : "Cancel"}</button>
                    <button className="community-primary" type="submit" disabled={busy || (roomNameDraft.trim() === room.name && roomUsernameDraft.trim().replace(/^@/, "") === room.username && roomDescriptionDraft.trim() === room.description)}>{busy ? (ru ? "Сохранение…" : "Saving…") : (ru ? "Сохранить" : "Save")}</button>
                  </div>
                </form>
              )}
              {(canChangeRoomInfo || canManageRoomAdmins || memberRole === "owner") && (
                <div className="community-info-admin-actions">
                  {canChangeRoomInfo && <>
                    <button type="button" onClick={() => { setRoomNameDraft(room.name); setRoomUsernameDraft(room.username); setRoomDescriptionDraft(room.description); setRoomEditing((current) => !current); setError(""); }}><PencilLine size={17} />{ru ? "Изменить информацию" : "Edit information"}</button>
                    <button type="button" onClick={() => avatarInput.current?.click()} disabled={busy}><ImagePlus size={17} />{ru ? "Изменить фото" : "Change photo"}</button>
                  </>}
                  {canManageRoomAdmins && (
                    <button type="button" onClick={() => void loadAdminManagement()} disabled={adminBusy}><ShieldCheck size={17} />{ru ? "Администраторы и права" : "Administrators and permissions"}</button>
                  )}
                  {room.created_by === user.id && memberRole === "owner" && (
                    <button className="danger" type="button" onClick={() => void deleteRoom()} disabled={busy}>
                      <Trash2 size={17} />{busy ? (ru ? "Удаление…" : "Deleting…") : (room.kind === "channel" ? (ru ? "Удалить канал" : "Delete channel") : (ru ? "Удалить группу" : "Delete group"))}
                    </button>
                  )}
                </div>
              )}
              {!memberRole && room.is_public && (
                <button className="community-primary community-info-join" type="button" onClick={() => void joinPublicRoom()} disabled={busy}>{room.kind === "channel" ? (ru ? "Подписаться" : "Subscribe") : (ru ? "Вступить в группу" : "Join group")}</button>
              )}
            </div>
          </section>
        )}

        {adminManagementOpen && room && (
          <section className="community-admin-screen" role="dialog" aria-modal="true" aria-label={ru ? "Администраторы группы" : "Group administrators"}>
            <header className="community-info-header">
              <button className="icon-button" type="button" onClick={() => { setAdminManagementOpen(false); setEditingAdminId(null); setAdminError(""); }} aria-label={ru ? "Назад" : "Back"}><ArrowLeft size={20} /></button>
              <strong>{ru ? "Администраторы" : "Administrators"}</strong>
              <span className="community-info-header-spacer" />
            </header>
            <div className="community-admin-scroll">
              <section className="community-admin-section">
                <h2>{ru ? "Текущие администраторы" : "Current administrators"}</h2>
                {roomAdmins.map((admin) => {
                  const label = admin.profile?.display_name || admin.profile?.username || (ru ? "Участник" : "Member");
                  const appointedBy = admin.promoter?.username || admin.promoter?.display_name || null;
                  const appointedAt = new Date(admin.promoted_at || admin.joined_at).toLocaleDateString(ru ? "ru-RU" : "en-US");
                  return (
                    <article className="community-admin-person" key={admin.user_id}>
                      <div className="community-admin-person-avatar">
                        {admin.profile?.avatar_url ? <img src={admin.profile.avatar_url} alt="" /> : label.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="community-admin-person-copy">
                        <strong>{label}</strong>
                        <small>{admin.role === "owner" ? (ru ? "Владелец" : "Owner") : (ru ? "Администратор" : "Administrator")}</small>
                        <small>{(ru ? "Назначен: " : "Appointed: ") + appointedAt + (appointedBy ? " · " + (ru ? "кем" : "by") + " @" + appointedBy : "")}</small>
                      </div>
                      {admin.role === "admin" && admin.user_id !== user.id && (
                        <div className="community-admin-person-actions">
                          {memberRole === "owner" && <button type="button" onClick={() => editAdminPermissions(admin.user_id)}>{ru ? "Права" : "Rights"}</button>}
                          {(memberRole === "owner" || admin.promoted_by === user.id) && (
                            <button className="community-admin-remove" type="button" onClick={() => void removeCommunityAdmin(admin.user_id)} disabled={adminBusy}>{ru ? "Снять" : "Remove"}</button>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </section>

              <section className="community-admin-section">
                <h2>{ru ? "Назначить администратора" : "Add an administrator"}</h2>
                {eligibleAdminMembers.length === 0
                  ? <p className="community-admin-empty">{ru ? "Нет участников, которых можно назначить." : "There are no eligible members to promote."}</p>
                  : eligibleAdminMembers.map((profile) => (
                    <button className="community-admin-candidate" type="button" key={profile.id} onClick={() => editAdminPermissions(profile.id)}>
                      <span className="community-admin-person-avatar">{profile.avatar_url ? <img src={profile.avatar_url} alt="" /> : (profile.display_name || profile.username).slice(0, 1).toUpperCase()}</span>
                      <span><strong>{profile.display_name || profile.username}</strong><small>@{profile.username}</small></span>
                      <ChevronRight size={17} />
                    </button>
                  ))}
              </section>

              {editingAdminId && (
                <section className="community-admin-section community-admin-editor">
                  <h2>{roomAdmins.some((admin) => admin.user_id === editingAdminId)
                    ? (ru ? "Права администратора" : "Administrator permissions")
                    : (ru ? "Назначение администратора" : "Promote member")}</h2>
                  <p className="community-admin-hint">{ru
                    ? "Выбери только те действия, которые этому администратору действительно нужны. Владелец сохраняет полный доступ."
                    : "Grant only the actions this administrator needs. The owner always keeps full access."}</p>
                  <label className="community-admin-permission">
                    <input type="checkbox" checked={permissionsDraft.change_info} onChange={(event) => setPermissionsDraft((current) => ({ ...current, change_info: event.target.checked }))} />
                    <span><strong>{ru ? "Изменение информации" : "Change group info"}</strong><small>{ru ? "Название, описание и фотография" : "Name, description and photo"}</small></span>
                  </label>
                  <label className="community-admin-permission">
                    <input type="checkbox" checked={permissionsDraft.delete_messages} onChange={(event) => setPermissionsDraft((current) => ({ ...current, delete_messages: event.target.checked }))} />
                    <span><strong>{ru ? "Удаление сообщений" : "Delete messages"}</strong><small>{ru ? "Удалять сообщения других участников" : "Delete messages sent by other members"}</small></span>
                  </label>
                  {room.kind === "channel" && (
                    <label className="community-admin-permission">
                      <input type="checkbox" checked={permissionsDraft.post_messages} onChange={(event) => setPermissionsDraft((current) => ({ ...current, post_messages: event.target.checked }))} />
                      <span><strong>{ru ? "Публикация сообщений" : "Publish messages"}</strong><small>{ru ? "Публиковать записи в канале" : "Publish posts in this channel"}</small></span>
                    </label>
                  )}
                  {memberRole === "owner" && (
                    <label className="community-admin-permission">
                      <input type="checkbox" checked={permissionsDraft.manage_admins} onChange={(event) => setPermissionsDraft((current) => ({ ...current, manage_admins: event.target.checked }))} />
                      <span><strong>{ru ? "Назначение администраторов" : "Manage administrators"}</strong><small>{ru ? "Назначать участников и управлять правами администраторов с меньшими полномочиями" : "Promote members and manage administrators with lower authority"}</small></span>
                    </label>
                  )}
                  <p className="community-admin-hint">{ru
                    ? "Приглашения, блокировка участников, закрепление сообщений, темы и звонки пока не поддерживаются в HELORO — эти права не отображаются как активные."
                    : "Invites, member bans, pinned messages, topics and calls are not implemented in HELORO yet, so they are not shown as active permissions."}</p>
                  <div className="community-admin-editor-actions">
                    <button type="button" className="community-secondary" onClick={() => { setEditingAdminId(null); setPermissionsDraft(EMPTY_COMMUNITY_ADMIN_PERMISSIONS); }} disabled={adminBusy}>{ru ? "Отмена" : "Cancel"}</button>
                    <button type="button" className="community-primary" onClick={() => void saveAdminPermissions()} disabled={adminBusy}>{adminBusy ? (ru ? "Сохранение…" : "Saving…") : (ru ? "Сохранить" : "Save")}</button>
                  </div>
                </section>
              )}
              {adminError && <p className="community-error" role="alert">{adminError}</p>}
            </div>
          </section>
        )}

        {error && <p className="community-error" role="alert">{error}</p>}
      </div>
    </section>
  );
}
