import { useEffect, useState } from "react";
import {
  ArrowLeft, Bell, Bookmark, Bot, Check, ChevronRight, CircleHelp, Cloud, Folder, Gift,
  Headphones, History, Laptop, LockKeyhole, Megaphone, MessageCircle, Moon,
  Palette, Phone, Settings, ShieldCheck, Sun, Users, X,
} from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "../../lib/types";
import type { Locale } from "../../lib/i18n";
import type { ThemePreference } from "../../lib/preferences";

type NavigationProps = {
  profile: Profile;
  locale: Locale;
  roles: string[];
  onClose: () => void;
  onOpenInbox: () => void;
  onOpenContacts: () => void;
  onCreateGroup: () => void;
  onCreateChannel: () => void;
  onOpenNews: () => void;
  onOpenSupport: () => void;
  onOpenSettings: () => void;
  onOpenBots: () => void;
  onOpenAdmin: () => void;
};

export function MessengerNavigation({
  profile, locale, roles, onClose, onOpenInbox, onOpenContacts, onCreateGroup,
  onCreateChannel, onOpenNews, onOpenSupport, onOpenSettings, onOpenBots, onOpenAdmin,
}: NavigationProps) {
  const ru = locale === "ru";
  const staff = roles.some((role) => role === "owner" || role === "admin" || role === "moderator");
  function run(action: () => void) { onClose(); action(); }

  return (
    <div className="navigation-overlay" onClick={onClose}>
      <aside className="navigation-drawer" role="dialog" aria-modal="true" aria-label={ru ? "Главное меню HELORO" : "HELORO main menu"} onClick={(event) => event.stopPropagation()}>
        <header className="navigation-profile">
          <div className="navigation-profile-top">
            <div className="brand-lockup"><div className="brand-symbol">H</div><span>HELORO</span></div>
            <button className="icon-button" type="button" onClick={onClose} aria-label={ru ? "Закрыть меню" : "Close menu"}><X size={19} /></button>
          </div>
          <div className="navigation-user">
            <div className="avatar navigation-avatar">{profile.avatar_url ? <img src={profile.avatar_url} alt="" loading="lazy" /> : (profile.display_name || "H").trim().slice(0, 1).toUpperCase()}</div>
            <div className="navigation-user-copy"><strong>{profile.display_name}</strong><small>@{profile.username}</small></div>
            {roles.includes("owner") && <ShieldCheck size={17} className="navigation-owner-mark" />}
          </div>
        </header>
        <nav className="navigation-menu" aria-label={ru ? "Разделы" : "Sections"}>
          <div className="navigation-group-label">{ru ? "МЕССЕНДЖЕР" : "MESSENGER"}</div>
          <button type="button" className="navigation-item" onClick={() => run(onOpenInbox)}><MessageCircle size={19} /><span>{ru ? "Сообщения" : "Messages"}</span></button>
          <button type="button" className="navigation-item" onClick={() => run(onOpenContacts)}><Users size={19} /><span>{ru ? "Контакты" : "Contacts"}</span></button>
          <button type="button" className="navigation-item" onClick={() => run(onCreateGroup)}><Users size={19} /><span>{ru ? "Новая группа" : "New group"}</span></button>
          <button type="button" className="navigation-item" onClick={() => run(onCreateChannel)}><Megaphone size={19} /><span>{ru ? "Новый канал" : "New channel"}</span></button>
          <button type="button" className="navigation-item" onClick={() => run(onOpenNews)}><Megaphone size={19} /><span>Heloro New</span></button>
          <button type="button" className="navigation-item" onClick={() => run(onOpenSupport)}><Headphones size={19} /><span>Support Heloro</span></button>
          <div className="navigation-separator" />
          <div className="navigation-group-label">{ru ? "ВОЗМОЖНОСТИ" : "FEATURES"}</div>
          <button type="button" className="navigation-item navigation-item-disabled" disabled><History size={19} /><span>{ru ? "Истории" : "Stories"}</span><small>{ru ? "Скоро" : "Soon"}</small></button>
          <button type="button" className="navigation-item navigation-item-disabled" disabled><Bookmark size={19} /><span>{ru ? "Избранное" : "Saved Messages"}</span><small>{ru ? "Скоро" : "Soon"}</small></button>
          <button type="button" className="navigation-item navigation-item-disabled" disabled><Folder size={19} /><span>{ru ? "Папки чатов" : "Chat folders"}</span><small>{ru ? "Скоро" : "Soon"}</small></button>
          <button type="button" className="navigation-item" onClick={() => run(onOpenBots)}><Bot size={19} /><span>{ru ? "Боты" : "Bots"}</span><ChevronRight size={16} className="navigation-chevron" /></button>
          <button type="button" className="navigation-item navigation-item-disabled" disabled><Phone size={19} /><span>{ru ? "Звонки" : "Calls"}</span><small>{ru ? "Ожидают настройки" : "Not enabled"}</small></button>
          <div className="navigation-separator" />
          <div className="navigation-group-label">{ru ? "АККАУНТ" : "ACCOUNT"}</div>
          <button type="button" className="navigation-item" onClick={() => run(onOpenSettings)}><Settings size={19} /><span>{ru ? "Настройки" : "Settings"}</span><ChevronRight size={16} className="navigation-chevron" /></button>
          {staff && <button type="button" className="navigation-item navigation-staff-item" onClick={() => run(onOpenAdmin)}><ShieldCheck size={19} /><span>HELORO S</span><ChevronRight size={16} className="navigation-chevron" /></button>}
        </nav>
        <footer className="navigation-footer"><span>HELORO</span><small>{ru ? "Мессенджер" : "Messenger"}</small></footer>
      </aside>
    </div>
  );
}

