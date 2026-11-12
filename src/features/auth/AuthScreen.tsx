import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, MessageCircle, Search, ShieldCheck } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { t, type Locale } from "../../lib/i18n";

type Props = {
  client: SupabaseClient;
  locale: Locale;
  onLocaleChange: (next: Locale) => void;
};

export default function AuthScreen({ client, locale, onLocaleChange }: Props) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error: authError } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { display_name: displayName.trim() },
            emailRedirectTo: new URL(import.meta.env.BASE_URL, window.location.origin).toString(),
          },
        });
        if (authError) throw authError;
        if (!data.session) {
          setNotice(t(locale, "authEmailNotice"));
        } else {
          setNotice(t(locale, "authAccountReady"));
        }
      } else {
        const { error: authError } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (authError) throw authError;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t(locale, "authGenericError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-stage">
      <div className="auth-orb auth-orb-a" />
      <div className="auth-orb auth-orb-b" />
      <header className="auth-topbar">
        <div className="brand-lockup"><div className="brand-symbol">H</div><span>HELORO</span></div>
        <div className="language-toggle" role="group" aria-label={t(locale, "language")}>
          <button type="button" className={locale === "ru" ? "active" : ""} aria-pressed={locale === "ru"} onClick={() => onLocaleChange("ru")}>RU</button>
          <button type="button" className={locale === "en" ? "active" : ""} aria-pressed={locale === "en"} onClick={() => onLocaleChange("en")}>EN</button>
        </div>
      </header>
      <div className="auth-layout">
        <section className="auth-intro">
          <div className="eyebrow">HELORO</div>
          <h1>{t(locale, mode === "signin" ? "authLoginTitle" : "authRegisterTitle")}</h1>
          <p>{t(locale, "authIntroText")}</p>
          <div className="intro-points">
            <span><MessageCircle size={16} /> {t(locale, "authFeatureMessages")}</span>
            <span><Search size={16} /> {t(locale, "authFeatureSearch")}</span>
          </div>
        </section>
        <section className="auth-card glass-panel">
          <div className="auth-card-heading">
            <div className="auth-card-icon"><MessageCircle size={20} /></div>
            <div>
              <h2>{t(locale, mode === "signin" ? "authLogin" : "authSignup")}</h2>
              <p>{t(locale, mode === "signin" ? "authLoginDescription" : "authSignupDescription")}</p>
            </div>
          </div>
          <div className="auth-tabs" role="tablist" aria-label={t(locale, "settingsAccount")}>
            <button type="button" role="tab" aria-selected={mode === "signin"} className={mode === "signin" ? "active" : ""} onClick={() => { setMode("signin"); setError(""); setNotice(""); }}>{t(locale, "authLogin")}</button>
            <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setError(""); setNotice(""); }}>{t(locale, "authSignup")}</button>
          </div>
          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === "signup" && (
              <label>{t(locale, "authDisplayName")}
                <input autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={t(locale, "authDisplayNamePlaceholder")} maxLength={48} required />
              </label>
            )}
            <label>{t(locale, "authEmail")}
              <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={t(locale, "authEmailPlaceholder")} required />
            </label>
            <label>{t(locale, "authPassword")}
              <div className="password-wrap">
                <input type={showPassword ? "text" : "password"} autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t(locale, "authPasswordPlaceholder")} minLength={8} required />
                <button type="button" className="icon-button password-toggle" aria-label={showPassword ? t(locale, "dismiss") : t(locale, "authPassword")} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </div>
            </label>
            {error && <p className="form-message error-message" role="alert">{error}</p>}
            {notice && <p className="form-message success-message" role="status">{notice}</p>}
            <button className="primary-button full-button" type="submit" disabled={busy}>
              {busy ? t(locale, "authWait") : mode === "signin" ? t(locale, "authLogin") : t(locale, "authCreateAccount")} <ArrowRight size={17} />
            </button>
          </form>
          <div className="auth-legal"><ShieldCheck size={14} /> {t(locale, "authLegal")}</div>
        </section>
      </div>
      <footer className="auth-footer"><span>HELORO</span><span>© 2026</span></footer>
    </main>
  );
}
