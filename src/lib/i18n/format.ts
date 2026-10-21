import type { Language } from "@/types/domain";
import { toIntlLocale } from "./index";

/** Formatting helpers keep dates consistent across the app and both languages. */

export function formatDate(
  input: Date | string | number,
  lang: Language = "en",
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" },
) {
  const date = toDate(input);
  if (!date) return "—";
  return new Intl.DateTimeFormat(toIntlLocale(lang), options).format(date);
}

export function formatLongDate(input: Date | string | number, lang: Language = "en") {
  return formatDate(input, lang, { day: "numeric", month: "long", year: "numeric" });
}

export function formatMonthYear(input: Date | string | number, lang: Language = "en") {
  return formatDate(input, lang, { month: "short", year: "numeric" });
}

export function formatDayMonth(input: Date | string | number, lang: Language = "en") {
  return formatDate(input, lang, { day: "numeric", month: "short" });
}

export function formatTime(input: Date | string | number, lang: Language = "en") {
  const date = toDate(input);
  if (!date) return "—";
  return new Intl.DateTimeFormat(toIntlLocale(lang), {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function formatNumber(value: number, lang: Language = "en", maxDigits = 1) {
  return new Intl.NumberFormat(toIntlLocale(lang), {
    maximumFractionDigits: maxDigits,
  }).format(value);
}

/** ISO calendar day in local time — used as the DoseLog key. */
export function toDayKey(input: Date | string | number = new Date()): string {
  const date = toDate(input) ?? new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** `2026-09-12` for <input type="date">. */
export function toDateInputValue(input: Date | string | number | null | undefined): string {
  if (input === null || input === undefined || input === "") return "";
  const date = toDate(input);
  if (!date) return "";
  return toDayKey(date);
}

export function toDate(input: Date | string | number | null | undefined): Date | null {
  if (input === null || input === undefined || input === "") return null;
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function daysBetween(a: Date | string, b: Date | string): number {
  const from = toDate(a);
  const to = toDate(b);
  if (!from || !to) return 0;
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

export function relativeDayLabel(input: Date | string, lang: Language = "en"): string {
  const date = toDate(input);
  if (!date) return "";
  const days = daysBetween(toDayKey(), date);
  if (days === 0) return lang === "hi" ? "आज" : "Today";
  if (days === -1) return lang === "hi" ? "कल" : "Yesterday";
  if (days === 1) return lang === "hi" ? "कल" : "Tomorrow";
  return formatDate(date, lang);
}

/** Formats a value + unit without a trailing space when the unit is empty. */
export function withUnit(value: string | number, unit?: string | null): string {
  return unit ? `${value} ${unit}` : String(value);
}

/** Truncates for previews while respecting word boundaries. */
export function truncate(text: string, max = 160): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : max)}…`;
}
