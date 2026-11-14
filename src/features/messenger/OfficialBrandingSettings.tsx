import { useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOfficialBrandingAvatar, uploadOfficialBrandingAvatar, type OfficialBrandingKind } from "../../lib/official";
import type { Locale } from "../../lib/i18n";
import { Headphones, Megaphone } from "lucide-react";

type Props = { client: SupabaseClient; userId: string; locale: Locale };

export default function OfficialBrandingSettings({ client, userId, locale }: Props) {
  const ru = locale === "ru";
  const [avatars, setAvatars] = useState<Record<OfficialBrandingKind, string | null>>({ news: null, support: null });
  const [busy, setBusy] = useState<OfficialBrandingKind | null>(null);
  const [error, setError] = useState("");
  const newsInput = useRef<HTMLInputElement>(null);
  const supportInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([getOfficialBrandingAvatar(client, "news"), getOfficialBrandingAvatar(client, "support")])
      .then(([news, support]) => { if (active) setAvatars({ news, support }); })
      .catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : (ru ? "Не удалось загрузить аватары." : "Could not load official avatars."));
      });
    return () => { active = false; };
  }, [client, ru]);

  async function chooseAvatar(kind: OfficialBrandingKind, file?: File) {
    if (!file) return;
    setBusy(kind);
    setError("");
    try {
      const url = await uploadOfficialBrandingAvatar(client, userId, kind, file);
      setAvatars((current) => ({ ...current, [kind]: url }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : (ru ? "Не удалось изменить аватар." : "Could not update the avatar."));
    } finally {
      setBusy(null);
      const input = kind === "news" ? newsInput.current : supportInput.current;
      if (input) input.value = "";
    }
  }

  return (
    <section className="official-branding-settings">
      <h3>{ru ? "Аватары официальных аккаунтов" : "Official account avatars"}</h3>
      <p>{ru ? "Эти изображения будут видны рядом с News и Support Heloro во всём мессенджере." : "These images appear beside News and Support Heloro throughout the messenger."}</p>
      <div className="official-branding-settings-grid">
        <div className="official-branding-setting-card">
          <div className="official-branding-setting-preview">{avatars.news ? <img src={avatars.news} alt="" /> : <Megaphone size={19} />}</div>
          <div className="official-branding-setting-copy">
            <strong>News</strong>
            <button type="button" disabled={busy !== null} onClick={() => newsInput.current?.click()}>{busy === "news" ? (ru ? "Загрузка…" : "Uploading…") : (ru ? "Изменить аватар" : "Change avatar")}</button>
            <input ref={newsInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => void chooseAvatar("news", event.target.files?.[0])} />
          </div>
        </div>
        <div className="official-branding-setting-card">
          <div className="official-branding-setting-preview">{avatars.support ? <img src={avatars.support} alt="" /> : <Headphones size={19} />}</div>
          <div className="official-branding-setting-copy">
            <strong>Support Heloro</strong>
            <button type="button" disabled={busy !== null} onClick={() => supportInput.current?.click()}>{busy === "support" ? (ru ? "Загрузка…" : "Uploading…") : (ru ? "Изменить аватар" : "Change avatar")}</button>
            <input ref={supportInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => void chooseAvatar("support", event.target.files?.[0])} />
          </div>
        </div>
      </div>
      {error && <p className="official-branding-settings-error" role="alert">{error}</p>}
    </section>
  );
}
