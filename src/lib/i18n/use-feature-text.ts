"use client";

import { useI18n } from "@/components/providers/i18n-provider";
import { featureText, type FeatureKey } from "./features";

/** Feature-string translator bound to the current UI language (falls back to English). */
export function useFeatureText() {
  const { lang } = useI18n();
  return (key: FeatureKey, vars?: Record<string, string | number>) => featureText(lang, key, vars);
}
