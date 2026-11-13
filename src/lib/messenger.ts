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

export async function getMessages(
  conversationId: string,
  limit = 60,
): Promise<Message[]> {
  const { data, error } = await client()
    .from("messages")
    .select("id, conversation_id, sender_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  const rows = ((data ?? []) as Message[]).reverse();
  return await Promise.all(rows.map(async (row): Promise<Message> => {
    const mediaPrefix = "HELORO_MEDIA:";
    if (!row.body.startsWith(mediaPrefix)) {
      return { ...row };
    }
    try {
      const payload = JSON.parse(row.body.slice(mediaPrefix.length)) as { kind?: string; path?: string };
      if ((payload.kind !== "sticker" && payload.kind !== "gif") || typeof payload.path !== "string") {
        return { ...row, body: "Media unavailable.", media: null };
      }
      const { data: signed, error: signError } = await client()
        .storage.from("message-media").createSignedUrl(payload.path, 3600);
      if (signError || !signed?.signedUrl) {
        return { ...row, body: "Media unavailable.", media: null };
      }
      return {
        ...row,
        body: "",
        media: { kind: payload.kind, url: signed.signedUrl, path: payload.path },
      };
    } catch {
      return { ...row, body: "Media unavailable.", media: null };
    }
  }));
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  body: string,
): Promise<Message> {
  const parsed = messageBodySchema.safeParse(body);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid message.");

  const { data, error } = await client()
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      body: parsed.data,
    })
    .select("id, conversation_id, sender_id, body, created_at")
    .single();

  if (error) throw error;
  return data as Message;
}

export async function sendMediaMessage(
  conversationId: string,
  senderId: string,
  file: File,
  kind: "sticker" | "gif",
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

  const { error: messageError } = await client().from("messages").insert({
    conversation_id: conversationId,
    sender_id: senderId,
    body: `HELORO_MEDIA:${JSON.stringify({ kind, path })}`,
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
      (payload) => onInsert(payload.new as Message),
    )
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, () => onDelete?.())
    .subscribe();
}