export type BadgeType = "blue" | "gold" | "creator" | "epic_sans";

export interface Profile {
  id: string;
  username: string | null;
  display_name: string;
  avatar_url: string | null;
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
  media?: { kind: "sticker" | "gif"; url: string; path?: string } | null;
}

export interface PublicProfile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  badge_type?: BadgeType | null;
}
