"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmergencyCallButton } from "./emergency-call-button";
import { ReadinessCard } from "./readiness-card";
import { ContactsManager } from "./contacts-manager";
import { EmergencyCardEditor } from "./emergency-card-editor";
import { LocationShare } from "./location-share";
import { TestMode } from "./test-mode";
import { useFeatureText } from "@/lib/i18n/use-feature-text";
import type { ContactView } from "@/lib/safety/service";
import type { CardView } from "@/lib/safety/card";
import type { ReadinessCheck, ReadinessLevel } from "@/lib/safety/readiness";
import type { ShareItem } from "./types";

export type EmergencyPanelProps = {
  emergencyNumber: string;
  ownerName: string;
  contacts: ContactView[];
  card: CardView | null;
  medicines: string[];
  shareItems: ShareItem[];
  readiness: { level: ReadinessLevel; checks: ReadinessCheck[] };
  providerConfigured: boolean;
};

/**
 * The emergency panel: call 112 (with confirmation), readiness, contacts, the
 * emergency card, location sharing and the test-mode rehearsal, in that order.
 */
export function EmergencyPanel(props: EmergencyPanelProps) {
  const ft = useFeatureText();

  const runTest = () => {
    document.getElementById("test-mode")?.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("test-mode-start")?.focus();
  };

  return (
    <div className="space-y-5">
      <section aria-labelledby="call-title" className="rounded-3xl border border-alert-100 bg-alert-50 p-5 sm:p-6">
        <h2 id="call-title" className="text-lg font-semibold text-alert-700">{ft("emergency.buttonLabel")}</h2>
        <p className="mt-2 text-base text-ink-800">{ft("emergency.siteNotice")}</p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <EmergencyCallButton number={props.emergencyNumber} size="lg" className="min-h-14 text-lg" />
          <Link href="/dashboard" className="inline-flex min-h-[var(--a11y-tap)] items-center gap-2 rounded-xl px-3 text-base font-medium text-ink-800 underline underline-offset-4 hover:text-ink-900">
            <ArrowLeft className="size-4" aria-hidden="true" />
            {ft("emergency.backToDashboard")}
          </Link>
        </div>
      </section>

      <Alert variant="info">
        <Info className="mt-0.5 size-5 shrink-0 text-info-700" aria-hidden="true" />
        <AlertDescription>{ft("contacts.lockedNote")} {ft("test.body")}</AlertDescription>
      </Alert>

      <div className="grid gap-5 lg:grid-cols-2">
        <ReadinessCard level={props.readiness.level} checks={props.readiness.checks} onRunTest={runTest} />
        <ContactsManager contacts={props.contacts} providerConfigured={props.providerConfigured} />
      </div>
      <EmergencyCardEditor card={props.card} medicines={props.medicines} />
      <LocationShare ownerName={props.ownerName} contacts={props.contacts} shareItems={props.shareItems} />
      <TestMode />
    </div>
  );
}
