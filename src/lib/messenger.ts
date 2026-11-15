import type { RealtimeChannel } from "@supabase/supabase-js";
import { messageBodySchema } from "./domain";
import { supabase, type SupabaseClient } from "./supabase";
import type { InboxConversation, Message, Profile, PublicProfile } from "./types";

function client(): SupabaseClient {
  if (!supabase) throw new Error("HELORO backend is not configured.");
  return supabase;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await client()
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return (data as Profile | null) ?? null;
}

export async function saveProfile(
  userId: string,
  values: { username: string; display_name: string },
): Promise<Profile> {
  const { data, error } = await client()
    .from("profiles")
    .update(values)
    .eq("id", userId)
    .select("id, username, display_name, avatar_url")
    .single();

  if (error) throw error;
  return data as Profile;
}

export async function getPublicProfile(userId: string): Promise<PublicProfile | null> {
  const { data, error } = await client().from("profiles")
    .select("id, username, display_name, avatar_url").eq("id", userId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { data: badge, error: badgeError } = await client().from("verification_badges")
    .select("badge_type").eq("user_id", userId).maybeSingle();
  if (badgeError) throw badgeError;
  return { ...data, username: data.username ?? "", badge_type: (badge?.badge_type as PublicProfile["badge_type"]) ?? null };
}

export async function uploadAvatar(userId: string, file: File): Promise<Profile> {
  const extensions: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
  const extension = extensions[file.type];
  if (!extension) throw new Error("Choose a PNG, JPEG or WebP image.");
  if (file.size < 1 || file.size > 3 * 1024 * 1024) throw new Error("Avatar images must be 3 MB or smaller.");
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const storage = client().storage.from("profile-avatars");
  const { error: uploadError } = await storage.upload(path, file, { contentType: file.type, cacheControl: "3600", upsert: false });
  if (uploadError) throw uploadError;
  const avatarUrl = storage.getPublicUrl(path).data.publicUrl;
  const { data, error } = await client().from("profiles").update({ avatar_url: avatarUrl })
    .eq("id", userId).select("id, username, display_name, avatar_url").single();
  if (error) { await storage.remove([path]); throw error; }
  return data as Profile;
}

export async function searchProfiles(query: string, currentUserId: string): Promise<PublicProfile[]> {
  const normalized = query.trim().replace(/^@/, "").toLowerCase();
  if (normalized.length < 2) return [];

  const safeQuery = normalized.replace(/[%,_]/g, "");
  if (safeQuery.length < 2) return [];

  const [usernameResult, nameResult] = await Promise.all([
    client()
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .neq("id", currentUserId)
      .ilike("username", `%${safeQuery}%`)
      .not("username", "is", null)
      .limit(8),
    client()
      .from("profiles")
      .select("id, username, display_name, avatar_url")
      .neq("id", currentUserId)
      .ilike("display_name", `%${safeQuery}%`)
      .not("username", "is", null)
      .limit(8),
  ]);

  if (usernameResult.error) throw usernameResult.error;
  if (nameResult.error) throw nameResult.error;

  const profiles = [...(usernameResult.data ?? []), ...(nameResult.data ?? [])];
  const uniqueProfiles = Array.from(new Map(profiles.map((profile) => [profile.id, profile])).values()).slice(0, 8);
  if (uniqueProfiles.length === 0) return [];

  const { data: badges, error: badgeError } = await client()
    .from("verification_badges")
    .select("user_id, badge_type")
    .in("user_id", uniqueProfiles.map((profile) => profile.id));
  if (badgeError) throw badgeError;

  const badgeByUser = new Map((badges ?? []).map((badge) => [badge.user_id, badge.badge_type]));
  return uniqueProfiles.map((profile) => ({
    ...profile,
    badge_type: (badgeByUser.get(profile.id) as PublicProfile["badge_type"]) ?? null,
  })) as PublicProfile[];
}

export async function listPublicProfiles(
  currentUserId: string,
  offset = 0,
  pageSize = 50,
): Promise<PublicProfile[]> {
  const { data, error } = await client()
    .from("profiles")
    .select("id, username, display_name, avatar_url")
    .neq("id", currentUserId)
    .not("username", "is", null)
    .order("display_name", { ascending: true })
    .order("username", { ascending: true })
    .range(offset, offset + pageSize - 1);

  if (error) throw error;

  const profiles = data ?? [];
  if (profiles.length === 0) return [];

  const { data: badges, error: badgeError } = await client()
    .from("verification_badges")
    .select("user_id, badge_type")
    .in("user_id", profiles.map((profile) => profile.id));
  if (badgeError) throw badgeError;

  const badgeByUser = new Map((badges ?? []).map((badge) => [badge.user_id, badge.badge_type]));
  return profiles.map((profile) => ({
    ...profile,
    badge_type: (badgeByUser.get(profile.id) as PublicProfile["badge_type"]) ?? null,
  })) as PublicProfile[];
}

export async function createDirectConversation(username: string): Promise<string> {
  const { data, error } = await client().rpc("create_direct_conversation", {
    target_username: username.replace(/^@/, "").trim().toLowerCase(),
  });

  if (error) throw error;
  if (typeof data !== "string") throw new Error("The conversation could not be created.");
  return data;
}

export async function getInbox(): Promise<InboxConversation[]> {
  const { data, error } = await client().rpc("get_inbox");
  if (error) throw error;
  return (data ?? []) as InboxConversation[];
}

async function hydrateMessageRows(rows: Message[]): Promise<Message[]> {
  const replyIds = [...new Set(rows.map((row) => row.reply_to).filter((id): id is string => Boolean(id)))];
  const replies = new Map<string, NonNullable<Message['reply']>>();
  if (replyIds.length > 0) {
    const { data, error } = await client().from('messages').select('id, sender_id, body, created_at').in('id', replyIds);
    if (error) throw error;
    for (const item of data ?? []) {
      const row = item as NonNullable<Message['reply']>;
      replies.set(row.id, { ...row, body: row.body.startsWith('HELORO_MEDIA:') ? 'Медиафайл' : row.body });
    }
  }
  return Promise.all(rows.map(async (row): Promise<Message> => {
    const withReply = { ...row, reply: row.reply_to ? replies.get(row.reply_to) ?? null : null };
    const prefix = 'HELORO_MEDIA:';
    if (!row.body.startsWith(prefix)) return withReply;
    try {
      const payload = JSON.parse(row.body.slice(prefix.length)) as { kind?: string; path?: string; caption?: string };
      if ((payload.kind !== 'photo' && payload.kind !== 'sticker' && payload.kind !== 'gif') || typeof payload.path !== 'string') return { ...withReply, body: 'Media unavailable.', media: null };
      const { data: signed, error } = await client().storage.from('message-media').createSignedUrl(payload.path, 3600);
      if (error || !signed?.signedUrl) return { ...withReply, body: 'Media unavailable.', media: null };
      return {
        ...withReply,
        body: payload.kind === 'photo' && typeof payload.caption === 'string' ? payload.caption : '',
        media: { kind: payload.kind, url: signed.signedUrl, path: payload.path },
      };
    } catch { return { ...withReply, body: 'Media unavailable.', media: null }; }
  }));
}
export async function getMessages(conversationId: string, limit = 60): Promise<Message[]> {
  const withReplies = await client().from('messages')
    .select('id, conversation_id, sender_id, body, created_at, reply_to')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (withReplies.error && !/reply_to/i.test(withReplies.error.message)) throw withReplies.error;
  const rows = withReplies.error
    ? await client().from('messages').select('id, conversation_id, sender_id, body, created_at').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(limit)
    : withReplies;
  if (rows.error) throw rows.error;
  return hydrateMessageRows(((rows.data ?? []) as Message[]).reverse());
}
export async function sendMessage(
  conversationId: string,
  senderId: string,
  body: string,
  replyTo?: string | null,
): Promise<Message> {
  const parsed = messageBodySchema.safeParse(body);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Invalid message.');
  const values = { conversation_id: conversationId, sender_id: senderId, body: parsed.data, ...(replyTo ? { reply_to: replyTo } : {}) };
  const query = client().from('messages').insert(values);
  const result = replyTo
    ? await query.select('id, conversation_id, sender_id, body, created_at, reply_to').single()
    : await query.select('id, conversation_id, sender_id, body, created_at').single();
  if (result.error && replyTo && /reply_to/i.test(result.error.message)) throw new Error('Ответы в чате ещё не включены на сервере. Требуется обновление базы HELORO.');
  if (result.error) throw result.error;
  return { ...(result.data as Message), reply_to: replyTo ?? null };
}

export async function getDirectMessageById(conversationId: string, messageId: string): Promise<Message | null> {
  const withReply = await client().from('messages').select('id, conversation_id, sender_id, body, created_at, reply_to').eq('conversation_id', conversationId).eq('id', messageId).maybeSingle();
  if (withReply.error && !/reply_to/i.test(withReply.error.message)) throw withReply.error;
  const row = withReply.error
    ? await client().from('messages').select('id, conversation_id, sender_id, body, created_at').eq('conversation_id', conversationId).eq('id', messageId).maybeSingle()
    : withReply;
  if (row.error) throw row.error;
  if (!row.data) return null;
  const [message] = await hydrateMessageRows([row.data as Message]);
  return message ?? null;
}

export async function getPinnedMessages(conversationId: string): Promise<Message[]> {
  const { data: pins, error: pinError } = await client().from('pinned_messages').select('message_id, pinned_at').eq('conversation_id', conversationId).order('pinned_at', { ascending: false }).limit(50);
  if (pinError) throw pinError;
  const ids = (pins ?? []).map((item) => item.message_id as string);
  if (ids.length === 0) return [];
  const { data, error } = await client().from('messages').select('id, conversation_id, sender_id, body, created_at, reply_to').eq('conversation_id', conversationId).in('id', ids);
  if (error) throw error;
  const byId = new Map((await hydrateMessageRows((data ?? []) as Message[])).map((item) => [item.id, item]));
  return ids.map((id) => byId.get(id)).filter((item): item is Message => Boolean(item));
}

export async function setDirectMessagePinned(conversationId: string, messageId: string, userId: string, pinned: boolean): Promise<void> {
  if (pinned) {
    const { error } = await client().from('pinned_messages').insert({ conversation_id: conversationId, message_id: messageId, pinned_by: userId });
    if (error && error.code !== '23505') throw error;
    return;
  }
  const { error } = await client().from('pinned_messages').delete().eq('conversation_id', conversationId).eq('message_id', messageId);
  if (error) throw error;
}

export async function sendMediaMessage(
  conversationId: string,
  senderId: string,
  file: File,
  kind: "photo" | "sticker" | "gif",
  caption = "",
): Promise<void> {
  const allowed = kind === "gif"
    ? ["image/gif"]
    : ["image/png", "image/jpeg", "image/webp"];
  if (!allowed.includes(file.type)) {
    throw new Error(kind === "gif" ? "Choose a GIF file." : "Choose a PNG, JPEG or WebP image.");
  }
  if (file.size < 1 || file.size > 5 * 1024 * 1024) {
    throw new Error("Media must be smaller than 5 MB.");
  }
  const extensionByType: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
  };
  const path = `${conversationId}/${senderId}/${crypto.randomUUID()}.${extensionByType[file.type]}`;
  const storage = client().storage.from("message-media");
  const { error: uploadError } = await storage.upload(path, file, {
    contentType: file.type,
    cacheControl: "3600",
    upsert: false,
  });
  if (uploadError) throw uploadError;

  const payload = {
    kind,
    path,
    ...(kind === "photo" && caption.trim() ? { caption: caption.trim().slice(0, 4000) } : {}),
  };
  const { error: messageError } = await client().from("messages").insert({
    conversation_id: conversationId,
    sender_id: senderId,
    body: `HELORO_MEDIA:${JSON.stringify(payload)}`,
  });
  if (messageError) {
    await storage.remove([path]);
    throw messageError;
  }
}

