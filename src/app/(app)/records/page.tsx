import Link from "next/link";
import type { Metadata } from "next";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RecordCard } from "@/components/health/record-card";
import { EmptyState, PageHeader, SectionHeading } from "@/components/health/states";
import { requireUser } from "@/lib/auth/session";
import { getActiveProfile } from "@/lib/auth/guards";
import { getTimelineRecords } from "@/lib/database/queries";
import { createTranslator } from "@/lib/i18n";
import { recordTypeMeta } from "@/components/health/record-type-meta";
import { RECORD_TYPES, type Language } from "@/types/domain";

export const metadata: Metadata = { title: "My records" };

/** All uploaded documents for the active profile, newest first, grouped by type. */
export default async function RecordsPage() {
  const user = await requireUser();
  const profile = await getActiveProfile(user.id);
  const records = await getTimelineRecords(profile.id);
  const lang: Language = user.preferences?.language === "hi" ? "hi" : "en";
  const t = createTranslator(lang);

  const counts = RECORD_TYPES.map((type) => ({
    type,
    count: records.filter((record) => record.type === type).length,
  })).filter((entry) => entry.count > 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("records.title")}
        description={t("records.subtitle", { name: profile.name })}
        emoji="🗂️"
        action={
          <Button asChild>
            <Link href="/upload">
              <Upload aria-hidden="true" />
              {t("nav.upload")}
            </Link>
          </Button>
        }
      />

      {records.length === 0 ? (
        <EmptyState
          title={t("records.emptyTitle")}
          description={t("records.emptyBody")}
          actionLabel={t("nav.upload")}
          actionHref="/upload"
        />
      ) : (
        <>
          <section aria-labelledby="type-summary">
            <SectionHeading title={t("records.byType")} description={t("records.byTypeBody")} />
            <h2 id="type-summary" className="sr-only">
              {t("records.byType")}
            </h2>
            <ul className="flex flex-wrap gap-2">
              {counts.map((entry) => (
                <li key={entry.type}>
                  <Badge variant="neutral" size="lg">
                    {recordTypeMeta(entry.type).emoji} {t(recordTypeMeta(entry.type).labelKey)}: {entry.count}
                  </Badge>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="records-list">
            <SectionHeading
              title={t("records.allDocuments")}
              description={t("records.countLabel", { count: records.length })}
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link href="/timeline">{t("nav.timeline")}</Link>
                </Button>
              }
            />
            <h2 id="records-list" className="sr-only">
              {t("records.allDocuments")}
            </h2>
            <ul className="grid gap-3 xl:grid-cols-2">
              {records.map((record) => (
                <li key={record.id}>
                  <RecordCard
                    record={{
                      id: record.id,
                      type: record.type,
                      title: record.title,
                      recordDate: record.recordDate,
                      doctorName: record.doctorName,
                      facilityName: record.facilityName,
                      labCount: record.labCount,
                      medicineCount: record.medicineCount,
                      plainSummary: record.plainSummary,
                    }}
                  />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
