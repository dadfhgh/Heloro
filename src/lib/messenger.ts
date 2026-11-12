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
    .select("id, conversation_id, sender_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return ((data ?? []) as Message[]).reverse();
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