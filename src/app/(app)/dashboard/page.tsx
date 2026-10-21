import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Bot, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { HealthMetricCard } from "@/components/health/health-metric-card";
import { InsightList } from "@/components/health/insight-list";
import { RecordCard } from "@/components/health/record-card";
import { DoseTracker, type DoseItem } from "@/components/medications/dose-tracker";
import { EmptyState, PageHeader, SectionHeading } from "@/components/health/states";
import { EmergencyAssistanceCard } from "@/components/dashboard/emergency-assistance-card";
import { UpcomingCareCard } from "@/components/dashboard/upcoming-care-card";
import { requireUser } from "@/lib/auth/session";
import { getActiveProfile } from "@/lib/auth/guards";
import { getDashboardSnapshot } from "@/lib/database/queries";
import { getMetric } from "@/lib/health/metrics";
import { listCareTasks } from "@/lib/care/service";
import { selectUpcomingTasks, todayIso } from "@/lib/care/upcoming";
import { activeMedicineNames, getCard, listContacts } from "@/lib/safety/service";
import { cardHasDetails } from "@/lib/safety/card";
import { computeReadiness } from "@/lib/safety/readiness";
import { getEmergencyNumber, isVerificationProviderConfigured } from "@/lib/safety/emergency-number";
import { createTranslator } from "@/lib/i18n";
import { DOSE_SLOTS, SLOT_DEFAULT_TIME, type DoseSlot, type Language } from "@/types/domain";

export const metadata: Metadata = { title: "Dashboard" };

/**
 * Health dashboard.
 *
 * Reads only the active profile's data. Featured metrics first, then the
 * arithmetic insight list, today's doses and the most recent documents.
 */
