import { useState, type FormEvent } from "react";
import { ArrowRight, AtSign, UserRound } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { displayNameSchema, usernameSchema } from "../../lib/domain";
import type { Profile } from "../../lib/types";

type Props = {
  client: SupabaseClient;
  userId: string;
  onSaved: (profile: Profile) => void;
};

export default function ProfileSetup({ client, userId, onSaved }: Props) {
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const checkedName = displayNameSchema.safeParse(displayName);
    const checkedUsername = usernameSchema.safeParse(username);
    if (!checkedName.success) return setError(checkedName.error.issues[0]?.message ?? "Check your display name.");
    if (!checkedUsername.success) return setError(checkedUsername.error.issues[0]?.message ?? "Check your username.");

    setBusy(true);
    try {
      const { data, error: updateError } = await client
        .from("profiles")
        .update({ display_name: checkedName.data, username: checkedUsername.data })
        .eq("id", userId)
        .select("id, username, display_name, avatar_url")
        .single();
      if (updateError) throw updateError;
      onSaved(data as Profile);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Your profile could not be saved.";
      setError(message.includes("profiles_username_lower_unique") || message.toLowerCase().includes("duplicate")
        ? "That username is already taken. Try another one."
        : message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="profile-stage">
      <section className="profile-card glass-panel">
        <div className="brand-lockup"><div className="brand-symbol">H</div><span>HELORO</span></div>
        <div className="profile-emblem"><UserRound size={28} /></div>
        <div className="eyebrow">ONE LAST THING</div>
        <h1>Make this space<br /><span>yours.</span></h1>
        <p className="muted">Choose the name people will see and your unique HELORO address.</p>
        <form onSubmit={handleSubmit} className="profile-form">
          <label>Display name<div className="input-with-icon"><UserRound size={17} /><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" maxLength={48} required /></div></label>
          <label>Username<div className="input-with-icon"><AtSign size={17} /><input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} placeholder="yourname" minLength={3} maxLength={24} pattern="[a-z0-9_]+" required /></div><small>3–24 characters · lowercase letters, numbers and underscores</small></label>
          {error && <p className="form-message error-message" role="alert">{error}</p>}
          <button className="primary-button full-button" disabled={busy}>{busy ? "Saving…" : "Continue"} <ArrowRight size={17} /></button>
        </form>
      </section>
    </main>
  );
}