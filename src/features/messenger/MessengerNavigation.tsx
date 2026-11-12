import {
  Bell,
  Bookmark,
  Bot,
  Check,
  ChevronRight,
  CircleHelp,
  Cloud,
  Folder,
  Gift,
  Headphones,
  History,
  Laptop,
  LockKeyhole,
  Megaphone,
  MessageCircle,
  Moon,
  Palette,
  Settings,
  ShieldCheck,
  Sun,
  Users,
  X,
} from "lucide-react";
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
  onOpenNews: () => void;
  onOpenSupport: () => void;
  onOpenSettings: () => void;
  onOpenAdmin: () => void;
};

export function MessengerNavigation({
  profile,
  locale,
  roles,
  onClose,
  onOpenInbox,
  onOpenContacts,
  onOpenNews,
  onOpenSupport,
  onOpenSettings,
  onOpenAdmin,
}: NavigationProps) {
  const ru = locale === "ru";
  const staff = roles.some((role) => role === "owner" || role === "admin" || role === "moderator");

  function run(action: () => void) {
    onClose();
    action();
  }

  return (
    <div className="navigation-overlay" onClick={onClose}>
      <aside
        className="navigation-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={ru ? "Главное меню HELORO" : "HELORO main menu"}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="navigation-profile">
          <div className="navigation-profile-top">
            <div className="brand-lockup"><div className="brand-symbol">H</div><span>HELORO</span></div>
            <button className="icon-button" type="button" onClick={onClose} aria-label={ru ? "Закрыть меню" : "Close menu"}><X size={19} /></button>
          </div>
          <div className="navigation-user">
            <div className="avatar navigation-avatar">{(profile.display_name || "H").trim().slice(0, 1).toUpperCase()}</div>
            <div className="navigation-user-copy">
              <strong>{profile.display_name}</strong>
              <small>@{profile.username}</small>
            </div>
            {roles.includes("owner") && <ShieldCheck size={17} className="navigation-owner-mark" />}
          </div>
        </header>

        <nav className="navigation-menu" aria-label={ru ? "Разделы" : "Sections"}>
          <div className="navigation-group-label">{ru ? "МЕССЕНДЖЕР" : "MESSENGER"}</div>
          <button type="button" className="navigation-item" onClick={() => run(onOpenInbox)}><MessageCircle size={19} /><span>{ru ? "Сообщения" : "Messages"}</span></button>
          <button type="button" className="navigation-item" onClick={() => run(onOpenContacts)}><Users size={19} /><span>{ru ? "Контакты" : "Contacts"}</span></button>
          <button type="button" className="navigation-item" onClick={() => run(onOpenNews)}><Megaphone size={19} /><span>Heloro New</span></button>
          <button type="button" className="navigation-item" onClick={() => run(onOpenSupport)}><Headphones size={19} /><span>Support Heloro</span></button>

          <div className="navigation-separator" />
          <div className="navigation-group-label">{ru ? "ВОЗМОЖНОСТИ" : "FEATURES"}</div>
          <button type="button" className="navigation-item navigation-item-disabled" disabled><History size={19} /><span>{ru ? "Истории" : "Stories"}</span><small>{ru ? "Скоро" : "Soon"}</small></button>
          <button type="button" className="navigation-item navigation-item-disabled" disabled><Bookmark size={19} /><span>{ru ? "Избранное" : "Saved Messages"}</span><small>{ru ? "Скоро" : "Soon"}</small></button>
          <button type="button" className="navigation-item navigation-item-disabled" disabled><Folder size={19} /><span>{ru ? "Папки чатов" : "Chat folders"}</span><small>{ru ? "Скоро" : "Soon"}</small></button>
          <button type="button" className="navigation-item navigation-item-disabled" disabled><Bot size={19} /><span>{ru ? "Боты" : "Bots"}</span><small>{ru ? "Скоро" : "Soon"}</small></button>

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
  | "account"
  | "notifications"
  | "privacy"
  | "devices"
  | "appearance"
  | "language"
  | "chats"
  | "storage"
  | "help"
  | "plus"
  | "staff";

type SettingsProps = {
  profile: Profile;
  locale: Locale;
  roles: string[];
  theme: ThemePreference;
  activeSection: SettingsSection;
  onSectionChange: (section: SettingsSection) => void;
  onThemeChange: (theme: ThemePreference) => void;
  onLocaleChange: (locale: Locale) => void;
  onClose: () => void;
  onOpenSupport: () => void;
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
  { id: "notifications", label: { ru: "Уведомления", en: "Notifications" }, Icon: Bell, available: false },
  { id: "privacy", label: { ru: "Конфиденциальность", en: "Privacy" }, Icon: LockKeyhole, available: false },
  { id: "devices", label: { ru: "Устройства", en: "Devices" }, Icon: Laptop, available: false },
  { id: "appearance", label: { ru: "Оформление", en: "Appearance" }, Icon: Palette, available: true },
  { id: "language", label: { ru: "Язык", en: "Language" }, Icon: Cloud, available: true },
  { id: "chats", label: { ru: "Настройки чатов", en: "Chat settings" }, Icon: MessageCircle, available: false },
  { id: "storage", label: { ru: "Данные и память", en: "Data and storage" }, Icon: Folder, available: false },
  { id: "help", label: { ru: "Помощь", en: "Help" }, Icon: CircleHelp, available: true },
  { id: "plus", label: { ru: "HELORO PLUS", en: "HELORO PLUS" }, Icon: Gift, available: true },
];

function SettingsNotice({ title, text, locale }: { title: string; text: string; locale: Locale }) {
  return (
    <div className="settings-coming-card">
      <span className="settings-coming-icon"><LockKeyhole size={20} /></span>
      <div><strong>{title}</strong><p>{text}</p><small>{locale === "ru" ? "Раздел подготовлен, но ещё не подключён." : "This section is designed but not connected yet."}</small></div>
    </div>
  );
}

export function MessengerSettings({
  profile,
  locale,
  roles,
  theme,
  activeSection,
  onSectionChange,
  onThemeChange,
  onLocaleChange,
  onClose,
  onOpenSupport,
  onOpenAdmin,
  onSignOut,
}: SettingsProps) {
  const ru = locale === "ru";
  const staff = roles.some((role) => role === "owner" || role === "admin" || role === "moderator");
  const items = staff
    ? [...settingItems, { id: "staff" as const, label: { ru: "HELORO S", en: "HELORO S" }, Icon: ShieldCheck, available: true }]
    : settingItems;

  const title = items.find((item) => item.id === activeSection)?.label[locale] ?? (ru ? "Настройки" : "Settings");

  return (
    <div className="settings-overlay settings-page-overlay" onClick={onClose}>
      <section className="settings-page-card" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(event) => event.stopPropagation()}>
        <header className="settings-page-header">
          <div><span className="settings-page-eyebrow">HELORO</span><h2 id="settings-title">{ru ? "Настройки" : "Settings"}</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label={ru ? "Закрыть настройки" : "Close settings"}><X size={20} /></button>
        </header>

        <div className="settings-page-body">
          <div className="settings-content">
            {activeSection !== "account" && (
              <button type="button" className="settings-back-button" onClick={() => onSectionChange("account")}>
                <ChevronRight size={18} /><span>{ru ? "Настройки" : "Settings"}</span>
              </button>
            )}
            <div className="settings-content-heading"><h3>{title}</h3><span>HELORO</span></div>

            {activeSection === "account" && (
              <div className="settings-section-content">
                <div className="settings-account-card">
                  <div className="avatar settings-account-avatar">{(profile.display_name || "H").trim().slice(0, 1).toUpperCase()}</div>
                  <div><strong>{profile.display_name}</strong><small>@{profile.username}</small></div>
                  {roles.includes("owner") && <span className="settings-account-owner"><ShieldCheck size={14} /> {ru ? "Владелец" : "Owner"}</span>}
                </div>
                <div className="settings-info-row"><span>{ru ? "Имя профиля" : "Profile name"}</span><strong>{profile.display_name}</strong></div>
                <div className="settings-info-row"><span>HELORO ID</span><strong>@{profile.username}</strong></div>
                <div className="settings-menu-list">
                  {items.filter((item) => item.id !== "account").map(({ id, label, Icon }) => {
                    const descriptions: Record<string, { ru: string; en: string }> = {
                      notifications: { ru: "Звуки, уведомления и исключения", en: "Sounds, alerts and exceptions" },
                      privacy: { ru: "Безопасность и видимость аккаунта", en: "Security and account visibility" },
                      devices: { ru: "Активные сеансы и устройства", en: "Active sessions and devices" },
                      appearance: { ru: "Тема и оформление", en: "Theme and appearance" },
                      language: { ru: "Язык интерфейса", en: "Interface language" },
                      chats: { ru: "Фон, папки и настройки переписки", en: "Wallpaper, folders and chat settings" },
                      storage: { ru: "Автозагрузка и использование памяти", en: "Auto-download and storage usage" },
                      help: { ru: "Поддержка и ответы на вопросы", en: "Support and help" },
                      plus: { ru: "Награды и праздничные значки", en: "Rewards and holiday badges" },
                      staff: { ru: "Модерация и управление", en: "Moderation and management" },
                    };
                    return (
                      <button type="button" className={`settings-menu-row settings-menu-${id}`} key={id} onClick={() => onSectionChange(id)}>
                        <span className="settings-menu-icon"><Icon size={19} /></span>
                        <span className="settings-menu-copy"><strong>{label[locale]}</strong><small>{descriptions[id]?.[locale] ?? ""}</small></span>
                        <ChevronRight size={17} />
                      </button>
                    );
                  })}
                </div>
                <p className="settings-muted-note">{ru ? "Изменение имени и фотографии профиля будет добавлено отдельно." : "Profile name and photo editing will be added separately."}</p>
                <button type="button" className="settings-signout" onClick={onSignOut}><span>{ru ? "Выйти из аккаунта" : "Sign out"}</span></button>
              </div>
            )}

            {activeSection === "notifications" && <SettingsNotice locale={locale} title={ru ? "Управление уведомлениями" : "Notification controls"} text={ru ? "Звуки, push-уведомления, исключения для чатов и тихий режим ещё не подключены к серверу." : "Sounds, push notifications, chat exceptions and quiet hours are not connected yet."} />}
            {activeSection === "privacy" && <SettingsNotice locale={locale} title={ru ? "Защита аккаунта и приватность" : "Account security and privacy"} text={ru ? "Настройки видимости, блокировки, активных разрешений и управления сессиями пока не реализованы." : "Visibility, blocking, active permissions and session controls are not implemented yet."} />}
            {activeSection === "devices" && <SettingsNotice locale={locale} title={ru ? "Активные устройства" : "Active devices"} text={ru ? "Здесь появится список устройств и возможность завершить отдельные сеансы. Серверный список сессий ещё не подключён." : "A device list and per-session sign-out will appear here. The server-side session list is not connected yet."} />}

            {activeSection === "appearance" && (
              <div className="settings-section-content">
                <p className="settings-description">{ru ? "Выберите светлое или тёмное оформление HELORO." : "Choose the HELORO light or dark appearance."}</p>
                <div className="theme-choice-list">
                  <button type="button" className={theme === "light" ? "active" : ""} aria-pressed={theme === "light"} onClick={() => onThemeChange("light")}><Sun size={18} /><span>{ru ? "Светлая" : "Light"}</span>{theme === "light" && <Check size={17} />}</button>
                  <button type="button" className={theme === "dark" ? "active" : ""} aria-pressed={theme === "dark"} onClick={() => onThemeChange("dark")}><Moon size={18} /><span>{ru ? "Тёмная" : "Dark"}</span>{theme === "dark" && <Check size={17} />}</button>
                  <button type="button" className={theme === "system" ? "active" : ""} aria-pressed={theme === "system"} onClick={() => onThemeChange("system")}><Cloud size={18} /><span>{ru ? "Как на устройстве" : "Use device setting"}</span>{theme === "system" && <Check size={17} />}</button>
                </div>
                <p className="settings-muted-note">{ru ? "Тема сохраняется только в этом браузере на этом устройстве." : "The theme preference is stored only in this browser on this device."}</p>
              </div>
            )}

            {activeSection === "language" && (
              <div className="settings-section-content">
                <p className="settings-description">{ru ? "Язык интерфейса приложения." : "Application interface language."}</p>
                <div className="theme-choice-list">
                  <button type="button" className={locale === "ru" ? "active" : ""} aria-pressed={locale === "ru"} onClick={() => onLocaleChange("ru")}><span>Русский</span>{locale === "ru" && <Check size={17} />}</button>
                  <button type="button" className={locale === "en" ? "active" : ""} aria-pressed={locale === "en"} onClick={() => onLocaleChange("en")}><span>English</span>{locale === "en" && <Check size={17} />}</button>
                </div>
              </div>
            )}

            {activeSection === "chats" && <SettingsNotice locale={locale} title={ru ? "Персонализация чатов" : "Chat personalization"} text={ru ? "Папки, закреплённые чаты, фон, размеры текста и сортировка появятся вместе с серверной поддержкой." : "Folders, pinned chats, wallpaper, text size and sorting will arrive with backend support."} />}
            {activeSection === "storage" && <SettingsNotice locale={locale} title={ru ? "Использование данных" : "Data usage"} text={ru ? "Автозагрузка медиа, кэш и управление файлами пока недоступны." : "Media auto-download, cache and file management are not available yet."} />}

            {activeSection === "help" && (
              <div className="settings-section-content">
                <p className="settings-description">{ru ? "Нужна помощь с HELORO? Откройте личный чат с командой поддержки." : "Need help with HELORO? Open a private chat with the support team."}</p>
                <button type="button" className="settings-action-button" onClick={onOpenSupport}><Headphones size={18} /> {ru ? "Открыть Support Heloro" : "Open Support Heloro"}</button>
              </div>
            )}

            {activeSection === "plus" && (
              <div className="settings-section-content">
                <div className="settings-plus-banner"><Gift size={25} /><div><strong>HELORO PLUS</strong><span>{ru ? "Постоянная награда за события" : "Permanent event reward"}</span></div></div>
                <p className="settings-description">{ru ? "PLUS задуман как награда за праздничные события в течение года. Полученный PLUS остаётся навсегда. Полный набор праздничных значков должен открывать HELORO X." : "PLUS is planned as a reward for holiday events throughout the year. Earned PLUS stays permanently. The complete holiday badge set is planned to unlock HELORO X."}</p>
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
          </div>
        </div>
      </section>
    </div>
  );
}
