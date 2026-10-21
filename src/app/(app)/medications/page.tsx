import Link from "next/link";
import type { Metadata } from "next";
import { FlaskConical, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { DoseTracker, type DoseItem } from "@/components/medications/dose-tracker";
import { MedicationManager } from "@/components/medications/medication-manager";
import { EmptyState, PageHeader, SectionHeading } from "@/components/health/states";
import { requireUser } from "@/lib/auth/session";
import { getActiveProfile } from "@/lib/auth/guards";
import { getMedicationsWithDoses } from "@/lib/database/queries";
import { createTranslator } from "@/lib/i18n";
import { DOSE_SLOTS, type DoseSlot, type Language } from "@/types/domain";

export const metadata: Metadata = { title: "Medicine manager" };

/** Medicines: today's schedule, tick-off, plus the full list with add/edit. */
export default async function MedicationsPage() {
  const user = await requireUser();
  const profile = await getActiveProfile(user.id);
  const medications = await getMedicationsWithDoses(profile.id);
  const lang: Language = user.preferences?.language === "hi" ? "hi" : "en";
  const t = createTranslator(lang);

  const doseItems: DoseItem[] = medications
    .filter((medication) => medication.status === "ACTIVE")
    .flatMap((medication) =>
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
            time: log?.time ?? null,
          };
        }),
    );

  const cardData = medications.map((medication) => ({
    id: medication.id,
    name: medication.name,
    dosage: medication.dosage,
    frequency: medication.frequency,
    duration: medication.duration,
    startDate: medication.startDate,
    endDate: medication.endDate,
    status: medication.status,
    slots: medication.slotsList,
    notes: medication.notes,
    prescribedIn: medication.healthRecord?.title ?? null,
    todaysLogs: medication.todayLogs.map((log) => ({ slot: log.slot, status: log.status })),
  }));

  const activeCount = medications.filter((medication) => medication.status === "ACTIVE").length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("meds.title")}
        description={t("meds.subtitle", { name: profile.name })}
        emoji="💊"
        action={
          <Button asChild variant="secondary">
            <Link href="/interactions">
              <TriangleAlert aria-hidden="true" />
              {t("nav.interactions")}
            </Link>
          </Button>
        }
      />

      {medications.length === 0 ? (
        <EmptyState
          title={t("meds.emptyTitle")}
          description={t("meds.emptyBody")}
          actionLabel={t("nav.upload")}
          actionHref="/upload"
        />
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>{t("meds.todayTitle")}</CardTitle>
                <Badge variant="brand">{t("meds.activeCount", { count: activeCount })}</Badge>
              </CardHeader>
              <CardContent>
                <DoseTracker items={doseItems} profileId={profile.id} />
              </CardContent>
            </Card>

            <div className="space-y-5">
              <Alert variant="watch">
                <p className="text-sm leading-relaxed">{t("meds.safetyNote")}</p>
              </Alert>
              <Alert variant="neutral">
                <p className="text-sm leading-relaxed">{t("reminder.localOnly")}</p>
              </Alert>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FlaskConical className="size-5 text-brand-600" aria-hidden="true" />
                    {t("meds.fromRecords")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed text-muted">{t("meds.fromRecordsBody")}</p>
                </CardContent>
              </Card>
            </div>
          </div>

          <section aria-labelledby="all-medicines">
            <SectionHeading title={t("meds.allTitle")} description={t("meds.allBody")} />
            <h2 id="all-medicines" className="sr-only">
              {t("meds.allTitle")}
            </h2>
            <MedicationManager medications={cardData} profileId={profile.id} />
          </section>
        </>
      )}
    </div>
  );
}
