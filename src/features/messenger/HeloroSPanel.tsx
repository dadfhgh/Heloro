import { useEffect, useRef, useState, type FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import {
  Activity, BadgeCheck, Ban, Check, CheckCircle2, CircleAlert,
  FileText, Headphones, LockKeyhole, Megaphone, MessageCircle, RefreshCw,
  Search, Settings, ShieldCheck, UserRound, Users, X,
} from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getSupportMessages, sendSupportMessage, setVerificationBadge,
  type BadgeType, type SupportMessage,
} from "../../lib/official";
import { formatMessageTime } from "../../lib/domain";
import type { Locale } from "../../lib/i18n";
import type { PublicProfile } from "../../lib/types";
import { adminErrorMessage, escapeAdminLikePattern, normalizeAdminSearch } from "./adminPanelUtils";

type Props = {
  client: SupabaseClient;
  user: User;
  locale: Locale;
  roles: string[];
  onOpenNews: () => void;
  onOpenDiscussion: () => void;
};

type TabId = "overview" | "users" | "moderation" | "reports" | "support" | "audit" | "settings" | "security" | "verification" | "channels" | "roles" | "groups";
type CommunityEntry = { id: string; name: string; username: string | null; kind: "group" | "channel"; created_at: string; created_by: string; member_count: number };
type AdminUser = PublicProfile & { created_at: string };
type AdminReport = {
  id: string; reporter_id: string; reported_user_id: string | null; reason: string;
  details: string; status: string; created_at: string;
  target_type?: string; target_id?: string | null; review_note?: string | null;
};
type AdminThread = {
  id: string; user_id: string; status?: string; assigned_to?: string | null;
  created_at: string; updated_at: string;
};
type ReportDecision = {
  id: string; report_id: string; actor_id: string;
  previous_status: string | null; next_status: string; note: string; created_at: string;
};
type AuditEntry = {
  id: string; actor_id: string; target_user_id: string | null;
  target_type?: string | null; target_id?: string | null;
  action: string; reason?: string | null; details?: Record<string, unknown>;
  created_at: string;
};
type StaffEntry = { user_id: string; role: string; granted_at: string; username?: string | null; display_name?: string | null };
type ActiveRestriction = { id: string; restriction_type: string; reason: string; created_at: string; expires_at: string | null; revoked_at: string | null; created_by: string };
type Overview = {
  users_total: number; registrations_24h: number; active_users_24h: number;
  messages_total: number; messages_24h: number; reports_open: number;
  support_open: number; admins_total: number; moderators_total: number;
};
type SettingEntry = { setting_key: string; value: unknown; updated_at: string; updated_by: string | null };

const tabItems: { id: TabId; ru: string; en: string; icon: typeof Activity }[] = [
  { id: "overview", ru: "Обзор", en: "Overview", icon: Activity },
  { id: "users", ru: "Пользователи", en: "Users", icon: Users },
  { id: "moderation", ru: "Модерация", en: "Moderation", icon: Ban },
  { id: "reports", ru: "Жалобы", en: "Reports", icon: CircleAlert },
  { id: "support", ru: "Поддержка", en: "Support", icon: Headphones },
  { id: "audit", ru: "Журнал действий", en: "Audit log", icon: FileText },
  { id: "settings", ru: "Настройки", en: "Settings", icon: Settings },
  { id: "security", ru: "Безопасность", en: "Security", icon: LockKeyhole },
  { id: "verification", ru: "Верификация", en: "Verification", icon: BadgeCheck },
  { id: "channels", ru: "Каналы", en: "Channels", icon: Megaphone },
  { id: "roles", ru: "Роли", en: "Roles", icon: ShieldCheck },
  { id: "groups", ru: "Группы", en: "Groups", icon: Users },
];

const settingDefinitions = [
  { key: "maintenance_mode", ru: "Режим технических работ", en: "Maintenance mode" },
  { key: "registrations_enabled", ru: "Новые регистрации", en: "New registrations" },
  { key: "public_groups_enabled", ru: "Публичные группы", en: "Public groups" },
  { key: "public_channels_enabled", ru: "Публичные каналы", en: "Public channels" },
];

function errorText(cause: unknown, fallback: string, ru = /[А-Яа-яЁё]/.test(fallback)) {
  return adminErrorMessage(cause, fallback, ru ? "ru" : "en");
}

function shortId(value: string | null | undefined) {
  return value ? value.slice(0, 8) : "—";
}

