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