"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useFeatureText } from "@/lib/i18n/use-feature-text";
import type { ReadinessCheck, ReadinessLevel } from "@/lib/safety/readiness";
import type { FeatureKey } from "@/lib/i18n/features";

const CHECK_KEY: Record<string, FeatureKey> = {
  contacts: "emergency.checkContacts",
  verified: "emergency.checkVerified",
  consent: "emergency.checkConsent",
  card: "emergency.checkCard",
  provider: "emergency.checkNoProvider",
};

/**
 * Readiness: what is set up in Parikshan. It deliberately uses neutral wording —
 * it never says the user is medically safe or that help is guaranteed.
 */
export function ReadinessCard({ level, checks, onRunTest }: { level: ReadinessLevel; checks: ReadinessCheck[]; onRunTest: () => void }) {
  const ft = useFeatureText();
  const meta = {
    READY: { label: ft("emergency.readyLabel"), variant: "good" as const, icon: CheckCircle2 },
    NEEDS_ATTENTION: { label: ft("emergency.attentionLabel"), variant: "watch" as const, icon: AlertTriangle },
    ACTION_REQUIRED: { label: ft("emergency.actionLabel"), variant: "alert" as const, icon: ShieldAlert },
  }[level];
  const Icon = meta.icon;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ft("emergency.readinessTitle")}</CardTitle>
        <CardDescription>{ft("emergency.readinessNote")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={meta.variant} size="lg" className="gap-2 text-sm" role="status" aria-live="polite">
            <Icon className="size-4" aria-hidden="true" />
            {meta.label}
          </Badge>
        </div>
        <ul className="space-y-2" aria-label={ft("emergency.readinessTitle")}>
          {checks.map((check) => (
            <li key={check.id} className="flex items-start gap-2 text-base text-ink-800">
              {check.passed ? (
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-good-600" aria-hidden="true" />
              ) : (
                <CircleDashed className="mt-0.5 size-5 shrink-0 text-ink-400" aria-hidden="true" />
              )}
              <span>
                {ft(CHECK_KEY[check.id])}{" "}
                <span className="sr-only">({check.passed ? ft("emergency.statusYes") : ft("emergency.statusNo")})</span>
              </span>
            </li>
          ))}
        </ul>
        <button type="button" onClick={onRunTest} className="text-sm font-semibold text-brand-700 underline underline-offset-4 hover:text-brand-800">
          {ft("emergency.runTest")}
        </button>
      </CardContent>
    </Card>
  );
}
