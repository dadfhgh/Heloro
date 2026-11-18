import { Fragment, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { RealtimeChannel, User } from "@supabase/supabase-js";
import {
  ArrowLeft,
  ArrowUp,
  BadgeCheck,
  Bookmark,
  BookmarkCheck,
  Check,
  CheckCheck,
  CalendarDays,
  Copy,
  Crown,
  Flag,
  Headphones,
  ImagePlus,
  Menu,
  Megaphone,
  MessageCircle,
  MessageSquareReply,
  Pin,
  PinOff,
  ChevronDown,
  MoreVertical,
  Paperclip,
  UserRound,
  Users,
  PencilLine,
  Phone,
  Search,
  Settings2,
  ShieldCheck,
  SmilePlus,
  Trash2,
  Video,
  X,
} from "lucide-react";
import {
  createDirectConversation,
  deleteDirectMessage,
  getInbox,
  getMessages,
  getMessageReactions,
  MESSAGE_REACTION_EMOJIS,
  toggleMessageReaction,
  subscribeToMessageReactions,
  getPinnedMessages,
  getDirectMessageById,
  setDirectMessagePinned,
  getPublicProfile,
  listPublicProfiles,
  searchProfiles,
  searchDirectMessages,
  saveProfile,
  sendMessage,
  sendMediaMessage,
  sendBuiltInMediaMessage,
  subscribeToMessages,
  subscribeToUserPresence,
  subscribeToConversationTyping,
  sendTypingIndicator,
  touchUserLastSeen,
  getVisibleLastSeen,
  uploadAvatar,
} from "../../lib/messenger";
import { formatInboxTime, formatLastSeen, formatMessageDayLabel, formatMessageTime, initials, messageBodySchema, usernameSchema, displayNameSchema, summarizeMessageReactions } from "../../lib/domain";
import type { InboxConversation, Message, MessageReaction, MessageReactionEmoji, Profile, PublicProfile, BadgeType } from "../../lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { t, type Locale } from "../../lib/i18n";
import OfficialPanels from "./OfficialPanels";
import OfficialAvatar from "./OfficialAvatar";
import CommunityHub from "./CommunityHub";
import ChatMediaPicker from "./ChatMediaPicker";
import { setVerificationBadge, submitUserReport, submitContentReport } from "../../lib/official";
import type { SettingsSection } from "./MessengerNavigation";
import ChatFoldersBar, { type FolderChoice } from "./ChatFoldersBar";
import type { ThemePreference } from "../../lib/preferences";
import "./MessengerTelegramDesign.css";
import "./MessengerCommunity.css";

type SystemView = "news" | "discussion" | "support" | "admin";
type CommunityRoomPreview = { id: string; kind: "group" | "channel"; name: string; username: string; description: string; avatar_url: string | null; is_public: boolean; updated_at: string; badge_type?: "blue" | "gold" | "creator" | null };
type VisibleChatItem = { kind: "direct"; sortAt: string; conversation: InboxConversation } | { kind: "community"; sortAt: string; room: CommunityRoomPreview };
type SavedMessageRecord = { id: string; conversationId: string; sourceTitle: string; savedAt: string; message: Message };

function readSavedMessages(userId: string): SavedMessageRecord[] {
  try {
    const raw = window.localStorage.getItem("heloro:saved-messages:" + userId);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SavedMessageRecord =>
      Boolean(item) &&
      typeof item === "object" &&
      typeof (item as SavedMessageRecord).id === "string" &&
      typeof (item as SavedMessageRecord).conversationId === "string" &&
      typeof (item as SavedMessageRecord).sourceTitle === "string" &&
      typeof (item as SavedMessageRecord).savedAt === "string" &&
      Boolean((item as SavedMessageRecord).message) &&
      typeof (item as SavedMessageRecord).message.id === "string" &&
      typeof (item as SavedMessageRecord).message.created_at === "string",
    ).slice(-300);
  } catch {
    return [];
  }
}

type Props = {
  client: SupabaseClient;
  user: User;
  profile: Profile;
  locale: Locale;
  onLocaleChange: (next: Locale) => void;
  roles: string[];
  theme: ThemePreference;
  onThemeChange: (next: ThemePreference) => void;
};

function Avatar({ label, className = "", src, crown = false }: { label: string; className?: string; src?: string | null; crown?: boolean }) {
  return <div className={`avatar ${crown ? "avatar-with-crown" : ""} ${className}`.trim()} aria-hidden="true">
    {src ? <img src={src} alt="" loading="lazy" /> : initials(label)}
    {crown && (
      <>
        <svg className="avatar-crown-frame-art" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          <path className="avatar-crown-frame-ring" d="M 46.2 10.9 A 25.4 25.4 0 1 0 56.4 24.8" />
        </svg>
        <span className="avatar-crown-frame-crown" aria-hidden="true"><Crown size={17} strokeWidth={2.5} /></span>
      </>
    )}
  </div>;
}

function PurpleCrownNameMark({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="purple-crown-name-mark" title="Фиолетовая корона HELORO" aria-label="Фиолетовая корона HELORO">
      <Crown size={13} strokeWidth={2.5} />
    </span>
  );
}

function VerificationMark({ type, title }: { type?: BadgeType | null; title: string }) {
  if (!type) return null;
  if (type === "epic_sans") {
    // Keep Epic Sans exactly as it was before the badge redesign.
    return <BadgeCheck size={14} className="epic-sans-verified-mark" aria-label="Epic Sans" role="img" />;
  }
  if (type === "creator") {
    const creatorTitle = title === "Verified by HELORO" ? "Verified HELORO creator" : "Проверенный автор HELORO";
    return <BadgeCheck size={14} className="creator-verified-mark" aria-label={creatorTitle} role="img" />;
  }
  if (type === "blue") {
    return <BadgeCheck size={14} className="blue-verified-mark" aria-label={title} role="img" />;
  }
  return <BadgeCheck size={14} className="gold-verified-mark" aria-label={title} role="img" />;
}

function formatInboxMessagePreview(value: string | null, locale: Locale): string {
  if (!value) return t(locale, "inboxSayHello");
  const prefix = "HELORO_MEDIA:";
  if (!value.startsWith(prefix)) return value;
  try {
    const payload = JSON.parse(value.slice(prefix.length)) as { kind?: string; caption?: string; emoji?: string };
    if (payload.kind === "photo") {
      const photoLabel = locale === "ru" ? "Фото" : "Photo";
      return payload.caption?.trim() ? photoLabel + ": " + payload.caption.trim() : photoLabel;
    }
    if (payload.kind === "video") return payload.caption?.trim() ? "Видео: " + payload.caption.trim() : (locale === "ru" ? "Видео" : "Video");
    if (payload.kind === "gif") return payload.emoji ? "GIF " + payload.emoji : "GIF";
    if (payload.kind === "sticker") return payload.emoji ? (locale === "ru" ? "Стикер " : "Sticker ") + payload.emoji : (locale === "ru" ? "Стикер" : "Sticker");
  } catch {
    // Older or malformed media messages still get a safe, readable preview.
  }
  return locale === "ru" ? "Медиафайл" : "Media";
}
function EmptyChat({ locale }: { locale: Locale }) {
  return (
    <div className="empty-chat">
      <div className="empty-chat-icon"><MessageCircle size={28} /></div>
      <h2>{t(locale, "chatSelectTitle")}</h2>
      <p>{t(locale, "chatSelectDescription")}</p>
    </div>
  );
}

type PhotoAspect = "original" | "square" | "landscape";
type MediaViewerState = { kind: "photo" | "video"; url: string; caption?: string };

async function transformPhotoFile(file: File, rotation: number, aspect: PhotoAspect): Promise<File> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const normalizedRotation = ((rotation % 360) + 360) % 360;
    const swap = normalizedRotation === 90 || normalizedRotation === 270;
    const rotatedWidth = swap ? image.naturalHeight : image.naturalWidth;
    const rotatedHeight = swap ? image.naturalWidth : image.naturalHeight;
    const rotatedCanvas = document.createElement("canvas");
    rotatedCanvas.width = rotatedWidth;
    rotatedCanvas.height = rotatedHeight;
    const rotatedContext = rotatedCanvas.getContext("2d");
    if (!rotatedContext) throw new Error("Не удалось открыть редактор фото.");
    rotatedContext.translate(rotatedWidth / 2, rotatedHeight / 2);
    rotatedContext.rotate((normalizedRotation * Math.PI) / 180);
    rotatedContext.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);

    let cropWidth = rotatedWidth;
    let cropHeight = rotatedHeight;
    const targetRatio = aspect === "square" ? 1 : aspect === "landscape" ? 16 / 9 : rotatedWidth / rotatedHeight;
    if (cropWidth / cropHeight > targetRatio) cropWidth = cropHeight * targetRatio;
    else cropHeight = cropWidth / targetRatio;
    const cropX = (rotatedWidth - cropWidth) / 2;
    const cropY = (rotatedHeight - cropHeight) / 2;
    const output = document.createElement("canvas");
    output.width = Math.max(1, Math.round(cropWidth));
    output.height = Math.max(1, Math.round(cropHeight));
    const context = output.getContext("2d");
    if (!context) throw new Error("Не удалось подготовить фото к отправке.");
    context.drawImage(rotatedCanvas, cropX, cropY, cropWidth, cropHeight, 0, 0, output.width, output.height);
    const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob>((resolve, reject) => {
      output.toBlob((value) => value ? resolve(value) : reject(new Error("Не удалось сохранить отредактированное фото.")), outputType, 0.92);
    });
    const extension = outputType === "image/png" ? "png" : "jpg";
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + "-edited." + extension, { type: outputType, lastModified: Date.now() });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

const reportReasons = ["spam", "harassment", "scam", "inappropriate", "other"] as const;

const LazyMessengerNavigation = lazy(async () => {
  const module = await import("./MessengerNavigation");
  return { default: module.MessengerNavigation };
});

const LazyMessengerSettings = lazy(async () => {
  const module = await import("./MessengerNavigation");
  return { default: module.MessengerSettings };
});

const LazyBotsHub = lazy(async () => {
  const module = await import("./BotsHub");
  return { default: module.default };
});

