import { useEffect, useState, type ReactNode } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getOfficialBrandingAvatar, type OfficialBrandingKind } from "../../lib/official";
import { initials } from "../../lib/domain";

type Props = {
  client: SupabaseClient;
  kind: OfficialBrandingKind;
  label: string;
  className?: string;
  fallback?: ReactNode;
};

export default function OfficialAvatar({ client, kind, label, className = "", fallback }: Props) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void getOfficialBrandingAvatar(client, kind)
      .then((url) => { if (active) setAvatarUrl(url); })
      .catch(() => { if (active) setAvatarUrl(null); });
    return () => { active = false; };
  }, [client, kind]);
  return (
    <div className={("avatar system-avatar official-branding-avatar " + className).trim()} aria-hidden="true">
      {avatarUrl ? <img src={avatarUrl} alt="" loading="lazy" /> : fallback ?? initials(label)}
    </div>
  );
}
