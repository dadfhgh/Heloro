import { useEffect, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { ArrowRight, Check, Cloud, LockKeyhole, ShieldCheck } from "lucide-react";
import { supabase, type SupabaseClient as HeloroClient } from "./lib/supabase";
import { getProfile } from "./lib/messenger";
import type { Profile } from "./lib/types";
import AuthScreen from "./features/auth/AuthScreen";
import ProfileSetup from "./features/profile/ProfileSetup";
import MessengerApp from "./features/messenger/MessengerApp";
import { getInitialLocale, saveLocale, t, type Locale } from "./lib/i18n";
import { parseThemePreference, serializeThemePreference, type ThemePreference } from "./lib/preferences";

function LoadingScreen({ locale }: { locale: Locale }) {
  return (
    <main className="center-stage">
      <div className="loading-mark">H</div>
      <p className="muted">{t(locale, "appLoading")}</p>
    </main>
  );
}

function BackendSetupScreen({ locale }: { locale: Locale }) {
  return (
    <main className="setup-stage">
      <section className="setup-card glass-panel">
        <div className="brand-lockup">
          <div className="brand-symbol">H</div>
          <span>HELORO</span>
        </div>
        <div className="eyebrow">{t(locale, "backendMissingStatus")}</div>
        <h1>{t(locale, "backendMissingTitle")}</h1>
        <p className="setup-lead">{t(locale, "backendMissingText")}</p>
        <div className="setup-steps">
          <div className="setup-step">
            <span className="step-icon"><Cloud size={18} /></span>
            <div><strong>Supabase</strong><small>VITE_SUPABASE_URL</small></div>
          </div>
          <div className="setup-step">
            <span className="step-icon"><LockKeyhole size={18} /></span>
            <div><strong>Public connection key</strong><small>VITE_SUPABASE_PUBLISHABLE_KEY</small></div>
          </div>
        </div>
        <div className="setup-note"><ShieldCheck size={16} /><span>{t(locale, "backendSecurityNote")}</span></div>
        <div className="setup-footer">
          <span><Check size={14} /> {t(locale, "backendMissingStatus")}</span>
        </div>
        <a className="setup-link" href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">
          {t(locale, "backendDashboard")} <ArrowRight size={16} />
        </a>
      </section>
    </main>
  );
}

function AuthenticatedApp({
  session,
  client,
  locale,
  onLocaleChange,
  theme,
  onThemeChange,
}: {
  session: Session;
  client: HeloroClient;
  locale: Locale;
  onLocaleChange: (next: Locale) => void;
  theme: ThemePreference;
  onThemeChange: (next: ThemePreference) => void;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [roles, setRoles] = useState<string[]>([]);
  const [profileError, setProfileError] = useState("");
  const [restrictionLoading, setRestrictionLoading] = useState(true);
  const [restriction, setRestriction] = useState<{ restriction_type: string; reason: string; expires_at: string | null } | null>(null);

  useEffect(() => {
    let active = true;
    setRestrictionLoading(true);
    void Promise.resolve(client.rpc("heloro_current_account_restriction"))
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.warn("HELORO restriction lookup unavailable:", error.message);
          setRestriction(null);
        } else {
          setRestriction((data as { restriction_type: string; reason: string; expires_at: string | null } | null) ?? null);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          console.warn("HELORO restriction lookup failed:", cause);
          setRestriction(null);
        }
      })
      .finally(() => { if (active) setRestrictionLoading(false); });
    return () => { active = false; };
  }, [client, session.user.id]);

  useEffect(() => {
    let active = true;
    setLoadingProfile(true);
    setProfileError("");
    setRoles([]);
    void client.from("user_roles").select("role").eq("user_id", session.user.id)
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error("HELORO role lookup failed:", error.message);
          setRoles([]);
        } else {
          setRoles((data ?? []).map((row) => String(row.role)));
        }
      });
    void getProfile(session.user.id)
      .then((value) => { if (active) setProfile(value); })
      .catch((error: unknown) => {
        if (active) setProfileError(error instanceof Error ? error.message : t(locale, "profileLoadError"));
      })
      .finally(() => { if (active) setLoadingProfile(false); });
    return () => { active = false; };
  }, [session.user.id, locale, client]);

  if (restrictionLoading || loadingProfile) return <LoadingScreen locale={locale} />;
  if (restriction) {
    const ru = locale === "ru";
    const label = restriction.restriction_type === "freeze"
      ? (ru ? "Аккаунт заморожен" : "Account frozen")
      : restriction.restriction_type === "ban"
        ? (ru ? "Аккаунт заблокирован" : "Account banned")
        : (ru ? "Временное ограничение" : "Temporary restriction");
    return (
      <main className="center-stage">
        <section className="setup-card glass-panel compact-card">
          <div className="system-admin-icon"><ShieldCheck size={21} /></div>
          <h2>{label}</h2>
          <p className="muted">{restriction.reason}</p>
          {restriction.expires_at && <p className="muted">{ru ? "Действует до" : "Expires"}: {new Date(restriction.expires_at).toLocaleString()}</p>}
          <button className="primary-button" onClick={() => void client.auth.signOut()}>{ru ? "Выйти из аккаунта" : "Sign out"}</button>
        </section>
      </main>
    );
  }
  if (profileError) {
    return (
      <main className="center-stage">
        <section className="setup-card glass-panel compact-card">
          <h2>{t(locale, "profileLoadError")}</h2>
          <p className="muted">{profileError}</p>
          <button className="primary-button" onClick={() => window.location.reload()}>{t(locale, "retry")}</button>
        </section>
      </main>
    );
  }
  if (!profile?.username) {
    return <ProfileSetup client={client} userId={session.user.id} onSaved={setProfile} locale={locale} />;
  }
  return <MessengerApp client={client} user={session.user} profile={profile} locale={locale} onLocaleChange={onLocaleChange} roles={roles} theme={theme} onThemeChange={onThemeChange} />;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [locale, setLocale] = useState<Locale>(() => getInitialLocale());
  const [theme, setTheme] = useState<ThemePreference>(() => {
    try {
      return parseThemePreference(window.localStorage.getItem("heloro-preferences-v1"));
    } catch {
      return "system";
    }
  });

  useEffect(() => {
    document.documentElement.lang = locale;
    saveLocale(locale);
  }, [locale]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const resolved = theme === "system" ? (media.matches ? "dark" : "light") : theme;
      document.documentElement.dataset.theme = resolved;
    };
    applyTheme();
    try {
      window.localStorage.setItem("heloro-preferences-v1", serializeThemePreference(theme));
    } catch {
      // HELORO remains usable when browser storage is unavailable.
    }
    if (theme !== "system") return;
    media.addEventListener("change", applyTheme);
    return () => media.removeEventListener("change", applyTheme);
  }, [theme]);

  useEffect(() => {
    if (!supabase) {
      setBooting(false);
      return;
    }

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) console.error("HELORO session restore failed:", error.message);
      setSession(data.session);
      setBooting(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!supabase) return <BackendSetupScreen locale={locale} />;
  if (booting) return <LoadingScreen locale={locale} />;
  if (!session) return <AuthScreen client={supabase as SupabaseClient} locale={locale} onLocaleChange={setLocale} />;
  return <AuthenticatedApp session={session} client={supabase} locale={locale} onLocaleChange={setLocale} theme={theme} onThemeChange={setTheme} />;
}
