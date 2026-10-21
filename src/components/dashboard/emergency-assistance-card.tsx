import Link from "next/link";
import { ArrowRight, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmergencyCallButton } from "@/components/emergency/emergency-call-button";
import { featureText, type FeatureKey } from "@/lib/i18n/features";
import type { ReadinessLevel } from "@/lib/safety/readiness";
import type { Language } from "@/types/domain";

const LEVEL_KEY: Record<ReadinessLevel, FeatureKey> = {
  READY: "emergency.readyLabel",
  NEEDS_ATTENTION: "emergency.attentionLabel",
  ACTION_REQUIRED: "emergency.actionLabel",
};

const LEVEL_VARIANT: Record<ReadinessLevel, "good" | "watch" | "alert"> = {
  READY: "good",
  NEEDS_ATTENTION: "watch",
  ACTION_REQUIRED: "alert",
};

/**
 * Emergency entry point on the dashboard.
 *
 * Deliberately different from ordinary navigation (alert-red surface, phone
 * icon) but still safe: the primary button opens a confirmation dialog, and
 * only the second tap follows a `tel:` link. The side link opens the emergency
 * page with contacts, card, location message and readiness details.
 */
export function EmergencyAssistanceCard({
  lang,
  number,
  level,
  contactCount,
}: {
  lang: Language;
  number: string;
  level: ReadinessLevel;
  contactCount: number;
}) {
  return (
    <Card className="relative overflow-hidden border-alert-100 bg-alert-50/70 ring-1 ring-alert-100">
      <CardContent className="flex h-full flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-alert-700">
              <ShieldAlert className="size-4" aria-hidden="true" />
              {featureText(lang, "emergency.dashboardReadiness")}
            </p>
            <h2 className="mt-1 text-lg font-semibold leading-snug text-ink-900">
              {featureText(lang, "emergency.buttonLabel")}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-700">
              {featureText(lang, "emergency.dashboardCardBody")}
            </p>
          </div>
          <Badge variant={LEVEL_VARIANT[level]}>{featureText(lang, LEVEL_KEY[level])}</Badge>
        </div>

        {contactCount === 0 && (
          <p className="rounded-xl bg-surface/70 px-3 py-2 text-sm text-ink-700">
            {featureText(lang, "contacts.empty")}
          </p>
        )}

        <div className="mt-auto flex flex-wrap items-center gap-2">
          <EmergencyCallButton number={number} variant="danger" />
          <Button asChild variant="secondary">
            <Link href="/emergency">
              {featureText(lang, "emergency.manageCard")}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>

        <p className="text-xs leading-relaxed text-ink-600">
          {featureText(lang, "emergency.siteNotice")}
        </p>
      </CardContent>
    </Card>
  );
}