export default function HeloroSPanel({
  client, user, locale, roles, onOpenNews, onOpenDiscussion,
}: Props) {
  const ru = locale === "ru";
  const isOwner = roles.includes("owner");
  const isAdmin = roles.includes("admin");
  const staff = isOwner || isAdmin || roles.includes("moderator");
  const canManageBadges = isOwner || isAdmin;
  const [tab, setTab] = useState<TabId>("overview");
  const [busy, setBusy] = useState(false);
  const [loadingTab, setLoadingTab] = useState<TabId | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const selectedUserIdRef = useRef<string | null>(null);
  const selectedThreadIdRef = useRef<string | null>(null);
  const userSearchRequestRef = useRef(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  useEffect(() => { selectedUserIdRef.current = selectedUser?.id ?? null; }, [selectedUser]);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [reportDecisions, setReportDecisions] = useState<ReportDecision[]>([]);
  const [threads, setThreads] = useState<AdminThread[]>([]);
  const [selectedThread, setSelectedThread] = useState<AdminThread | null>(null);
  useEffect(() => { selectedThreadIdRef.current = selectedThread?.id ?? null; }, [selectedThread]);
  const [supportMessages, setSupportMessages] = useState<SupportMessage[]>([]);
  const [reply, setReply] = useState("");
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [staffEntries, setStaffEntries] = useState<StaffEntry[]>([]);
  const [settings, setSettings] = useState<SettingEntry[]>([]);
  const [restrictionType, setRestrictionType] = useState("warning");
  const [restrictionReason, setRestrictionReason] = useState("");
  const [restrictionUntil, setRestrictionUntil] = useState("");
  const [roleChoice, setRoleChoice] = useState("admin");
  const [reportNote, setReportNote] = useState<Record<string, string>>({});
  const [badgeType, setBadgeType] = useState<BadgeType>("blue");
  const [communities, setCommunities] = useState<CommunityEntry[]>([]);
  const [communitySearch, setCommunitySearch] = useState("");

  function clearMessages() {
    setError("");
    setNotice("");
  }

  async function loadOverview(isCurrent: () => boolean = () => true) {
    const { data, error: queryError } = await client.rpc("heloro_admin_overview");
    if (queryError) throw queryError;
    if (isCurrent()) setOverview(data as Overview);
  }

  async function loadUsers(query: string, isCurrent: () => boolean = () => true) {
    const raw = query.trim();
    const normalized = normalizeAdminSearch(raw);
    if (raw.length > 0 && normalized.length < 2) {
      if (isCurrent()) setUsers([]);
      return;
    }

    const columns = "id, username, display_name, avatar_url, created_at";
    if (raw.length === 0) {
      const { data, error: queryError } = await client.from("profiles")
        .select(columns).order("created_at", { ascending: false }).limit(30);
      if (queryError) throw queryError;
      if (isCurrent()) setUsers((data ?? []) as AdminUser[]);
      return;
    }

    const pattern = "%" + escapeAdminLikePattern(normalized) + "%";
    const usernameQuery = client.from("profiles").select(columns)
      .ilike("username", pattern).order("created_at", { ascending: false }).limit(30);
    const queries = raw.startsWith("@")
      ? [usernameQuery]
      : [
          usernameQuery,
          client.from("profiles").select(columns)
            .ilike("display_name", pattern).order("created_at", { ascending: false }).limit(30),
        ];
    const results = await Promise.all(queries);
    const failed = results.find((result) => result.error);
    if (failed?.error) throw failed.error;
    const merged = new Map<string, AdminUser>();
    for (const result of results) {
      for (const item of (result.data ?? []) as AdminUser[]) merged.set(item.id, item);
    }
    const items = [...merged.values()]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 30);
    if (isCurrent()) setUsers(items);
  }

  async function loadReports(isCurrent: () => boolean = () => true) {
    const { data, error: queryError } = await client.from("user_reports")
      .select("id, reporter_id, reported_user_id, reason, details, status, created_at, target_type, target_id, review_note")
      .order("created_at", { ascending: false }).limit(100);
    if (queryError) throw queryError;
    const items = (data ?? []) as AdminReport[];
    if (!isCurrent()) return;
    setReports(items);
    if (items.length === 0) { setReportDecisions([]); return; }
    const { data: history, error: historyError } = await client.from("user_report_decisions")
      .select("id, report_id, actor_id, previous_status, next_status, note, created_at")
      .in("report_id", items.map((item) => item.id))
      .order("created_at", { ascending: false });
    if (historyError) throw historyError;
    if (isCurrent()) setReportDecisions((history ?? []) as ReportDecision[]);
  }

  async function loadThreads(isCurrent: () => boolean = () => true): Promise<AdminThread[]> {
    const { data, error: queryError } = await client.from("support_threads")
      .select("id, user_id, status, assigned_to, created_at, updated_at")
      .order("updated_at", { ascending: false }).limit(100);
    if (queryError) throw queryError;
    const items = (data ?? []) as AdminThread[];
    if (isCurrent()) setThreads(items);
    return items;
  }

  async function loadAudit(isCurrent: () => boolean = () => true) {
    const { data, error: queryError } = await client.from("admin_action_logs")
      .select("id, actor_id, target_user_id, target_type, target_id, action, reason, details, created_at")
      .order("created_at", { ascending: false }).limit(100);
    if (queryError) throw queryError;
    if (isCurrent()) setAudit((data ?? []) as AuditEntry[]);
  }

  async function loadStaff(isCurrent: () => boolean = () => true) {
    const { data, error: queryError } = await client.rpc("heloro_admin_list_staff");
    if (queryError) throw queryError;
    const rows = (data ?? []) as StaffEntry[];
    if (rows.length === 0) {
      if (isCurrent()) setStaffEntries([]);
      return;
    }
    const { data: profileRows, error: profileError } = await client.from("profiles")
      .select("id, username, display_name")
      .in("id", rows.map((item) => item.user_id));
    const profileById = new Map((profileRows ?? []).map((item) => [item.id, item]));
    const enriched = rows.map((item) => ({
      ...item,
      username: profileById.get(item.user_id)?.username ?? null,
      display_name: profileById.get(item.user_id)?.display_name ?? null,
    }));
    if (profileError) console.warn("HELORO staff profile lookup failed:", profileError.message);
    if (isCurrent()) setStaffEntries(enriched);
  }

  async function loadCommunities(isCurrent: () => boolean = () => true) {
    const { data, error: queryError } = await client.rpc("heloro_admin_list_communities");
    if (queryError) throw queryError;
    if (isCurrent()) setCommunities((data ?? []) as CommunityEntry[]);
  }

  async function deleteCommunity(item: CommunityEntry) {
    const label = item.name + (item.username ? " (@" + item.username + ")" : "");
    if (!window.confirm(ru ? `Удалить ${item.kind === "group" ? "группу" : "канал"} «${label}» для всех участников? Все сообщения и участники этого сообщества будут удалены. Действие необратимо.` : `Delete ${item.kind} “${label}” for everyone? Its messages and memberships will also be deleted. This cannot be undone.`)) return;
    setBusy(true); clearMessages();
    try {
      const { error: rpcError } = await client.rpc("heloro_admin_delete_community", { p_room_id: item.id });
      if (rpcError) throw rpcError;
      setCommunities((current) => current.filter((row) => row.id !== item.id));
      setNotice(ru ? "Сообщество удалено для всех участников." : "Community deleted for all members.");
      await loadAudit();
    } catch (cause) {
      setError(errorText(cause, ru ? "Не удалось удалить сообщество." : "Could not delete community."));
    } finally { setBusy(false); }
  }

  async function loadSettings() {
    const { data, error: queryError } = await client.from("heloro_settings")
      .select("setting_key, value, updated_at, updated_by")
      .order("setting_key");
    if (queryError) throw queryError;
    setSettings((data ?? []) as SettingEntry[]);
  }

  useEffect(() => {
    let active = true;
    clearMessages();
    const run = async () => {
      try {
        if (tab === "overview") await loadOverview();
        if (tab === "reports") await loadReports();
        if (tab === "support") await loadThreads();
        if (tab === "audit") await loadAudit();
        if (tab === "roles") await loadStaff();
        if (tab === "settings") await loadSettings();
        if (tab === "groups") await loadCommunities();
      } catch (cause) {
        if (active) setError(errorText(cause, ru ? "Не удалось загрузить раздел." : "Could not load this section."));
      }
    };
    if (staff) void run();
    return () => { active = false; };
  }, [client, tab, staff, ru]);

  useEffect(() => {
    if (!["users", "moderation", "verification", "roles"].includes(tab)) return;
    let active = true;
    const timer = window.setTimeout(() => {
      loadUsers(search).catch((cause: unknown) => {
        if (active) setError(errorText(cause, ru ? "Не удалось найти пользователей." : "Could not search users."));
      });
    }, 180);
    return () => { active = false; window.clearTimeout(timer); };
  }, [client, tab, search, ru]);

  useEffect(() => {
    if (!selectedThread) {
      setSupportMessages([]);
      return;
    }
    let active = true;
    getSupportMessages(client, selectedThread.id)
      .then((items) => { if (active) setSupportMessages(items); })
      .catch((cause: unknown) => { if (active) setError(errorText(cause, ru ? "Не удалось загрузить переписку поддержки." : "Could not load support conversation.")); });
    const channel = client.channel("heloro-s-admin-support-"+selectedThread.id)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages", filter: "thread_id=eq."+selectedThread.id }, (payload) => {
        const item = payload.new as SupportMessage;
        setSupportMessages((current) => current.some((row) => row.id === item.id) ? current : [...current, item]);
      }).subscribe();
    return () => { active = false; void client.removeChannel(channel); };
  }, [client, selectedThread, ru]);

  async function applyRestriction() {
    if (!selectedUser || !restrictionReason.trim()) return;
    if (!window.confirm(ru ? "Подтвердить это действие модерации?" : "Confirm this moderation action?")) return;
    if (restrictionType === "temporary_ban" && !restrictionUntil) {
      setError(ru ? "Укажите дату окончания временного ограничения." : "Set an expiry for the temporary restriction.");
      return;
    }
    setBusy(true); clearMessages();
    try {
      const expiresAt = restrictionType === "temporary_ban" ? new Date(restrictionUntil).toISOString() : null;
      const { error: rpcError } = await client.rpc("heloro_admin_apply_restriction", {
        p_target_user_id: selectedUser.id,
        p_restriction_type: restrictionType,
        p_reason: restrictionReason.trim(),
        p_expires_at: expiresAt,
      });
      if (rpcError) throw rpcError;
      setNotice(ru ? "Действие модерации записано." : "Moderation action saved.");
      setRestrictionReason("");
      await loadAudit();
    } catch (cause) {
      setError(errorText(cause, ru ? "Не удалось применить ограничение." : "Could not apply restriction."));
    } finally { setBusy(false); }
  }

  async function revokeRestriction(restrictionId: string) {
    if (!window.confirm(ru ? "Снять это ограничение?" : "Revoke this restriction?")) return;
    setBusy(true); clearMessages();
    try {
      const { error: rpcError } = await client.rpc("heloro_admin_revoke_restriction", {
        p_restriction_id: restrictionId,
        p_reason: ru ? "Снято через HELORO S" : "Revoked from HELORO S",
      });
      if (rpcError) throw rpcError;
      setNotice(ru ? "Ограничение снято." : "Restriction lifted.");
      await loadAudit();
    } catch (cause) {
      setError(errorText(cause, ru ? "Не удалось снять ограничение." : "Could not lift restriction."));
    } finally { setBusy(false); }
  }

  async function loadSelectedRestrictions() {
    if (!selectedUser) return [];
    const { data, error: queryError } = await client.from("account_restrictions")
      .select("id, restriction_type, reason, created_at, expires_at, revoked_at")
      .eq("user_id", selectedUser.id).is("revoked_at", null).order("created_at", { ascending: false });
    if (queryError) throw queryError;
    return ((data ?? []) as { id: string; restriction_type: string; reason: string; created_at: string; expires_at: string | null; revoked_at: string | null }[]).filter((item) => !item.expires_at || new Date(item.expires_at).getTime() > Date.now());
  }

  const [activeRestrictions, setActiveRestrictions] = useState<{ id: string; restriction_type: string; reason: string; created_at: string; expires_at: string | null; revoked_at: string | null }[]>([]);
  useEffect(() => {
    let active = true;
    if (tab !== "moderation" || !selectedUser) { setActiveRestrictions([]); return; }
    loadSelectedRestrictions().then((items) => { if (active) setActiveRestrictions(items); })
      .catch((cause: unknown) => { if (active) setError(errorText(cause, ru ? "Не удалось загрузить ограничения." : "Could not load restrictions.")); });
    return () => { active = false; };
  }, [client, tab, selectedUser]);

  async function updateReport(report: AdminReport, status: string) {
    setBusy(true); clearMessages();
    try {
      const { error: rpcError } = await client.rpc("heloro_admin_update_report", {
        p_report_id: report.id,
        p_status: status,
        p_note: (reportNote[report.id] ?? "").trim(),
      });
      if (rpcError) throw rpcError;
      await loadReports();
      setNotice(ru ? "Решение по жалобе сохранено." : "Report decision saved.");
    } catch (cause) {
      setError(errorText(cause, ru ? "Не удалось обновить жалобу." : "Could not update report."));
    } finally { setBusy(false); }
  }

  async function updateSupport(thread: AdminThread, status: string, assignedTo: string | null) {
    setBusy(true); clearMessages();
    try {
      const { error: rpcError } = await client.rpc("heloro_admin_update_support", {
        p_thread_id: thread.id,
        p_status: status,
        p_assigned_to: assignedTo,
      });
      if (rpcError) throw rpcError;
      await loadThreads();
      setNotice(ru ? "Обращение обновлено." : "Support thread updated.");
    } catch (cause) {
      setError(errorText(cause, ru ? "Не удалось обновить обращение." : "Could not update support thread."));
    } finally { setBusy(false); }
  }

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedThread || !reply.trim()) return;
    setBusy(true); clearMessages();
    try {
      const item = await sendSupportMessage(client, selectedThread.id, user.id, reply.trim());
      setSupportMessages((current) => current.some((row) => row.id === item.id) ? current : [...current, item]);
      setReply("");
      await loadThreads();
    } catch (cause) {
      setError(errorText(cause, ru ? "Не удалось отправить ответ." : "Could not send reply."));
    } finally { setBusy(false); }
  }

  async function changeRole(target: AdminUser, nextRole: string | null) {
    if (!window.confirm(ru ? "Подтвердить изменение роли?" : "Confirm role change?")) return;
    setBusy(true); clearMessages();
    try {
      const { error: rpcError } = await client.rpc("heloro_admin_set_role", {
        p_target_user_id: target.id,
        p_role: nextRole,
      });
      if (rpcError) throw rpcError;
      await loadStaff();
      setNotice(ru ? "Роль обновлена." : "Role updated.");
    } catch (cause) {
      setError(errorText(cause, ru ? "Не удалось изменить роль." : "Could not change role."));
    } finally { setBusy(false); }
  }

  async function saveSetting(settingKey: string, value: boolean) {
    if (!window.confirm(ru ? "Сохранить системную настройку?" : "Save this system setting?")) return;
    setBusy(true); clearMessages();
    try {
      const { error: rpcError } = await client.rpc("heloro_admin_set_setting", {
        p_setting_key: settingKey,
        p_value: value,
      });
      if (rpcError) throw rpcError;
      await loadSettings();
      setNotice(ru ? "Настройка сохранена." : "Setting saved.");
    } catch (cause) {
      setError(errorText(cause, ru ? "Не удалось сохранить настройку." : "Could not save setting."));
    } finally { setBusy(false); }
  }

  async function saveBadge(target: AdminUser) {
    const confirmation = badgeType === "epic_sans"
      ? (ru
        ? "Выдать единственную эксклюзивную отметку Epic Sans этому аккаунту? Её может получить только один аккаунт HELORO."
        : "Grant the exclusive Epic Sans badge to this account? Only one HELORO account can hold it.")
      : (ru ? "Выдать отметку этому аккаунту?" : "Grant a verification badge to this account?");
    if (!window.confirm(confirmation)) return;
    setBusy(true); clearMessages();
    try {
      await setVerificationBadge(client, target.id, user.id, badgeType);
      setNotice(ru ? "Отметка верификации обновлена." : "Verification badge updated.");
      await loadAudit();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "";
      setError(message.includes("epic_sans_badge_already_assigned")
        ? (ru ? "Эксклюзивная отметка Epic Sans уже выдана другому аккаунту." : "The exclusive Epic Sans badge is already assigned to another account.")
        : errorText(cause, ru ? "Не удалось изменить отметку." : "Could not update badge."));
    } finally { setBusy(false); }
  }

  function visibleTabs() {
    return tabItems.filter((item) => {
      if (item.id === "roles" || item.id === "settings") return isOwner;
      if (item.id === "verification") return canManageBadges;
      if (item.id === "security") return isOwner || isAdmin;
      if (item.id === "groups") return isOwner || isAdmin;
      return true;
    });
  }

  if (!staff) return null;

  return (
    <div className="special-panel admin-panel admin-panel-full">
      <header className="chat-header">
        <div className="system-admin-icon"><ShieldCheck size={19} /></div>
        <div className="chat-person"><strong>HELORO S</strong><small>{isOwner ? "HELORO Owner" : isAdmin ? "Admin" : "Moderator"}</small></div>
        <div className="admin-header-status"><span className="admin-status-dot" />{ru ? "Защищённый доступ" : "Protected access"}</div>
      </header>
      <div className="special-stream admin-workspace">
        <p className="system-description">{ru ? "Управление HELORO. Все привилегированные действия проверяются сервером и попадают в журнал." : "HELORO operations. Privileged actions are checked server-side and recorded in the audit log."}</p>
        <nav className="admin-nav-tabs" aria-label={ru ? "Разделы панели" : "Admin sections"}>
          {visibleTabs().map((item) => {
            const Icon = item.icon;
            return <button key={item.id} className={tab === item.id ? "active" : ""} onClick={() => { clearMessages(); setTab(item.id); }}>
              <Icon size={15} /><span>{ru ? item.ru : item.en}</span>
            </button>;
          })}
        </nav>
        {error && <div className="admin-alert admin-alert-error" role="alert"><CircleAlert size={15} />{error}<button onClick={() => setError("")} aria-label={ru ? "Закрыть" : "Dismiss"}><X size={14} /></button></div>}
        {notice && <div className="admin-alert admin-alert-success" role="status"><CheckCircle2 size={15} />{notice}<button onClick={() => setNotice("")} aria-label={ru ? "Закрыть" : "Dismiss"}><X size={14} /></button></div>}

        {tab === "overview" && (
          <section className="admin-section">
            <div className="admin-section-heading"><div><h2>{ru ? "Обзор" : "Overview"}</h2><p>{ru ? "Сводка по активности сервиса" : "Service activity summary"}</p></div><button className="admin-icon-action" onClick={() => void loadOverview()}><RefreshCw size={15} />{ru ? "Обновить" : "Refresh"}</button></div>
            {overview ? <div className="admin-stats-grid">
              {[
                [ru ? "Пользователи" : "Users", overview.users_total],
                [ru ? "Регистрации за 24 ч" : "Sign-ups · 24h", overview.registrations_24h],
                [ru ? "Активные за 24 ч" : "Active · 24h", overview.active_users_24h],
                [ru ? "Сообщения всего" : "Messages total", overview.messages_total],
                [ru ? "Сообщения за 24 ч" : "Messages · 24h", overview.messages_24h],
                [ru ? "Открытые жалобы" : "Open reports", overview.reports_open],
                [ru ? "Открытые обращения" : "Open support", overview.support_open],
                [ru ? "Администраторы / модераторы" : "Admins / moderators", String(overview.admins_total)+" / "+String(overview.moderators_total)],
              ].map(([label,value]) => <article className="admin-stat-card" key={String(label)}><span>{label}</span><strong>{value}</strong></article>)}
            </div> : <p className="admin-muted">{ru ? "Статистика появится после установки серверного обновления." : "Statistics will appear after the backend migration is installed."}</p>}
          </section>
        )}

        {(tab === "users" || tab === "moderation" || tab === "roles" || tab === "verification") && (
          <section className="admin-section">
            <div className="admin-section-heading"><div><h2>{tab === "users" ? (ru ? "Пользователи" : "Users") : tab === "moderation" ? (ru ? "Модерация аккаунтов" : "Account moderation") : tab === "roles" ? (ru ? "Роли и доступ" : "Roles and access") : (ru ? "Верификация" : "Verification")}</h2><p>{ru ? "Поиск по имени или @username" : "Search by name or @username"}</p></div></div>
            <div className="admin-search"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={ru ? "Имя пользователя или @username" : "Display name or @username"} /><button onClick={() => setSearch("")} aria-label={ru ? "Очистить" : "Clear"}><X size={14} /></button></div>
            <div className="admin-user-results">
              {users.map((item) => <button key={item.id} className={"admin-user-row"+(selectedUser?.id === item.id ? " active" : "")} onClick={() => setSelectedUser(item)}>
                <span className="admin-user-avatar">{(item.display_name || item.username || "?").slice(0,1).toUpperCase()}</span>
                <span className="admin-user-copy"><strong>{item.display_name || item.username || "—"}</strong><small>@{item.username || "—"} · {ru ? "регистрация" : "joined"} {new Date(item.created_at).toLocaleDateString()}</small></span>
                <span className="admin-user-select"><Check size={15} /></span>
              </button>)}
              {users.length === 0 && <p className="admin-muted">{ru ? "Введите минимум 2 символа для поиска." : "Enter at least 2 characters to search."}</p>}
            </div>
            {selectedUser && (
              <div className="admin-selected-user">
                <div className="admin-selected-user-heading"><strong>{selectedUser.display_name || selectedUser.username}</strong><span>@{selectedUser.username}</span><small>{ru ? "Регистрация" : "Joined"}: {new Date(selectedUser.created_at).toLocaleString()}</small></div>
                {tab === "moderation" && (
                  <div className="admin-form-stack">
                    <label>{ru ? "Тип действия" : "Action type"}<select value={restrictionType} onChange={(event) => setRestrictionType(event.target.value)}>
                      <option value="warning">{ru ? "Предупреждение" : "Warning"}</option>
                      <option value="temporary_ban">{ru ? "Временное ограничение" : "Temporary restriction"}</option>
                      <option value="freeze" disabled={!isOwner && !isAdmin}>{ru ? "Заморозить аккаунт" : "Freeze account"}</option>
                      <option value="ban" disabled={!isOwner && !isAdmin}>{ru ? "Заблокировать аккаунт" : "Ban account"}</option>
                    </select></label>
                    {restrictionType === "temporary_ban" && <label>{ru ? "Действует до" : "Expires at"}<input type="datetime-local" value={restrictionUntil} onChange={(event) => setRestrictionUntil(event.target.value)} /></label>}
                    <label>{ru ? "Причина (обязательно)" : "Reason (required)"}<textarea rows={2} value={restrictionReason} onChange={(event) => setRestrictionReason(event.target.value)} maxLength={1000} /></label>
                    <button className="admin-primary-action" disabled={busy || !restrictionReason.trim() || selectedUser.id === user.id} onClick={() => void applyRestriction()}><Ban size={15} />{ru ? "Применить действие" : "Apply action"}</button>
                    <div className="admin-active-restrictions"><strong>{ru ? "Активные действия" : "Active actions"}</strong>
                      {activeRestrictions.length === 0 ? <small>{ru ? "Активных ограничений нет." : "No active restrictions."}</small> : activeRestrictions.map((item) => <div key={item.id}><span>{item.restriction_type}: {item.reason}</span><button disabled={busy} onClick={() => void revokeRestriction(item.id)}>{ru ? "Снять" : "Revoke"}</button></div>)}
                    </div>
                  </div>
                )}
                {tab === "roles" && isOwner && <div className="admin-role-editor"><select value={roleChoice} onChange={(event) => setRoleChoice(event.target.value)}><option value="admin">Admin</option><option value="moderator">Moderator</option></select><button disabled={busy || selectedUser.id === user.id} onClick={() => void changeRole(selectedUser, roleChoice)}>{ru ? "Назначить роль" : "Assign role"}</button><button className="admin-secondary-action" disabled={busy || selectedUser.id === user.id} onClick={() => void changeRole(selectedUser, null)}>{ru ? "Снять роль" : "Remove role"}</button></div>}
                {tab === "verification" && canManageBadges && <div className="admin-role-editor"><select value={badgeType} onChange={(event) => setBadgeType(event.target.value as BadgeType)}><option value="blue">{ru ? "Синяя — подтверждённая личность" : "Blue — verified identity"}</option><option value="gold">{ru ? "Золотая — организация" : "Gold — organization"}</option><option value="creator">{ru ? "Автор" : "Creator"}</option><option value="epic_sans" disabled={!isOwner}>{ru ? "Epic Sans — эксклюзивная фиолетовая звезда" : "Epic Sans — exclusive violet star"}</option></select><button disabled={busy} onClick={() => void saveBadge(selectedUser)}>{ru ? "Выдать отметку" : "Grant badge"}</button><button className="admin-secondary-action" disabled={busy} onClick={() => { if (window.confirm(ru ? "Снять отметку верификации?" : "Revoke this verification badge?")) void setVerificationBadge(client, selectedUser.id, user.id, null).then(() => loadAudit()).then(() => setNotice(ru ? "Отметка снята." : "Badge revoked.")).catch((cause: unknown) => setError(errorText(cause, "Could not revoke badge."))); }}>{ru ? "Снять отметку" : "Revoke badge"}</button></div>}
                {tab === "users" && <p className="admin-muted">{ru ? "Доступны только публичные данные профиля. Личные переписки и пароли здесь не отображаются." : "Only public profile information is shown. Private chats and passwords are never displayed here."}</p>}
              </div>
            )}
          </section>
        )}

        {tab === "reports" && (
          <section className="admin-section"><div className="admin-section-heading"><div><h2>{ru ? "Жалобы" : "Reports"}</h2><p>{ru ? "Жалобы на пользователей и ссылки на объекты" : "Reports about users and references to reported objects"}</p></div><button className="admin-icon-action" onClick={() => void loadReports()}><RefreshCw size={15} /></button></div>
            {reports.map((report) => <article className="admin-record-card" key={report.id}>
              <div className="admin-record-heading"><strong>{ru ? "Жалоба" : "Report"} · {report.reason}</strong><span>{report.status}</span></div>
              <small>{ru ? "Тип объекта" : "Target"}: {report.target_type || "user"} · ID: {shortId(report.target_id || report.reported_user_id)} · {new Date(report.created_at).toLocaleString()}</small>
              <p>{report.details || (ru ? "Описание отсутствует." : "No details provided.")}</p>
              <label>{ru ? "Заметка по решению" : "Decision note"}<textarea rows={2} value={reportNote[report.id] ?? report.review_note ?? ""} onChange={(event) => setReportNote((current) => ({ ...current, [report.id]: event.target.value }))} maxLength={1000} /></label>
              {reportDecisions.filter((item) => item.report_id === report.id).map((item) => <small key={item.id} className="admin-decision-history">{new Date(item.created_at).toLocaleString()} · {item.next_status} · {shortId(item.actor_id)}{item.note ? " · "+item.note : ""}</small>)}
              <div className="admin-actions"><button disabled={busy || report.status === "reviewing"} onClick={() => void updateReport(report, "reviewing")}>{ru ? "В работу" : "Review"}</button><button disabled={busy || report.status === "resolved"} onClick={() => void updateReport(report, "resolved")}>{ru ? "Решено" : "Resolve"}</button><button disabled={busy || report.status === "dismissed"} onClick={() => void updateReport(report, "dismissed")}>{ru ? "Отклонить" : "Dismiss"}</button></div>
            </article>)}
            {reports.length === 0 && <p className="admin-muted">{ru ? "Жалоб пока нет." : "No reports yet."}</p>}
            <p className="admin-privacy-note">{ru ? "Для сообщений из личных чатов сохраняется только ссылка на объект жалобы. Содержимое личной переписки администратору не открывается." : "For private-message reports, only the reported object reference is stored. Administrators do not gain access to private chat contents."}</p>
          </section>
        )}

        {tab === "support" && (
          <section className="admin-section"><div className="admin-section-heading"><div><h2>{ru ? "Поддержка" : "Support"}</h2><p>{ru ? "Входящие обращения Support Heloro" : "Support Heloro inbox"}</p></div><button className="admin-icon-action" onClick={() => void loadThreads()}><RefreshCw size={15} /></button></div>
            <div className="admin-support-grid"><div className="admin-record-list">
              {threads.map((thread) => <button key={thread.id} className={"admin-thread-row"+(selectedThread?.id === thread.id ? " active" : "")} onClick={() => setSelectedThread(thread)}><UserRound size={15} /><span>{shortId(thread.user_id)}</span><small>{thread.status || "open"}</small></button>)}
              {threads.length === 0 && <p className="admin-muted">{ru ? "Обращений пока нет." : "No support requests yet."}</p>}
            </div>
            <div className="admin-support-detail">
              {selectedThread ? <>
                <div className="admin-support-controls"><strong>{ru ? "Обращение" : "Support thread"} · {shortId(selectedThread.user_id)}</strong><select value={selectedThread.status || "open"} onChange={(event) => void updateSupport(selectedThread, event.target.value, selectedThread.assigned_to || null)}><option value="open">open</option><option value="in_progress">in_progress</option><option value="resolved">resolved</option><option value="closed">closed</option></select><button disabled={busy} onClick={() => void updateSupport(selectedThread, selectedThread.status || "open", user.id)}>{ru ? "Назначить мне" : "Assign to me"}</button></div>
                <div className="admin-support-messages">{supportMessages.map((item) => <article className={"admin-support-message"+(item.sender_id === user.id ? " mine" : "")} key={item.id}><strong>{item.sender_id === user.id ? (ru ? "Вы" : "You") : (ru ? "Пользователь" : "User")}</strong><p>{item.body}</p><time>{formatMessageTime(item.created_at)}</time></article>)}</div>
                <form className="admin-support-reply" onSubmit={sendReply}><input value={reply} onChange={(event) => setReply(event.target.value)} placeholder={ru ? "Ответить пользователю…" : "Reply to user…"} maxLength={4000} /><button type="submit" disabled={busy || !reply.trim()}><MessageCircle size={15} />{ru ? "Ответить" : "Reply"}</button></form>
              </> : <p className="admin-muted">{ru ? "Выберите обращение." : "Select a support request."}</p>}
            </div></div>
          </section>
        )}

        {tab === "audit" && (
          <section className="admin-section"><div className="admin-section-heading"><div><h2>{ru ? "Журнал действий" : "Audit log"}</h2><p>{ru ? "История привилегированных действий" : "History of privileged actions"}</p></div><button className="admin-icon-action" onClick={() => void loadAudit()}><RefreshCw size={15} /></button></div>
            {audit.map((entry) => <article className="admin-record-card" key={entry.id}><div className="admin-record-heading"><strong>{entry.action}</strong><time>{new Date(entry.created_at).toLocaleString()}</time></div><small>{ru ? "Исполнитель" : "Actor"}: {shortId(entry.actor_id)} · {ru ? "Объект" : "Target"}: {entry.target_type || "user"} / {shortId(entry.target_id || entry.target_user_id)}</small><p>{entry.reason || "—"}</p></article>)}
            {audit.length === 0 && <p className="admin-muted">{ru ? "Записей пока нет." : "No audit events yet."}</p>}
            <p className="admin-privacy-note">{ru ? "Записи доступны только сотрудникам и не редактируются из клиентского приложения." : "Entries are staff-only and cannot be edited from the client app."}</p>
          </section>
        )}

        {tab === "settings" && isOwner && (
          <section className="admin-section"><div className="admin-section-heading"><div><h2>{ru ? "Настройки HELORO" : "HELORO settings"}</h2><p>{ru ? "Системные параметры — только владелец" : "System controls — owner only"}</p></div><button className="admin-icon-action" onClick={() => void loadSettings()}><RefreshCw size={15} /></button></div>
            {settingDefinitions.map((item) => {
              const entry = settings.find((value) => value.setting_key === item.key);
              const checked = entry?.value === true;
              return <label className="admin-setting-row" key={item.key}><span><strong>{ru ? item.ru : item.en}</strong><small>{item.key}</small></span><input type="checkbox" checked={checked} disabled={!entry || busy} onChange={(event) => void saveSetting(item.key, event.target.checked)} /></label>;
            })}
            <p className="admin-privacy-note">{ru ? "Изменение переключателя записывается на сервере и в журнале. Применение отдельных переключателей к регистрации и публичным разделам требует подключения соответствующих runtime-проверок." : "Each setting change is recorded server-side and audited. Applying individual switches to sign-up and public areas requires their runtime guards to be wired."}</p>
          </section>
        )}

        {tab === "security" && (isOwner || isAdmin) && (
          <section className="admin-section"><div className="admin-section-heading"><div><h2>{ru ? "Безопасность панели" : "Panel security"}</h2><p>{ru ? "Границы доступа и защиты данных" : "Access boundaries and data protection"}</p></div></div>
            <div className="admin-security-list">
              <div><ShieldCheck size={18} /><span><strong>{ru ? "Ролевая авторизация на сервере" : "Server-side role authorization"}</strong><small>{ru ? "Проверка роли при каждом привилегированном действии." : "Role is checked for every privileged action."}</small></span><CheckCircle2 size={17} /></div>
              <div><LockKeyhole size={18} /><span><strong>{ru ? "Личные переписки закрыты" : "Private chats are restricted"}</strong><small>{ru ? "Панель не предоставляет поиск или чтение личных сообщений." : "The panel does not provide private-message browsing."}</small></span><CheckCircle2 size={17} /></div>
              <div><FileText size={18} /><span><strong>{ru ? "Аудит привилегированных действий" : "Privileged action auditing"}</strong><small>{ru ? "Роли, ограничения, жалобы, поддержка и настройки." : "Roles, restrictions, reports, support and settings."}</small></span><CheckCircle2 size={17} /></div>
              <div><Ban size={18} /><span><strong>{ru ? "Пароли недоступны персоналу" : "Passwords are never exposed"}</strong><small>{ru ? "Только безопасное восстановление доступа." : "Account recovery remains a secure flow."}</small></span><CheckCircle2 size={17} /></div>
            </div>
            <p className="admin-privacy-note">{ru ? "Перед публичным запуском нужно пройти проверку RLS и тесты с отдельными Owner, Admin, Moderator и обычным аккаунтом." : "Before public launch, validate RLS with separate Owner, Admin, Moderator and regular-user accounts."}</p>
          </section>
        )}

        {tab === "groups" && (isOwner || isAdmin) && (
          <section className="admin-section">
            <div className="admin-section-heading"><div><h2>{ru ? "Группы и сообщества" : "Groups and communities"}</h2><p>{ru ? "Удаление тестовых и других сообществ для всех участников. Официальная поддержка и системный канал здесь не отображаются." : "Delete test and other communities for everyone. Official Support and the system channel are not listed here."}</p></div><button className="admin-icon-action" disabled={busy} onClick={() => void loadCommunities()}><RefreshCw size={15} /></button></div>
            <div className="admin-search"><Search size={16} /><input value={communitySearch} onChange={(event) => setCommunitySearch(event.target.value)} placeholder={ru ? "Поиск по названию или @username" : "Search by name or @username"} /><button onClick={() => setCommunitySearch("")} aria-label={ru ? "Очистить" : "Clear"}><X size={14} /></button></div>
            <div className="admin-user-results">
              {communities.filter((item) => (item.name + " " + (item.username ?? "")).toLowerCase().includes(communitySearch.trim().replace(/^@/, "").toLowerCase())).map((item) => (
                <article className="admin-record-card" key={item.id}>
                  <div className="admin-record-heading"><strong>{item.kind === "group" ? (ru ? "Группа" : "Group") : (ru ? "Канал" : "Channel")} · {item.name}</strong><span>{item.member_count} {ru ? "участников" : "members"}</span></div>
                  <small>{item.username ? "@" + item.username + " · " : ""}{ru ? "Создано" : "Created"}: {new Date(item.created_at).toLocaleString()} · ID: {shortId(item.id)}</small>
                  <div className="admin-actions"><button className="system-delete-button" disabled={busy} onClick={() => void deleteCommunity(item)}><Ban size={14} />{ru ? "Удалить для всех" : "Delete for everyone"}</button></div>
                </article>
              ))}
              {communities.length === 0 && <p className="admin-muted">{ru ? "Сообществ нет или серверное обновление ещё не установлено." : "No communities found, or the backend migration is not installed yet."}</p>}
            </div>
            <p className="admin-privacy-note">{ru ? "Доступ есть только у Owner и Admin. Каждое удаление проверяется на сервере и записывается в журнал действий. Обычные участники и модераторы не могут удалять сообщества через эту панель." : "Only Owner and Admin can use this action. Every deletion is authorized server-side and recorded in the audit log. Members and moderators cannot delete communities from this panel."}</p>
          </section>
        )}

        {tab === "channels" && (
          <section className="admin-section"><div className="admin-section-heading"><div><h2>{ru ? "Официальные каналы" : "Official channels"}</h2><p>{ru ? "Публикации и обсуждения HELORO New" : "HELORO New posts and discussions"}</p></div></div>
            <div className="admin-channel-actions"><button onClick={onOpenNews}><Megaphone size={18} /><span><strong>Heloro New</strong><small>{ru ? "Публикации, закрепление и комментарии" : "Posts, pinning and comments"}</small></span></button><button onClick={onOpenDiscussion}><MessageCircle size={18} /><span><strong>Heloro New — {ru ? "обсуждение" : "discussion"}</strong><small>{ru ? "Связанный групповой чат" : "Linked group discussion"}</small></span></button></div>
          </section>
        )}

        {tab === "roles" && isOwner && (
          <section className="admin-section"><div className="admin-section-heading"><div><h2>{ru ? "Роли и разрешения" : "Roles and permissions"}</h2><p>{ru ? "Только Owner назначает Admin и Moderator" : "Only Owner can appoint Admin and Moderator"}</p></div><button className="admin-icon-action" onClick={() => void loadStaff()}><RefreshCw size={15} /></button></div>
            <div className="admin-role-list">{staffEntries.map((entry) => <article key={entry.user_id}><span className="admin-user-avatar"><ShieldCheck size={15} /></span><span><strong>{entry.role}</strong><small>{shortId(entry.user_id)} · {new Date(entry.granted_at).toLocaleString()}</small></span></article>)}</div>
            <p className="admin-privacy-note">{ru ? "Owner не может изменить собственную роль через эту панель. Назначение Owner не выполняется через обычный интерфейс ролей." : "Owner cannot change their own role here. Owner assignment is intentionally excluded from the regular role editor."}</p>
          </section>
        )}
      </div>
    </div>
  );
}
