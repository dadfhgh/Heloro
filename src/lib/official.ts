import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

export type BadgeType = "blue" | "gold" | "creator" | "epic_sans";

export interface ChannelPost {
  id: string;
  channel_id: string;
  author_id: string;
  body: string;
  is_pinned: boolean;
  created_at: string;
  media?: { kind: "photo"; path: string; url: string } | null;
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

const CHANNEL_MEDIA_PREFIX = "HELORO_CHANNEL_MEDIA:";
const CHANNEL_PHOTO_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
type ChannelPhotoPayload = { scope: "official" | "community"; path: string; caption?: string };

async function hydrateChannelPost(client: SupabaseClient, post: ChannelPost): Promise<ChannelPost> {
  if (!post.body.startsWith(CHANNEL_MEDIA_PREFIX)) return { ...post, media: null };
  try {
    const payload = JSON.parse(post.body.slice(CHANNEL_MEDIA_PREFIX.length)) as Partial<ChannelPhotoPayload>;
    if (payload.scope !== "official" || typeof payload.path !== "string") {
      return { ...post, body: "", media: null };
    }
    const { data, error } = await client.storage.from("channel-media").createSignedUrl(payload.path, 3600);
    if (error || !data?.signedUrl) {
      return { ...post, body: payload.caption ?? "", media: null };
    }
    return {
      ...post,
      body: payload.caption ?? "",
      media: { kind: "photo", path: payload.path, url: data.signedUrl },
    };
  } catch {
    return { ...post, body: "", media: null };
  }
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
  return Promise.all(((data ?? []) as ChannelPost[]).map((post) => hydrateChannelPost(client, post)));
}

export async function deleteChannelPost(client: SupabaseClient, postId: string) {
  const existing = await client.from("channel_posts").select("body").eq("id", postId).maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data) throw new Error("Публикация не найдена или у вас нет прав на её удаление.");

  const { data, error } = await client.from("channel_posts").delete().eq("id", postId).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Публикация не найдена или у вас нет прав на её удаление.");

  if (existing.data.body.startsWith(CHANNEL_MEDIA_PREFIX)) {
    try {
      const payload = JSON.parse(existing.data.body.slice(CHANNEL_MEDIA_PREFIX.length)) as Partial<ChannelPhotoPayload>;
      if (payload.scope === "official" && typeof payload.path === "string") {
        const { error: cleanupError } = await client.storage.from("channel-media").remove([payload.path]);
        if (cleanupError) console.warn("Channel post was deleted, but its photo cleanup failed.", cleanupError);
      }
    } catch (cause) {
      console.warn("Channel post was deleted, but its photo path could not be parsed.", cause);
    }
  }
}

export async function createChannelPost(
  client: SupabaseClient,
  channelId: string,
  authorId: string,
  body: string,
  photo?: File | null,
) {
  const text = body.trim();
  if (text.length > 3500) throw new Error("Caption can contain up to 3,500 characters.");
  if (!text && !photo) throw new Error("Add text or choose a photo.");

  let mediaPath: string | null = null;
  let storedBody = text;
  if (photo) {
    const extension = CHANNEL_PHOTO_TYPES[photo.type];
    if (!extension) throw new Error("Choose a PNG, JPEG or WebP photo.");
    if (photo.size < 1 || photo.size > 5 * 1024 * 1024) throw new Error("Photos must be 5 MB or smaller.");
    mediaPath = `official/${channelId}/${authorId}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await client.storage.from("channel-media").upload(mediaPath, photo, {
      contentType: photo.type,
      cacheControl: "3600",
      upsert: false,
    });
    if (uploadError) throw uploadError;
    storedBody = CHANNEL_MEDIA_PREFIX + JSON.stringify({ scope: "official", path: mediaPath, caption: text });
    if (storedBody.length > 4000) {
      await client.storage.from("channel-media").remove([mediaPath]);
      throw new Error("Photo caption is too long.");
    }
  }

  const { data, error } = await client
    .from("channel_posts")
    .insert({ channel_id: channelId, author_id: authorId, body: storedBody })
    .select("id, channel_id, author_id, body, is_pinned, created_at")
    .single();
  if (error) {
    if (mediaPath) await client.storage.from("channel-media").remove([mediaPath]);
    throw error;
  }
  return hydrateChannelPost(client, data as ChannelPost);
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

export async function deleteChannelComment(client: SupabaseClient, commentId: string) {
  const { data, error } = await client.from("channel_comments").delete().eq("id", commentId).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Комментарий не найден или у вас нет прав на его удаление.");
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

export async function deleteDiscussionMessage(client: SupabaseClient, messageId: string) {
  const { data, error } = await client.from("channel_discussion_messages").delete().eq("id", messageId).select("id").maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Сообщение не найдено или у вас нет прав на его удаление.");
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
  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError) throw authError;
  if (!authData.user || authData.user.id !== reporterId) throw new Error("Report author does not match the signed-in account.");
  const { error } = await client.rpc("heloro_submit_report", {
    p_target_type: "user",
    p_target_id: null,
    p_reported_user_id: reportedUserId,
    p_reason: reason,
    p_details: details.trim().slice(0, 1500),
  });
  if (error) throw error;
}

export type ContentReportTarget = "message" | "group" | "channel";

export async function submitContentReport(
  client: SupabaseClient,
  targetType: ContentReportTarget,
  targetId: string,
  reason: UserReport["reason"],
  details: string,
) {
  const { error } = await client.rpc("heloro_submit_report", {
    p_target_type: targetType,
    p_target_id: targetId,
    p_reported_user_id: null,
    p_reason: reason,
    p_details: details.trim().slice(0, 1500),
  });
  if (error) throw error;
}

export async function updateReportStatus(
  client: SupabaseClient,
  reportId: string,
  status: UserReport["status"],
  note = "",
) {
  const { error } = await client.rpc("heloro_admin_update_report", {
    p_report_id: reportId,
    p_status: status,
    p_note: note.trim().slice(0, 1000),
  });
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
  if (badgeType === "epic_sans") {
    const { error } = await client.rpc("heloro_admin_grant_epic_sans_badge", {
      p_target_user_id: userId,
    });
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
  onDelete?: () => void,
): RealtimeChannel {
  const insertConfig = { event: "INSERT" as const, schema: "public", table, ...(filter ? { filter } : {}) };
  // Postgres Changes DELETE events cannot be filtered; consumers refresh their own scope.
  const deleteConfig = { event: "DELETE" as const, schema: "public", table };
  const channel = client
    .channel(`heloro:${table}:${filter ?? "all"}`)
    .on("postgres_changes", insertConfig, (payload) => onInsert(payload.new as T));
  if (onDelete) channel.on("postgres_changes", deleteConfig, () => onDelete());
  return channel.subscribe();
}
