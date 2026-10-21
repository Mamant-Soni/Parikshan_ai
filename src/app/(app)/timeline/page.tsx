import Link from "next/link";
import type { Metadata } from "next";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TimelineExplorer } from "@/components/timeline/timeline-explorer";
import { EmptyState, PageHeader } from "@/components/health/states";
import { requireUser } from "@/lib/auth/session";
import { getActiveProfile } from "@/lib/auth/guards";
import { getTimelineRecords } from "@/lib/database/queries";
import { createTranslator } from "@/lib/i18n";
import type { Language } from "@/types/domain";

export const metadata: Metadata = { title: "Health timeline" };

/** Chronological history of every document for the active profile. */
export default async function TimelinePage() {
  const user = await requireUser();
  const profile = await getActiveProfile(user.id);
  const records = await getTimelineRecords(profile.id);
  const lang: Language = user.preferences?.language === "hi" ? "hi" : "en";
  const t = createTranslator(lang);

  const entries = records.map((record) => ({
    id: record.id,
    type: record.type,
    title: record.title,
    recordDate: record.recordDate.toISOString(),
    doctorName: record.doctorName,
    facilityName: record.facilityName,
    diagnosisTerms: record.diagnosisTerms,
    labCount: record.labCount,
    medicineCount: record.medicineCount,
    plainSummary: record.plainSummary,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("timeline.title")}
        description={t("timeline.subtitle", { name: profile.name })}
        emoji="🕰️"
        action={
          <Button asChild>
            <Link href="/upload">
              <Upload aria-hidden="true" />
              {t("timeline.uploadRecord")}
            </Link>
          </Button>
        }
      />

      {entries.length === 0 ? (
        <EmptyState
          title={t("timeline.empty")}
          description={t("timeline.emptyBody")}
          actionLabel={t("nav.upload")}
          actionHref="/upload"
        />
      ) : (
        <TimelineExplorer entries={entries} />
      )}
    </div>
  );
}
