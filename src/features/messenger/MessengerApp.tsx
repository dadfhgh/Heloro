import { Fragment, lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { RealtimeChannel, User } from "@supabase/supabase-js";
import {
  ArrowLeft,
  ArrowUp,
  BadgeCheck,
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
  Trash2,
  Video,
  X,
} from "lucide-react";
import {
  createDirectConversation,
  deleteDirectMessage,
  getInbox,
  getMessages,
  getPinnedMessages,
  getDirectMessageById,
  setDirectMessagePinned,
  getPublicProfile,
  listPublicProfiles,
  searchProfiles,
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
import { formatInboxTime, formatLastSeen, formatMessageDayLabel, formatMessageTime, initials, messageBodySchema, usernameSchema, displayNameSchema } from "../../lib/domain";
import type { InboxConversation, Message, Profile, PublicProfile, BadgeType } from "../../lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { t, type Locale } from "../../lib/i18n";
import OfficialPanels from "./OfficialPanels";
import OfficialAvatar from "./OfficialAvatar";
import CommunityHub from "./CommunityHub";
import ChatMediaPicker from "./ChatMediaPicker";
import { setVerificationBadge, submitUserReport, submitContentReport } from "../../lib/official";
import type { SettingsSection } from "./MessengerNavigation";
import type { ThemePreference } from "../../lib/preferences";
import "./MessengerTelegramDesign.css";
import "./MessengerCommunity.css";

type SystemView = "news" | "discussion" | "support" | "admin";
type CommunityRoomPreview = { id: string; kind: "group" | "channel"; name: string; username: string; description: string; avatar_url: string | null; is_public: boolean; updated_at: string; badge_type?: "blue" | "gold" | "creator" | null };
type VisibleChatItem = { kind: "direct"; sortAt: string; conversation: InboxConversation } | { kind: "community"; sortAt: string; room: CommunityRoomPreview };

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
    if (!showSettings && !showBots && !showReport && !showNavigation && !showProfile && !showComposeScreen && !showContactsScreen) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
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
  }, [showSettings, showBots, showNavigation, showReport, showProfile, showComposeScreen, showContactsScreen]);

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
      if (!currentDraft && editTarget.media?.kind !== "photo") return;
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
