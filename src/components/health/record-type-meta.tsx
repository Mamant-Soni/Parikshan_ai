import { FileText, Stethoscope, Syringe, FlaskConical, Scan, ClipboardList } from "lucide-react";
import type { TranslationKey } from "@/lib/i18n";

/**
 * Record types → emoji, icon, badge tone and dictionary label.
 *
 * This module deliberately has no `"use client"` directive so that both server
 * pages (dashboard, records list, record detail, summary) and client components
 * can read the same metadata without duplicating it.
 */
export const RECORD_TYPE_META: Record<
  string,
  { emoji: string; icon: React.ReactNode; labelKey: TranslationKey; variant: "brand" | "info" | "good" | "neutral" | "watch" }
> = {
  PRESCRIPTION: { emoji: "💊", icon: <FileText className="size-5" aria-hidden="true" />, labelKey: "recordType.PRESCRIPTION", variant: "brand" },
  LAB_REPORT: { emoji: "🧪", icon: <FlaskConical className="size-5" aria-hidden="true" />, labelKey: "recordType.LAB_REPORT", variant: "info" },
  DOCTOR_VISIT: { emoji: "👨‍⚕️", icon: <Stethoscope className="size-5" aria-hidden="true" />, labelKey: "recordType.DOCTOR_VISIT", variant: "good" },
  DISCHARGE_SUMMARY: { emoji: "🏥", icon: <ClipboardList className="size-5" aria-hidden="true" />, labelKey: "recordType.DISCHARGE_SUMMARY", variant: "neutral" },
  VACCINATION: { emoji: "💉", icon: <Syringe className="size-5" aria-hidden="true" />, labelKey: "recordType.VACCINATION", variant: "good" },
  IMAGING: { emoji: "🩻", icon: <Scan className="size-5" aria-hidden="true" />, labelKey: "recordType.IMAGING", variant: "neutral" },
  OTHER: { emoji: "📄", icon: <FileText className="size-5" aria-hidden="true" />, labelKey: "recordType.OTHER", variant: "neutral" },
};

export function recordTypeMeta(type: string) {
  return RECORD_TYPE_META[type] ?? RECORD_TYPE_META.OTHER;
}