export async function deleteDirectMessage(message: Message, currentUserId: string): Promise<void> {
  if (!currentUserId) throw new Error("Authentication required.");
  const { data, error } = await client().from("messages")
    .delete()
    .eq("id", message.id)
    .eq("conversation_id", message.conversation_id)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Message not found or delete permission denied.");

  // The database policy authorizes this action for either participant in a
  // one-to-one conversation. The storage policy mirrors that exact scope.
  if (message.media?.path) {
    const { error: mediaError } = await client().storage.from("message-media").remove([message.media.path]);
    if (mediaError) console.warn("Message was deleted, but its media cleanup failed.", mediaError);
  }
}

export function subscribeToMessages(
  conversationId: string,
  onInsert: (message: Message) => void,
  onDelete?: () => void,
): RealtimeChannel {
  return client()
    .channel(`heloro:messages:${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`,
      },
      (payload) => {
        const incoming = payload.new as Message;
        if (!incoming.reply_to) {
          onInsert(incoming);
          return;
        }
        void client().from('messages')
          .select('id, sender_id, body, created_at')
          .eq('id', incoming.reply_to)
          .maybeSingle()
          .then(({ data, error }) => {
            if (error || !data) {
              onInsert(incoming);
              return;
            }
            const original = data as NonNullable<Message['reply']>;
            onInsert({
              ...incoming,
              reply: {
                ...original,
                body: original.body.startsWith('HELORO_MEDIA:') ? 'Медиафайл' : original.body,
              },
            });
          });
      },
    )
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, () => onDelete?.())
    .subscribe();
}

