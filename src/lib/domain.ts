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

function localDateKey(date: Date): string {
  return String(date.getFullYear()) + "-" + String(date.getMonth()) + "-" + String(date.getDate());
}

export function formatMessageDayLabel(value: string, locale: "ru" | "en"): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (localDateKey(date) === localDateKey(now)) return locale === "ru" ? "Сегодня" : "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (localDateKey(date) === localDateKey(yesterday)) return locale === "ru" ? "Вчера" : "Yesterday";
  const dayStart = (item: Date) => Date.UTC(item.getFullYear(), item.getMonth(), item.getDate());
  const daysAgo = Math.floor((dayStart(now) - dayStart(date)) / 86400000);
  if (daysAgo >= 0 && daysAgo < 7) return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { weekday: "long" }).format(date);
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "numeric", month: "long", ...(date.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}) }).format(date);
}

export function formatLastSeen(value: string | null | undefined, locale: "ru" | "en", hidden = false, hiddenBucket?: "recently" | "within_week" | "within_month" | "long_ago" | null): string {
  const ru = locale === "ru";
  if (hidden) {
    if (hiddenBucket === "within_week") return ru ? "был(а) на этой неделе" : "last seen within a week";
    if (hiddenBucket === "within_month") return ru ? "был(а) в этом месяце" : "last seen within a month";
    if (hiddenBucket === "long_ago") return ru ? "был(а) давно" : "last seen a long time ago";
    return ru ? "был(а) недавно" : "last seen recently";
  }
  if (!value) return ru ? "был(а) давно" : "last seen a long time ago";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return ru ? "был(а) давно" : "last seen a long time ago";
  const now = new Date();
  const time = formatMessageTime(value);
  const dayStart = (item: Date) => Date.UTC(item.getFullYear(), item.getMonth(), item.getDate());
  const daysAgo = Math.floor((dayStart(now) - dayStart(date)) / 86400000);
  if (daysAgo <= 0) return ru ? "был(а) сегодня в " + time : "last seen today at " + time;
  if (daysAgo === 1) return ru ? "был(а) вчера в " + time : "last seen yesterday at " + time;
  if (daysAgo < 7) {
    const weekday = new Intl.DateTimeFormat(ru ? "ru-RU" : "en-US", { weekday: "long" }).format(date);
    return ru ? "был(а) " + weekday + " в " + time : "last seen " + weekday + " at " + time;
  }
  if (daysAgo < 30) {
    const shortDate = new Intl.DateTimeFormat(ru ? "ru-RU" : "en-US", { day: "numeric", month: "short" }).format(date);
    return ru ? "был(а) " + shortDate + " в " + time : "last seen " + shortDate + " at " + time;
  }
  return ru ? "был(а) давно" : "last seen a long time ago";
}
