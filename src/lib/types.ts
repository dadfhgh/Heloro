export type BadgeType = "blue" | "gold" | "creator" | "epic_sans";

export interface Profile {
  id: string;
  username: string | null;
  display_name: string;
  avatar_url: string | null;
  created_at?: string;
}

export interface InboxConversation {
  conversation_id: string;
  updated_at: string;
  other_user_id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  last_message: string | null;
  last_message_at: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  edited_at?: string | null;
  reply_to?: string | null;
  reply?: { id: string; sender_id: string; body: string; created_at: string } | null;
  media?: { kind: "photo" | "sticker" | "gif" | "video"; url?: string; path?: string; emoji?: string; animation?: "pop" | "float" | "pulse" | "spin"; trimStart?: number; trimEnd?: number } | null;
}

export interface PublicProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  created_at?: string;
  badge_type?: BadgeType | null;
}
