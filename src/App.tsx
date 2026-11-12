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
}: {
  session: Session;
  client: HeloroClient;
  locale: Locale;
  onLocaleChange: (next: Locale) => void;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState("");

  useEffect(() => {
    let active = true;
    setLoadingProfile(true);
    setProfileError("");
    void getProfile(session.user.id)
      .then((value) => { if (active) setProfile(value); })
      .catch((error: unknown) => {
        if (active) setProfileError(error instanceof Error ? error.message : t(locale, "profileLoadError"));
      })
      .finally(() => { if (active) setLoadingProfile(false); });
    return () => { active = false; };
  }, [session.user.id, locale]);

  if (loadingProfile) return <LoadingScreen locale={locale} />;
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
  return <MessengerApp client={client} user={session.user} profile={profile} locale={locale} onLocaleChange={onLocaleChange} />;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);
  const [locale, setLocale] = useState<Locale>(() => getInitialLocale());

  useEffect(() => {
    document.documentElement.lang = locale;
    saveLocale(locale);
  }, [locale]);

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
  return <AuthenticatedApp session={session} client={supabase} locale={locale} onLocaleChange={setLocale} />;
}
