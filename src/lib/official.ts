import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

export type BadgeType = "blue" | "gold" | "creator";

export interface ChannelPost {
  id: string;
  channel_id: string;
  author_id: string;
  body: string;
  is_pinned: boolean;
  created_at: string;
}

export interface ChannelComment {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
}

export interface DiscussionMessage {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
}

export interface SupportThread {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface SupportMessage {
  id: string;
  thread_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface UserReport {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  reason: "spam" | "harassment" | "scam" | "inappropriate" | "other";
  details: string;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  created_at: string;
}

export async function getNewsChannel(client: SupabaseClient) {
  const { data, error } = await client
    .from("heloro_channels")
    .select("id, slug, name, description")
    .eq("slug", "heloro-new")
    .single();
  if (error) throw error;
  return data as { id: string; slug: string; name: string; description: string };
}

export async function getChannelPosts(client: SupabaseClient, channelId: string) {
  const { data, error } = await client
    .from("channel_posts")
    .select("id, channel_id, author_id, body, is_pinned, created_at")
    .eq("channel_id", channelId)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as ChannelPost[];
}

export async function createChannelPost(client: SupabaseClient, channelId: string, authorId: string, body: string) {
  const text = body.trim();
  if (!text || text.length > 4000) throw new Error("Post must contain 1–4000 characters.");
  const { data, error } = await client
    .from("channel_posts")
    .insert({ channel_id: channelId, author_id: authorId, body: text })
    .select("id, channel_id, author_id, body, is_pinned, created_at")
    .single();
  if (error) throw error;
  return data as ChannelPost;
}

export async function getChannelComments(client: SupabaseClient, postId: string) {
  const { data, error } = await client
    .from("channel_comments")
    .select("id, post_id, user_id, body, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as ChannelComment[];
}

export async function sendChannelComment(client: SupabaseClient, postId: string, userId: string, body: string) {
  const text = body.trim();
  if (!text || text.length > 2000) throw new Error("Comment must contain 1–2000 characters.");
  const { data, error } = await client
    .from("channel_comments")
    .insert({ post_id: postId, user_id: userId, body: text })
    .select("id, post_id, user_id, body, created_at")
    .single();
  if (error) throw error;
  return data as ChannelComment;
}

export async function getDiscussionMessages(client: SupabaseClient) {
  const { data, error } = await client
    .from("channel_discussion_messages")
    .select("id, user_id, body, created_at")
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as DiscussionMessage[];
}

export async function sendDiscussionMessage(client: SupabaseClient, userId: string, body: string) {
  const text = body.trim();
  if (!text || text.length > 2000) throw new Error("Message must contain 1–2000 characters.");
  const { data, error } = await client
    .from("channel_discussion_messages")
    .insert({ user_id: userId, body: text })
    .select("id, user_id, body, created_at")
    .single();
  if (error) throw error;
  return data as DiscussionMessage;
}

export async function getOrCreateSupportThread(client: SupabaseClient, userId: string) {
  const existing = await client
    .from("support_threads")
    .select("id, user_id, created_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) return existing.data as SupportThread;

  const created = await client
    .from("support_threads")
    .insert({ user_id: userId })
    .select("id, user_id, created_at, updated_at")
    .single();
  if (!created.error) return created.data as SupportThread;
  if (created.error.code !== "23505") throw created.error;

  const retry = await client
    .from("support_threads")
    .select("id, user_id, created_at, updated_at")
    .eq("user_id", userId)
    .single();
  if (retry.error) throw retry.error;
  return retry.data as SupportThread;
}

export async function getSupportThreads(client: SupabaseClient) {
  const { data, error } = await client
    .from("support_threads")
    .select("id, user_id, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as SupportThread[];
}

export async function getSupportMessages(client: SupabaseClient, threadId: string) {
  const { data, error } = await client
    .from("support_messages")
    .select("id, thread_id, sender_id, body, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as SupportMessage[];
}

export async function sendSupportMessage(client: SupabaseClient, threadId: string, senderId: string, body: string) {
  const text = body.trim();
  if (!text || text.length > 4000) throw new Error("Message must contain 1–4000 characters.");
  const { data, error } = await client
    .from("support_messages")
    .insert({ thread_id: threadId, sender_id: senderId, body: text })
    .select("id, thread_id, sender_id, body, created_at")
    .single();
  if (error) throw error;
  return data as SupportMessage;
}

export async function getUserReports(client: SupabaseClient) {
  const { data, error } = await client
    .from("user_reports")
    .select("id, reporter_id, reported_user_id, reason, details, status, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as UserReport[];
}

export async function submitUserReport(
  client: SupabaseClient,
  reporterId: string,
  reportedUserId: string,
  reason: UserReport["reason"],
  details: string,
) {
  const { error } = await client.from("user_reports").insert({
    reporter_id: reporterId,
    reported_user_id: reportedUserId,
    reason,
    details: details.trim().slice(0, 1500),
  });
  if (error) throw error;
}

export async function updateReportStatus(
  client: SupabaseClient,
  reportId: string,
  status: UserReport["status"],
) {
  const { error } = await client
    .from("user_reports")
    .update({ status })
    .eq("id", reportId);
  if (error) throw error;
}

export async function setVerificationBadge(
  client: SupabaseClient,
  userId: string,
  staffId: string,
  badgeType: BadgeType | null,
) {
  if (!badgeType) {
    const { error } = await client.from("verification_badges").delete().eq("user_id", userId);
    if (error) throw error;
    return;
  }
  const { error: deleteError } = await client.from("verification_badges").delete().eq("user_id", userId);
  if (deleteError) throw deleteError;
  const { error } = await client.from("verification_badges").insert({
    user_id: userId,
    badge_type: badgeType,
    granted_by: staffId,
  });
  if (error) throw error;
}

export function subscribeToOfficialInserts<T>(
  client: SupabaseClient,
  table: "channel_posts" | "channel_comments" | "channel_discussion_messages" | "support_messages",
  filter: string | undefined,
  onInsert: (row: T) => void,
): RealtimeChannel {
  const config = { event: "INSERT" as const, schema: "public", table, ...(filter ? { filter } : {}) };
  return client
    .channel(`heloro:${table}:${filter ?? "all"}`)
    .on("postgres_changes", config, (payload) => onInsert(payload.new as T))
    .subscribe();
}
