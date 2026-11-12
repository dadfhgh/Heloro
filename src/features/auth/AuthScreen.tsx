import { useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, MessageCircle, ShieldCheck } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";

type Props = { client: SupabaseClient };

export default function AuthScreen({ client }: Props) {
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
          setNotice("Check your email for a confirmation link, then come back here to sign in.");
        } else {
          setNotice("Account created. Let's set up your profile.");
        }
      } else {
        const { error: authError } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (authError) throw authError;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again.");
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
        <span className="topbar-caption">A little closer, every day</span>
      </header>
      <div className="auth-layout">
        <section className="auth-intro">
          <div className="eyebrow"><span className="eyebrow-dot" /> YOUR SPACE, YOUR PEOPLE</div>
          <h1>Stay close.<br /><span>Feel connected.</span></h1>
          <p>Simple conversations, thoughtful details, and a little more room to breathe.</p>
          <div className="intro-points">
            <span><MessageCircle size={16} /> Conversations that matter</span>
            <span><ShieldCheck size={16} /> Private by design</span>
          </div>
          <div className="floating-glass-card">
            <div className="mini-avatar mini-avatar-blue">H</div>
            <div><strong>A calmer inbox</strong><small>Everything in its place.</small></div>
            <span className="tiny-live-dot" />
          </div>
        </section>
        <section className="auth-card glass-panel">
          <div className="auth-card-heading">
            <div className="auth-card-icon"><MessageCircle size={20} /></div>
            <div><h2>{mode === "signin" ? "Welcome back" : "Create your account"}</h2><p>{mode === "signin" ? "Pick up where you left off." : "Your HELORO space starts here."}</p></div>
          </div>
          <div className="auth-tabs" role="tablist" aria-label="Account access">
            <button type="button" role="tab" aria-selected={mode === "signin"} className={mode === "signin" ? "active" : ""} onClick={() => { setMode("signin"); setError(""); setNotice(""); }}>Sign in</button>
            <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setError(""); setNotice(""); }}>Sign up</button>
          </div>
          <form className="auth-form" onSubmit={handleSubmit}>
            {mode === "signup" && <label>Display name<input autoComplete="name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="How should we call you?" maxLength={48} required /></label>}
            <label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label>
            <label>Password
              <div className="password-wrap">
                <input type={showPassword ? "text" : "password"} autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" minLength={8} required />
                <button type="button" className="icon-button password-toggle" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </div>
            </label>
            {error && <p className="form-message error-message" role="alert">{error}</p>}
            {notice && <p className="form-message success-message" role="status">{notice}</p>}
            <button className="primary-button full-button" type="submit" disabled={busy}>
              {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"} <ArrowRight size={17} />
            </button>
          </form>
          <div className="auth-legal"><ShieldCheck size={14} /> Your account and conversations are protected by server-side access rules.</div>
        </section>
      </div>
      <footer className="auth-footer"><span>HELORO</span><span>Thoughtfully connected.</span><span>© 2026</span></footer>
    </main>
  );
}
