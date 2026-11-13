import { lazy, Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import {
  ArrowLeft,
  ArrowUp,
  BadgeCheck,
  CheckCheck,
  Flag,
  Headphones,
  ImagePlus,
  Menu,
  Megaphone,
  MessageCircle,
  MoreVertical,
  UserRound,
  Users,
  PencilLine,
  Phone,
  Search,
  Settings2,
  SmilePlus,
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
  getPublicProfile,
  listPublicProfiles,
  searchProfiles,
  saveProfile,
  sendMessage,
  sendMediaMessage,
  subscribeToMessages,
  uploadAvatar,
} from "../../lib/messenger";
import { formatInboxTime, formatMessageTime, initials, messageBodySchema, usernameSchema, displayNameSchema } from "../../lib/domain";
import type { InboxConversation, Message, Profile, PublicProfile, BadgeType } from "../../lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { t, type Locale } from "../../lib/i18n";
import OfficialPanels from "./OfficialPanels";
import CommunityHub from "./CommunityHub";
import { setVerificationBadge, submitUserReport, submitContentReport } from "../../lib/official";
import type { SettingsSection } from "./MessengerNavigation";
import type { ThemePreference } from "../../lib/preferences";
import "./MessengerTelegramDesign.css";
import "./MessengerCommunity.css";

type SystemView = "news" | "discussion" | "support" | "admin";
type CommunityRoomPreview = { id: string; kind: "group" | "channel"; name: string; username: string; description: string; avatar_url: string | null; is_public: boolean; updated_at: string };
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

function Avatar({ label, className = "", src }: { label: string; className?: string; src?: string | null }) {
  return <div className={`avatar ${className}`} aria-hidden="true">
    {src ? <img src={src} alt="" loading="lazy" /> : initials(label)}
  </div>;
}

function VerificationMark({ type, title }: { type?: BadgeType | null; title: string }) {
  if (!type) return null;
  if (type === "epic_sans") {
    return <BadgeCheck size={14} className="epic-sans-verified-mark" title="Epic Sans" aria-label="Epic Sans" />;
  }
  const label = type === "blue" ? "blue" : type === "gold" ? "gold" : "creator";
  return (
    <span className={`verification-mark verification-${label}`} title={title} aria-label={title}>
      <BadgeCheck size={14} strokeWidth={2.8} />
    </span>
  );
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
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [badgeMap, setBadgeMap] = useState<Record<string, BadgeType>>({});
  const [searching, setSearching] = useState(false);
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [mediaSending, setMediaSending] = useState(false);
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
  const stickerInputRef = useRef<HTMLInputElement>(null);
  const gifInputRef = useRef<HTMLInputElement>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isStaff = roles.some((role) => role === "owner" || role === "admin" || role === "moderator");
  const canManageBadges = roles.includes("owner") || roles.includes("admin");

  const activeConversation = useMemo(
    () => inbox.find((item) => item.conversation_id === activeId) ?? null,
    [inbox, activeId],
  );

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
    setCommunityRooms((data ?? []) as CommunityRoomPreview[]);
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
        setCommunitySearchRooms((data ?? []) as CommunityRoomPreview[]);
      });
    return () => { active = false; };
  }, [client, search, showSearch]);

  useEffect(() => {
    if (inbox.length === 0) {
      setBadgeMap({});
      return;
    }
    let active = true;
    client.from("verification_badges")
      .select("user_id, badge_type")
      .in("user_id", inbox.map((item) => item.other_user_id))
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
    return () => { active = false; };
  }, [client, inbox]);

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
    );
    return () => {
      active = false;
      void client.removeChannel(channel);
    };
  }, [activeId, client, locale]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

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

  async function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = messageBodySchema.safeParse(draft);
    if (!parsed.success || !activeId) return;
    setSending(true);
    setError("");
    const currentDraft = parsed.data;
    setDraft("");
    try {
      const saved = await sendMessage(activeId, user.id, currentDraft);
      setMessages((current) => current.some((item) => item.id === saved.id) ? current : [...current, saved]);
      await refreshInbox();
    } catch (cause) {
      setDraft(currentDraft);
      setError(cause instanceof Error ? cause.message : t(locale, "messageSendFailed"));
    } finally {
      setSending(false);
    }
  }

  async function openUserProfile(userId: string) {
    setShowProfile(true);
    setProfileEditing(false);
    setViewedProfile(null);
    setProfileLoading(true);
    setProfileError("");
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
      if (kind === "sticker" && stickerInputRef.current) stickerInputRef.current.value = "";
      if (kind === "gif" && gifInputRef.current) gifInputRef.current.value = "";
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
      setDirectoryRooms([...uniqueRooms.values()].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)));
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
  }

  function openNewMessageScreen() {
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
    setMobileTab("chats");
    setShowContactsScreen(false);
    setShowComposeScreen(false);
    setSystemView(null);
    setActiveId(null);
    setActiveCommunityRoomId(null);
    setCommunityCreateKind(null);
    setShowSearch(true);
    setSearch("");
    setResults([]);
  }

  function openSystemView(view: SystemView) {
    setMobileTab("chats");
    setShowContactsScreen(false);
    setShowComposeScreen(false);
    setActiveId(null);
    setActiveCommunityRoomId(null);
    setCommunityCreateKind(null);
    setSystemView(view);
    setShowSearch(false);
    setSearch("");
    setResults([]);
    setError("");
  }

  function closeConversation() {
    setMobileTab("chats");
    setShowContactsScreen(false);
    setShowComposeScreen(false);
    setActiveId(null);
    setActiveCommunityRoomId(null);
    setCommunityCreateKind(null);
    setSystemView(null);
    setShowSearch(false);
    setShowChatActions(false);
    setSearch("");
  }

  function openSettings(section: SettingsSection = "account") {
    setSettingsSection(section);
    setShowBots(false);
    setShowSettings(true);
  }

  function openBots() {
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

  return (
    <main className={`messenger-stage ${activeConversation || systemView || activeCommunityRoomId || communityCreateKind ? "chat-selected" : ""}`}>
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

          <section className="conversation-list">
            {showSearch && search.trim().length > 1 ? (
              <>
                {visibleCommunityRooms.length > 0 && (
                  <>
                    <div className="section-label">{locale === "ru" ? "Группы и каналы" : "Groups and channels"}</div>
                    {visibleCommunityRooms.map((room) => (
                      <button className="person-result community-search-result" type="button" key={room.id} onClick={() => openCommunity(room.id)}>
                        <div className="community-inbox-avatar">{room.avatar_url ? <img src={room.avatar_url} alt="" /> : room.kind === "channel" ? <Megaphone size={18} /> : <Users size={18} />}</div>
                        <span><strong>{room.name}</strong><small>@{room.username} · {room.kind === "channel" ? (locale === "ru" ? "Канал" : "Channel") : (locale === "ru" ? "Группа" : "Group")}</small></span>
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
                    <Avatar label={person.display_name || person.username} src={person.avatar_url} />
                    <span><strong>{person.display_name || person.username}<VerificationMark type={person.badge_type} title={locale === "ru" ? "Аккаунт подтверждён HELORO" : "Verified by HELORO"} /></strong><small>@{person.username}</small></span>
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
                      <div className="system-avatar system-news-avatar"><Megaphone size={19} /></div>
                      <span className="conversation-copy">
                        <span className="conversation-title-line"><strong>Heloro New <BadgeCheck size={14} className="system-verified-mark" /></strong><time>{locale === "ru" ? "Канал" : "Channel"}</time></span>
                        <span className="conversation-preview-line"><small>{locale === "ru" ? "Новости и обновления" : "News and updates"}</small></span>
                      </span>
                    </button>
                    <button className={`conversation-item pinned-system-item ${systemView === "support" ? "selected" : ""}`} onClick={() => openSystemView("support")}>
                      <div className="system-avatar system-support-avatar"><Headphones size={19} /></div>
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
                ) : visibleChatItems.length === 0 ? (
                  <div className="inbox-empty">
                    <div className="inbox-empty-icon"><MessageCircle size={21} /></div>
                    <strong>{t(locale, "inboxEmptyTitle")}</strong>
                    <p>{t(locale, "inboxEmptyDescription")}</p>
                    <button onClick={openSearch}>{t(locale, "inboxFindSomeone")}</button>
                  </div>
                ) : visibleChatItems.map((entry) => entry.kind === "community" ? (
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
                        <strong>{entry.room.name}</strong>
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
                      <Avatar label={label} src={item.avatar_url} />
                      <span className="conversation-copy">
                        <span className="conversation-title-line">
                          <strong>{label}<VerificationMark type={badgeMap[item.other_user_id]} title={locale === "ru" ? "Аккаунт подтверждён HELORO" : "Verified by HELORO"} /></strong>
                          <time>{formatInboxTime(item.last_message_at)}</time>
                        </span>
                        <span className="conversation-preview-line">
                          <small>{item.last_message || t(locale, "inboxSayHello")}</small>
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
              <Avatar label={ownProfile.display_name} className="profile-avatar" src={ownProfile.avatar_url} />
              <span className="profile-summary"><strong>{ownProfile.display_name}</strong><small>@{ownProfile.username}</small></span>
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
                      <Avatar label={person.display_name || person.username} src={person.avatar_url} />
                      <span className="new-message-person-copy">
                        <strong>{person.display_name || person.username}<VerificationMark type={person.badge_type} title={locale === "ru" ? "Аккаунт подтверждён HELORO" : "Verified by HELORO"} /></strong>
                        <small>@{person.username}</small>
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
                        <strong>{room.name}</strong>
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
          {!showComposeScreen && !showSettings && !showBots && !showProfile && !showNavigation && (
            <nav className="mobile-bottom-nav" aria-label={locale === "ru" ? "Основная навигация" : "Main navigation"}>
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
            </nav>
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
                        <Avatar label={person.display_name || person.username} src={person.avatar_url} />
                        <span className="new-message-person-copy">
                          <strong>{person.display_name || person.username}<VerificationMark type={person.badge_type} title={locale === "ru" ? "Аккаунт подтверждён HELORO" : "Verified by HELORO"} /></strong>
                          <small>@{person.username}</small>
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
                        <Avatar label={item.display_name || item.username} src={item.avatar_url} />
                        <span className="new-message-person-copy">
                          <strong>{item.display_name || item.username}<VerificationMark type={badgeMap[item.other_user_id]} title={locale === "ru" ? "Аккаунт подтверждён HELORO" : "Verified by HELORO"} /></strong>
                          <small>@{item.username}</small>
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
          {systemView ? (
            <div className="system-screen">
              <button className="system-mobile-back" onClick={closeConversation} aria-label={t(locale, "inboxBack")}><ArrowLeft size={19} /></button>
              <OfficialPanels
                view={systemView}
                client={client}
                user={user}
                locale={locale}
                roles={roles}
                onOpenDiscussion={() => openSystemView("discussion")}
                onOpenNews={() => openSystemView("news")}
              />
            </div>
          ) : (activeCommunityRoomId || communityCreateKind) ? (
            <CommunityHub
              key={`${activeCommunityRoomId ?? "new"}-${communityCreateKind ?? ""}`}
              client={client}
              user={user}
              locale={locale}
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
                  <Avatar label={activeConversation.display_name || activeConversation.username} className="chat-header-avatar" src={activeConversation.avatar_url} />
                  <span className="chat-person">
                    <strong>{activeConversation.display_name || activeConversation.username}<VerificationMark type={badgeMap[activeConversation.other_user_id]} title={locale === "ru" ? "Аккаунт подтверждён HELORO" : "Verified by HELORO"} /></strong>
                    <small>@{activeConversation.username}</small>
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
              <div className="message-stream">
                <div className="chat-date-pill">{t(locale, "chatConversationLabel")}</div>
                {loadingMessages ? (
                  <div className="message-loading">{t(locale, "chatLoading")}</div>
                ) : messages.length === 0 ? (
                  <div className="first-message">
                    <div className="first-message-icon"><MessageCircle size={20} /></div>
                    <strong>{t(locale, "chatFirstMessageTitle")}</strong>
                    <p>{t(locale, "chatFirstMessageDescription")}</p>
                  </div>
                ) : messages.map((message) => {
                  const mine = message.sender_id === user.id;
                  return (
                    <div className={`message-row ${mine ? "mine" : "theirs"}`} key={message.id}>
                      <div className="message-bubble">
                        {message.media?.url ? (
                          <img
                            className={message.media.kind === "gif" ? "message-media message-gif" : "message-media message-sticker"}
                            src={message.media.url}
                            alt={message.media.kind === "gif" ? (locale === "ru" ? "GIF" : "GIF") : (locale === "ru" ? "Стикер" : "Sticker")}
                            loading="lazy"
                          />
                        ) : message.body ? <p>{message.body}</p> : null}
                        <div className="message-meta">
                          <span>{formatMessageTime(message.created_at)} {mine && <CheckCheck size={13} />}</span>
                          <button type="button" className="message-delete-button" onClick={() => void removeDirectMessage(message)} aria-label={t(locale, "messageDelete")} title={t(locale, "messageDelete")}><Trash2 size={13} /></button>
                          {!mine && <button type="button" className="message-delete-button" onClick={() => { setReportMessageTargetId(message.id); setReportReason("other"); setReportDetails(""); setShowReport(true); }} aria-label={locale === "ru" ? "Пожаловаться на сообщение" : "Report message"} title={locale === "ru" ? "Пожаловаться на сообщение" : "Report message"}><Flag size={13} /></button>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
              {error && <div className="inline-error" role="alert">{error}<button onClick={() => setError("")} aria-label={t(locale, "dismiss")}><X size={14} /></button></div>}
              <form className="composer" onSubmit={handleSend}>
                <button type="button" className="icon-button composer-media-button" onClick={() => stickerInputRef.current?.click()} disabled={mediaSending} aria-label={locale === "ru" ? "Отправить стикер" : "Send sticker"} title={locale === "ru" ? "Стикер из файла" : "Sticker from file"}>
                  <SmilePlus size={19} />
                </button>
                <button type="button" className="icon-button composer-media-button" onClick={() => gifInputRef.current?.click()} disabled={mediaSending} aria-label="GIF" title={locale === "ru" ? "Отправить GIF" : "Send GIF"}>
                  <ImagePlus size={19} />
                </button>
                <input ref={stickerInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => void handleMediaSelect("sticker", event.target.files?.[0])} />
                <input ref={gifInputRef} type="file" accept="image/gif" hidden onChange={(event) => void handleMediaSelect("gif", event.target.files?.[0])} />
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={mediaSending ? (locale === "ru" ? "Отправка медиа…" : "Sending media…") : t(locale, "messagePlaceholder")}
                  aria-label={t(locale, "messagePlaceholder")}
                  maxLength={4000}
                />
                <button type="submit" disabled={sending || !draft.trim()} aria-label={t(locale, "messageSend")} className="send-button">
                  {sending ? <span className="button-spinner" /> : <ArrowUp size={20} />}
                </button>
              </form>
              <div className="chat-footnote"><ShieldCheck size={13} /> {t(locale, "messageSecurityNote")}</div>
            </>
          ) : (
            <EmptyChat locale={locale} />
          )}
        </section>
      </div>

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

      {showProfile && (
        <div className="profile-view-overlay" onClick={() => { setShowProfile(false); setMobileTab("chats"); }}>
          <section className="profile-view-card" role="dialog" aria-modal="true" aria-labelledby="profile-view-title" onClick={(event) => event.stopPropagation()}>
            <header className="profile-view-topbar">
              <button className="icon-button" type="button" onClick={() => { setShowProfile(false); setMobileTab("chats"); }} aria-label={locale === "ru" ? "Назад" : "Back"}><ArrowLeft size={20} /></button>
              <strong>{t(locale, "profileViewTitle")}</strong>
              <span className="profile-view-topbar-spacer" />
            </header>
            <div className="profile-view-content">
              {profileLoading ? <p className="profile-view-loading">{t(locale, "appLoading")}</p> : viewedProfile ? <>
                <div className="profile-view-cover" />
                <div className="profile-view-hero">
                  <Avatar label={viewedProfile.display_name || viewedProfile.username} className="profile-view-avatar" src={viewedProfile.avatar_url} />
                  <h2 id="profile-view-title">{viewedProfile.display_name || viewedProfile.username}<VerificationMark type={viewedProfile.badge_type} title={locale === "ru" ? "Аккаунт подтверждён HELORO" : "Verified by HELORO"} /></h2>
                  <p className="profile-view-username">@{viewedProfile.username}</p>
                </div>
                <div className="profile-info-card">
                  <div className="profile-info-row">
                    <UserRound size={19} />
                    <span><small>{locale === "ru" ? "Имя пользователя" : "Username"}</small><strong>@{viewedProfile.username}</strong></span>
                  </div>
                  <div className="profile-info-row">
                    <ShieldCheck size={19} />
                    <span><small>{locale === "ru" ? "Статус аккаунта" : "Account status"}</small><strong>{viewedProfile.badge_type ? (locale === "ru" ? "Подтверждён HELORO" : "Verified by HELORO") : (locale === "ru" ? "Пользователь HELORO" : "HELORO user")}</strong></span>
                  </div>
                </div>
                {viewedProfile.id === user.id ? <>
                  <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => void handleAvatarSelect(event.target.files?.[0])} />
                  <div className="profile-actions-row">
                    <button className="profile-view-action" type="button" disabled={avatarBusy} onClick={() => avatarInputRef.current?.click()}><ImagePlus size={17} />{avatarBusy ? t(locale, "profilePhotoUploading") : (locale === "ru" ? "Изменить фото" : "Change photo")}</button>
                    {!profileEditing && <button className="profile-view-action" type="button" onClick={() => { setProfileNameDraft(viewedProfile.display_name); setProfileUsernameDraft(viewedProfile.username); setProfileEditing(true); }}>{locale === "ru" ? "Изменить профиль" : "Edit profile"}</button>}
                  </div>
                  {profileEditing && (
                    <form className="profile-edit-form" onSubmit={(event) => { event.preventDefault(); void saveOwnProfile(); }}>
                      <label>{locale === "ru" ? "Имя" : "Name"}<input value={profileNameDraft} onChange={(event) => setProfileNameDraft(event.target.value)} maxLength={48} required /></label>
                      <label>@username<input value={profileUsernameDraft} onChange={(event) => setProfileUsernameDraft(event.target.value.replace(/^@/, "").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0,24))} minLength={3} maxLength={24} required autoCapitalize="none" autoCorrect="off" spellCheck={false} /></label>
                      <div className="profile-edit-actions">
                        <button className="profile-view-action" type="button" disabled={profileSaving} onClick={() => setProfileEditing(false)}>{locale === "ru" ? "Отмена" : "Cancel"}</button>
                        <button className="profile-view-action profile-edit-save" type="submit" disabled={profileSaving}>{profileSaving ? (locale === "ru" ? "Сохранение…" : "Saving…") : (locale === "ru" ? "Сохранить" : "Save")}</button>
                      </div>
                    </form>
                  )}
                </> : (
                  <div className="profile-actions-row">
                    <button className="profile-view-action profile-message-action" type="button" onClick={() => { setShowProfile(false); void startConversation(viewedProfile); }}>
                      <MessageCircle size={17} />{locale === "ru" ? "Написать сообщение" : "Send message"}
                    </button>
                  </div>
                )}
                {canManageBadges && viewedProfile.badge_type && <button className="profile-view-remove-badge" type="button" disabled={profileBusy} onClick={() => void removeProfileBadge()}><ShieldCheck size={16} />{profileBusy ? t(locale, "profileBadgeRemoving") : t(locale, "profileBadgeRemove")}</button>}
              </> : <p className="profile-view-loading">{profileError || t(locale, "profileLoadError")}</p>}
              {profileError && viewedProfile && <p className="profile-view-error" role="alert">{profileError}</p>}
            </div>
          </section>
        </div>
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
