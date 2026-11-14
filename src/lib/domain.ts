import { z } from "zod";

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Username must contain at least 3 characters.")
  .max(24, "Username must contain no more than 24 characters.")
  .regex(/^[a-z0-9_]+$/, "Use lowercase letters, numbers and underscores only.");

export const displayNameSchema = z
  .string()
  .trim()
  .min(1, "Add a display name.")
  .max(48, "Display name is too long.");

export const messageBodySchema = z
  .string()
  .trim()
  .min(1, "Write a message first.")
  .max(4000, "Messages can contain up to 4,000 characters.");

export function initials(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "H";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
}

export function formatMessageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(date);
}

export function formatInboxTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const sameDay = new Date().toDateString() === date.toDateString();
  return sameDay
    ? formatMessageTime(value)
    : new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" }).format(date);
}

function localDayNumber(date: Date): number {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
}

export function formatMessageDayLabel(value: string, locale: "ru" | "en", now = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const dayDifference = localDayNumber(now) - localDayNumber(date);
  if (dayDifference === 0) return locale === "ru" ? "Сегодня" : "Today";
  if (dayDifference === 1) return locale === "ru" ? "Вчера" : "Yesterday";
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "numeric",
    month: "long",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" as const } : {}),
  }).format(date);
}

export function formatLastSeen(value: string, locale: "ru" | "en", now = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const dayDifference = localDayNumber(now) - localDayNumber(date);
  const time = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
  if (date.getTime() > now.getTime() + 60_000) return "";
  if (now.getTime() - date.getTime() < 60_000) {
    return locale === "ru" ? "был(а) недавно" : "last seen recently";
  }
  if (dayDifference === 0) return locale === "ru" ? `был(а) сегодня в ${time}` : `last seen today at ${time}`;
  if (dayDifference === 1) return locale === "ru" ? `был(а) вчера в ${time}` : `last seen yesterday at ${time}`;
  const dateLabel = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "numeric",
    month: "short",
    ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" as const } : {}),
  }).format(date);
  return locale === "ru" ? `был(а) ${dateLabel} в ${time}` : `last seen ${dateLabel} at ${time}`;
}