export type SettingsSection =
  | "account" | "notifications" | "privacy" | "devices" | "calls" | "appearance"
  | "language" | "chats" | "storage" | "help" | "plus" | "bots" | "staff";

type UserPreferences = {
  message_notifications: boolean;
  theme_preference: ThemePreference;
  interface_language: Locale;
  account_settings_initialized: boolean;
  group_notifications: boolean;
  sound_enabled: boolean;
  preview_enabled: boolean;
  last_seen_visibility: "everyone" | "contacts" | "nobody";
  profile_photo_visibility: "everyone" | "contacts" | "nobody";
  allow_group_invites: boolean;
  auto_download_media: "never" | "wifi" | "always";
};

const defaultPreferences: UserPreferences = {
  message_notifications: true,
  theme_preference: "system",
  interface_language: "ru",
  account_settings_initialized: false,
  group_notifications: true,
  sound_enabled: true,
  preview_enabled: true,
  last_seen_visibility: "everyone",
  profile_photo_visibility: "everyone",
  allow_group_invites: true,
  auto_download_media: "wifi",
};

type SettingsProps = {
  client: SupabaseClient;
  userId: string;
  profile: Profile;
  locale: Locale;
  roles: string[];
  theme: ThemePreference;
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  onThemeChange: (theme: ThemePreference) => void;
  onLocaleChange: (locale: Locale) => void;
  onClose: () => void;
  onOpenMyProfile: () => void;
  onOpenSupport: () => void;
  onOpenBots: () => void;
  onOpenAdmin: () => void;
  onSignOut: () => void;
};

const settingItems: {
  id: SettingsSection;
  label: { ru: string; en: string };
  Icon: typeof Settings;
  available: boolean;
}[] = [
  { id: "account", label: { ru: "Мой аккаунт", en: "My account" }, Icon: Users, available: true },
  { id: "notifications", label: { ru: "Уведомления", en: "Notifications" }, Icon: Bell, available: true },
  { id: "privacy", label: { ru: "Конфиденциальность", en: "Privacy" }, Icon: LockKeyhole, available: true },
  { id: "devices", label: { ru: "Устройства", en: "Devices" }, Icon: Laptop, available: false },
  { id: "calls", label: { ru: "Звонки", en: "Calls" }, Icon: Phone, available: false },
  { id: "appearance", label: { ru: "Оформление", en: "Appearance" }, Icon: Palette, available: true },
  { id: "language", label: { ru: "Язык", en: "Language" }, Icon: Cloud, available: true },
  { id: "chats", label: { ru: "Настройки чатов", en: "Chat settings" }, Icon: MessageCircle, available: true },
  { id: "storage", label: { ru: "Данные и память", en: "Data and storage" }, Icon: Folder, available: true },
  { id: "bots", label: { ru: "Мои боты", en: "My bots" }, Icon: Bot, available: true },
  { id: "help", label: { ru: "Помощь", en: "Help" }, Icon: CircleHelp, available: true },
  { id: "plus", label: { ru: "HELORO PLUS", en: "HELORO PLUS" }, Icon: Gift, available: true },
];

