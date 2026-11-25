import { BadgeCheck, Crown } from "lucide-react";
import { initials } from "../../lib/domain";
import type { BadgeType } from "../../lib/types";

function Avatar({ label, className = "", src, crown = false }: { label: string; className?: string; src?: string | null; crown?: boolean }) {
  return <div className={`avatar ${crown ? "avatar-with-crown" : ""} ${className}`.trim()} aria-hidden="true">
    {src ? <img src={src} alt="" loading="lazy" /> : initials(label)}
    {crown && (
      <>
        <svg className="avatar-crown-frame-art" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
          <path className="avatar-crown-frame-ring" d="M 46.2 10.9 A 25.4 25.4 0 1 0 56.4 24.8" />
        </svg>
        <span className="avatar-crown-frame-crown" aria-hidden="true"><Crown size={17} strokeWidth={2.5} /></span>
      </>
    )}
  </div>;
}

function PurpleCrownNameMark({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="purple-crown-name-mark" title="Фиолетовая корона HELORO" aria-label="Фиолетовая корона HELORO">
      <Crown size={13} strokeWidth={2.5} />
    </span>
  );
}

function VerificationMark({ type, title }: { type?: BadgeType | null; title: string }) {
  if (!type) return null;
  if (type === "epic_sans") {
    // Keep Epic Sans exactly as it was before the badge redesign.
    return <BadgeCheck size={14} className="epic-sans-verified-mark" aria-label="Epic Sans" role="img" />;
  }
  if (type === "creator") {
    const creatorTitle = title === "Verified by HELORO" ? "Verified HELORO creator" : "Проверенный автор HELORO";
    return <BadgeCheck size={14} className="creator-verified-mark" aria-label={creatorTitle} role="img" />;
  }
  if (type === "blue") {
    return <BadgeCheck size={14} className="blue-verified-mark" aria-label={title} role="img" />;
  }
  return <BadgeCheck size={14} className="gold-verified-mark" aria-label={title} role="img" />;
}

export { Avatar, PurpleCrownNameMark, VerificationMark };