export default async function DashboardPage() {
  const user = await requireUser();
  const profile = await getActiveProfile(user.id);
  const snapshot = await getDashboardSnapshot(user.id, profile.id, profile.name);
  const lang: Language = user.preferences?.language === "hi" ? "hi" : "en";
  const t = createTranslator(lang);

  // Emergency readiness and the next few care tasks, both scoped to the active
  // profile by the service layer (a profile the user does not own yields []).
  const [contacts, emergencyCard, medicineNames, careTasks] = await Promise.all([
    listContacts(user.id, profile.id),
    getCard(user.id, profile.id),
    activeMedicineNames(user.id, profile.id),
    listCareTasks(user.id, profile.id),
  ]);
  const readiness = computeReadiness({
    contacts: contacts.map((contact) => ({
      verificationStatus: contact.verificationStatus,
      consentEmergencyInfo: contact.consentEmergencyInfo,
    })),
    cardHasDetails: cardHasDetails(emergencyCard, medicineNames),
    verificationProviderConfigured: isVerificationProviderConfigured(),
  });
  const upcomingCare = selectUpcomingTasks(careTasks, todayIso(), 3);
  const openCareCount = careTasks.filter((task) => task.status === "OPEN").length;

  const metrics = snapshot.metricSummaries.slice(0, 4).map((metric) => {
    const definition = getMetric(metric.metricKey);
    const paired = definition?.pairedWith
      ? snapshot.metricSummaries.find((entry) => entry.metricKey === definition.pairedWith)
      : undefined;
    return {
      metricKey: metric.metricKey,
      labelKey: definition?.labelKey ?? null,
      label: metric.label,
      value: metric.value,
      status: metric.status,
      unit: metric.unit,
      previousValue: metric.previousValue,
      delta: metric.delta,
      direction: metric.direction as "up" | "down" | "flat" | "unknown",
      decimals: metric.decimals ?? definition?.decimals,
      pairedValue: paired?.value,
    };
  });

  const insights = snapshot.insights.map((insight) => ({
    id: insight.id,
    metricKey: insight.metricKey,
    labelKey: insight.labelKey,
    label: insight.label,
    from: insight.from,
    to: insight.to,
    unit: insight.unit,
    direction: insight.direction,
    delta: insight.delta,
  }));

  const doseItems: DoseItem[] = snapshot.activeMedications.flatMap((medication) =>
    medication.slotsList
      .filter((slot): slot is DoseSlot => (DOSE_SLOTS as readonly string[]).includes(slot))
      .map((slot) => {
        const log = medication.todayLogs.find((entry) => entry.slot === slot);
        return {
          medicationId: medication.id,
          name: medication.name,
          dosage: medication.dosage,
          slot,
          status: log?.status ?? "PENDING",
          time: log?.time ?? SLOT_DEFAULT_TIME[slot],
        };
      }),
  );

  const hasData = snapshot.records.length > 0 || metrics.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("dashboard.greeting", { name: profile.name })}
        description={t("dashboard.subtitle")}
        emoji={profile.avatarEmoji}
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/upload">
                <Upload aria-hidden="true" />
                {t("nav.upload")}
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/assistant">
                <Bot aria-hidden="true" />
                {t("nav.assistant")}
              </Link>
            </Button>
          </div>
        }
      />

      {/* Emergency and preventive care are surfaced on the dashboard itself,
          not only in the navigation, so they are reachable in one glance. */}
      <div className="grid gap-3 lg:grid-cols-2">
        <EmergencyAssistanceCard
          lang={lang}
          number={getEmergencyNumber()}
          level={readiness.level}
          contactCount={contacts.length}
        />
        <UpcomingCareCard lang={lang} items={upcomingCare} openCount={openCareCount} />
      </div>

      {!hasData ? (
        <EmptyState
          title={t("dashboard.emptyTitle")}
          description={t("dashboard.emptyBody")}
          actionLabel={t("dashboard.emptyAction")}
          actionHref="/upload"
        />
      ) : (
        <>
          <section aria-labelledby="metrics-heading">
            <SectionHeading
              title={t("dashboard.metricsTitle")}
              description={t("dashboard.metricsSubtitle")}
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link href="/trends">
                    {t("nav.trends")}
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              }
            />
            <h2 id="metrics-heading" className="sr-only">
              {t("dashboard.metricsTitle")}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {metrics.map((metric) => (
                <li key={metric.metricKey}>
                  <HealthMetricCard metric={metric} href={`/trends?metric=${metric.metricKey}`} />
                </li>
              ))}
            </ul>
          </section>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="space-y-5">
              <InsightList insights={insights} />

              <section aria-labelledby="records-heading">
                <SectionHeading
                  title={t("dashboard.recentRecords")}
                  description={t("dashboard.recentRecordsBody")}
                  action={
                    <Button asChild variant="ghost" size="sm">
                      <Link href="/records">
                        {t("common.viewAll")}
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    </Button>
                  }
                />
                <h2 id="records-heading" className="sr-only">
                  {t("dashboard.recentRecords")}
                </h2>
                <ul className="space-y-3">
                  {snapshot.records.slice(0, 3).map((record) => (
                    <li key={record.id}>
                      <RecordCard record={record} />
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <div className="space-y-5">
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle>{t("meds.todayTitle")}</CardTitle>
                  <Badge variant={snapshot.dosesTakenToday >= snapshot.dosesScheduledToday ? "good" : "brand"}>
                    {t("reminder.progress", {
                      taken: snapshot.dosesTakenToday,
                      total: snapshot.dosesScheduledToday,
                    })}
                  </Badge>
                </CardHeader>
                <CardContent>
                  <DoseTracker items={doseItems} profileId={profile.id} />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>{t("dashboard.quickActions")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {[
                    { href: "/upload", labelKey: "landing.step1Title" as const },
                    { href: "/summary", labelKey: "nav.summary" as const },
                    { href: "/interactions", labelKey: "nav.interactions" as const },
                    { href: "/timeline", labelKey: "nav.timeline" as const },
                  ].map((action) => (
                    <Button key={action.href} asChild variant="secondary" className="w-full justify-between">
                      <Link href={action.href}>
                        {t(action.labelKey)}
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    </Button>
                  ))}
                </CardContent>
              </Card>

              <Alert variant="brand">
                <p className="text-sm leading-relaxed">{t("dashboard.privacyNote")}</p>
              </Alert>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