function SettingsNotice({ title, text, locale }: { title: string; text: string; locale: Locale }) {
  return <div className="settings-coming-card"><span className="settings-coming-icon"><LockKeyhole size={20} /></span><div><strong>{title}</strong><p>{text}</p><small>{locale === "ru" ? "Этот раздел подключается отдельным этапом." : "This section will be connected in a separate stage."}</small></div></div>;
}

function ToggleRow({ title, description, checked, onChange, disabled = false }: { title: string; description?: string; checked: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <label className="settings-toggle-row">
      <span className="settings-toggle-copy"><strong>{title}</strong>{description && <small>{description}</small>}</span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span className="settings-toggle-track" />
    </label>
  );
}

function SettingsHomeRow({
  title, description, Icon, onClick, disabled = false, trailing,
}: {
  title: string;
  description: string;
  Icon: typeof Settings;
  onClick: () => void;
  disabled?: boolean;
  trailing?: string;
}) {
  return (
    <button className="settings-home-row" type="button" onClick={onClick} disabled={disabled}>
      <span className="settings-home-icon"><Icon size={19} strokeWidth={1.8} /></span>
      <span className="settings-home-copy"><strong>{title}</strong><small>{description}</small></span>
      <span className="settings-home-trailing">{trailing ?? <ChevronRight size={17} />}</span>
    </button>
  );
}