export default function MessengerApp({ client, user, profile, locale, onLocaleChange, roles, theme, onThemeChange }: Props) {
  const [inbox, setInbox] = useState<InboxConversation[]>([]);
  const [ownProfile, setOwnProfile] = useState(profile);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [systemView, setSystemView] = useState<SystemView | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageReactions, setMessageReactions] = useState<MessageReaction[]>([]);
  const [reactionsAvailable, setReactionsAvailable] = useState(false);
  const [reactionPickerFor, setReactionPickerFor] = useState<string | null>(null);
  const [reactingMessageIds, setReactingMessageIds] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [editTarget, setEditTarget] = useState<Message | null>(null);
  const [pinnedMessages, setPinnedMessages] = useState<Message[]>([]);
  const [showPinnedList, setShowPinnedList] = useState(false);
  const [pinningMessageIds, setPinningMessageIds] = useState<string[]>([]);
  const [onlineMap, setOnlineMap] = useState<Record<string, boolean>>({});
  const [lastSeenMap, setLastSeenMap] = useState<Record<string, string>>({});
  const [isTyping, setIsTyping] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [badgeMap, setBadgeMap] = useState<Record<string, BadgeType>>({});
  const [crownMap, setCrownMap] = useState<Record<string, boolean>>({});
  const [searching, setSearching] = useState(false);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [mediaSending, setMediaSending] = useState(false);
  const [photoDraft, setPhotoDraft] = useState<File | null>(null);
  const [photoCaption, setPhotoCaption] = useState("");
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoRotation, setPhotoRotation] = useState(0);
  const [photoAspect, setPhotoAspect] = useState<PhotoAspect>("original");
  const [videoDraft, setVideoDraft] = useState<File | null>(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState<string | null>(null);
  const [videoCaption, setVideoCaption] = useState("");
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoTrimStart, setVideoTrimStart] = useState(0);
  const [videoTrimEnd, setVideoTrimEnd] = useState(0);
  const [showAttachmentMenu, setShowAttachmentMenu] = useState(false);
  const [mediaViewer, setMediaViewer] = useState<MediaViewerState | null>(null);
  const [mediaViewerScale, setMediaViewerScale] = useState(1);
  const [mediaViewerLoadError, setMediaViewerLoadError] = useState(false);
  const [error, setError] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showBots, setShowBots] = useState(false);
  const [showNavigation, setShowNavigation] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [activeCommunityRoomId, setActiveCommunityRoomId] = useState<string | null>(null);
  const [communityCreateKind, setCommunityCreateKind] = useState<"group" | "channel" | null>(null);
  const [communityRooms, setCommunityRooms] = useState<CommunityRoomPreview[]>([]);
  const [communitySearchRooms, setCommunitySearchRooms] = useState<CommunityRoomPreview[]>([]);
  const [showComposeScreen, setShowComposeScreen] = useState(false);
  const [showContactsScreen, setShowContactsScreen] = useState(false);
  const [directoryTab, setDirectoryTab] = useState<"users" | "groups" | "channels">("users");
  const [directoryUsers, setDirectoryUsers] = useState<PublicProfile[]>([]);
  const [directoryUsersOffset, setDirectoryUsersOffset] = useState(0);
  const [directoryUsersHasMore, setDirectoryUsersHasMore] = useState(true);
  const [directoryUsersLoading, setDirectoryUsersLoading] = useState(false);
  const [directoryRooms, setDirectoryRooms] = useState<CommunityRoomPreview[]>([]);
  const [directoryRoomsLoading, setDirectoryRoomsLoading] = useState(false);
  const [directoryRoomsLoaded, setDirectoryRoomsLoaded] = useState(false);
  const [directoryError, setDirectoryError] = useState("");
  const [mobileTab, setMobileTab] = useState<"chats" | "contacts" | "settings" | "profile">("chats");
  const [showSavedMessages, setShowSavedMessages] = useState(false);
  const [savedMessages, setSavedMessages] = useState<SavedMessageRecord[]>(() => readSavedMessages(user.id));
  const [folderChatIds, setFolderChatIds] = useState<string[] | null>(null);
  const [folderManagerOpen, setFolderManagerOpen] = useState(false);
  const [viewedProfile, setViewedProfile] = useState<PublicProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileNotice, setProfileNotice] = useState("");
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileNameDraft, setProfileNameDraft] = useState("");
  const [profileUsernameDraft, setProfileUsernameDraft] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("account");
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState<(typeof reportReasons)[number]>("other");
  const [reportMessageTargetId, setReportMessageTargetId] = useState<string | null>(null);
  const [reportDetails, setReportDetails] = useState("");
  const [reportBusy, setReportBusy] = useState(false);
  const [chatFilter, setChatFilter] = useState<"all" | "personal">("all");
  const [showChatActions, setShowChatActions] = useState(false);
  const [messageSearchOpen, setMessageSearchOpen] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState("");
  const [messageSearchResults, setMessageSearchResults] = useState<Message[]>([]);
  const [messageSearchLoading, setMessageSearchLoading] = useState(false);
  const [messageSearchError, setMessageSearchError] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const composeSearchInputRef = useRef<HTMLInputElement>(null);
  const contactsSearchInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const typingChannelReadyRef = useRef(false);
  const typingTimeoutRef = useRef<number | null>(null);
  const remoteTypingTimeoutRef = useRef<number | null>(null);
  const lastTypingBroadcastRef = useRef(0);
  const isStaff = roles.some((role) => role === "owner" || role === "admin" || role === "moderator");
  const canManageBadges = roles.includes("owner") || roles.includes("admin");
  const handleFolderFilterChange = useCallback((ids: string[] | null) => setFolderChatIds(ids), []);

  useEffect(() => {
    if (!messageSearchOpen || !activeId) {
      setMessageSearchResults([]);
      setMessageSearchLoading(false);
      setMessageSearchError("");
      return;
    }

    const query = messageSearchQuery.trim();
    if (query.replace(/[%_,]/g, "").length < 2) {
      setMessageSearchResults([]);
      setMessageSearchLoading(false);
      setMessageSearchError("");
      return;
    }

    let active = true;
    setMessageSearchLoading(true);
    setMessageSearchError("");
    const timer = window.setTimeout(() => {
      void searchDirectMessages(activeId, query)
        .then((items) => { if (active) setMessageSearchResults(items); })
        .catch((cause: unknown) => {
          if (active) {
            setMessageSearchResults([]);
            setMessageSearchError(cause instanceof Error ? cause.message : (locale === "ru" ? "Не удалось выполнить поиск." : "Search failed."));
          }
        })
        .finally(() => { if (active) setMessageSearchLoading(false); });
    }, 220);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [messageSearchOpen, messageSearchQuery, activeId, locale]);

  useEffect(() => {
    if (!messageSearchOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMessageSearchOpen(false);
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [messageSearchOpen]);

  useEffect(() => {
    try {
      window.localStorage.setItem("heloro:saved-messages:" + user.id, JSON.stringify(savedMessages));
    } catch {
      // Keep the in-memory Saved Messages view usable when storage is full or unavailable.
    }
  }, [savedMessages, user.id]);

  // Modal layers are portalled to document.body, and the page behind them must not scroll.
  useEffect(() => {
    const hasModal = showProfile || Boolean(mediaViewer) || showAttachmentMenu || Boolean(photoDraft) || Boolean(videoDraft);
    if (!hasModal) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [showProfile, mediaViewer, showAttachmentMenu, photoDraft, videoDraft]);

  const activeConversation = useMemo(
    () => inbox.find((item) => item.conversation_id === activeId) ?? null,
    [inbox, activeId],
  );
  const presenceContactKey = useMemo(
    () => [...new Set(inbox.map((item) => item.other_user_id))].sort().join(","),
    [inbox],
  );

  useEffect(() => {
    let active = true;
    setReplyTarget(null);
    setPinnedMessages([]);
    setShowPinnedList(false);
    if (!activeId) return () => { active = false; };
    void getPinnedMessages(activeId)
      .then((items) => { if (active) setPinnedMessages(items); })
      .catch((cause) => {
        if (active && !(cause instanceof Error && /pinned_messages|does not exist/i.test(cause.message))) {
          console.warn("HELORO pinned messages are unavailable:", cause);
        }
      });
    return () => { active = false; };
  }, [activeId]);

  useEffect(() => {
    let active = true;
    let channels: RealtimeChannel[] = [];
    const peerIds = presenceContactKey.split(",").filter(Boolean);
    const targetIds = [...new Set([user.id, ...peerIds])];
    setOnlineMap(Object.fromEntries(peerIds.map((id) => [id, false])));

    const refreshLastSeen = async () => {
      if (peerIds.length === 0) {
        if (active) setLastSeenMap({});
        return;
      }
      try {
        const rows = await getVisibleLastSeen(peerIds);
        if (active) setLastSeenMap(Object.fromEntries(rows.map((row) => [row.user_id, row.last_seen_at])));
      } catch (cause) {
        console.warn("HELORO last-seen lookup failed:", cause);
      }
    };

    const touchActivity = () => {
      if (document.visibilityState !== "visible") return;
      void touchUserLastSeen().catch((cause) => console.warn("HELORO last-seen heartbeat failed:", cause));
      void refreshLastSeen();
    };

    void (async () => {
      try {
        await client.realtime.setAuth();
        const connected = await Promise.all(targetIds.map((targetId) =>
          subscribeToUserPresence(targetId, user.id, (online) => {
            if (!active || targetId === user.id) return;
            setOnlineMap((current) => ({ ...current, [targetId]: online }));
          }),
        ));
        if (!active) {
          await Promise.all(connected.map((channel) => client.removeChannel(channel)));
          return;
        }
        channels = connected;
      } catch (cause) {
        console.warn("HELORO contact presence is unavailable:", cause);
      }
    })();

    touchActivity();
    const heartbeat = window.setInterval(touchActivity, 30000);
    document.addEventListener("visibilitychange", touchActivity);
    window.addEventListener("focus", touchActivity);
    return () => {
      active = false;
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", touchActivity);
      window.removeEventListener("focus", touchActivity);
      channels.forEach((channel) => { void client.removeChannel(channel); });
    };
  }, [client, user.id, presenceContactKey]);

  const visibleInbox = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const base = chatFilter === "personal" ? inbox : inbox;
    if (!query) return base;
    return base.filter((item) =>
      (item.display_name || "").toLocaleLowerCase().includes(query) ||
      (item.username || "").toLocaleLowerCase().includes(query) ||
      (item.last_message || "").toLocaleLowerCase().includes(query),
    );
  }, [inbox, search, chatFilter]);

  const visibleCommunityRooms = useMemo(() => {
    const query = search.trim().toLocaleLowerCase().replace(/^@/, "");
    const source = chatFilter === "personal" ? [] : (showSearch ? [...communityRooms, ...communitySearchRooms] : communityRooms);
    const unique = new Map(source.map((item) => [item.id, item]));
    return [...unique.values()].filter((item) =>
      !query || item.name.toLocaleLowerCase().includes(query) ||
      item.username.toLocaleLowerCase().includes(query) ||
      item.description.toLocaleLowerCase().includes(query)
    );
  }, [communityRooms, communitySearchRooms, search, showSearch]);

  const visibleChatItems = useMemo<VisibleChatItem[]>(() => [
    ...visibleInbox.map((conversation) => ({
      kind: "direct" as const,
      sortAt: conversation.last_message_at || "1970-01-01T00:00:00.000Z",
      conversation,
    })),
    ...visibleCommunityRooms.map((room) => ({
      kind: "community" as const,
      sortAt: room.updated_at,
      room,
    })),
  ].sort((left, right) => Date.parse(right.sortAt) - Date.parse(left.sortAt)), [visibleInbox, visibleCommunityRooms]);

  const folderChoices = useMemo<FolderChoice[]>(() => [
    ...inbox.map((item) => ({
      id: item.conversation_id,
      label: item.display_name || item.username || (locale === "ru" ? "Личный чат" : "Direct chat"),
      subtitle: "@" + item.username,
    })),
    ...communityRooms.map((room) => ({
      id: room.id,
      label: room.name,
      subtitle: room.kind === "channel" ? (locale === "ru" ? "Канал" : "Channel") : (locale === "ru" ? "Группа" : "Group"),
    })),
  ], [inbox, communityRooms, locale]);

  const folderFilteredChatItems = useMemo(() => {
    if (!folderChatIds) return visibleChatItems;
    return visibleChatItems.filter((entry) => folderChatIds.includes(
      entry.kind === "direct" ? entry.conversation.conversation_id : entry.room.id,
    ));
  }, [visibleChatItems, folderChatIds]);

  async function refreshInbox(selectId?: string) {
    const updated = await getInbox();
    setInbox(updated);
    if (selectId) {
      setActiveId(selectId);
      setSystemView(null);
      setActiveCommunityRoomId(null);
      setCommunityCreateKind(null);
    } else if (activeId && !updated.some((item) => item.conversation_id === activeId)) {
      setActiveId(null);
    }
  }

  async function attachCommunityBadges(rows: CommunityRoomPreview[]) {
    if (rows.length === 0) return rows;
    const { data, error: badgeError } = await client.from("community_verification_badges")
      .select("room_id, badge_type").in("room_id", rows.map((item) => item.id));
    if (badgeError) throw badgeError;
    const badges = new Map((data ?? []).map((item) => [item.room_id as string, item.badge_type as "blue" | "gold" | "creator"]));
    return rows.map((item) => ({ ...item, badge_type: badges.get(item.id) ?? null }));
  }

  async function refreshCommunityRooms() {
    const { data: memberships, error: membershipError } = await client.from("community_room_members")
      .select("room_id").eq("user_id", user.id);
    if (membershipError) throw membershipError;
    const roomIds = (memberships ?? []).map((item) => item.room_id as string);
    if (roomIds.length === 0) {
      setCommunityRooms([]);
      return;
    }
    const { data, error: roomError } = await client.from("community_rooms")
      .select("id, kind, name, username, description, avatar_url, is_public, updated_at")
      .in("id", roomIds).order("updated_at", { ascending: false }).limit(100);
    if (roomError) throw roomError;
    setCommunityRooms(await attachCommunityBadges((data ?? []) as CommunityRoomPreview[]));
  }

  function openCommunity(roomId: string | null, createKind: "group" | "channel" | null = null) {
    setMobileTab("chats");
    setShowContactsScreen(false);
    setActiveId(null);
    setSystemView(null);
    setActiveCommunityRoomId(roomId);
    setCommunityCreateKind(createKind);
    setShowSearch(false);
    setSearch("");
    setResults([]);
    setShowComposeScreen(false);
    setShowContactsScreen(false);
  }

  function closeCommunity() {
    setActiveCommunityRoomId(null);
    setCommunityCreateKind(null);
    void refreshCommunityRooms().catch(() => undefined);
  }

  async function openChannelDiscussion(channelId: string) {
    setError("");
    try {
      const { data, error: joinError } = await client.rpc("join_channel_discussion", { p_channel_id: channelId });
      if (joinError) throw joinError;
      if (typeof data !== "string" || !data) throw new Error(locale === "ru" ? "Обсуждение канала не найдено." : "The channel discussion was not found.");
      openCommunity(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (locale === "ru" ? "Не удалось открыть обсуждение." : "Could not open the discussion."));
    }
  }

  async function openNewsDiscussion() {
    const { data: channel, error: channelError } = await client.from("heloro_channels")
      .select("id").eq("slug", "heloro-new").single();
    if (channelError || !channel) {
      setError(channelError?.message || (locale === "ru" ? "Канал News не найден." : "News channel was not found."));
      return;
    }
    const { data: discussionId, error: joinError } = await client.rpc("join_channel_discussion", { p_channel_id: channel.id });
    if (joinError || typeof discussionId !== "string" || !discussionId) {
      // Keep the existing discussion reachable until the additive database migration is applied.
      openSystemView("discussion");
      return;
    }
    openCommunity(discussionId);
  }

  useEffect(() => {
    let active = true;
    setLoadingInbox(true);
    getInbox()
      .then((items) => { if (active) setInbox(items); })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : t(locale, "inboxLoadFailed"));
      })
      .finally(() => { if (active) setLoadingInbox(false); });
    return () => { active = false; };
  }, [locale]);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      void refreshCommunityRooms().catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : (locale === "ru" ? "Не удалось загрузить группы и каналы." : "Could not load groups and channels."));
      });
    };
    refresh();
    const channel = client.channel("heloro:community-list:" + user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "community_rooms" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "community_room_members", filter: "user_id=eq." + user.id }, refresh)
      .subscribe();
    return () => { active = false; void client.removeChannel(channel); };
  }, [client, user.id, locale]);

  useEffect(() => {
    const rawSearch = search.trim();
    const handleQuery = rawSearch.startsWith("@")
      ? rawSearch.slice(1).toLocaleLowerCase().replace(/[^a-z0-9_]/g, "")
      : "";
    if (!showSearch || handleQuery.length < 2) {
      setCommunitySearchRooms([]);
      return;
    }
    let active = true;
    void client.from("community_rooms")
      .select("id, kind, name, username, description, avatar_url, is_public, updated_at")
      .eq("is_public", true)
      .ilike("username", `%${handleQuery}%`)
      .order("updated_at", { ascending: false })
      .limit(15)
      .then(({ data, error: searchError }) => {
        if (!active) return;
        if (searchError) {
          setCommunitySearchRooms([]);
          return;
        }
        void attachCommunityBadges((data ?? []) as CommunityRoomPreview[]).then(setCommunitySearchRooms).catch(() => setCommunitySearchRooms([]));
      });
    return () => { active = false; };
  }, [client, search, showSearch]);

  useEffect(() => {
    const ids = [...new Set([user.id, ...inbox.map((item) => item.other_user_id), ...results.map((item) => item.id), ...directoryUsers.map((item) => item.id), ...(viewedProfile ? [viewedProfile.id] : [])])];
    if (ids.length === 0) {
      setBadgeMap({});
      setCrownMap({});
      return;
    }
    let active = true;
    client.from("verification_badges")
      .select("user_id, badge_type")
      .in("user_id", ids)
      .then(({ data, error: badgeError }) => {
        if (!active) return;
        if (badgeError) {
          console.warn("HELORO badge lookup failed:", badgeError.message);
          return;
        }
        const next: Record<string, BadgeType> = {};
        for (const row of data ?? []) {
          if (row.badge_type === "blue" || row.badge_type === "gold" || row.badge_type === "creator" || row.badge_type === "epic_sans") {
            next[row.user_id] = row.badge_type;
          }
        }
        setBadgeMap(next);
      });
    void client.from("profile_gifts").select("user_id").eq("gift_type", "purple_crown").in("user_id", ids)
      .then(({ data, error: giftError }) => {
        if (!active) return;
        if (giftError) {
          console.warn("HELORO purple crown lookup failed:", giftError.message);
          return;
        }
        setCrownMap(Object.fromEntries((data ?? []).map((item) => [item.user_id as string, true])));
      });
    return () => { active = false; };
  }, [client, inbox, results, directoryUsers, viewedProfile?.id, user.id]);


  useEffect(() => {
    if (!activeId) {
      setMessages([]);
      return;
    }
    let active = true;
    setLoadingMessages(true);
    setError("");
    getMessages(activeId)
      .then((items) => { if (active) setMessages(items); })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : t(locale, "messagesLoadFailed"));
      })
      .finally(() => { if (active) setLoadingMessages(false); });

    const channel = subscribeToMessages(activeId,
      () => {
        void getMessages(activeId).then(setMessages).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t(locale, "messagesLoadFailed")));
        void refreshInbox();
      },
      () => {
        void getMessages(activeId).then(setMessages).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : t(locale, "messagesLoadFailed")));
        void refreshInbox();
      },
      (updated) => {
        setMessages((current) => current.map((item) => item.id === updated.id ? updated : item));
        void refreshInbox();
      },
    );
    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [activeId, client, locale]);

  useEffect(() => {
    if (!activeId) {
      setMessageReactions([]);
      setReactionsAvailable(false);
      setReactionPickerFor(null);
      return;
    }
    let active = true;
    const refreshReactions = () => {
      void getMessageReactions(activeId)
        .then((items) => {
          if (!active) return;
          setMessageReactions(items);
          setReactionsAvailable(true);
        })
        .catch((cause: unknown) => {
          if (!active) return;
          setMessageReactions([]);
          setReactionsAvailable(false);
          console.warn("HELORO message reactions are unavailable until the database migration is applied:", cause);
        });
    };
    refreshReactions();
    const channel = subscribeToMessageReactions(refreshReactions);
    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [activeId, client]);

  useEffect(() => {
    if (!activeId) {
      setIsTyping(false);
      return;
    }
    let active = true;
    let channel: RealtimeChannel | null = null;
    typingChannelReadyRef.current = false;
    void client.realtime.setAuth()
      .then(() => subscribeToConversationTyping(activeId, user.id, (typing) => {
        if (!active) return;
        setIsTyping(typing);
        if (remoteTypingTimeoutRef.current !== null) window.clearTimeout(remoteTypingTimeoutRef.current);
        if (typing) {
          remoteTypingTimeoutRef.current = window.setTimeout(() => setIsTyping(false), 2500);
        } else {
          remoteTypingTimeoutRef.current = null;
        }
      }, (ready) => { typingChannelReadyRef.current = ready; }))
      .then((connected) => {
        if (!active) {
          void client.removeChannel(connected);
          return;
        }
        channel = connected;
        typingChannelRef.current = connected;
      })
      .catch((cause: unknown) => console.warn("HELORO typing indicator is unavailable:", cause));
    return () => {
      active = false;
      typingChannelReadyRef.current = false;
      if (typingTimeoutRef.current !== null) window.clearTimeout(typingTimeoutRef.current);
      if (remoteTypingTimeoutRef.current !== null) window.clearTimeout(remoteTypingTimeoutRef.current);
      typingTimeoutRef.current = null;
      remoteTypingTimeoutRef.current = null;
      if (typingChannelRef.current === channel) typingChannelRef.current = null;
      if (channel) void client.removeChannel(channel);
      setIsTyping(false);
    };
  }, [activeId, client, user.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    if (!photoDraft) {
      setPhotoPreviewUrl(null);
      return;
    }
    const previewUrl = URL.createObjectURL(photoDraft);
    setPhotoPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [photoDraft]);

  useEffect(() => {
    if (!videoDraft) {
      setVideoPreviewUrl(null);
      return;
    }
    const previewUrl = URL.createObjectURL(videoDraft);
    setVideoPreviewUrl(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [videoDraft]);

  useEffect(() => {
    setPhotoDraft(null);
    setPhotoCaption("");
    setPhotoRotation(0);
    setPhotoAspect("original");
    setVideoDraft(null);
    setVideoCaption("");
    setVideoDuration(0);
    setVideoTrimStart(0);
    setVideoTrimEnd(0);
    setShowAttachmentMenu(false);
    if (photoInputRef.current) photoInputRef.current.value = "";
    if (videoInputRef.current) videoInputRef.current.value = "";
  }, [activeId]);

  useEffect(() => {
    const normalized = search.trim();
    if (normalized.replace(/^@/, "").length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    let active = true;
    setSearching(true);
    const timeout = window.setTimeout(() => {
      searchProfiles(normalized, user.id)
        .then((items) => { if (active) setResults(items); })
        .catch((cause: unknown) => {
          if (active) setError(cause instanceof Error ? cause.message : t(locale, "searchFailed"));
        })
        .finally(() => { if (active) setSearching(false); });
    }, 220);
    return () => { active = false; window.clearTimeout(timeout); };
  }, [search, user.id, locale]);

  useEffect(() => {
    if (!showSettings && !showBots && !showReport && !showNavigation && !showProfile && !showComposeScreen && !showContactsScreen && !mediaViewer) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (mediaViewer) {
          setMediaViewer(null);
          return;
        }
        setShowSettings(false);
        setShowBots(false);
        setShowNavigation(false);
        setShowReport(false);
        setShowProfile(false);
        setShowComposeScreen(false);
        setShowContactsScreen(false);
        setMobileTab("chats");
        setShowSearch(false);
        setSearch("");
        setResults([]);
        setShowAttachmentMenu(false);
        setMediaViewer(null);
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [showSettings, showBots, showNavigation, showReport, showProfile, showComposeScreen, showContactsScreen, showSavedMessages, mediaViewer]);

  useEffect(() => {
    if (showSearch && !showComposeScreen) searchInputRef.current?.focus();
  }, [showSearch, showComposeScreen]);

  useEffect(() => {
    if (showComposeScreen) composeSearchInputRef.current?.focus();
  }, [showComposeScreen]);

  useEffect(() => {
    if (showContactsScreen) contactsSearchInputRef.current?.focus();
  }, [showContactsScreen]);

  async function startConversation(target: PublicProfile) {
    setError("");
    try {
      const conversationId = await createDirectConversation(target.username);
      await refreshInbox(conversationId);
      setSearch("");
      setResults([]);
      setShowSearch(false);
      setShowComposeScreen(false);
      setShowContactsScreen(false);
      setMobileTab("chats");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t(locale, "conversationCreateFailed"));
    }
  }

  function handleDraftChange(value: string) {
    setDraft(value);
    const channel = typingChannelRef.current;
    if (!channel || !typingChannelReadyRef.current) return;
    if (!value.trim()) {
      sendTypingIndicator(channel, user.id, false);
      if (typingTimeoutRef.current !== null) window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
      return;
    }
    const now = Date.now();
    if (now - lastTypingBroadcastRef.current > 900) {
      sendTypingIndicator(channel, user.id, true);
      lastTypingBroadcastRef.current = now;
    }
    if (typingTimeoutRef.current !== null) window.clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => {
      sendTypingIndicator(channel, user.id, false);
      typingTimeoutRef.current = null;
    }, 2400);
  }

  async function jumpToMessage(messageId: string) {
    let element = messageRefs.current[messageId] ?? document.getElementById("message-" + messageId);
    if (!element && activeId) {
      try {
        const original = await getDirectMessageById(activeId, messageId);
        if (original) {
          setMessages((current) => current.some((item) => item.id === original.id) ? current : [...current, original].sort((left, right) => left.created_at.localeCompare(right.created_at)));
          window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
            const loaded = messageRefs.current[messageId] ?? document.getElementById("message-" + messageId);
            loaded?.scrollIntoView({ behavior: "smooth", block: "center" });
            loaded?.classList.add("message-jump-highlight");
            window.setTimeout(() => loaded?.classList.remove("message-jump-highlight"), 1200);
          }));
        }
      } catch (cause) { console.warn("HELORO could not load the original message:", cause); }
      return;
    }
    element?.scrollIntoView({ behavior: "smooth", block: "center" });
    element?.classList.add("message-jump-highlight");
    window.setTimeout(() => element?.classList.remove("message-jump-highlight"), 1200);
  }

  async function changeMessageReaction(messageId: string, emoji: MessageReactionEmoji) {
    const conversationId = activeId;
    if (!conversationId || reactingMessageIds.includes(messageId)) return;
    setReactingMessageIds((current) => current.includes(messageId) ? current : [...current, messageId]);
    setError("");
    try {
      await toggleMessageReaction(conversationId, messageId, user.id, emoji);
      const refreshed = await getMessageReactions(conversationId);
      setMessageReactions(refreshed);
      setReactionPickerFor(null);
    } catch (cause) {
      console.warn("HELORO could not update a message reaction:", cause);
      setError(t(locale, "messageReactionError"));
    } finally {
      setReactingMessageIds((current) => current.filter((id) => id !== messageId));
    }
  }

  async function togglePinnedMessage(message: Message) {
    const conversationId = activeId;
    if (!conversationId || pinningMessageIds.includes(message.id)) return;
    const currentlyPinned = pinnedMessages.some((item) => item.id === message.id);
    setPinningMessageIds((current) => current.includes(message.id) ? current : [...current, message.id]);
    setError("");
    try {
      await setDirectMessagePinned(conversationId, message.id, user.id, !currentlyPinned);
      setPinnedMessages((current) => currentlyPinned
        ? current.filter((item) => item.id !== message.id)
        : [message, ...current.filter((item) => item.id !== message.id)]);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "";
      setError(locale === "ru"
        ? `Не удалось ${currentlyPinned ? "открепить" : "закрепить"} сообщение.${detail ? ` ${detail}` : ""}`
        : `Could not ${currentlyPinned ? "unpin" : "pin"} the message.${detail ? ` ${detail}` : ""}`);
    } finally {
      setPinningMessageIds((current) => current.filter((id) => id !== message.id));
    }
  }

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (typingChannelRef.current && typingChannelReadyRef.current) sendTypingIndicator(typingChannelRef.current, user.id, false);
    if (typingTimeoutRef.current !== null) window.clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = null;
    if (!activeId) return;
    const currentDraft = draft.trim();
    if (editTarget) {
      if (!currentDraft && editTarget.media?.kind !== "photo" && editTarget.media?.kind !== "video") return;
      setSending(true);
      setError("");
      try {
        const body = editTarget.media?.path
          ? "HELORO_MEDIA:" + JSON.stringify({
              kind: editTarget.media.kind,
              path: editTarget.media.path,
              ...(["photo", "video"].includes(editTarget.media.kind) ? { caption: currentDraft } : {}),
              ...(editTarget.media.kind === "video" ? { trimStart: editTarget.media.trimStart ?? 0, trimEnd: editTarget.media.trimEnd ?? 0 } : {}),
            })
          : currentDraft;
        const editedAt = new Date().toISOString();
        const { data, error: updateError } = await client.from("messages")
          .update({ body, edited_at: editedAt })
          .eq("id", editTarget.id).eq("conversation_id", activeId)
          .select("id, conversation_id, sender_id, body, created_at, reply_to, edited_at")
          .maybeSingle();
        if (updateError) throw updateError;
        if (!data) throw new Error(locale === "ru" ? "Сообщение не найдено или редактирование запрещено." : "Message not found or editing is not allowed.");
        const updated: Message = { ...editTarget, body: currentDraft, edited_at: editedAt };
        setMessages((current) => current.map((item) => item.id === updated.id ? updated : item));
        setPinnedMessages((current) => current.map((item) => item.id === updated.id ? updated : item));
        setEditTarget(null);
        setDraft("");
        await refreshInbox();
      } catch (cause) {
        const detail = cause instanceof Error ? cause.message : "";
        setDraft(currentDraft);
        setError(/edited_at|permission|row-level security|not allowed|schema cache/i.test(detail)
          ? (locale === "ru" ? "Редактирование личных сообщений появится после обновления базы HELORO." : "Direct-message editing requires the HELORO database migration.")
          : (detail || t(locale, "messageSendFailed")));
      } finally { setSending(false); }
      return;
    }
    const parsed = messageBodySchema.safeParse(draft);
    if (!parsed.success) return;
    setSending(true);
    setError("");
    const currentMessage = parsed.data;
    setDraft("");
    try {
      const selectedReply = replyTarget;
      const saved = await sendMessage(activeId, user.id, currentMessage, selectedReply?.id ?? null);
      const withReply: Message = {
        ...saved,
        reply: selectedReply ? { id: selectedReply.id, sender_id: selectedReply.sender_id, body: selectedReply.body || (selectedReply.media ? "Медиафайл" : ""), created_at: selectedReply.created_at } : null,
      };
      setMessages((current) => current.some((item) => item.id === saved.id) ? current : [...current, withReply]);
      setReplyTarget(null);
      await refreshInbox();
    } catch (cause) {
      setDraft(currentMessage);
      setError(cause instanceof Error ? cause.message : t(locale, "messageSendFailed"));
    } finally {
      setSending(false);
    }
  }

  function openPhotoViewer(url: string | null | undefined, caption?: string) {
    if (!url) return;
    setMediaViewerLoadError(false);
    setMediaViewer({ kind: "photo", url, caption });
    setMediaViewerScale(1);
  }

  async function openUserProfile(userId: string) {
    if (userId === user.id) setMobileTab("profile");
    setShowProfile(true);
    setProfileEditing(false);
    setViewedProfile(null);
    setProfileLoading(true);
    setProfileError("");
    setProfileNotice("");
    try {
      const target = await getPublicProfile(userId);
      if (!target) throw new Error("Profile not found.");
      setViewedProfile(target);
      if (userId === user.id) {
        setProfileNameDraft(target.display_name);
        setProfileUsernameDraft(target.username);
      }
    } catch {
      setProfileError(t(locale, "profileLoadError"));
    } finally {
      setProfileLoading(false);
    }
  }

  async function copyProfileUsername(profile: PublicProfile) {
    const value = "@" + profile.username;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else {
        const field = document.createElement("textarea");
        field.value = value;
        field.setAttribute("readonly", "");
        field.style.position = "fixed";
        field.style.opacity = "0";
        document.body.appendChild(field);
        field.select();
        const copied = document.execCommand("copy");
        field.remove();
        if (!copied) throw new Error("Clipboard access is unavailable.");
      }
      setProfileNotice(locale === "ru" ? value + " скопирован" : value + " copied");
      setProfileError("");
    } catch {
      setProfileError(locale === "ru" ? "Не удалось скопировать имя пользователя." : "Could not copy the username.");
    }
  }


  async function saveOwnProfile() {
    if (!viewedProfile || viewedProfile.id !== user.id) return;
    const parsedName = displayNameSchema.safeParse(profileNameDraft);
    const parsedUsername = usernameSchema.safeParse(profileUsernameDraft.trim().replace(/^@/, ""));
    if (!parsedName.success || !parsedUsername.success) {
      setProfileError(locale === "ru"
        ? (!parsedName.success ? "Имя должно быть не длиннее 48 символов." : "Username: 3–24 символа, только a–z, 0–9 и _.")
        : (!parsedName.success ? "Display name must be 48 characters or fewer." : "Username: 3–24 characters, using a–z, 0–9 and _ only."));
      return;
    }
    setProfileSaving(true);
    setProfileError("");
    try {
      const updated = await saveProfile(user.id, {
        display_name: parsedName.data,
        username: parsedUsername.data,
      });
      setOwnProfile(updated);
      setViewedProfile((current) => current ? {
        ...current, display_name: updated.display_name, username: updated.username ?? "",
      } : current);
      setProfileNameDraft(updated.display_name);
      setProfileUsernameDraft(updated.username ?? "");
      setProfileEditing(false);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setProfileError(/duplicate|unique|already exists|23505/i.test(message)
        ? (locale === "ru" ? "Этот @username уже занят." : "That @username is already taken.")
        : (message || t(locale, "profileLoadError")));
    } finally {
      setProfileSaving(false);
    }
  }

  async function handleAvatarSelect(file?: File) {
    if (!file) return;
    setAvatarBusy(true);
    setProfileError("");
    try {
      const updated = await uploadAvatar(user.id, file);
      setOwnProfile(updated);
      setViewedProfile((current) => current?.id === updated.id ? { ...current, avatar_url: updated.avatar_url } : current);
      setInbox((current) => current.map((item) => item.other_user_id === updated.id ? { ...item, avatar_url: updated.avatar_url } : item));
    } catch {
      setProfileError(t(locale, "profilePhotoError"));
    } finally {
      setAvatarBusy(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  async function removeProfileBadge() {
    if (!viewedProfile || !canManageBadges || !viewedProfile.badge_type) return;
    if (!window.confirm(t(locale, "profileBadgeRemoveConfirm"))) return;
    setProfileBusy(true);
    setProfileError("");
    try {
      await setVerificationBadge(client, viewedProfile.id, user.id, null);
      setViewedProfile((current) => current ? { ...current, badge_type: null } : current);
      setBadgeMap((current) => {
        const next = { ...current };
        delete next[viewedProfile.id];
        return next;
      });
    } catch {
      setProfileError(t(locale, "profileBadgeRemoveError"));
    } finally {
      setProfileBusy(false);
    }
  }

  async function removeDirectMessage(message: Message) {
    if (!window.confirm(t(locale, "messageDeleteConfirm"))) return;
    setError("");
    try {
      await deleteDirectMessage(message, user.id);
      setMessages((current) => current.filter((item) => item.id !== message.id));
      await refreshInbox();
    } catch {
      setError(t(locale, "messageDeleteError"));
    }
  }

  function handlePhotoSelect(file?: File) {
    if (!file || !activeId) return;
    setError("");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setError(locale === "ru" ? "Поддерживаются фото PNG, JPEG и WebP." : "PNG, JPEG and WebP photos are supported.");
      if (photoInputRef.current) photoInputRef.current.value = "";
      return;
    }
    if (file.size < 1 || file.size > 5 * 1024 * 1024) {
      setError(locale === "ru" ? "Сейчас сервер принимает фото до 5 МБ." : "The current server accepts photos up to 5 MB.");
      if (photoInputRef.current) photoInputRef.current.value = "";
      return;
    }
    setVideoDraft(null);
    setPhotoDraft(file);
    setPhotoCaption("");
    setPhotoRotation(0);
    setPhotoAspect("original");
    setShowAttachmentMenu(false);
  }

  function handleVideoSelect(file?: File) {
    if (!file || !activeId) return;
    setError("");
    if (!["video/mp4", "video/webm"].includes(file.type)) {
      setError(locale === "ru" ? "Пока поддерживаются MP4 и WebM." : "MP4 and WebM videos are supported.");
      if (videoInputRef.current) videoInputRef.current.value = "";
      return;
    }
    if (file.size < 1 || file.size > 5 * 1024 * 1024) {
      setError(locale === "ru" ? "Лимит текущего хранилища HELORO — 5 МБ на видео." : "The current HELORO storage limit is 5 MB per video.");
      if (videoInputRef.current) videoInputRef.current.value = "";
      return;
    }
    setPhotoDraft(null);
    setVideoDraft(file);
    setVideoCaption("");
    setVideoDuration(0);
    setVideoTrimStart(0);
    setVideoTrimEnd(0);
    setShowAttachmentMenu(false);
  }

  function clearPhotoDraft() {
    setPhotoDraft(null);
    setPhotoCaption("");
    setPhotoRotation(0);
    setPhotoAspect("original");
    if (photoInputRef.current) photoInputRef.current.value = "";
  }

  function clearVideoDraft() {
    setVideoDraft(null);
    setVideoCaption("");
    setVideoDuration(0);
    setVideoTrimStart(0);
    setVideoTrimEnd(0);
    if (videoInputRef.current) videoInputRef.current.value = "";
  }

  async function handleSendPhoto() {
    const conversationId = activeId;
    const file = photoDraft;
    if (!conversationId || !file || mediaSending) return;
    setMediaSending(true);
    setError("");
    try {
      const editedFile = await transformPhotoFile(file, photoRotation, photoAspect);
      await sendMediaMessage(conversationId, user.id, editedFile, "photo", photoCaption);
      setMessages(await getMessages(conversationId));
      await refreshInbox();
      clearPhotoDraft();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t(locale, "messageSendFailed"));
    } finally {
      setMediaSending(false);
    }
  }

  async function handleSendVideo() {
    const conversationId = activeId;
    const file = videoDraft;
    if (!conversationId || !file || mediaSending) return;
    setMediaSending(true);
    setError("");
    try {
      await sendMediaMessage(conversationId, user.id, file, "video", videoCaption, videoTrimStart, videoTrimEnd);
      setMessages(await getMessages(conversationId));
      await refreshInbox();
      clearVideoDraft();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t(locale, "messageSendFailed"));
    } finally {
      setMediaSending(false);
    }
  }

  async function handleMediaSelect(kind: "sticker" | "gif", file?: File) {
    if (!file || !activeId) return;
    setMediaSending(true);
    setError("");
    try {
      await sendMediaMessage(activeId, user.id, file, kind);
      setMessages(await getMessages(activeId));
      await refreshInbox();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t(locale, "messageSendFailed"));
    } finally {
      setMediaSending(false);
    }
  }

  async function handleBuiltInMediaSelect(kind: "sticker" | "gif", emoji: string, motion: "pop" | "float" | "pulse" | "spin") {
    if (!activeId || mediaSending) return;
    setMediaSending(true);
    setError("");
    try {
      await sendBuiltInMediaMessage(activeId, user.id, kind, emoji, motion);
      setMessages(await getMessages(activeId));
      await refreshInbox();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t(locale, "messageSendFailed"));
    } finally {
      setMediaSending(false);
    }
  }

  async function submitReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeConversation) return;
    setReportBusy(true);
    setError("");
    try {
      if (reportMessageTargetId) {
        await submitContentReport(client, "message", reportMessageTargetId, reportReason, reportDetails);
      } else {
        await submitUserReport(client, user.id, activeConversation.other_user_id, reportReason, reportDetails);
      }
      setShowReport(false);
      setReportMessageTargetId(null);
      setReportDetails("");
      setReportReason("other");
      setError(locale === "ru" ? "Жалоба отправлена модераторам." : "Your report was sent to the moderation team.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (locale === "ru" ? "Не удалось отправить жалобу." : "Could not send the report."));
    } finally {
      setReportBusy(false);
    }
  }

  async function signOut() {
    const { error: signOutError } = await client.auth.signOut();
    if (signOutError) setError(signOutError.message);
    else setShowSettings(false);
  }

  async function loadDirectoryUsers(reset = false) {
    if (directoryUsersLoading) return;
    const offset = reset ? 0 : directoryUsersOffset;
    setDirectoryUsersLoading(true);
    setDirectoryError("");
    try {
      const page = await listPublicProfiles(user.id, offset, 50);
      setDirectoryUsers((current) => reset
        ? page
        : [...current, ...page.filter((person) => !current.some((existing) => existing.id === person.id))]);
      setDirectoryUsersOffset(offset + page.length);
      setDirectoryUsersHasMore(page.length === 50);
    } catch (cause) {
      setDirectoryError(cause instanceof Error ? cause.message : (locale === "ru" ? "Не удалось загрузить пользователей." : "Could not load users."));
    } finally {
      setDirectoryUsersLoading(false);
    }
  }

  async function loadDirectoryRooms() {
    if (directoryRoomsLoading || directoryRoomsLoaded) return;
    setDirectoryRoomsLoading(true);
    setDirectoryError("");
    const columns = "id, kind, name, username, description, avatar_url, is_public, updated_at";
    try {
      const [publicResult, membershipsResult] = await Promise.all([
        client.from("community_rooms").select(columns).eq("is_public", true)
          .order("updated_at", { ascending: false }).range(0, 999),
        client.from("community_room_members").select("room_id").eq("user_id", user.id),
      ]);
      if (publicResult.error) throw publicResult.error;
      if (membershipsResult.error) throw membershipsResult.error;

      const joinedIds = [...new Set((membershipsResult.data ?? []).map((item) => item.room_id as string))];
      let joinedRooms: CommunityRoomPreview[] = [];
      if (joinedIds.length > 0) {
        const { data, error: joinedError } = await client.from("community_rooms")
          .select(columns).in("id", joinedIds);
        if (joinedError) throw joinedError;
        joinedRooms = (data ?? []) as CommunityRoomPreview[];
      }

      const uniqueRooms = new Map<string, CommunityRoomPreview>();
      for (const room of [...(publicResult.data ?? []), ...joinedRooms] as CommunityRoomPreview[]) {
        uniqueRooms.set(room.id, room);
      }
      const hydratedRooms = await attachCommunityBadges([...uniqueRooms.values()]);
      setDirectoryRooms(hydratedRooms.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)));
      setDirectoryRoomsLoaded(true);
    } catch (cause) {
      setDirectoryError(cause instanceof Error ? cause.message : (locale === "ru" ? "Не удалось загрузить группы и каналы." : "Could not load groups and channels."));
    } finally {
      setDirectoryRoomsLoading(false);
    }
  }

  function openContactsScreen() {
    setActiveId(null);
    setActiveCommunityRoomId(null);
    setCommunityCreateKind(null);
    setSystemView(null);
    setShowSearch(false);
    setShowComposeScreen(false);
    setShowContactsScreen(true);
    setMobileTab("contacts");
    setDirectoryTab("users");
    setDirectoryUsers([]);
    setDirectoryUsersOffset(0);
    setDirectoryUsersHasMore(true);
    setDirectoryRooms([]);
    setDirectoryRoomsLoaded(false);
    setDirectoryError("");
    setSearch("");
    setResults([]);
    setError("");
    void loadDirectoryUsers(true);
  }

  function closeContactsScreen() {
    setShowContactsScreen(false);
    setMobileTab("chats");
    setShowSearch(false);
    setSearch("");
    setResults([]);
  }

  function openMobileTab(tab: "chats" | "contacts" | "settings" | "profile") {
    setMobileTab(tab);
    setShowSettings(false);
    setShowProfile(false);
    setShowSavedMessages(false);
    setShowBots(false);
    setFolderManagerOpen(false);
    if (tab === "chats") {
      setShowContactsScreen(false);
      closeConversation();
      return;
    }
    if (tab === "contacts") {
      openContactsScreen();
      return;
    }
    setShowContactsScreen(false);
    closeConversation();
    if (tab === "settings") openSettings("account");
    else void openUserProfile(user.id);
    setMobileTab(tab);
  }

  function openNewMessageScreen() {
    setShowSavedMessages(false);
    setActiveId(null);
    setActiveCommunityRoomId(null);
    setCommunityCreateKind(null);
    setSystemView(null);
    setShowSearch(true);
    setShowComposeScreen(true);
    setShowContactsScreen(false);
    setMobileTab("chats");
    setSearch("");
    setResults([]);
    setError("");
  }

  function closeNewMessageScreen() {
    setShowComposeScreen(false);
    setShowContactsScreen(false);
    setShowSearch(false);
    setSearch("");
    setResults([]);
  }

  function openSearch() {
    setMessageSearchQuery("");
    setMessageSearchResults([]);
    setMessageSearchError("");
    setMessageSearchOpen((current) => !current);
  }

  function openSystemView(view: SystemView) {
    setShowSavedMessages(false);
    setMobileTab("chats");
    setShowContactsScreen(false);
    setShowComposeScreen(false);
    setActiveId(null);
    setActiveCommunityRoomId(null);
    setCommunityCreateKind(null);
    setSystemView(view);
    setMessageSearchOpen(false);
    setMessageSearchQuery("");
    setShowSearch(false);
    setSearch("");
    setResults([]);
    setError("");
  }

  function closeConversation() {
    setShowSavedMessages(false);
    setMobileTab("chats");
    setShowContactsScreen(false);
    setShowComposeScreen(false);
    setActiveId(null);
    setActiveCommunityRoomId(null);
    setCommunityCreateKind(null);
    setSystemView(null);
    setShowSearch(false);
    setShowChatActions(false);
    setMessageSearchOpen(false);
    setMessageSearchQuery("");
    setSearch("");
  }

  function openSettings(section: SettingsSection = "account") {
    setShowSavedMessages(false);
    setSettingsSection(section);
    setShowBots(false);
    setShowSettings(true);
  }

  function openBots() {
    setShowSavedMessages(false);
    setShowSettings(false);
    setShowNavigation(false);
    setShowComposeScreen(false);
    setShowContactsScreen(false);
    setShowProfile(false);
    setMobileTab("chats");
    setShowBots(true);
  }

  function closeBots() {
    setShowBots(false);
    setMobileTab("chats");
  }

  function openSavedMessages() {
    setShowNavigation(false);
    setShowSettings(false);
    setShowProfile(false);
    setShowBots(false);
    setShowContactsScreen(false);
    setShowComposeScreen(false);
    setShowSearch(false);
    setActiveId(null);
    setActiveCommunityRoomId(null);
    setCommunityCreateKind(null);
    setSystemView(null);
    setMobileTab("chats");
    setShowSavedMessages(true);
  }

  function openFolderManager() {
    setShowNavigation(false);
    setShowSettings(false);
    setShowProfile(false);
    setShowSavedMessages(false);
    setShowBots(false);
    setShowComposeScreen(false);
    setShowContactsScreen(false);
    closeConversation();
    setFolderManagerOpen(true);
  }

  function toggleSavedMessage(message: Message) {
    const id = message.conversation_id + ":" + message.id;
    setSavedMessages((current) => {
      if (current.some((item) => item.id === id)) return current.filter((item) => item.id !== id);
      const record: SavedMessageRecord = {
        id,
        conversationId: message.conversation_id,
        sourceTitle: activeConversation?.display_name || activeConversation?.username || (locale === "ru" ? "Личный чат" : "Direct chat"),
        savedAt: new Date().toISOString(),
        message: { ...message, media: message.media ? { ...message.media } : message.media },
      };
      return [...current, record].slice(-300);
    });
  }

  function openSavedConversation(record: SavedMessageRecord) {
    setShowSavedMessages(false);
    setShowContactsScreen(false);
    setShowComposeScreen(false);
    setSystemView(null);
    setActiveCommunityRoomId(null);
    setCommunityCreateKind(null);
    setActiveId(record.conversationId);
    setMobileTab("chats");
  }

  return (
    <main className={`messenger-stage ${activeConversation || systemView || activeCommunityRoomId || communityCreateKind || showSavedMessages ? "chat-selected" : ""}`}>
      <div className="messenger-shell">
        <aside className="inbox-panel">
          <header className="inbox-topbar">
            <button
              className="icon-button menu-button"
              title={locale === "ru" ? "Меню" : "Menu"}
              aria-label={locale === "ru" ? "Открыть меню" : "Open menu"}
              onClick={() => setShowNavigation(true)}
            >
              <Menu size={21} className="desktop-menu-icon" />
              <MoreVertical size={21} className="mobile-menu-icon" />
            </button>
            <div className="brand-lockup"><div className="brand-symbol">H</div><span>HELORO</span></div>
            <button
              className="icon-button compose-button"
              title={t(locale, "inboxStartConversation")}
              aria-label={t(locale, "inboxStartConversation")}
              onClick={openNewMessageScreen}
              aria-expanded={showComposeScreen}
            >
              <PencilLine size={19} />
            </button>
          </header>

          <div className="inbox-search-area">
            <label className="telegram-search">
              <Search size={18} />
              <input
                ref={searchInputRef}
                value={search}
                onChange={(event) => { setSearch(event.target.value); setShowSearch(true); }}
                onFocus={() => { setSystemView(null); setActiveId(null); setShowSearch(true); }}
                placeholder={locale === "ru" ? "Поиск" : "Search"}
                aria-label={locale === "ru" ? "Поиск пользователей и чатов" : "Search people and chats"}
              />
              {search && (
                <button className="clear-search" type="button" onClick={() => { setSearch(""); setResults([]); }} aria-label={t(locale, "inboxClear")}>
                  <X size={15} />
                </button>
              )}
            </label>
          </div>

          <div className="chat-filter-tabs" role="tablist" aria-label={t(locale, "inboxTitle")}>
            <button type="button" role="tab" aria-selected={chatFilter === "all"} className={chatFilter === "all" ? "active" : ""} onClick={() => setChatFilter("all")}>
              {t(locale, "chatAll")}
            </button>
            <button type="button" role="tab" aria-selected={chatFilter === "personal"} className={chatFilter === "personal" ? "active" : ""} onClick={() => setChatFilter("personal")}>
              {t(locale, "chatPersonal")}
            </button>
          </div>
          <ChatFoldersBar
            userId={user.id}
            locale={locale}
            choices={folderChoices}
            managerOpen={folderManagerOpen}
            onManagerClose={() => setFolderManagerOpen(false)}
            onActiveFolderChange={handleFolderFilterChange}
          />

          <section className="conversation-list">
            {showSearch && search.trim().length > 1 ? (
              <>
                {visibleCommunityRooms.length > 0 && (
                  <>
                    <div className="section-label">{locale === "ru" ? "Группы и каналы" : "Groups and channels"}</div>
                    {visibleCommunityRooms.map((room) => (
                      <button className="person-result community-search-result" type="button" key={room.id} onClick={() => openCommunity(room.id)}>
                        <div className="community-inbox-avatar">{room.avatar_url ? <img src={room.avatar_url} alt="" /> : room.kind === "channel" ? <Megaphone size={18} /> : <Users size={18} />}</div>
                        <span><strong>{room.name}<VerificationMark type={room.badge_type ?? null} title={locale === "ru" ? "Сообщество подтверждено HELORO" : "Community verified by HELORO"} /></strong><small>@{room.username} · {room.kind === "channel" ? (locale === "ru" ? "Канал" : "Channel") : (locale === "ru" ? "Группа" : "Group")}</small></span>
                      </button>
                    ))}
                  </>
                )}
                <div className="section-label">{locale === "ru" ? "Люди" : "People"}</div>
                {searching ? (
                  <p className="muted small-copy">{t(locale, "inboxSearching")}</p>
                ) : results.length === 0 ? (
                  <p className="muted small-copy">{t(locale, "inboxNoResults")}</p>
                ) : results.map((person) => (
                  <button className="person-result" key={person.id} onClick={() => void startConversation(person)}>
                    <Avatar label={person.display_name || person.username} src={person.avatar_url} crown={Boolean(crownMap[person.id])} />
                    <span><strong>{person.display_name || person.username}<VerificationMark type={person.badge_type} title={locale === "ru" ? "Аккаунт подтверждён HELORO" : "Verified by HELORO"} /></strong><small>@{person.username}<PurpleCrownNameMark active={Boolean(crownMap[person.id])} /></small></span>
                    <MessageCircle size={17} />
                  </button>
                ))}
                <button className="cancel-search" onClick={() => { setShowSearch(false); setSearch(""); setResults([]); }}>
                  {t(locale, "inboxBack")}
                </button>
              </>
            ) : (
              <>
                {chatFilter === "all" && (
                  <div className="pinned-system-list">
                    <button className={`conversation-item pinned-system-item ${systemView === "news" || systemView === "discussion" ? "selected" : ""}`} onClick={() => openSystemView("news")}>
                      <OfficialAvatar client={client} kind="news" label="News" className="system-news-avatar" fallback={<Megaphone size={19} />} />
                      <span className="conversation-copy">
                        <span className="conversation-title-line"><strong>News <BadgeCheck size={14} className="system-verified-mark" style={{ color: "#229ED9", background: "transparent", boxShadow: "none" }} /></strong><time>{locale === "ru" ? "Канал" : "Channel"}</time></span>
                        <span className="conversation-preview-line"><small>{locale === "ru" ? "Новости и обновления" : "News and updates"}</small></span>
                      </span>
                    </button>
                    <button className={`conversation-item pinned-system-item ${systemView === "support" ? "selected" : ""}`} onClick={() => openSystemView("support")}>
                      <OfficialAvatar client={client} kind="support" label="Support Heloro" className="system-support-avatar" fallback={<Headphones size={19} />} />
                      <span className="conversation-copy">
                        <span className="conversation-title-line"><strong>Support Heloro <BadgeCheck size={14} className="support-verified-mark" aria-label={locale === "ru" ? "Официальная поддержка" : "Official support"} /></strong><time>{locale === "ru" ? "Поддержка" : "Support"}</time></span>
                        <span className="conversation-preview-line"><small>{locale === "ru" ? "Личный чат с поддержкой" : "Private support chat"}</small></span>
                      </span>
                    </button>
                    {isStaff && (
                      <button className={`conversation-item pinned-system-item ${systemView === "admin" ? "selected" : ""}`} onClick={() => openSystemView("admin")}>
                        <div className="system-avatar system-admin-icon"><ShieldCheck size={19} /></div>
                        <span className="conversation-copy">
                          <span className="conversation-title-line"><strong>HELORO S</strong><time>Staff</time></span>
                          <span className="conversation-preview-line"><small>{locale === "ru" ? "Модерация и управление" : "Moderation and admin"}</small></span>
                        </span>
                      </button>
                    )}
                  </div>
                )}
                {loadingInbox ? (
                  <div className="list-placeholder"><span /><span /><span /><span /></div>
                ) : folderFilteredChatItems.length === 0 ? (
                  <div className="inbox-empty">
                    <div className="inbox-empty-icon"><MessageCircle size={21} /></div>
                    <strong>{t(locale, "inboxEmptyTitle")}</strong>
                    <p>{t(locale, "inboxEmptyDescription")}</p>
                    <button onClick={openSearch}>{t(locale, "inboxFindSomeone")}</button>
                  </div>
                ) : folderFilteredChatItems.map((entry) => entry.kind === "community" ? (
                  <button
                    className={`conversation-item community-inbox-item ${activeCommunityRoomId === entry.room.id ? "selected" : ""}`}
                    type="button"
                    key={`community-${entry.room.id}`}
                    onClick={() => openCommunity(entry.room.id)}
                  >
                    <div className="community-inbox-avatar">
                      {entry.room.avatar_url ? <img src={entry.room.avatar_url} alt="" /> : entry.room.kind === "channel" ? <Megaphone size={18} /> : <Users size={18} />}
                    </div>
                    <span className="conversation-copy">
                      <span className="conversation-title-line">
                        <strong>{entry.room.name}<VerificationMark type={entry.room.badge_type ?? null} title={locale === "ru" ? "Сообщество подтверждено HELORO" : "Community verified by HELORO"} /></strong>
                        <time>{entry.room.kind === "channel" ? (locale === "ru" ? "Канал" : "Channel") : (locale === "ru" ? "Группа" : "Group")}</time>
                      </span>
                      <span className="conversation-preview-line"><small>@{entry.room.username}{entry.room.description ? ` · ${entry.room.description}` : ""}</small></span>
                    </span>
                  </button>
                ) : (() => {
                  const item = entry.conversation;
                  const label = item.display_name || item.username;
                  return (
                    <button
                      className={`conversation-item ${activeId === item.conversation_id ? "selected" : ""}`}
                      key={item.conversation_id}
                      onClick={() => { setActiveCommunityRoomId(null); setCommunityCreateKind(null); setActiveId(item.conversation_id); setSystemView(null); setShowSearch(false); }}
                    >
                      <Avatar label={label} className={onlineMap[item.other_user_id] ? "presence-online-avatar" : ""} src={item.avatar_url} crown={Boolean(crownMap[item.other_user_id])} />
                      <span className="conversation-copy">
                        <span className="conversation-title-line">
                          <strong>{label}<PurpleCrownNameMark active={Boolean(crownMap[item.other_user_id])} /><VerificationMark type={badgeMap[item.other_user_id]} title={locale === "ru" ? "Аккаунт подтверждён HELORO" : "Verified by HELORO"} /></strong>
                          <time>{formatInboxTime(item.last_message_at)}</time>
                        </span>
                        <span className="conversation-preview-line">
                          <small>{formatInboxMessagePreview(item.last_message, locale)}</small>
                          {item.last_message && <CheckCheck className="preview-check" size={15} />}
                        </span>
                      </span>
                    </button>
                  );
                })())}
              </>
            )}
          </section>

          <footer className="inbox-profile">
            <button className="inbox-own-profile" type="button" onClick={() => void openUserProfile(user.id)} aria-label={t(locale, "profileViewTitle")}>
              <Avatar label={ownProfile.display_name} className="profile-avatar" src={ownProfile.avatar_url} crown={Boolean(crownMap[user.id])} />
              <span className="profile-summary"><strong>{ownProfile.display_name}</strong><small>@{ownProfile.username}<PurpleCrownNameMark active={Boolean(crownMap[user.id])} /></small></span>
            </button>
            {roles.includes("owner") && <span className="owner-mini-mark" title={t(locale, "ownerRole")}><ShieldCheck size={15} /></span>}
            <button className="icon-button profile-menu-button" title={t(locale, "settings")} aria-label={t(locale, "settings")} onClick={() => openSettings("account")}><Settings2 size={18} /></button>
          </footer>
          <div className="inbox-create-wrap">
            <button
              className="inbox-create-fab"
              type="button"
              title={locale === "ru" ? "Новое сообщение" : "New message"}
              aria-label={locale === "ru" ? "Новое сообщение" : "New message"}
              onClick={openNewMessageScreen}
            >
              <PencilLine size={22} />
            </button>
          </div>
          {showContactsScreen && (
            <section className="new-message-screen contacts-screen" aria-label={locale === "ru" ? "Контакты" : "Contacts"}>
              <header className="new-message-header">
                <button className="new-message-back" type="button" onClick={closeContactsScreen} aria-label={t(locale, "inboxBack")}>
                  <ArrowLeft size={21} />
                </button>
                <h2>{locale === "ru" ? "Контакты" : "Contacts"}</h2>
              </header>
              <div className="contacts-directory-tabs" role="tablist" aria-label={locale === "ru" ? "Каталог HELORO" : "HELORO directory"}>
                <button type="button" role="tab" aria-selected={directoryTab === "users"} className={directoryTab === "users" ? "active" : ""} onClick={() => setDirectoryTab("users")}>
                  <Users size={16} />{locale === "ru" ? "Люди" : "People"}
                </button>
                <button type="button" role="tab" aria-selected={directoryTab === "groups"} className={directoryTab === "groups" ? "active" : ""} onClick={() => { setDirectoryTab("groups"); void loadDirectoryRooms(); }}>
                  <Users size={16} />{locale === "ru" ? "Группы" : "Groups"}
                </button>
                <button type="button" role="tab" aria-selected={directoryTab === "channels"} className={directoryTab === "channels" ? "active" : ""} onClick={() => { setDirectoryTab("channels"); void loadDirectoryRooms(); }}>
                  <Megaphone size={16} />{locale === "ru" ? "Каналы" : "Channels"}
                </button>
              </div>
              {directoryTab === "users" ? (
                <div className="new-message-people contacts-directory-list" role="tabpanel">
                  <div className="new-message-section-title">{locale === "ru" ? "Все пользователи" : "All users"}</div>
                  {directoryError && <p className="contacts-directory-error" role="alert">{directoryError}</p>}
                  {directoryUsers.length === 0 && directoryUsersLoading ? (
                    <p className="new-message-empty">{t(locale, "appLoading")}</p>
                  ) : directoryUsers.length === 0 ? (
                    <div className="new-message-empty"><UserRound size={25} /><strong>{locale === "ru" ? "Пока нет пользователей" : "No users yet"}</strong></div>
                  ) : directoryUsers.map((person) => (
                    <button className="new-message-person" type="button" key={person.id} onClick={() => void startConversation(person)}>
                      <Avatar label={person.display_name || person.username} src={person.avatar_url} crown={Boolean(crownMap[person.id])} />
                      <span className="new-message-person-copy">
                        <strong>{person.display_name || person.username}<VerificationMark type={person.badge_type} title={locale === "ru" ? "Аккаунт подтверждён HELORO" : "Verified by HELORO"} /></strong>
                        <small>@{person.username}<PurpleCrownNameMark active={Boolean(crownMap[person.id])} /></small>
                      </span>
                      <MessageCircle size={18} />
                    </button>
                  ))}
                  {directoryUsersLoading && directoryUsers.length > 0 && <p className="contacts-directory-loading">{locale === "ru" ? "Загрузка…" : "Loading…"}</p>}
                  {directoryUsersHasMore && !directoryUsersLoading && directoryUsers.length > 0 && (
                    <button className="contacts-directory-more" type="button" onClick={() => void loadDirectoryUsers()}>
                      {locale === "ru" ? "Показать ещё пользователей" : "Load more users"}
                    </button>
                  )}
                </div>
              ) : (
                <div className="new-message-people contacts-directory-list" role="tabpanel">
                  <div className="new-message-section-title">{directoryTab === "groups" ? (locale === "ru" ? "Все доступные группы" : "All available groups") : (locale === "ru" ? "Все доступные каналы" : "All available channels")}</div>
                  {directoryError && <p className="contacts-directory-error" role="alert">{directoryError}</p>}
                  {directoryRoomsLoading && directoryRooms.length === 0 ? (
                    <p className="new-message-empty">{t(locale, "appLoading")}</p>
                  ) : directoryRooms.filter((room) => room.kind === (directoryTab === "groups" ? "group" : "channel")).length === 0 ? (
                    <div className="new-message-empty">
                      {directoryTab === "groups" ? <Users size={25} /> : <Megaphone size={25} />}
                      <strong>{directoryTab === "groups" ? (locale === "ru" ? "Групп пока нет" : "No groups yet") : (locale === "ru" ? "Каналов пока нет" : "No channels yet")}</strong>
                      <p>{locale === "ru" ? "Здесь появятся публичные сообщества и ваши закрытые группы." : "Public communities and your private groups will appear here."}</p>
                    </div>
                  ) : directoryRooms.filter((room) => room.kind === (directoryTab === "groups" ? "group" : "channel")).map((room) => (
                    <button className="new-message-person" type="button" key={room.id} onClick={() => openCommunity(room.id)}>
                      <Avatar label={room.name} src={room.avatar_url} />
                      <span className="new-message-person-copy">
                        <strong>{room.name}<VerificationMark type={room.badge_type ?? null} title={locale === "ru" ? "Сообщество подтверждено HELORO" : "Community verified by HELORO"} /></strong>
                        <small>{room.username ? "@" + room.username : (room.kind === "group" ? (locale === "ru" ? "Группа" : "Group") : (locale === "ru" ? "Канал" : "Channel"))}</small>
                      </span>
                      {room.kind === "channel" ? <Megaphone size={18} /> : <Users size={18} />}
                    </button>
                  ))}
                  {directoryRoomsLoading && directoryRooms.length > 0 && <p className="contacts-directory-loading">{locale === "ru" ? "Загрузка…" : "Loading…"}</p>}
                </div>
              )}
            </section>
          )}

          {showComposeScreen && (
            <section className="new-message-screen" aria-label={locale === "ru" ? "Новое сообщение" : "New message"}>
              <header className="new-message-header">
                <button className="new-message-back" type="button" onClick={closeNewMessageScreen} aria-label={t(locale, "inboxBack")}>
                  <ArrowLeft size={21} />
                </button>
                <h2>{locale === "ru" ? "Новое сообщение" : "New message"}</h2>
              </header>

              <div className="new-message-search-area">
                <label className="new-message-search">
                  <Search size={18} />
                  <input
                    ref={composeSearchInputRef}
                    value={search}
                    onChange={(event) => { setSearch(event.target.value); setShowSearch(true); }}
                    placeholder={locale === "ru" ? "Поиск по имени или @username" : "Search by name or @username"}
                    aria-label={locale === "ru" ? "Поиск контактов" : "Search contacts"}
                  />
                  {search && (
                    <button type="button" className="new-message-clear" onClick={() => { setSearch(""); setResults([]); }} aria-label={t(locale, "inboxClear")}>
                      <X size={16} />
                    </button>
                  )}
                </label>
              </div>

              <div className="new-message-actions">
                <button type="button" onClick={() => openCommunity(null, "group")}>
                  <Users size={21} />
                  <span>{locale === "ru" ? "Новая группа" : "New group"}</span>
                </button>
                <button type="button" onClick={() => openCommunity(null, "channel")}>
                  <Megaphone size={21} />
                  <span>{locale === "ru" ? "Новый канал" : "New channel"}</span>
                </button>
              </div>

              <div className="new-message-people">
                {search.trim().replace(/^@/, "").length >= 2 ? (
                  <>
                    <div className="new-message-section-title">{locale === "ru" ? "Результаты поиска" : "Search results"}</div>
                    {searching ? (
                      <p className="new-message-empty">{t(locale, "inboxSearching")}</p>
                    ) : results.length === 0 ? (
                      <p className="new-message-empty">{t(locale, "inboxNoResults")}</p>
                    ) : results.map((person) => (
                      <button className="new-message-person" type="button" key={person.id} onClick={() => void startConversation(person)}>
                        <Avatar label={person.display_name || person.username} src={person.avatar_url} crown={Boolean(crownMap[person.id])} />
                        <span className="new-message-person-copy">
                          <strong>{person.display_name || person.username}<VerificationMark type={person.badge_type} title={locale === "ru" ? "Аккаунт подтверждён HELORO" : "Verified by HELORO"} /></strong>
                          <small>@{person.username}<PurpleCrownNameMark active={Boolean(crownMap[person.id])} /></small>
                        </span>
                        <MessageCircle size={18} />
                      </button>
                    ))}
                  </>
                ) : (
                  <>
                    <div className="new-message-section-title">{locale === "ru" ? "Недавние собеседники" : "Recent chats"}</div>
                    {inbox.length === 0 ? (
                      <div className="new-message-empty">
                        <UserRound size={25} />
                        <strong>{locale === "ru" ? "Пока нет контактов" : "No contacts yet"}</strong>
                        <p>{locale === "ru" ? "Найди человека через поиск по имени или @username." : "Find someone by name or @username."}</p>
                      </div>
                    ) : [...new Map(inbox.map((item) => [item.other_user_id, item])).values()].map((item) => (
                      <button
                        className="new-message-person"
                        type="button"
                        key={item.other_user_id}
                        onClick={() => void startConversation({
                          id: item.other_user_id,
                          username: item.username,
                          display_name: item.display_name,
                          avatar_url: item.avatar_url,
                          badge_type: badgeMap[item.other_user_id] ?? null,
                        })}
                      >
                        <Avatar label={item.display_name || item.username} src={item.avatar_url} crown={Boolean(crownMap[item.other_user_id])} />
                        <span className="new-message-person-copy">
                          <strong>{item.display_name || item.username}<VerificationMark type={badgeMap[item.other_user_id]} title={locale === "ru" ? "Аккаунт подтверждён HELORO" : "Verified by HELORO"} /></strong>
                          <small>@{item.username}<PurpleCrownNameMark active={Boolean(crownMap[item.other_user_id])} /></small>
                        </span>
                        {item.last_message_at && (
                          <time title={locale === "ru" ? "Время последнего сообщения в чате" : "Time of the latest chat message"}>
                            {formatInboxTime(item.last_message_at)}
                          </time>
                        )}
                      </button>
                    ))}
                  </>
                )}
              </div>
            </section>
          )}
        </aside>

        <section className="conversation-panel">
          {showSavedMessages ? (
            <div className="saved-messages-screen">
              <header className="saved-messages-header">
                <button type="button" onClick={closeConversation} aria-label={locale === "ru" ? "Назад к чатам" : "Back to chats"}><ArrowLeft size={20} /></button>
                <span><strong>{locale === "ru" ? "Избранное" : "Saved Messages"}</strong><small>{locale === "ru" ? "Сохранённые сообщения" : "Your saved messages"}</small></span>
              </header>
              <div className="saved-message-list">
                {savedMessages.length === 0 ? (
                  <div className="saved-message-empty">
                    <div className="saved-message-empty-icon"><Bookmark size={28} /></div>
                    <strong>{locale === "ru" ? "Здесь пока пусто" : "Nothing saved yet"}</strong>
                    <p>{locale === "ru" ? "Нажми значок закладки под сообщением, чтобы сохранить его здесь." : "Tap the bookmark icon on a message to keep it here."}</p>
                  </div>
                ) : [...savedMessages].reverse().map((record) => (
                  <article className="saved-message-item" key={record.id}>
                    <div className="saved-message-item-copy">
                      <span className="saved-message-source">{record.sourceTitle}</span>
                      {record.message.media?.kind === "photo" && record.message.media.url && <img className="saved-message-media" src={record.message.media.url} alt={locale === "ru" ? "Сохранённое фото" : "Saved photo"} loading="lazy" />}
                      {record.message.media?.kind === "video" && <span className="saved-message-source">{locale === "ru" ? "Видеосообщение" : "Video message"}</span>}
                      {record.message.media?.kind === "sticker" && <span className="saved-message-body">{record.message.media.emoji || (locale === "ru" ? "Стикер" : "Sticker")}</span>}
                      {record.message.media?.kind === "gif" && <span className="saved-message-body">{record.message.media.emoji || "GIF"}</span>}
                      {record.message.body && <p className="saved-message-body">{record.message.body}</p>}
                      <small className="saved-message-meta">{new Date(record.savedAt).toLocaleString(locale === "ru" ? "ru-RU" : "en-US")}</small>
                    </div>
                    <div className="saved-message-actions">
                      <button type="button" onClick={() => openSavedConversation(record)} aria-label={locale === "ru" ? "Открыть исходный чат" : "Open source chat"} title={locale === "ru" ? "Открыть чат" : "Open chat"}><MessageCircle size={15} /></button>
                      <button type="button" className="saved-message-remove" onClick={() => setSavedMessages((current) => current.filter((item) => item.id !== record.id))} aria-label={locale === "ru" ? "Удалить из избранного" : "Remove from Saved Messages"} title={locale === "ru" ? "Удалить" : "Remove"}><Trash2 size={15} /></button>
                    </div>
                  </article>
                ))}
                <p className="saved-message-disclaimer">{locale === "ru" ? "Избранное хранится локально на этом устройстве и не синхронизируется между устройствами." : "Saved Messages are stored on this device and are not synced across devices."}</p>
              </div>
            </div>
          ) : systemView ? (
            <div className="system-screen">
              <button className="system-mobile-back" onClick={closeConversation} aria-label={t(locale, "inboxBack")}><ArrowLeft size={19} /></button>
              <OfficialPanels
                view={systemView}
                client={client}
                user={user}
                locale={locale}
                roles={roles}
                onOpenDiscussion={() => void openNewsDiscussion()}
                onOpenNews={() => openSystemView("news")}
              />
            </div>
          ) : (activeCommunityRoomId || communityCreateKind) ? (
            <CommunityHub
              key={`${activeCommunityRoomId ?? "new"}-${communityCreateKind ?? ""}`}
              client={client}
              user={user}
              locale={locale}
              roles={roles}
              onOpenDiscussionRoom={(channelId) => void openChannelDiscussion(channelId)}
              contacts={inbox.map((item) => ({
                id: item.other_user_id,
                username: item.username,
                display_name: item.display_name,
                avatar_url: item.avatar_url,
                badge_type: badgeMap[item.other_user_id] ?? null,
              }))}
              initialRoomId={activeCommunityRoomId}
              initialCreateKind={communityCreateKind}
              onRoomsChanged={() => { void refreshCommunityRooms().catch(() => undefined); }}
              onClose={closeCommunity}
            />
          ) : activeConversation ? (
            <>
              <header className="chat-header">
                <button className="icon-button mobile-back" aria-label={t(locale, "inboxBack")} onClick={closeConversation}>
                  <ArrowLeft size={20} />
                </button>
                <button type="button" className="chat-profile-trigger" onClick={() => void openUserProfile(activeConversation.other_user_id)} aria-label={t(locale, "profileViewTitle")}>
                  <Avatar label={activeConversation.display_name || activeConversation.username} className={"chat-header-avatar " + (onlineMap[activeConversation.other_user_id] ? "presence-online-avatar" : "")} src={activeConversation.avatar_url} crown={Boolean(crownMap[activeConversation.other_user_id])} />
                  <span className="chat-person">
                    <strong><span className="chat-display-name">{activeConversation.display_name || activeConversation.username}</span><PurpleCrownNameMark active={Boolean(crownMap[activeConversation.other_user_id])} /><VerificationMark type={badgeMap[activeConversation.other_user_id]} title={locale === "ru" ? "Аккаунт подтверждён HELORO" : "Verified by HELORO"} /></strong>
                    <small aria-live="polite" className={"chat-presence-status " + (onlineMap[activeConversation.other_user_id] ? "is-online " : "") + (isTyping ? "is-typing" : "")}>{isTyping ? (locale === "ru" ? "печатает…" : "typing…") : onlineMap[activeConversation.other_user_id] ? (locale === "ru" ? "в сети" : "online") : formatLastSeen(lastSeenMap[activeConversation.other_user_id] ?? null, locale, !lastSeenMap[activeConversation.other_user_id])}</small>
                  </span>
                </button>
                <div className="chat-header-actions">
                  <button className="icon-button" aria-label={t(locale, "chatSearch")} title={t(locale, "chatSearch")} onClick={() => openSearch()}>
                    <Search size={20} />
                  </button>
                  <button className="icon-button" type="button" disabled title={locale === "ru" ? "Голосовые звонки пока не подключены" : "Voice calls are not enabled yet"} aria-label={locale === "ru" ? "Голосовые звонки недоступны" : "Voice calls unavailable"}>
                    <Phone size={19} />
                  </button>
                  <button className="icon-button" type="button" disabled title={locale === "ru" ? "Видеозвонки пока не подключены" : "Video calls are not enabled yet"} aria-label={locale === "ru" ? "Видеозвонки недоступны" : "Video calls unavailable"}>
                    <Video size={19} />
                  </button>
                  <div
                    className="chat-menu-wrap"
                    onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        setShowChatActions(false);
                      }
                    }}
                  >
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={locale === "ru" ? "Действия с чатом" : "Chat actions"}
                      title={locale === "ru" ? "Действия с чатом" : "Chat actions"}
                      aria-haspopup="menu"
                      aria-expanded={showChatActions}
                      onClick={() => setShowChatActions((current) => !current)}
                    >
                      <MoreVertical size={20} />
                    </button>
                    {showChatActions && (
                      <div className="chat-action-menu" role="menu">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setShowChatActions(false);
                            void openUserProfile(activeConversation.other_user_id);
                          }}
                        >
                          <UserRound size={16} />
                          {locale === "ru" ? "Открыть профиль" : "Open profile"}
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setShowChatActions(false);
                            setReportMessageTargetId(null);
                            setShowReport(true);
                          }}
                        >
                          <Flag size={16} />
                          {locale === "ru" ? "Пожаловаться" : "Report"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </header>
                {messageSearchOpen && (
                  <section className="chat-message-search-panel" aria-label={locale === "ru" ? "Поиск по переписке" : "Search in conversation"}>
                    <div className="chat-message-search-input-row">
                      <Search size={17} aria-hidden="true" />
                      <input
                        autoFocus
                        type="search"
                        value={messageSearchQuery}
                        onChange={(event) => setMessageSearchQuery(event.target.value)}
                        placeholder={locale === "ru" ? "Найти сообщение в чате" : "Find a message in this chat"}
                        aria-label={locale === "ru" ? "Поиск сообщений" : "Search messages"}
                      />
                      {messageSearchQuery && (
                        <button type="button" onClick={() => setMessageSearchQuery("")} aria-label={locale === "ru" ? "Очистить поиск" : "Clear search"}>
                          <X size={16} />
                        </button>
                      )}
                      <button type="button" onClick={() => setMessageSearchOpen(false)} aria-label={locale === "ru" ? "Закрыть поиск" : "Close search"}>
                        <X size={18} />
                      </button>
                    </div>
                    <div className="chat-message-search-status" aria-live="polite">
                      {messageSearchLoading
                        ? (locale === "ru" ? "Поиск…" : "Searching…")
                        : messageSearchError
                          ? messageSearchError
                          : messageSearchQuery.trim().length < 2
                            ? (locale === "ru" ? "Введите минимум 2 символа" : "Enter at least 2 characters")
                            : messageSearchResults.length === 0
                              ? (locale === "ru" ? "Ничего не найдено" : "No messages found")
                              : (locale === "ru" ? `Найдено: ${messageSearchResults.length}` : `Found: ${messageSearchResults.length}`)}
                    </div>
                    {messageSearchResults.length > 0 && (
                      <div className="chat-message-search-results">
                        {messageSearchResults.map((result) => (
                          <button
                            type="button"
                            className="chat-message-search-result"
                            key={result.id}
                            onClick={() => {
                              setMessageSearchOpen(false);
                              void jumpToMessage(result.id);
                            }}
                          >
                            <span className="chat-message-search-result-copy">
                              <strong>{result.sender_id === user.id ? (locale === "ru" ? "Вы" : "You") : activeConversation.display_name}</strong>
                              <span>{result.body || result.media?.emoji || (locale === "ru" ? "Медиафайл" : "Media")}</span>
                            </span>
                            <time>{formatMessageTime(result.created_at)}</time>
                          </button>
                        ))}
                      </div>
                    )}
                  </section>
                )}
                {pinnedMessages.length > 0 && (
                  <div className="pinned-messages-panel">
                    <div className="pinned-message-head">
                      <span className="pinned-message-symbol" aria-hidden="true"><Pin size={18} /></span>
                      <button
                        type="button"
                        className="pinned-message-main"
                        onClick={() => void jumpToMessage(pinnedMessages[0].id)}
                        title={locale === "ru" ? "Перейти к закреплённому сообщению" : "Jump to pinned message"}
                      >
                        <small>{locale === "ru" ? "ЗАКРЕПЛЁННОЕ СООБЩЕНИЕ" : "PINNED MESSAGE"}</small>
                        <strong>{pinnedMessages[0].body || (pinnedMessages[0].media ? (locale === "ru" ? "Медиафайл" : "Media") : (locale === "ru" ? "Сообщение" : "Message"))}</strong>
                      </button>
                      <button
                        type="button"
                        className="pinned-messages-toggle"
                        onClick={() => setShowPinnedList((value) => !value)}
                        aria-expanded={showPinnedList}
                        aria-label={locale === "ru" ? "Показать все закреплённые сообщения" : "Show all pinned messages"}
                        title={locale === "ru" ? "Все закреплённые сообщения" : "All pinned messages"}
                      >
                        <span>{pinnedMessages.length}</span>
                        <ChevronDown size={17} className={showPinnedList ? "is-expanded" : ""} />
                      </button>
                    </div>
                    {showPinnedList && (
                      <div className="pinned-messages-list">
                        {pinnedMessages.map((item) => (
                          <div className="pinned-message-item" key={item.id}>
                            <button
                              type="button"
                              className="pinned-messages-open"
                              onClick={() => { void jumpToMessage(item.id); setShowPinnedList(false); }}
                            >
                              <span>{item.sender_id === user.id ? (locale === "ru" ? "Вы" : "You") : (locale === "ru" ? "Собеседник" : "Contact")} · {formatMessageTime(item.created_at)}</span>
                              <strong>{item.body || (item.media ? (locale === "ru" ? "Медиафайл" : "Media") : (locale === "ru" ? "Сообщение" : "Message"))}</strong>
                            </button>
                            <button
                              type="button"
                              className="pinned-messages-remove"
                              disabled={pinningMessageIds.includes(item.id)}
                              onClick={() => void togglePinnedMessage(item)}
                              aria-label={locale === "ru" ? "Открепить сообщение" : "Unpin message"}
                              title={locale === "ru" ? "Открепить" : "Unpin"}
                            >
                              <PinOff size={16} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              <div className="message-stream">
                {loadingMessages ? (
                  <div className="message-loading">{t(locale, "chatLoading")}</div>
                ) : messages.length === 0 ? (
                  <div className="first-message">
                    <div className="first-message-icon"><MessageCircle size={20} /></div>
                    <strong>{t(locale, "chatFirstMessageTitle")}</strong>
                    <p>{t(locale, "chatFirstMessageDescription")}</p>
                  </div>
                ) : messages.map((message, index) => {
                  const mine = message.sender_id === user.id;
                  const previous = messages[index - 1];
                  const showDay = !previous || new Date(previous.created_at).toDateString() !== new Date(message.created_at).toDateString();
                  const reactionSummary = summarizeMessageReactions(
                    messageReactions.filter((reaction) => reaction.message_id === message.id),
                    user.id,
                  );
                  return (
                    <Fragment key={message.id}>
                      {showDay && <div className="chat-date-pill">{formatMessageDayLabel(message.created_at, locale)}</div>}
                      <div
                        id={"message-" + message.id}
                        ref={(element) => { messageRefs.current[message.id] = element; }}
                        className={"message-row " + (mine ? "mine" : "theirs")}
                      >
                      <div className="message-bubble">
                        {message.reply && (
                          <button type="button" className="message-reply-quote" onClick={() => void jumpToMessage(message.reply!.id)}>
                            <span>{message.reply.sender_id === user.id ? (locale === "ru" ? "Вы ответили себе" : "You replied to yourself") : (locale === "ru" ? "Ответ на сообщение" : "Reply to message")}</span>
                            <strong>{message.reply.body || (locale === "ru" ? "Медиафайл" : "Media")}</strong>
                          </button>
                        )}
                        {message.media?.kind === "video" && message.media.url ? (
                          <>
                            <video
                              className="message-media message-video"
                              src={message.media.url}
                              controls
                              playsInline
                              preload="metadata"
                              onLoadedMetadata={(event) => {
                                const startAt = message.media?.trimStart ?? 0;
                                if (startAt > 0) event.currentTarget.currentTime = startAt;
                              }}
                              onTimeUpdate={(event) => {
                                const endAt = message.media?.trimEnd ?? 0;
                                if (endAt > 0 && event.currentTarget.currentTime >= endAt) {
                                  event.currentTarget.pause();
                                  event.currentTarget.currentTime = endAt;
                                }
                              }}
                            />
                            {message.body && <p className="message-media-caption">{message.body}</p>}
                          </>
                        ) : message.media?.url ? (
                          <>
                            {message.media.kind === "photo" ? (
                              <button
                                type="button"
                                className="message-media-open"
                                onClick={(event) => { event.preventDefault(); event.stopPropagation(); openPhotoViewer(message.media?.url, message.body); }}
                                onPointerUp={(event) => { if (event.pointerType === "touch") { event.preventDefault(); event.stopPropagation(); openPhotoViewer(message.media?.url, message.body); } }}
                                aria-label={locale === "ru" ? "Открыть фото на весь экран" : "Open photo fullscreen"}
                                title={locale === "ru" ? "Открыть фото" : "Open photo"}
                              >
                                <img className="message-media message-photo" src={message.media.url} alt={locale === "ru" ? "Фото" : "Photo"} loading="lazy" />
                                <span>{locale === "ru" ? "Открыть фото" : "Open photo"}</span>
                              </button>
                            ) : (
                              <img
                                className={message.media.kind === "gif" ? "message-media message-gif" : "message-media message-sticker"}
                                src={message.media.url}
                                alt={message.media.kind === "gif" ? "GIF" : (locale === "ru" ? "Стикер" : "Sticker")}
                                loading="lazy"
                              />
                            )}
                            {message.media.kind === "photo" && message.body && <p className="message-media-caption">{message.body}</p>}
                          </>
                        ) : message.media?.emoji ? (
                          <div className={"message-built-in-media " + message.media.kind + " motion-" + (message.media.animation ?? "pop")} role="img" aria-label={message.media.kind === "gif" ? "GIF" : (locale === "ru" ? "Стикер" : "Sticker")}>
                            {message.media.emoji}
                          </div>
                        ) : message.body ? <p>{message.body}</p> : null}
                        <div className="message-meta">
                          <span>{formatMessageTime(message.created_at)} {mine && <CheckCheck size={13} />} {message.edited_at && <small className="message-edited-label">{locale === "ru" ? "изменено" : "edited"}</small>}</span>
                          <button type="button" className="message-action-button" onClick={() => { setEditTarget(null); setReplyTarget(message); }} aria-label={locale === "ru" ? "Ответить" : "Reply"} title={locale === "ru" ? "Ответить" : "Reply"}><MessageSquareReply size={13} /></button>
                          {mine && (!message.media || message.media.kind === "photo" || message.media.kind === "video") && <button type="button" className="message-action-button" onClick={() => { setReplyTarget(null); setEditTarget(message); setDraft(message.body); setPhotoDraft(null); setPhotoCaption(""); }} aria-label={locale === "ru" ? "Редактировать" : "Edit"} title={locale === "ru" ? "Редактировать" : "Edit"}><PencilLine size={13} /></button>}
                          <button
                            type="button"
                            className={"message-action-button " + (savedMessages.some((item) => item.id === message.conversation_id + ":" + message.id) ? "is-saved" : "")}
                            onClick={() => toggleSavedMessage(message)}
                            aria-label={savedMessages.some((item) => item.id === message.conversation_id + ":" + message.id) ? (locale === "ru" ? "Убрать из избранного" : "Remove from Saved Messages") : (locale === "ru" ? "Сохранить в избранное" : "Save to Saved Messages")}
                            title={savedMessages.some((item) => item.id === message.conversation_id + ":" + message.id) ? (locale === "ru" ? "В избранном" : "Saved") : (locale === "ru" ? "Сохранить" : "Save")}
                          >
                            {savedMessages.some((item) => item.id === message.conversation_id + ":" + message.id) ? <BookmarkCheck size={15} /> : <Bookmark size={15} />}
                          </button>
                          <button
                            type="button"
                            className={"message-action-button " + (pinnedMessages.some((item) => item.id === message.id) ? "is-pinned" : "")}
                            disabled={pinningMessageIds.includes(message.id)}
                            aria-busy={pinningMessageIds.includes(message.id)}
                            onClick={() => void togglePinnedMessage(message)}
                            aria-label={pinnedMessages.some((item) => item.id === message.id) ? (locale === "ru" ? "Открепить" : "Unpin") : (locale === "ru" ? "Закрепить" : "Pin")}
                            title={pinnedMessages.some((item) => item.id === message.id) ? (locale === "ru" ? "Открепить" : "Unpin") : (locale === "ru" ? "Закрепить" : "Pin")}
                          >
                            {pinnedMessages.some((item) => item.id === message.id) ? <PinOff size={16} /> : <Pin size={16} />}
                          </button>
                          <button type="button" className="message-delete-button" onClick={() => void removeDirectMessage(message)} aria-label={t(locale, "messageDelete")} title={t(locale, "messageDelete")}><Trash2 size={13} /></button>
                          {!mine && <button type="button" className="message-delete-button" onClick={() => { setReportMessageTargetId(message.id); setReportReason("other"); setReportDetails(""); setShowReport(true); }} aria-label={locale === "ru" ? "Пожаловаться на сообщение" : "Report message"} title={locale === "ru" ? "Пожаловаться на сообщение" : "Report message"}><Flag size={13} /></button>}
                        </div>
                        {reactionsAvailable && (
                          <div className="message-reactions">
                            {reactionSummary.map((reaction) => (
                              <button key={reaction.emoji} type="button"
                                className={"message-reaction-chip" + (reaction.selectedByMe ? " is-selected" : "")}
                                aria-pressed={reaction.selectedByMe}
                                aria-label={reaction.emoji + ", " + reaction.count}
                                disabled={reactingMessageIds.includes(message.id)}
                                onClick={() => void changeMessageReaction(message.id, reaction.emoji)}>
                                <span>{reaction.emoji}</span><small>{reaction.count}</small>
                              </button>
                            ))}
                            <div className="message-reaction-picker-wrap">
                              <button type="button" className="message-reaction-add"
                                aria-label={t(locale, "messageAddReaction")}
                                aria-expanded={reactionPickerFor === message.id}
                                title={t(locale, "messageAddReaction")}
                                disabled={reactingMessageIds.includes(message.id)}
                                onClick={() => setReactionPickerFor((current) => current === message.id ? null : message.id)}>
                                <SmilePlus size={14} />
                              </button>
                              {reactionPickerFor === message.id && (
                                <div className="message-reaction-picker" role="group" aria-label={t(locale, "messageChooseReaction")}>
                                  {MESSAGE_REACTION_EMOJIS.map((emoji) => (
                                    <button key={emoji} type="button" aria-label={emoji}
                                      disabled={reactingMessageIds.includes(message.id)}
                                      onClick={() => void changeMessageReaction(message.id, emoji)}>{emoji}</button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    </Fragment>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
              {error && <div className="inline-error" role="alert">{error}<button onClick={() => setError("")} aria-label={t(locale, "dismiss")}><X size={14} /></button></div>}
              {replyTarget && (
                <div className="reply-composer-preview">
                  <MessageSquareReply size={16} />
                  <span><strong>{locale === "ru" ? "Ответ на сообщение" : "Replying to message"}</strong><small>{replyTarget.body || (replyTarget.media ? (locale === "ru" ? "Медиафайл" : "Media") : (locale === "ru" ? "Сообщение" : "Message"))}</small></span>
                  <button type="button" onClick={() => setReplyTarget(null)} aria-label={locale === "ru" ? "Отменить ответ" : "Cancel reply"}><X size={16} /></button>
                </div>
              )}
              {editTarget && (
                <div className="reply-composer-preview edit-composer-preview">
                  <PencilLine size={16} />
                  <span><strong>{locale === "ru" ? "Редактирование сообщения" : "Editing message"}</strong><small>{editTarget.body || (locale === "ru" ? "Фотография" : "Photo")}</small></span>
                  <button type="button" onClick={() => { setEditTarget(null); setDraft(""); }} aria-label={locale === "ru" ? "Отменить редактирование" : "Cancel editing"}><X size={16} /></button>
                </div>
              )}
              {photoDraft && photoPreviewUrl && createPortal(
                <div className="media-editor-backdrop" onClick={() => { if (!mediaSending) clearPhotoDraft(); }}>
                  <section className="photo-composer-preview media-editor-panel media-editor-sheet" onClick={(event) => event.stopPropagation()} aria-label={locale === "ru" ? "Редактор фото" : "Photo editor"}>
                  <div className="media-editor-heading">
                    <strong>{locale === "ru" ? "Предпросмотр фото" : "Photo preview"}</strong>
                    <button type="button" className="photo-composer-remove" onClick={clearPhotoDraft} disabled={mediaSending} aria-label={locale === "ru" ? "Убрать фото" : "Remove photo"}><X size={17} /></button>
                  </div>
                  <div className={"photo-composer-image-wrap crop-" + photoAspect}>
                    <img src={photoPreviewUrl} alt={locale === "ru" ? "Выбранное фото" : "Selected photo"} style={{ transform: "rotate(" + photoRotation + "deg)" }} />
                    <span className="photo-composer-size">{(photoDraft.size / (1024 * 1024)).toFixed(1)} MB</span>
                  </div>
                  <div className="media-editor-tools">
                    <div className="media-editor-tool-group">
                      <span>{locale === "ru" ? "Кадрирование" : "Crop"}</span>
                      <div>
                        <button type="button" className={photoAspect === "original" ? "active" : ""} onClick={() => setPhotoAspect("original")}>{locale === "ru" ? "Оригинал" : "Original"}</button>
                        <button type="button" className={photoAspect === "square" ? "active" : ""} onClick={() => setPhotoAspect("square")}>1:1</button>
                        <button type="button" className={photoAspect === "landscape" ? "active" : ""} onClick={() => setPhotoAspect("landscape")}>16:9</button>
                      </div>
                    </div>
                    <button type="button" className="media-editor-rotate" onClick={() => setPhotoRotation((angle) => (angle + 90) % 360)}><span aria-hidden="true">↻</span>{locale === "ru" ? "Повернуть" : "Rotate"}</button>
                  </div>
                  <div className="photo-composer-caption-row">
                    <textarea value={photoCaption} onChange={(event) => setPhotoCaption(event.target.value.slice(0, 4000))} rows={2} maxLength={4000} placeholder={locale === "ru" ? "Добавить подпись…" : "Add a caption…"} aria-label={locale === "ru" ? "Подпись к фото" : "Photo caption"} disabled={mediaSending} />
                    <button type="button" className="send-button photo-composer-send" onClick={() => void handleSendPhoto()} disabled={mediaSending}>
                      {mediaSending ? <span className="button-spinner" /> : <ArrowUp size={20} />}
                    </button>
                  </div>
                  </section>
                </div>,
                document.body,
              )}
              {videoDraft && videoPreviewUrl && createPortal(
                <div className="media-editor-backdrop" onClick={() => { if (!mediaSending) clearVideoDraft(); }}>
                  <section className="photo-composer-preview media-editor-panel video-editor-panel media-editor-sheet" onClick={(event) => event.stopPropagation()} aria-label={locale === "ru" ? "Редактор видео" : "Video editor"}>
                  <div className="media-editor-heading">
                    <strong>{locale === "ru" ? "Предпросмотр видео" : "Video preview"}</strong>
                    <button type="button" className="photo-composer-remove" onClick={clearVideoDraft} disabled={mediaSending} aria-label={locale === "ru" ? "Убрать видео" : "Remove video"}><X size={17} /></button>
                  </div>
                  <video className="video-editor-preview" src={videoPreviewUrl} controls playsInline preload="metadata" onLoadedMetadata={(event) => { const duration = Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0; setVideoDuration(duration); setVideoTrimEnd(duration); }} />
                  <div className="video-trim-control">
                    <label>{locale === "ru" ? "Начало" : "Start"} <strong>{videoTrimStart.toFixed(1)} c</strong></label>
                    <input type="range" min="0" max={Math.max(videoDuration, 0.1)} step="0.1" value={Math.min(videoTrimStart, Math.max(videoDuration, 0))} onChange={(event) => setVideoTrimStart(Math.min(Number(event.target.value), Math.max(videoTrimEnd - 0.1, 0)))} disabled={!videoDuration || mediaSending} />
                  </div>
                  <div className="video-trim-control">
                    <label>{locale === "ru" ? "Конец" : "End"} <strong>{(videoTrimEnd || videoDuration).toFixed(1)} c</strong></label>
                    <input type="range" min={Math.min(videoTrimStart + 0.1, Math.max(videoDuration, 0))} max={Math.max(videoDuration, 0.1)} step="0.1" value={Math.min(videoTrimEnd || videoDuration, Math.max(videoDuration, 0.1))} onChange={(event) => setVideoTrimEnd(Number(event.target.value))} disabled={!videoDuration || mediaSending} />
                  </div>
                  <div className="photo-composer-caption-row">
                    <textarea value={videoCaption} onChange={(event) => setVideoCaption(event.target.value.slice(0, 4000))} rows={2} maxLength={4000} placeholder={locale === "ru" ? "Подпись к видео…" : "Add a video caption…"} aria-label={locale === "ru" ? "Подпись к видео" : "Video caption"} disabled={mediaSending} />
                    <button type="button" className="send-button photo-composer-send" onClick={() => void handleSendVideo()} disabled={mediaSending}><ArrowUp size={20} /></button>
                  </div>
                  </section>
                </div>,
                document.body,
              )}
              <form className="composer" onSubmit={handleSend}>
                <ChatMediaPicker
                  locale={locale}
                  disabled={mediaSending || Boolean(editTarget)}
                  onEmojiSelect={(emoji) => setDraft((current) => (current + emoji).slice(0, 4000))}
                  onStickerSelect={(emoji, motion) => void handleBuiltInMediaSelect("sticker", emoji, motion)}
                  onGifSelect={(emoji, motion) => void handleBuiltInMediaSelect("gif", emoji, motion)}
                  onStickerUpload={(file) => void handleMediaSelect("sticker", file)}
                  onGifUpload={(file) => void handleMediaSelect("gif", file)}
                />
                <input
                  value={draft}
                  onChange={(event) => handleDraftChange(event.target.value)}
                  onBlur={() => { if (typingChannelRef.current && typingChannelReadyRef.current) sendTypingIndicator(typingChannelRef.current, user.id, false); if (typingTimeoutRef.current !== null) window.clearTimeout(typingTimeoutRef.current); typingTimeoutRef.current = null; }}
                  placeholder={editTarget ? (locale === "ru" ? "Измени сообщение…" : "Edit your message…") : mediaSending ? (locale === "ru" ? "Отправка медиа…" : "Sending media…") : t(locale, "messagePlaceholder")}
                  aria-label={t(locale, "messagePlaceholder")}
                  maxLength={4000}
                />
                <button type="button" className={"icon-button composer-media-button " + (showAttachmentMenu ? "is-open" : "")} onClick={() => setShowAttachmentMenu((value) => !value)} disabled={mediaSending || Boolean(editTarget)} aria-label={locale === "ru" ? "Прикрепить фото или видео" : "Attach photo or video"} title={locale === "ru" ? "Прикрепить фото или видео" : "Attach photo or video"}>
                  <Paperclip size={19} />
                </button>
                {showAttachmentMenu && createPortal(
                  <div className="heloro-sheet-backdrop" onClick={() => setShowAttachmentMenu(false)}>
                    <section className="heloro-attachment-menu" role="dialog" aria-modal="true" aria-label={locale === "ru" ? "Выбор вложения" : "Choose attachment"} onClick={(event) => event.stopPropagation()}>
                      <span className="heloro-sheet-handle" aria-hidden="true" />
                      <div className="heloro-sheet-heading">
                        <strong>{locale === "ru" ? "Прикрепить" : "Attach"}</strong>
                        <button type="button" onClick={() => setShowAttachmentMenu(false)} aria-label={locale === "ru" ? "Закрыть" : "Close"}><X size={19} /></button>
                      </div>
                      <div className="heloro-attachment-options">
                        <button type="button" onClick={() => { setShowAttachmentMenu(false); photoInputRef.current?.click(); }}>
                          <span className="heloro-attachment-icon"><ImagePlus size={23} /></span>
                          <span><strong>{locale === "ru" ? "Фото" : "Photo"}</strong><small>{locale === "ru" ? "Выбрать изображение" : "Choose an image"}</small></span>
                        </button>
                        <button type="button" onClick={() => { setShowAttachmentMenu(false); videoInputRef.current?.click(); }}>
                          <span className="heloro-attachment-icon"><Video size={23} /></span>
                          <span><strong>{locale === "ru" ? "Видео" : "Video"}</strong><small>{locale === "ru" ? "Выбрать ролик" : "Choose a video"}</small></span>
                        </button>
                      </div>
                      <p className="heloro-sheet-hint">{locale === "ru" ? "После выбора откроется предпросмотр и редактор." : "Preview and editor open after selection."}</p>
                    </section>
                  </div>,
                  document.body,
                )}
                <input ref={photoInputRef} type="file" accept="image/*" hidden onChange={(event) => { handlePhotoSelect(event.target.files?.[0]); event.target.value = ""; }} />
                <input ref={videoInputRef} type="file" accept="video/mp4,video/webm" hidden onChange={(event) => { handleVideoSelect(event.target.files?.[0]); event.target.value = ""; }} />
                <button type="submit" disabled={sending || (!draft.trim() && editTarget?.media?.kind !== "photo" && editTarget?.media?.kind !== "video")} aria-label={editTarget ? (locale === "ru" ? "Сохранить" : "Save") : t(locale, "messageSend")} className="send-button">
                  {sending ? <span className="button-spinner" /> : editTarget ? <Check size={20} /> : <ArrowUp size={20} />}
                </button>
              </form>
              <div className="chat-footnote"><ShieldCheck size={13} /> {t(locale, "messageSecurityNote")}</div>
            </>
          ) : (
            <EmptyChat locale={locale} />
          )}
        </section>
      </div>

      {!showComposeScreen && !showNavigation && !showBots && !showReport && !mediaViewer && !showAttachmentMenu && !photoDraft && !videoDraft && createPortal(
        <nav className="mobile-bottom-nav mobile-bottom-nav-floating" aria-label={locale === "ru" ? "Основная навигация" : "Main navigation"}>
          <button type="button" className={mobileTab === "chats" ? "active" : ""} aria-current={mobileTab === "chats" ? "page" : undefined} onClick={() => openMobileTab("chats")}>
            <MessageCircle size={21} /><span>{locale === "ru" ? "Чаты" : "Chats"}</span>
          </button>
          <button type="button" className={mobileTab === "contacts" ? "active" : ""} aria-current={mobileTab === "contacts" ? "page" : undefined} onClick={() => openMobileTab("contacts")}>
            <Users size={21} /><span>{locale === "ru" ? "Контакты" : "Contacts"}</span>
          </button>
          <button type="button" className={mobileTab === "settings" ? "active" : ""} aria-current={mobileTab === "settings" ? "page" : undefined} onClick={() => openMobileTab("settings")}>
            <Settings2 size={21} /><span>{locale === "ru" ? "Настройки" : "Settings"}</span>
          </button>
          <button type="button" className={mobileTab === "profile" ? "active" : ""} aria-current={mobileTab === "profile" ? "page" : undefined} onClick={() => openMobileTab("profile")}>
            <UserRound size={21} /><span>{locale === "ru" ? "Профиль" : "Profile"}</span>
          </button>
        </nav>,
        document.body,
      )}

      {error && !activeConversation && !systemView && !activeCommunityRoomId && !communityCreateKind && <div className="global-error" role="alert">{error}<button onClick={() => setError("")} aria-label={t(locale, "dismiss")}><X size={14} /></button></div>}

      {showNavigation && (
        <Suspense fallback={null}>
          <LazyMessengerNavigation
            profile={ownProfile}
            locale={locale}
            roles={roles}
            onClose={() => setShowNavigation(false)}
            onOpenInbox={closeConversation}
            onOpenContacts={openSearch}
            onCreateGroup={() => openCommunity(null, "group")}
            onCreateChannel={() => openCommunity(null, "channel")}
            onOpenNews={() => openSystemView("news")}
            onOpenSupport={() => openSystemView("support")}
            onOpenSettings={() => openSettings("account")}
            onOpenBots={openBots}
            onOpenAdmin={() => openSystemView("admin")}
            onOpenMyProfile={() => void openUserProfile(user.id)}
            onOpenSaved={openSavedMessages}
            onOpenFolders={openFolderManager}
          />
        </Suspense>
      )}

      {showSettings && (
        <Suspense fallback={null}>
          <LazyMessengerSettings
            client={client}
            userId={user.id}
            profile={ownProfile}
            locale={locale}
            roles={roles}
            theme={theme}
            activeSection={settingsSection}
            onSectionChange={setSettingsSection}
            onThemeChange={onThemeChange}
            onLocaleChange={onLocaleChange}
            onClose={() => { setShowSettings(false); setMobileTab("chats"); }}
            onOpenSupport={() => { setShowSettings(false); openSystemView("support"); }}
            onOpenBots={openBots}
            onOpenMyProfile={() => { setShowSettings(false); void openUserProfile(user.id); }}
            onOpenAdmin={() => { setShowSettings(false); openSystemView("admin"); }}
            onSignOut={() => void signOut()}
          />
        </Suspense>
      )}

      {showBots && (
        <Suspense fallback={null}>
          <LazyBotsHub client={client} user={user} locale={locale} onClose={closeBots} />
        </Suspense>
      )}

      {showProfile && createPortal(
        <div className="profile-view-overlay" onClick={() => { setShowProfile(false); setMobileTab("chats"); }}>
          <section className="profile-view-card" role="dialog" aria-modal="true" aria-labelledby="profile-view-title" onClick={(event) => event.stopPropagation()}>
            <header className="profile-view-topbar">
              <button className="icon-button" type="button" onClick={() => { setShowProfile(false); setProfileEditing(false); setMobileTab("chats"); }} aria-label={locale === "ru" ? "Назад" : "Back"}><ArrowLeft size={20} /></button>
              <strong>{viewedProfile?.id === user.id ? (locale === "ru" ? "Мой профиль" : "My profile") : t(locale, "profileViewTitle")}</strong>
              <span className="profile-view-topbar-spacer" />
              {viewedProfile?.id === user.id && !profileEditing && (
                <button className="profile-view-topbar-edit" type="button" onClick={() => { setProfileNameDraft(viewedProfile.display_name); setProfileUsernameDraft(viewedProfile.username); setProfileEditing(true); }}>
                  <PencilLine size={15} />{locale === "ru" ? "Изменить" : "Edit"}
                </button>
              )}
              {viewedProfile && viewedProfile.id !== user.id && (
                <button className="icon-button profile-view-copy-top" type="button" onClick={() => void copyProfileUsername(viewedProfile)} aria-label={locale === "ru" ? "Скопировать username" : "Copy username"} title={locale === "ru" ? "Скопировать username" : "Copy username"}><Copy size={17} /></button>
              )}
            </header>
            <div className="profile-view-content">
              <div className="profile-view-cover" aria-hidden="true" />
              {profileLoading ? <p className="profile-view-loading">{t(locale, "appLoading")}</p> : viewedProfile ? <>
                <div className="profile-view-hero">
                  <button type="button" className="profile-view-avatar-button" onClick={() => openPhotoViewer(viewedProfile.avatar_url)} disabled={!viewedProfile.avatar_url} aria-label={locale === "ru" ? "Увеличить фото профиля" : "Enlarge profile photo"}>
                    <Avatar label={viewedProfile.display_name || viewedProfile.username} className="profile-view-avatar" src={viewedProfile.avatar_url} crown={Boolean(crownMap[viewedProfile.id])} />
                  </button>
                  <h2 id="profile-view-title">
                    <span className="profile-display-name">{viewedProfile.display_name || viewedProfile.username}</span>
                    <PurpleCrownNameMark active={Boolean(crownMap[viewedProfile.id])} />
                    <VerificationMark type={viewedProfile.badge_type} title={locale === "ru" ? "Аккаунт подтверждён HELORO" : "Verified by HELORO"} />
                  </h2>
                  <p className="profile-view-username">@{viewedProfile.username}</p>
                  <p className={"profile-view-presence" + (onlineMap[viewedProfile.id] ? " is-online" : "")}>
                    {viewedProfile.id === user.id
                      ? (locale === "ru" ? "Ваш профиль HELORO" : "Your HELORO profile")
                      : onlineMap[viewedProfile.id]
                        ? (locale === "ru" ? "в сети" : "online")
                        : formatLastSeen(lastSeenMap[viewedProfile.id] ?? null, locale, !lastSeenMap[viewedProfile.id])}
                  </p>
                </div>

                {viewedProfile.id === user.id ? (
                  <>
                    <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => void handleAvatarSelect(event.target.files?.[0])} />
                    <div className="profile-actions-row profile-own-actions">
                      <button className="profile-view-action" type="button" disabled={avatarBusy} onClick={() => avatarInputRef.current?.click()}>
                        <ImagePlus size={17} />{avatarBusy ? t(locale, "profilePhotoUploading") : (locale === "ru" ? "Фото профиля" : "Profile photo")}
                      </button>
                      <button className="profile-view-action profile-message-action" type="button" onClick={() => { setProfileNameDraft(viewedProfile.display_name); setProfileUsernameDraft(viewedProfile.username); setProfileEditing(true); }}>
                        <PencilLine size={16} />{locale === "ru" ? "Редактировать" : "Edit profile"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="profile-actions-row profile-public-actions">
                    <button className="profile-view-action profile-message-action" type="button" onClick={() => { setShowProfile(false); void startConversation(viewedProfile); }}>
                      <MessageCircle size={17} />{locale === "ru" ? "Сообщение" : "Message"}
                    </button>
                    <button className="profile-view-action" type="button" onClick={() => void copyProfileUsername(viewedProfile)}>
                      <Copy size={16} />{locale === "ru" ? "Копировать @username" : "Copy @username"}
                    </button>
                  </div>
                )}

                <section className="profile-info-section">
                  <h3>{locale === "ru" ? "Информация" : "Info"}</h3>
                  <div className="profile-info-card">
                    <div className="profile-info-row">
                      <UserRound size={19} />
                      <span><small>{locale === "ru" ? "Имя пользователя" : "Username"}</small><strong>@{viewedProfile.username}</strong></span>
                      <button type="button" className="profile-info-copy" onClick={() => void copyProfileUsername(viewedProfile)} aria-label={locale === "ru" ? "Скопировать username" : "Copy username"}><Copy size={16} /></button>
                    </div>
                    <div className="profile-info-row">
                      <ShieldCheck size={19} />
                      <span><small>{locale === "ru" ? "Статус аккаунта" : "Account status"}</small><strong>{viewedProfile.badge_type ? (locale === "ru" ? "Подтверждён HELORO" : "Verified by HELORO") : (locale === "ru" ? "Пользователь HELORO" : "HELORO user")}</strong></span>
                    </div>
                    {viewedProfile.created_at && (
                      <div className="profile-info-row">
                        <CalendarDays size={19} />
                        <span>
                          <small>{locale === "ru" ? "В HELORO с" : "Joined HELORO"}</small>
                          <strong>{new Date(viewedProfile.created_at).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US", { day: "numeric", month: "long", year: "numeric" })}</strong>
                        </span>
                      </div>
                    )}
                  </div>
                </section>

                {profileEditing && viewedProfile.id === user.id && (
                  <section className="profile-edit-section">
                    <div className="profile-info-section-heading">
                      <h3>{locale === "ru" ? "Редактирование профиля" : "Edit profile"}</h3>
                      <span>{locale === "ru" ? "Изменения сохраняются в аккаунте" : "Changes are saved to your account"}</span>
                    </div>
                    <form className="profile-edit-form" onSubmit={(event) => { event.preventDefault(); void saveOwnProfile(); }}>
                      <label>{locale === "ru" ? "Имя" : "Name"}<input value={profileNameDraft} onChange={(event) => setProfileNameDraft(event.target.value)} maxLength={48} required /></label>
                      <label>@username<input value={profileUsernameDraft} onChange={(event) => setProfileUsernameDraft(event.target.value.replace(/^@/, "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0,24))} minLength={3} maxLength={24} required autoCapitalize="none" autoCorrect="off" spellCheck={false} /></label>
                      <div className="profile-edit-actions">
                        <button className="profile-view-action" type="button" disabled={profileSaving} onClick={() => { setProfileEditing(false); setProfileNameDraft(viewedProfile.display_name); setProfileUsernameDraft(viewedProfile.username); }}>{locale === "ru" ? "Отмена" : "Cancel"}</button>
                        <button className="profile-view-action profile-edit-save" type="submit" disabled={profileSaving}>{profileSaving ? (locale === "ru" ? "Сохранение…" : "Saving…") : (locale === "ru" ? "Сохранить" : "Save")}</button>
                      </div>
                    </form>
                  </section>
                )}

                {profileNotice && <p className="profile-crown-notice profile-view-feedback" role="status">{profileNotice}</p>}
                {canManageBadges && viewedProfile.badge_type && <button className="profile-view-remove-badge" type="button" disabled={profileBusy} onClick={() => void removeProfileBadge()}><ShieldCheck size={16} />{profileBusy ? t(locale, "profileBadgeRemoving") : t(locale, "profileBadgeRemove")}</button>}
              </> : <p className="profile-view-loading">{profileError || t(locale, "profileLoadError")}</p>}
              {profileError && viewedProfile && <p className="profile-view-error" role="alert">{profileError}</p>}
            </div>
          </section>
        </div>,
        document.body,
      )}

      {mediaViewer && createPortal(
        <div className="media-viewer-overlay" role="dialog" aria-modal="true" aria-label={mediaViewer.kind === "photo" ? (locale === "ru" ? "Просмотр фото" : "Photo viewer") : (locale === "ru" ? "Просмотр видео" : "Video viewer")} onClick={() => setMediaViewer(null)}>
          <button type="button" className="media-viewer-close" onClick={() => setMediaViewer(null)} aria-label={locale === "ru" ? "Закрыть просмотр" : "Close viewer"}><X size={23} /></button>
          {mediaViewer.kind === "photo" ? (
            <>
              <div className="media-viewer-zoom-tools" onClick={(event) => event.stopPropagation()}>
                <button type="button" onClick={() => setMediaViewerScale((value) => Math.max(1, Number((value - 0.25).toFixed(2))))} disabled={mediaViewerScale <= 1} aria-label={locale === "ru" ? "Уменьшить" : "Zoom out"}>−</button>
                <span>{Math.round(mediaViewerScale * 100)}%</span>
                <button type="button" onClick={() => setMediaViewerScale((value) => Math.min(3, Number((value + 0.25).toFixed(2))))} disabled={mediaViewerScale >= 3} aria-label={locale === "ru" ? "Увеличить" : "Zoom in"}>+</button>
              </div>
              <div className="media-viewer-scroll" onClick={(event) => event.stopPropagation()}>
                {mediaViewerLoadError ? (
                  <p className="media-viewer-load-error" role="alert">{locale === "ru" ? "Не удалось загрузить фото. Попробуйте открыть его ещё раз." : "Could not load this photo. Please try opening it again."}</p>
                ) : (
                  <img className="media-viewer-image" src={mediaViewer.url} alt={mediaViewer.caption || (locale === "ru" ? "Фото" : "Photo")} draggable={false} onLoad={() => setMediaViewerLoadError(false)} onError={() => setMediaViewerLoadError(true)} style={{ transform: "scale(" + mediaViewerScale + ")" }} />
                )}
              </div>
            </>
          ) : (
            <video className="media-viewer-video" src={mediaViewer.url} controls playsInline autoPlay onClick={(event) => event.stopPropagation()} />
          )}
          {mediaViewer.caption && <p className="media-viewer-caption">{mediaViewer.caption}</p>}
        </div>,
        document.body,
      )}

      {showReport && activeConversation && (
        <div className="settings-overlay" onClick={() => setShowReport(false)}>
          <section className="settings-card glass-panel report-card" role="dialog" aria-modal="true" aria-labelledby="report-title" onClick={(event) => event.stopPropagation()}>
            <div className="settings-heading">
              <h2 id="report-title">{reportMessageTargetId ? (locale === "ru" ? "Пожаловаться на сообщение" : "Report message") : (locale === "ru" ? "Пожаловаться на пользователя" : "Report user")}</h2>
              <button className="icon-button" onClick={() => setShowReport(false)} aria-label={t(locale, "settingsClose")}><X size={18} /></button>
            </div>
            <p className="muted small-copy">{reportMessageTargetId ? (locale === "ru" ? "Содержимое сообщения не будет показываться модераторам." : "The message content will not be shown to moderators.") : `${activeConversation.display_name || activeConversation.username} · @${activeConversation.username}`}</p>
            <form className="report-form" onSubmit={submitReport}>
              <label>{locale === "ru" ? "Причина" : "Reason"}
                <select value={reportReason} onChange={(event) => setReportReason(event.target.value as (typeof reportReasons)[number])}>
                  {reportReasons.map((reason) => <option value={reason} key={reason}>{locale === "ru"
                    ? ({ spam: "Спам", harassment: "Оскорбления", scam: "Мошенничество", inappropriate: "Неподходящий контент", other: "Другое" } as const)[reason]
                    : ({ spam: "Spam", harassment: "Harassment", scam: "Scam", inappropriate: "Inappropriate content", other: "Other" } as const)[reason]}</option>)}
                </select>
              </label>
              <label>{locale === "ru" ? "Подробности (необязательно)" : "Details (optional)"}
                <textarea value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={1500} placeholder={locale === "ru" ? "Опишите проблему…" : "Describe the issue…"} />
              </label>
              <button className="primary-button" type="submit" disabled={reportBusy}>{reportBusy ? (locale === "ru" ? "Отправка…" : "Sending…") : (locale === "ru" ? "Отправить жалобу" : "Send report")} <Flag size={15} /></button>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
