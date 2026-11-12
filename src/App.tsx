import { useEffect, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import { ArrowRight, Check, Cloud, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import { supabase, type SupabaseClient as HeloroClient } from "./lib/supabase";
import { getProfile } from "./lib/messenger";
import type { Profile } from "./lib/types";
import AuthScreen from "./features/auth/AuthScreen";
import ProfileSetup from "./features/profile/ProfileSetup";
import MessengerApp from "./features/messenger/MessengerApp";

function LoadingScreen() {
  return (
    <main className="center-stage">
      <div className="loading-mark">H</div>
      <p className="muted">Preparing your space…</p>
    </main>
  );
}

function BackendSetupScreen() {
  return (
    <main className="setup-stage">
      <div className="setup-glow setup-glow-one" />
      <div className="setup-glow setup-glow-two" />
      <section className="setup-card glass-panel">
        <div className="brand-lockup">
          <div className="brand-symbol">H</div>
          <span>HELORO</span>
        </div>
        <div className="eyebrow">A calmer way to stay close</div>
        <h1>Good conversations<br /><span>feel like home.</span></h1>
        <p className="setup-lead">
          Your HELORO workspace is ready for its own secure online backend.
          Connect Supabase to activate real accounts, conversations and live messages.
        </p>
        <div className="setup-steps">
          <div className="setup-step"><span className="step-icon"><Cloud size={18} /></span><div><strong>Create a Supabase project</strong><small>Use a separate project just for HELORO.</small></div></div>
          <div className="setup-step"><span className="step-icon"><ShieldCheck size={18} /></span><div><strong>Run the database migration</strong><small>It creates chat tables, access rules and realtime support.</small></div></div>
          <div className="setup-step"><span className="step-icon"><LockKeyhole size={18} /></span><div><strong>Add the public connection values</strong><small>Set the two VITE_SUPABASE variables from .env.example.</small></div></div>
        </div>
        <div className="setup-note"><Sparkles size={16} /><span>Messages will be stored on the server — not only on this device.</span></div>
        <div className="setup-footer">
          <span><Check size={14} /> Client foundation committed</span>
          <span className="status-pill"><span /> Backend not connected</span>
        </div>
        <a className="setup-link" href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">
          Open Supabase dashboard <ArrowRight size={16} />
        </a>
        <p className="fine-print">Never put a Supabase secret or service_role key in the browser or in GitHub.</p>
      </section>
      <div className="setup-wordmark">HELORO · STAY CLOSE</div>
    </main>
  );
}

function AuthenticatedApp({ session, client }: { session: Session; client: HeloroClient }) {
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
        if (active) setProfileError(error instanceof Error ? error.message : "Profile could not be loaded.");
      })
      .finally(() => { if (active) setLoadingProfile(false); });
    return () => { active = false; };
  }, [session.user.id]);

  if (loadingProfile) return <LoadingScreen />;
  if (profileError) {
    return (
      <main className="center-stage">
        <section className="setup-card glass-panel compact-card">
          <h2>Could not load your profile</h2>
          <p className="muted">{profileError}</p>
          <button className="primary-button" onClick={() => window.location.reload()}>Try again</button>
        </section>
      </main>
    );
  }
  if (!profile?.username) {
    return <ProfileSetup client={client} userId={session.user.id} onSaved={setProfile} />;
  }
  return <MessengerApp client={client} user={session.user} profile={profile} />;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true);

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

  if (!supabase) return <BackendSetupScreen />;
  if (booting) return <LoadingScreen />;
  if (!session) return <AuthScreen client={supabase as SupabaseClient} />;
  return <AuthenticatedApp session={session} client={supabase} />;
}