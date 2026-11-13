export type AdminLocale = "ru" | "en";

type ErrorLike = {
  code?: unknown;
  message?: unknown;
};

/** Keeps valid handle characters such as underscores and Cyrillic display-name text. */
export function normalizeAdminSearch(value: string): string {
  return value.trim().replace(/^@/, "").replace(/[\u0000-\u001f]/g, "").slice(0, 80);
}

/** Escapes PostgreSQL LIKE metacharacters before passing a pattern to PostgREST. */
export function escapeAdminLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

export function isMissingAdminBackendError(cause: unknown): boolean {
  if (!cause || typeof cause !== "object") return false;
  const error = cause as ErrorLike;
  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message.toLowerCase() : "";
  return ["PGRST202", "PGRST205", "42883", "42P01"].includes(code)
    || /could not find the (function|table)|function .* does not exist|relation .* does not exist|schema cache/.test(message);
}

export function adminErrorMessage(cause: unknown, fallback: string, locale: AdminLocale): string {
  if (!cause || typeof cause !== "object") return fallback;
  const error = cause as ErrorLike;
  const code = typeof error.code === "string" ? error.code : "";
  const message = typeof error.message === "string" ? error.message : "";

  if (isMissingAdminBackendError(cause)) {
    return locale === "ru"
      ? "Серверная часть админки ещё не установлена. Необходимые миграции Supabase отсутствуют."
      : "The admin backend is not installed yet. Required Supabase migrations are missing.";
  }
  if (code === "42501" || /permission denied|access required|not authorized/i.test(message)) {
    return locale === "ru"
      ? "Недостаточно прав для этого действия."
      : "You do not have permission to perform this action.";
  }
  return message || fallback;
}
