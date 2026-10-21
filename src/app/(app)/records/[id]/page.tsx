import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { AISummaryCard } from "@/components/health/ai-summary-card";
import { RecordReview } from "@/components/records/record-review";
import { PageHeader } from "@/components/health/states";
import { DeleteRecordButton } from "@/components/records/delete-record-button";
import { requireUser } from "@/lib/auth/session";
import { getRecordDetail, parseCorrectionCount, parseSummarySections, safeJsonArray } from "@/lib/database/queries";
import { recordTypeMeta } from "@/components/health/record-type-meta";
import { createTranslator } from "@/lib/i18n";
import { formatLongDate } from "@/lib/i18n/format";
import type { Language, RecordStatus } from "@/types/domain";

export const metadata: Metadata = { title: "Record details" };

const STATUS_VARIANT: Record<string, "good" | "watch" | "info" | "neutral"> = {
  READY: "good",
  NEEDS_REVIEW: "watch",
  PROCESSING: "info",
  FAILED: "neutral",
};

/**
 * OCR result screen — "Here's what we found in your document".
 *
 * Renders the stored extraction (never a fresh OCR pass, so the numbers the user
 * corrected are the numbers that stay), plus the grounded AI summary.
 */
export default async function RecordDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ review?: string }>;
}) {
  const { id } = await params;
  const { review } = await searchParams;
  const user = await requireUser();

  const record = await getRecordDetail(id);
  // Ownership check before rendering anything: a record id from another account
  // must look like it does not exist.
  if (!record || record.profile.userId !== user.id) notFound();

  const lang: Language = user.preferences?.language === "hi" ? "hi" : "en";
  const t = createTranslator(lang);
  const meta = recordTypeMeta(record.type);
  const storedSummary = parseSummarySections(record.aiSummary);

  const status = (record.status ?? "READY") as RecordStatus;

  return (
    <div className="space-y-5">
      <PageHeader
        title={record.title}
        description={`${t(meta.labelKey)} · ${formatLongDate(record.recordDate, lang)}`}
        emoji={meta.emoji}
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <Link href="/records">
                <ArrowLeft aria-hidden="true" />
                {t("records.title")}
              </Link>
            </Button>
            <DeleteRecordButton
              recordId={record.id}
              title={record.title}
              label={t("common.delete")}
              confirmLabel={t("records.deleteConfirm")}
            />
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={meta.variant}>{t(meta.labelKey)}</Badge>
        <Badge variant={STATUS_VARIANT[status] ?? "neutral"}>
          {status === "READY" ? t("review.statusReady") : t(`review.status${status}` as "review.statusProcessing")}
        </Badge>
        {record.ocrProvider && <Badge variant="neutral">{record.ocrProvider}</Badge>}
        {record.aiProvider && <Badge variant="info">{t("summary.generatedBy", { provider: record.aiProvider })}</Badge>}
      </div>

      {review === "1" && (
        <Alert variant="brand">
          <p className="text-sm leading-relaxed">{t("review.welcome")}</p>
        </Alert>
      )}

      {status === "NEEDS_REVIEW" && (
        <Alert variant="watch">
          <p className="text-sm leading-relaxed">{t("review.needsReviewNote")}</p>
        </Alert>
      )}

      <AISummaryCard
        recordId={record.id}
        initialSummary={storedSummary}
        initialProvider={record.aiProvider}
        initialIsMock={Boolean(record.ocrProvider?.toLowerCase().includes("mock") || record.aiProvider?.toLowerCase().includes("mock"))}
      />

      <RecordReview
        record={{
          id: record.id,
          type: record.type,
          title: record.title,
          recordDate: record.recordDate.toISOString(),
          doctorName: record.doctorName,
          facilityName: record.facilityName,
          rawText: record.rawText,
          ocrProvider: record.ocrProvider,
          hasFile: Boolean(record.filePath),
          diagnosisTerms: safeJsonArray(record.diagnosisTerms),
        }}
        labs={record.labResults.map((lab) => ({
          id: lab.id,
          testName: lab.testName,
          value: lab.value,
          unit: lab.unit,
          referenceRange: lab.referenceRange,
          status: lab.status,
        }))}
        medicines={record.medications.map((medicine) => ({
          id: medicine.id,
          name: medicine.name,
          dosage: medicine.dosage,
          frequency: medicine.frequency,
          duration: medicine.duration,
        }))}
        confidence={record.ocrConfidence}
        warnings={[]}
        correctionCount={parseCorrectionCount(record.corrections)}
      />
    </div>
  );
}
