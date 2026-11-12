import { useState, type FormEvent } from "react";
import { ArrowRight, AtSign, UserRound } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { displayNameSchema, usernameSchema } from "../../lib/domain";
import type { Profile } from "../../lib/types";
import { t, type Locale } from "../../lib/i18n";

type Props = {
  client: SupabaseClient;
  userId: string;
  onSaved: (profile: Profile) => void;
  locale: Locale;
};

export default function ProfileSetup({ client, userId, onSaved, locale }: Props) {
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const checkedName = displayNameSchema.safeParse(displayName);
    const checkedUsername = usernameSchema.safeParse(username);
    if (!checkedName.success) return setError(checkedName.error.issues[0]?.message ?? t(locale, "profileSaveError"));
    if (!checkedUsername.success) return setError(checkedUsername.error.issues[0]?.message ?? t(locale, "profileSaveError"));

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
      const message = cause instanceof Error ? cause.message : t(locale, "profileSaveError");
      setError(message.includes("profiles_username_lower_unique") || message.toLowerCase().includes("duplicate")
        ? t(locale, "profileUsernameTaken")
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
        <div className="eyebrow">{t(locale, "profileTitle")}</div>
        <h1>{t(locale, "profileTitle")}</h1>
        <p className="muted">{t(locale, "profileDescription")}</p>
        <form onSubmit={handleSubmit} className="profile-form">
          <label>{t(locale, "profileName")}
            <div className="input-with-icon"><UserRound size={17} /><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={t(locale, "profileNamePlaceholder")} maxLength={48} required /></div>
          </label>
          <label>{t(locale, "profileUsername")}
            <div className="input-with-icon"><AtSign size={17} /><input value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} placeholder={t(locale, "profileUsernamePlaceholder")} minLength={3} maxLength={24} pattern="[a-z0-9_]+" required /></div>
            <small>{t(locale, "profileUsernameHint")}</small>
          </label>
          {error && <p className="form-message error-message" role="alert">{error}</p>}
          <button className="primary-button full-button" disabled={busy}>{busy ? t(locale, "profileSaving") : t(locale, "profileContinue")} <ArrowRight size={17} /></button>
        </form>
      </section>
    </main>
  );
}