export function MessengerSettings({
  client, userId, profile, locale, roles, theme, activeSection, onSectionChange,
  onThemeChange, onLocaleChange, onClose, onOpenMyProfile, onOpenSupport,
  onOpenBots, onOpenAdmin, onSignOut,
}: SettingsProps) {
  const ru = locale === "ru";
  const staff = roles.some((role) => role === "owner" || role === "admin" || role === "moderator");
  const items = staff
    ? [...settingItems, { id: "staff" as const, label: { ru: "HELORO S", en: "HELORO S" }, Icon: ShieldCheck, available: true }]
    : settingItems;
  const title = items.find((item) => item.id === activeSection)?.label[locale] ?? (ru ? "Настройки" : "Settings");
  const [settingsHome, setSettingsHome] = useState(activeSection === "account");
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences);
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [savingPreference, setSavingPreference] = useState(false);
  const [preferencesError, setPreferencesError] = useState("");

  useEffect(() => {
    let active = true;
    setPreferencesLoading(true);
    void (async () => {
      try {
        const columns = "message_notifications, group_notifications, sound_enabled, preview_enabled, last_seen_visibility, profile_photo_visibility, allow_group_invites, auto_download_media, theme_preference, interface_language, account_settings_initialized";
        const { data, error } = await client.from("user_preferences")
          .select(columns)
          .eq("user_id", userId).maybeSingle();
        if (!active) return;
        if (error) {
          setPreferencesError(error.message);
          return;
        }
        if (data?.account_settings_initialized) {
          const loaded = { ...defaultPreferences, ...data } as UserPreferences;
          setPreferences(loaded);
          onThemeChange(loaded.theme_preference);
          onLocaleChange(loaded.interface_language);
          return;
        }

        // On the first settings visit, preserve this device's existing local choices,
        // then use the account row as the cross-device source of truth.
        const baseline = {
          ...(data ?? defaultPreferences),
          theme_preference: theme,
          interface_language: locale,
          account_settings_initialized: true,
        };
        const { data: initialized, error: saveError } = await client.from("user_preferences")
          .upsert({ user_id: userId, ...baseline }, { onConflict: "user_id" })
          .select(columns)
          .single();
        if (!active) return;
        if (saveError) setPreferencesError(saveError.message);
        else if (initialized) setPreferences({ ...defaultPreferences, ...initialized } as UserPreferences);
      } catch (cause) {
        if (active) setPreferencesError(cause instanceof Error ? cause.message : "Could not load preferences.");
      } finally {
        if (active) setPreferencesLoading(false);
      }
    })();
    return () => { active = false; };
  }, [client, userId, onThemeChange, onLocaleChange]);

  async function updatePreference<K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) {
    const previous = preferences;
    const next = { ...preferences, [key]: value };
    setPreferences(next);
    setSavingPreference(true);
    setPreferencesError("");
    const { error } = await client.from("user_preferences").upsert(
      { user_id: userId, ...next, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    if (error) {
      setPreferences(previous);
      if (key === "theme_preference") onThemeChange(previous.theme_preference);
      if (key === "interface_language") onLocaleChange(previous.interface_language);
      setPreferencesError(error.message);
    }
    setSavingPreference(false);
  }

  const savingLabel = savingPreference ? (ru ? "Сохранение…" : "Saving…") : preferencesLoading ? (ru ? "Загрузка настроек…" : "Loading settings…") : (ru ? "Настройки синхронизированы с аккаунтом" : "Settings synced to your account");
  useEffect(() => {
    setSettingsHome(activeSection === "account");
  }, [activeSection]);

  const settingGroups: { title: string; ids: SettingsSection[] }[] = [
    { title: ru ? "АККАУНТ" : "ACCOUNT", ids: ["notifications", "privacy", "devices", "calls"] },
    { title: ru ? "НАСТРОЙКИ" : "SETTINGS", ids: ["appearance", "language", "chats", "storage"] },
    { title: ru ? "ПРИЛОЖЕНИЕ" : "APP", ids: ["bots", "help", "plus", ...(staff ? ["staff" as const] : [])] },
  ];

  const settingDescriptions: Record<SettingsSection, string> = {
    account: ru ? "Профиль и данные аккаунта" : "Profile and account details",
    notifications: ru ? "Личные сообщения, группы и звуки" : "Direct messages, groups and sounds",
    privacy: ru ? "Последняя активность, фото и приглашения" : "Last seen, profile photos and invites",
    devices: ru ? "Активные сеансы и входы" : "Active sessions and sign-ins",
    calls: ru ? "Аудио- и видеозвонки" : "Audio and video calls",
    appearance: ru ? (theme === "dark" ? "Тёмная тема" : theme === "light" ? "Светлая тема" : "Как на устройстве") : (theme === "dark" ? "Dark theme" : theme === "light" ? "Light theme" : "Use device setting"),
    language: ru ? (locale === "ru" ? "Русский" : "English") : (locale === "ru" ? "Russian" : "English"),
    chats: ru ? "Предпросмотр и поведение чатов" : "Chat previews and behavior",
    storage: ru ? "Автозагрузка медиа" : "Automatic media download",
    bots: ru ? "Создание и управление ботами" : "Create and manage bots",
    help: ru ? "Связаться с командой поддержки" : "Contact the support team",
    plus: ru ? "Награды и возможности HELORO" : "HELORO rewards and features",
    staff: ru ? "Модерация и администрирование" : "Moderation and administration",
  };

  return (
    <div className="settings-overlay settings-page-overlay" onClick={onClose}>
      <section className="settings-page-card" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(event) => event.stopPropagation()}>
        <header className="settings-page-header">
          <div className="settings-page-header-copy">
            <span className="settings-page-eyebrow">HELORO</span>
            <h2 id="settings-title">{settingsHome ? (ru ? "Настройки" : "Settings") : title}</h2>
          </div>
          <button
            className="icon-button settings-header-back"
            type="button"
            onClick={() => {
              if (settingsHome) onClose();
              else onSectionChange("account");
            }}
            aria-label={settingsHome ? (ru ? "Закрыть настройки" : "Close settings") : (ru ? "Назад к настройкам" : "Back to settings")}
          >
            {settingsHome ? <X size={20} /> : <ArrowLeft size={20} />}
          </button>
        </header>
        <div className="settings-page-body">
          <div className="settings-content">
            {settingsHome ? (
              <div className="settings-home">
                <button className="settings-home-profile" type="button" onClick={onOpenMyProfile}>
                  <span className="avatar settings-home-avatar">
                    {profile.avatar_url ? <img src={profile.avatar_url} alt="" loading="lazy" /> : (profile.display_name || "H").trim().slice(0, 1).toUpperCase()}
                  </span>
                  <span className="settings-home-profile-copy">
                    <strong>{profile.display_name || (ru ? "Пользователь" : "User")}</strong>
                    <small>@{profile.username}</small>
                    {roles.includes("owner") && <em><ShieldCheck size={13} /> {ru ? "Владелец HELORO" : "HELORO Owner"}</em>}
                  </span>
                  <ChevronRight size={19} />
                </button>
                {settingGroups.map((group) => (
                  <section className="settings-home-section" key={group.title}>
                    <h3>{group.title}</h3>
                    <div className="settings-home-group">
                      {group.ids.map((id) => {
                        const item = items.find((candidate) => candidate.id === id);
                        if (!item) return null;
                        const disabled = !item.available;
                        return (
                          <SettingsHomeRow
                            key={id}
                            title={item.label[locale]}
                            description={settingDescriptions[id]}
                            Icon={item.Icon}
                            disabled={disabled}
                            trailing={disabled ? (ru ? "Скоро" : "Soon") : undefined}
                            onClick={() => {
                              if (disabled) return;
                              onSectionChange(id);
                            }}
                          />
                        );
                      })}
                    </div>
                  </section>
                ))}
                <button className="settings-home-signout" type="button" onClick={onSignOut}>
                  {ru ? "Выйти из аккаунта" : "Sign out"}
                </button>
              </div>
            ) : (
              <>
                <div className="settings-content-heading"><h3>{title}</h3></div>
            {activeSection === "account" && (
              <div className="settings-section-content">
                <div className="settings-account-card">
                  <div className="avatar settings-account-avatar">{profile.avatar_url ? <img src={profile.avatar_url} alt="" loading="lazy" /> : (profile.display_name || "H").trim().slice(0, 1).toUpperCase()}</div>
                  <div><strong>{profile.display_name}</strong><small>@{profile.username}</small></div>
                  {roles.includes("owner") && <span className="settings-account-owner"><ShieldCheck size={14} /> {ru ? "Владелец" : "Owner"}</span>}
                </div>
                <div className="settings-info-row"><span>{ru ? "Имя профиля" : "Profile name"}</span><strong>{profile.display_name}</strong></div>
                <div className="settings-info-row"><span>HELORO ID</span><strong>@{profile.username}</strong></div>
                <button type="button" className="settings-action-button" onClick={onOpenMyProfile}><Users size={18} /> {ru ? "Открыть мой профиль" : "Open my profile"}</button>
                <button type="button" className="settings-signout" onClick={onSignOut}><span>{ru ? "Выйти с этого устройства" : "Sign out on this device"}</span></button>
              </div>
            )}
            {activeSection === "notifications" && (
              <div className="settings-section-content">
                <p className="settings-description">{ru ? "Сохрани предпочтения уведомлений. Push-уведомления будут подключены отдельно." : "Save your notification preferences. Push delivery will be connected separately."}</p>
                <div className="settings-toggle-list">
                  <ToggleRow title={ru ? "Личные сообщения" : "Direct messages"} description={ru ? "Уведомления о новых личных сообщениях." : "Notify about new direct messages."} checked={preferences.message_notifications} onChange={(v) => void updatePreference("message_notifications", v)} disabled={preferencesLoading || savingPreference} />
                  <ToggleRow title={ru ? "Группы и каналы" : "Groups and channels"} description={ru ? "Уведомления из сообществ." : "Notifications from communities."} checked={preferences.group_notifications} onChange={(v) => void updatePreference("group_notifications", v)} disabled={preferencesLoading || savingPreference} />
                  <ToggleRow title={ru ? "Звуки" : "Sounds"} description={ru ? "Предпочтение звуковых уведомлений." : "Preference for notification sounds."} checked={preferences.sound_enabled} onChange={(v) => void updatePreference("sound_enabled", v)} disabled={preferencesLoading || savingPreference} />
                  <ToggleRow title={ru ? "Предпросмотр сообщений" : "Message previews"} description={ru ? "Разрешить показывать текст в уведомлениях." : "Allow message text in notifications."} checked={preferences.preview_enabled} onChange={(v) => void updatePreference("preview_enabled", v)} disabled={preferencesLoading || savingPreference} />
                </div>
                <p className="settings-save-state">{savingLabel}</p>
                {preferencesError && <p className="settings-save-state settings-save-error">{preferencesError}</p>}
              </div>
            )}
            {activeSection === "privacy" && (
              <div className="settings-section-content">
                <p className="settings-description">{ru ? "Предпочтения сохраняются в аккаунте. Отображение статуса «в сети» и разграничение контактов будут включены после внедрения presence и системы контактов." : "Preferences are saved to your account. Online status and contact-based visibility will apply after presence and contacts are implemented."}</p>
                <label className="settings-select-row">{ru ? "Кто видит время последней активности" : "Who can see last seen"}
                  <select value={preferences.last_seen_visibility} onChange={(event) => void updatePreference("last_seen_visibility", event.target.value as UserPreferences["last_seen_visibility"])} disabled={preferencesLoading || savingPreference}>
                    <option value="everyone">{ru ? "Все" : "Everybody"}</option><option value="contacts">{ru ? "Контакты" : "Contacts"}</option><option value="nobody">{ru ? "Никто" : "Nobody"}</option>
                  </select>
                </label>
                <label className="settings-select-row">{ru ? "Кто видит фото профиля" : "Who can see profile photos"}
                  <select value={preferences.profile_photo_visibility} onChange={(event) => void updatePreference("profile_photo_visibility", event.target.value as UserPreferences["profile_photo_visibility"])} disabled={preferencesLoading || savingPreference}>
                    <option value="everyone">{ru ? "Все" : "Everybody"}</option><option value="contacts">{ru ? "Контакты" : "Contacts"}</option><option value="nobody">{ru ? "Никто" : "Nobody"}</option>
                  </select>
                </label>
                <div className="settings-toggle-list"><ToggleRow title={ru ? "Приглашения в группы" : "Group invitations"} description={ru ? "Разрешить добавлять аккаунт в группы." : "Allow others to add this account to groups."} checked={preferences.allow_group_invites} onChange={(v) => void updatePreference("allow_group_invites", v)} disabled={preferencesLoading || savingPreference} /></div>
                <p className="settings-save-state">{savingLabel}</p>
                {preferencesError && <p className="settings-save-state settings-save-error">{preferencesError}</p>}
              </div>
            )}
            {activeSection === "devices" && <SettingsNotice locale={locale} title={ru ? "Активные устройства" : "Active devices"} text={ru ? "Безопасный список всех сеансов и удалённое завершение отдельных устройств ещё не подключены. Сейчас можно завершить текущий сеанс через раздел «Мой аккаунт»." : "The secure session list and remote sign-out are not connected yet. You can sign out of the current session in My account."} />}
            {activeSection === "calls" && <SettingsNotice locale={locale} title={ru ? "Аудио- и видеозвонки" : "Audio and video calls"} text={ru ? "Звонки остаются отключёнными до настройки безопасного медиарелея и нагрузочной проверки. Прямое соединение без релея может раскрыть сетевой адрес собеседнику." : "Calls stay disabled until a safe media relay is configured and load-tested. Direct peer connections can expose a participant’s network address."} />}
            {activeSection === "appearance" && (
              <div className="settings-section-content">
                <p className="settings-description">{ru ? "Выберите светлое или тёмное оформление HELORO." : "Choose the HELORO light or dark appearance."}</p>
                <div className="theme-choice-list">
                  <button type="button" className={theme === "light" ? "active" : ""} aria-pressed={theme === "light"} onClick={() => { onThemeChange("light"); void updatePreference("theme_preference", "light"); }}><Sun size={18} /><span>{ru ? "Светлая" : "Light"}</span>{theme === "light" && <Check size={17} />}</button>
                  <button type="button" className={theme === "dark" ? "active" : ""} aria-pressed={theme === "dark"} onClick={() => { onThemeChange("dark"); void updatePreference("theme_preference", "dark"); }}><Moon size={18} /><span>{ru ? "Тёмная" : "Dark"}</span>{theme === "dark" && <Check size={17} />}</button>
                  <button type="button" className={theme === "system" ? "active" : ""} aria-pressed={theme === "system"} onClick={() => { onThemeChange("system"); void updatePreference("theme_preference", "system"); }}><Cloud size={18} /><span>{ru ? "Как на устройстве" : "Use device setting"}</span>{theme === "system" && <Check size={17} />}</button>
                </div>
                <p className="settings-muted-note">{ru ? "Тема сохраняется в браузере на этом устройстве." : "The theme preference is stored in this browser on this device."}</p>
              </div>
            )}
            {activeSection === "language" && (
              <div className="settings-section-content">
                <p className="settings-description">{ru ? "Язык интерфейса приложения." : "Application interface language."}</p>
                <div className="theme-choice-list">
                  <button type="button" className={locale === "ru" ? "active" : ""} aria-pressed={locale === "ru"} onClick={() => { onLocaleChange("ru"); void updatePreference("interface_language", "ru"); }}><span>Русский</span>{locale === "ru" && <Check size={17} />}</button>
                  <button type="button" className={locale === "en" ? "active" : ""} aria-pressed={locale === "en"} onClick={() => { onLocaleChange("en"); void updatePreference("interface_language", "en"); }}><span>English</span>{locale === "en" && <Check size={17} />}</button>
                </div>
              </div>
            )}
            {activeSection === "chats" && (
              <div className="settings-section-content">
                <p className="settings-description">{ru ? "Основные параметры переписки." : "General conversation preferences."}</p>
                <div className="settings-toggle-list"><ToggleRow title={ru ? "Предпросмотр текста в уведомлениях" : "Show text in notifications"} description={ru ? "Можно отключить содержимое сообщений в уведомлениях." : "Hide message content from notifications."} checked={preferences.preview_enabled} onChange={(v) => void updatePreference("preview_enabled", v)} disabled={preferencesLoading || savingPreference} /></div>
                <p className="settings-save-state">{savingLabel}</p>
              </div>
            )}
            {activeSection === "storage" && (
              <div className="settings-section-content">
                <p className="settings-description">{ru ? "Выбери, когда HELORO сможет автоматически загружать медиа. Загрузка в фоне будет подключена после реализации соответствующего механизма." : "Choose when HELORO may automatically download media. Background downloading will be connected when that feature is implemented."}</p>
                <label className="settings-select-row">{ru ? "Автозагрузка медиа" : "Automatic media download"}
                  <select value={preferences.auto_download_media} onChange={(event) => void updatePreference("auto_download_media", event.target.value as UserPreferences["auto_download_media"])} disabled={preferencesLoading || savingPreference}>
                    <option value="never">{ru ? "Никогда" : "Never"}</option><option value="wifi">{ru ? "Только Wi-Fi" : "Wi-Fi only"}</option><option value="always">{ru ? "Wi-Fi и мобильная сеть" : "Wi-Fi and mobile data"}</option>
                  </select>
                </label>
                <p className="settings-save-state">{savingLabel}</p>
              </div>
            )}
            {activeSection === "bots" && (
              <div className="settings-section-content">
                <div className="settings-bots-card"><div><Bot size={21} /><strong>{ru ? "Боты HELORO" : "HELORO bots"}</strong></div><p>{ru ? "Создавай ботов, задавай им команды, настраивай ответы и управляй доступом." : "Create bots, configure commands and replies, and manage access."}</p><button type="button" className="settings-action-button" onClick={onOpenBots}><Bot size={18} />{ru ? "Открыть ботов" : "Open bots"}</button></div>
              </div>
            )}
            {activeSection === "help" && (
              <div className="settings-section-content">
                <p className="settings-description">{ru ? "Нужна помощь с HELORO? Открой личный чат с командой поддержки." : "Need help with HELORO? Open a private chat with the support team."}</p>
                <button type="button" className="settings-action-button" onClick={onOpenSupport}><Headphones size={18} /> {ru ? "Открыть Support Heloro" : "Open Support Heloro"}</button>
              </div>
            )}
            {activeSection === "plus" && (
              <div className="settings-section-content">
                <div className="settings-plus-banner"><Gift size={25} /><div><strong>HELORO PLUS</strong><span>{ru ? "Постоянная награда за события" : "Permanent event reward"}</span></div></div>
                <p className="settings-description">{ru ? "PLUS задуман как награда за праздничные события. Полученный PLUS остаётся навсегда. Полный набор праздничных значков должен открывать HELORO X." : "PLUS is planned as a reward for seasonal events. Earned PLUS stays permanently. The complete holiday badge set is planned to unlock HELORO X."}</p>
                <p className="settings-muted-note">{ru ? "Система наград пока находится в разработке." : "The rewards system is still in development."}</p>
              </div>
            )}
            {activeSection === "staff" && staff && (
              <div className="settings-section-content">
                <div className="settings-staff-banner"><ShieldCheck size={25} /><div><strong>HELORO S</strong><span>{ru ? "Рабочее пространство команды" : "Staff workspace"}</span></div></div>
                <p className="settings-description">{ru ? "Жалобы, обращения в поддержку и управление галочками." : "Reports, support conversations and verification management."}</p>
                <button type="button" className="settings-action-button" onClick={onOpenAdmin}><ShieldCheck size={18} /> {ru ? "Открыть HELORO S" : "Open HELORO S"}</button>
              </div>
            )}
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
