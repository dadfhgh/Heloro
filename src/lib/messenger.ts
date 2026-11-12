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
    .select("id, conversation_id, sender_id, body, created_at, message_reactions(id, user_id, emoji)")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  const rows = ((data ?? []) as Array<Message & { message_reactions?: Message["reactions"] }>).reverse();
  return await Promise.all(rows.map(async (row): Promise<Message> => {
    const mediaPrefix = "HELORO_MEDIA:";
    if (!row.body.startsWith(mediaPrefix)) {
      return { ...row, reactions: row.message_reactions ?? [] };
    }
    try {
      const payload = JSON.parse(row.body.slice(mediaPrefix.length)) as { kind?: string; path?: string };
      if ((payload.kind !== "sticker" && payload.kind !== "gif") || typeof payload.path !== "string") {
        return { ...row, body: "Media unavailable.", reactions: row.message_reactions ?? [], media: null };
      }
      const { data: signed, error: signError } = await client()
        .storage.from("message-media").createSignedUrl(payload.path, 3600);
      if (signError || !signed?.signedUrl) {
        return { ...row, body: "Media unavailable.", reactions: row.message_reactions ?? [], media: null };
      }
      return {
        ...row,
        body: "",
        reactions: row.message_reactions ?? [],
        media: { kind: payload.kind, url: signed.signedUrl },
      };
    } catch {
      return { ...row, body: "Media unavailable.", reactions: row.message_reactions ?? [], media: null };
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

export async function toggleMessageReaction(messageId: string, userId: string, emoji: string): Promise<void> {
  const allowed = ["👍", "❤️", "😂", "🔥", "😮", "👏"];
  if (!allowed.includes(emoji)) throw new Error("Unsupported reaction.");
  const existing = await client()
    .from("message_reactions")
    .select("id")
    .eq("message_id", messageId)
    .eq("user_id", userId)
    .eq("emoji", emoji)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    const { error } = await client().from("message_reactions").delete().eq("id", existing.data.id);
    if (error) throw error;
    return;
  }
  const { error } = await client().from("message_reactions").insert({
    message_id: messageId,
    user_id: userId,
    emoji,
  });
  if (error) throw error;
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

export function subscribeToMessages(
  conversationId: string,
  onInsert: (message: Message) => void,
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
    .subscribe();
}