export async function subscribeToUserPresence(
  targetUserId: string,
  currentUserId: string,
  onChange: (online: boolean) => void,
): Promise<RealtimeChannel> {
  const presenceKey = targetUserId === currentUserId
    ? currentUserId + ":" + crypto.randomUUID()
    : currentUserId;
  const presenceChannel = client().channel("heloro:presence:" + targetUserId, {
    config: { private: true, presence: { key: presenceKey } },
  });
  presenceChannel.on("presence", { event: "sync" }, () => {
    const state = presenceChannel.presenceState<{ user_id?: string }>();
    onChange(Object.values(state).some((entries) => entries.some((entry) => entry.user_id === targetUserId)));
  });
  presenceChannel.subscribe(async (status) => {
    if (status === "SUBSCRIBED" && targetUserId === currentUserId) {
      const trackStatus = await presenceChannel.track({ user_id: currentUserId, online_at: new Date().toISOString() });
      if (trackStatus !== "ok") console.warn("HELORO presence tracking status:", trackStatus);
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      onChange(false);
    }
  });
  return presenceChannel;
}

export function subscribeToConversationTyping(
  conversationId: string,
  currentUserId: string,
  onTyping: (typing: boolean) => void,
  onReady?: (ready: boolean) => void,
): RealtimeChannel {
  return client()
    .channel("heloro:typing:" + conversationId, { config: { private: true } })
    .on("broadcast", { event: "typing" }, ({ payload }) => {
      const state = payload as { sender_id?: string; is_typing?: boolean };
      if (state.sender_id && state.sender_id !== currentUserId) onTyping(Boolean(state.is_typing));
    })
    .subscribe((status) => onReady?.(status === "SUBSCRIBED"));
}

export function sendTypingIndicator(channel: RealtimeChannel, userId: string, isTyping: boolean): void {
  void channel.send({ type: "broadcast", event: "typing", payload: { sender_id: userId, is_typing: isTyping } });
}

export type VisibleLastSeen = { user_id: string; last_seen_at: string };

export async function touchUserLastSeen(): Promise<void> {
  const { error } = await client().rpc("touch_user_last_seen");
  if (error) throw error;
}

export async function getVisibleLastSeen(userIds: string[]): Promise<VisibleLastSeen[]> {
  const uniqueIds = [...new Set(userIds)].filter(Boolean).slice(0, 100);
  if (uniqueIds.length === 0) return [];
  const { data, error } = await client().rpc("get_visible_last_seen", { target_user_ids: uniqueIds });
  if (error) throw error;
  return (data ?? []) as VisibleLastSeen[];
}
