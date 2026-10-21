"use client";

import { AlertTriangle } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { useI18n } from "@/components/providers/i18n-provider";

/**
 * Shown whenever a child profile is active: the caregiver context changes how
 * the app should be used, so it says so rather than being silent about it.
 */
export function ChildModeNotice() {
  const { t } = useI18n();
  return (
    <Alert variant="brand" className="mb-4">
      <AlertTriangle className="mt-0.5 size-5 shrink-0 text-brand-600" aria-hidden="true" />
      <div className="space-y-1">
        <p className="font-semibold">{t("childMode.title")}</p>
        <p className="text-sm text-muted">{t("childMode.body")}</p>
      </div>
    </Alert>
  );
}
