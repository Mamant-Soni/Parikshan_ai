"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Edit3, Eye, FileText, Info, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/components/providers/i18n-provider";
import { ReadAloudButton } from "@/components/layout/read-aloud-button";
import { ResultStatusPill } from "@/components/health/status-pill";
import { saveRecordCorrectionAction, updateRecordMetaAction } from "@/lib/actions/records";
import { formatLongDate } from "@/lib/i18n/format";
import { recordTypeMeta } from "@/components/health/record-type-meta";
import type { TranslationKey } from "@/lib/i18n";
import { RECORD_TYPES } from "@/types/domain";

/**
 * "Here's what we found" — the OCR review screen.
 *
 * Every extracted field can be corrected, because OCR is never perfect (and
 * handwriting is worse). Corrections are written back to the database, metrics
 * are recalculated, and the record is marked as human-verified.
 */

type LabRow = {
  id: string;
  testName: string;
  value: string;
  unit: string | null;
  referenceRange: string | null;
  status: string;
  sourceText: string | null;
  sourcePage: number | null;
  confidence: number | null;
  reviewStatus: string;
  classificationReason: string | null;
  criticalFlag: boolean;
  warnings: string[];
};

type MedicineRow = {
  id: string;
  name: string;
  dosage: string | null;
  frequency: string | null;
  duration: string | null;
};

function classificationReasonKey(lab: LabRow): TranslationKey {
  if (lab.status === "CRITICAL") return "result.reason.CRITICAL";
  if (lab.criticalFlag && lab.status === "UNKNOWN") return "result.reason.CRITICAL_UNCERTAIN";
  if (lab.status === "WITHIN_RANGE") return "result.reason.WITHIN_RANGE";
  if (lab.status === "BELOW_RANGE") {
    return lab.classificationReason?.startsWith("The source report flags")
      ? "result.reason.SOURCE_LOW"
      : "result.reason.BELOW_RANGE";
  }
  if (lab.status === "ABOVE_RANGE") {
    return lab.classificationReason?.startsWith("The source report flags")
      ? "result.reason.SOURCE_HIGH"
      : "result.reason.ABOVE_RANGE";
  }
  return "result.reason.UNKNOWN";
}

type EditTarget =
  | { kind: "record"; field: "title" | "doctorName" | "facilityName" | "recordDate"; label: string; value: string }
  | { kind: "lab"; id: string; field: "value" | "unit" | "referenceRange"; label: string; value: string }
  | { kind: "medication"; id: string; field: "name" | "dosage" | "frequency" | "duration"; label: string; value: string };

export function RecordReview({
  record,
  labs,
  medicines,
  confidence,
  warnings,
  correctionCount,
}: {
  record: {
    id: string;
    type: string;
    title: string;
    recordDate: string;
    doctorName: string | null;
    facilityName: string | null;
    rawText: string | null;
    ocrProvider: string | null;
    hasFile: boolean;
    diagnosisTerms: string[];
  };
  labs: LabRow[];
  medicines: MedicineRow[];
  confidence: number | null;
  warnings: string[];
  correctionCount: number;
}) {
  const { t, lang, easyRead } = useI18n();
  const router = useRouter();
  const [target, setTarget] = React.useState<EditTarget | null>(null);
  const [metaOpen, setMetaOpen] = React.useState(false);
  const [showRaw, setShowRaw] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  const meta = recordTypeMeta(record.type);
  const confidencePercent = confidence ? Math.round(confidence * 100) : null;
  const lowConfidence = confidencePercent !== null && confidencePercent < 75;
  const assessableLabs = labs.filter((lab) =>
    lab.reviewStatus === "CONFIRMED" || ((lab.confidence ?? 0) >= 0.75 && lab.status !== "UNKNOWN"),
  );
  const findingCounts = {
    inRange: assessableLabs.filter((lab) => lab.status === "WITHIN_RANGE").length,
    abnormal: assessableLabs.filter((lab) => lab.status === "BELOW_RANGE" || lab.status === "ABOVE_RANGE").length,
    critical: assessableLabs.filter((lab) => lab.status === "CRITICAL").length,
    needsReview: labs.length - assessableLabs.length,
  };

  const saveEdit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!target) return;
    const formData = new FormData(event.currentTarget);
    const value = String(formData.get("value") ?? "").trim();
    const current = target;

    startTransition(async () => {
      const result =
        current.kind === "record"
          ? await saveRecordCorrectionAction({ recordId: record.id, field: current.field, value, target: "record" })
          : current.kind === "lab"
            ? await saveRecordCorrectionAction({
                recordId: record.id,
                field: current.field,
                value,
                target: "labResult",
                targetId: current.id,
              })
            : await saveRecordCorrectionAction({
                recordId: record.id,
                field: current.field,
                value,
                target: "medication",
                targetId: current.id,
              });

      if (!result.ok) {
        toast.error(t("error.saveFailed"));
        return;
      }
      toast.success(t("common.saved"));
      setTarget(null);
      router.refresh();
    });
  };

  const saveMeta = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("recordId", record.id);
    startTransition(async () => {
      const result = await updateRecordMetaAction({ ok: false }, formData);
      if (!result.ok) {
        toast.error(t("error.saveFailed"));
        return;
      }
      toast.success(t("common.saved"));
      setMetaOpen(false);
      router.refresh();
    });
  };

  const spokenText = [
    `${record.title}. ${formatLongDate(record.recordDate, lang)}.`,
    medicines.length ? `${t("review.medicinesFound")}: ${medicines.map((m) => `${m.name} ${m.dosage ?? ""} ${m.frequency ?? ""}`).join(", ")}.` : "",
    labs.length ? `${t("review.labValuesFound")}: ${labs.map((lab) => `${lab.testName} ${lab.value} ${lab.unit ?? ""}`).join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">{t("review.documentInfo")}</CardTitle>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
              <Badge variant={meta.variant}>{t(meta.labelKey)}</Badge>
              {record.ocrProvider && <span>{record.ocrProvider}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ReadAloudButton text={spokenText} size="icon" />
            <Button variant="secondary" onClick={() => setMetaOpen(true)}>
              <Pencil aria-hidden="true" />
              {t("review.editRecordDetails")}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <InfoBlock
              label={t("review.documentType")}
              value={t(meta.labelKey)}
              onEdit={() => setMetaOpen(true)}
            />
            <InfoBlock
              label={t("review.date")}
              value={formatLongDate(record.recordDate, lang)}
              onEdit={() =>
                setTarget({
                  kind: "record",
                  field: "recordDate",
                  label: t("review.date"),
                  value: record.recordDate.slice(0, 10),
                })
              }
            />
            <InfoBlock
              label={t("review.doctor")}
              value={record.doctorName ?? "—"}
              onEdit={() =>
                setTarget({ kind: "record", field: "doctorName", label: t("review.doctor"), value: record.doctorName ?? "" })
              }
            />
            <InfoBlock
              label={t("review.facility")}
              value={record.facilityName ?? "—"}
              onEdit={() =>
                setTarget({
                  kind: "record",
                  field: "facilityName",
                  label: t("review.facility"),
                  value: record.facilityName ?? "",
                })
              }
            />
          </dl>

          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-ink-50 p-3">
            <span className="text-sm font-medium text-ink-700">{t("review.confidence")}:</span>
            {confidencePercent !== null && (
              <Badge variant={lowConfidence ? "watch" : "good"}>
                {lowConfidence ? <AlertTriangle className="size-3.5" aria-hidden="true" /> : <CheckCircle2 className="size-3.5" aria-hidden="true" />}
                {confidencePercent}%
              </Badge>
            )}
            <span className="text-sm text-muted">
              {lowConfidence ? t("review.confidenceLow") : t("review.confidenceGood")}
            </span>
            {correctionCount > 0 && <Badge variant="good">{t("review.markedVerified")}</Badge>}
          </div>

          {(lowConfidence || warnings.length > 0) && !easyRead && (
            <Alert variant="watch">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-watch-600" aria-hidden="true" />
              <div className="space-y-1 text-sm">
                <p className="font-semibold">{t("review.looksIncorrect")}</p>
                <p>{t("review.looksIncorrectBody")}</p>
                {warnings.slice(0, 3).map((warning, index) => (
                  <p key={index} className="text-muted">
                    {warning}
                  </p>
                ))}
              </div>
            </Alert>
          )}
        </CardContent>
      </Card>

      {medicines.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("review.medicinesFound")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[34rem] border-collapse text-left">
                <thead>
                  <tr className="border-b border-ink-200 text-sm text-ink-600">
                    <th scope="col" className="py-2 pr-3 font-medium">{t("review.medicine")}</th>
                    <th scope="col" className="py-2 pr-3 font-medium">{t("review.dosage")}</th>
                    <th scope="col" className="py-2 pr-3 font-medium">{t("review.frequency")}</th>
                    <th scope="col" className="py-2 pr-3 font-medium">{t("review.duration")}</th>
                    <th scope="col" className="py-2 font-medium">
                      <span className="sr-only">{t("common.edit")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {medicines.map((medicine) => (
                    <tr key={medicine.id} className="border-b border-ink-100 last:border-0">
                      <td className="py-2.5 pr-3 font-medium text-ink-900">{medicine.name}</td>
                      <td className="py-2.5 pr-3 text-ink-700">{medicine.dosage ?? "—"}</td>
                      <td className="py-2.5 pr-3 text-ink-700">{medicine.frequency ?? "—"}</td>
                      <td className="py-2.5 pr-3 text-ink-700">{medicine.duration ?? "—"}</td>
                      <td className="py-2.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            setTarget({
                              kind: "medication",
                              id: medicine.id,
                              field: "dosage",
                              label: `${medicine.name} — ${t("review.dosage")}`,
                              value: medicine.dosage ?? "",
                            })
                          }
                          aria-label={t("review.editField", { field: medicine.name })}
                        >
                          <Edit3 aria-hidden="true" />
                          {t("common.edit")}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {labs.length > 0 && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{t("review.labValuesFound")}</CardTitle>
            <Badge variant="neutral">{t("timeline.valuesExtracted", { count: labs.length })}</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="flex flex-wrap gap-2" aria-label={t("review.findingSummary")}>
              <li><Badge variant="good">{t("review.inRangeCount", { count: findingCounts.inRange })}</Badge></li>
              <li><Badge variant="watch">{t("review.abnormalCount", { count: findingCounts.abnormal })}</Badge></li>
              {findingCounts.critical > 0 && <li><Badge variant="alert">{t("review.criticalCount", { count: findingCounts.critical })}</Badge></li>}
              {findingCounts.needsReview > 0 && <li><Badge variant="neutral">{t("review.needsReviewCount", { count: findingCounts.needsReview })}</Badge></li>}
            </ul>
            <p className="text-xs text-muted">{t("result.statusDisclaimer")}</p>
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full min-w-[38rem] border-collapse text-left">
                <thead>
                  <tr className="border-b border-ink-200 text-sm text-ink-600">
                    <th scope="col" className="py-2 pr-3 font-medium">{t("review.testName")}</th>
                    <th scope="col" className="py-2 pr-3 font-medium">{t("review.value")}</th>
                    <th scope="col" className="py-2 pr-3 font-medium">{t("review.unit")}</th>
                    <th scope="col" className="py-2 pr-3 font-medium">{t("review.referenceRange")}</th>
                    <th scope="col" className="py-2 pr-3 font-medium">{t("review.result")}</th>
                    <th scope="col" className="py-2 font-medium">
                      <span className="sr-only">{t("common.edit")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {labs.map((lab) => (
                    <tr key={lab.id} className="border-b border-ink-100 last:border-0">
                      <td className="py-2.5 pr-3 font-medium text-ink-900">
                        <p>{lab.testName}</p>
                        <p className="mt-1 text-xs font-normal text-muted">
                          {lab.sourcePage ? t("review.sourcePage", { page: lab.sourcePage }) : t("result.UNKNOWN")}
                          {lab.confidence !== null && ` · ${t("review.ocrConfidence", { confidence: Math.round(lab.confidence * 100) })}`}
                        </p>
                        {lab.sourceText && (
                          <details className="mt-1 text-xs font-normal text-muted">
                            <summary className="cursor-pointer underline underline-offset-2">{t("review.sourceText")}</summary>
                            <q className="mt-1 block break-words">{lab.sourceText}</q>
                          </details>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 font-semibold text-ink-900">{lab.value}</td>
                      <td className="py-2.5 pr-3 text-ink-700">{lab.unit ?? "—"}</td>
                      <td className="py-2.5 pr-3 text-ink-700">{lab.referenceRange ?? "—"}</td>
                      <td className="py-2.5 pr-3">
                        <div className="flex min-w-36 flex-col items-start gap-1.5">
                          <ResultStatusPill status={lab.status} />
                          <Badge variant={lab.reviewStatus === "CONFIRMED" ? "good" : "neutral"}>
                            {lab.reviewStatus === "CONFIRMED" ? t("review.markedVerified") : t("review.needsReview")}
                          </Badge>
                          {lab.classificationReason && (
                            <p className="max-w-64 text-xs text-muted">
                              <span className="font-medium">{t("review.classificationReason")}:</span> {t(classificationReasonKey(lab))}
                            </p>
                          )}
                          {lab.warnings.map((warning, index) => <p key={index} className="max-w-64 text-xs text-watch-700">{warning}</p>)}
                        </div>
                      </td>
                      <td className="py-2.5">
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setTarget({ kind: "lab", id: lab.id, field: "value", label: lab.testName, value: lab.value })
                            }
                            aria-label={t("review.editField", { field: lab.testName })}
                          >
                            <Edit3 aria-hidden="true" />
                            {t("common.edit")}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {labs.length === 0 && medicines.length === 0 && (
        <Alert variant="neutral">
          <Info className="mt-0.5 size-5 shrink-0 text-info-600" aria-hidden="true" />
          <div>
            <p className="font-semibold">{t("review.noResults")}</p>
            <p className="text-sm text-muted">{t("review.noResultsBody")}</p>
          </div>
        </Alert>
      )}

      {record.diagnosisTerms.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("review.diagnosisTerms")}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {record.diagnosisTerms.map((term) => (
              <Badge key={term} variant="neutral" size="lg">
                {term}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-3">
        {record.hasFile && (
          <Button asChild variant="secondary">
            <a href={`/api/records/${record.id}/file`} target="_blank" rel="noreferrer">
              <Eye aria-hidden="true" />
              {t("review.viewFile")}
            </a>
          </Button>
        )}
        {record.rawText && (
          <Button variant="ghost" onClick={() => setShowRaw((current) => !current)} aria-expanded={showRaw}>
            <FileText aria-hidden="true" />
            {t("review.rawText")}
          </Button>
        )}
      </div>

      {showRaw && record.rawText && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("review.rawText")}</CardTitle>
            <p className="text-sm text-muted">{t("review.rawTextHint")}</p>
          </CardHeader>
          <CardContent>
            <pre className="max-h-80 overflow-auto rounded-xl bg-ink-50 p-4 text-xs leading-relaxed text-ink-700 scrollbar-thin">
              {record.rawText}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Field edit dialog */}
      <Dialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("review.editField", { field: target?.label ?? "" })}</DialogTitle>
            <DialogDescription>{t("review.looksIncorrectBody")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveEdit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-value">{target?.label}</Label>
              <Input
                id="edit-value"
                name="value"
                defaultValue={target?.value ?? ""}
                type={target?.kind === "record" && target.field === "recordDate" ? "date" : "text"}
                autoFocus
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isPending} size="lg">
                {isPending ? t("common.saving") : t("review.saveChanges")}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setTarget(null)}>
                {t("common.cancel")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Record meta dialog */}
      <Dialog open={metaOpen} onOpenChange={setMetaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("review.editRecordDetails")}</DialogTitle>
            <DialogDescription>{t("review.looksIncorrectBody")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveMeta} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="meta-title">{t("review.title") ?? t("common.name")}</Label>
              <Input id="meta-title" name="title" defaultValue={record.title} required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="meta-type">{t("review.documentType")}</Label>
                <select
                  id="meta-type"
                  name="type"
                  defaultValue={record.type}
                  className="min-h-[var(--a11y-tap)] w-full rounded-xl border border-ink-200 bg-surface px-3 text-base"
                >
                  {RECORD_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(recordTypeMeta(type).labelKey)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="meta-date">{t("review.date")}</Label>
                <Input id="meta-date" name="recordDate" type="date" defaultValue={record.recordDate.slice(0, 10)} />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="meta-doctor">{t("review.doctor")}</Label>
                <Input id="meta-doctor" name="doctorName" defaultValue={record.doctorName ?? ""} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="meta-facility">{t("review.facility")}</Label>
                <Input id="meta-facility" name="facilityName" defaultValue={record.facilityName ?? ""} />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={isPending} size="lg">
                {isPending ? t("common.saving") : t("review.saveChanges")}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setMetaOpen(false)}>
                {t("common.cancel")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoBlock({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  const { t } = useI18n();
  return (
    <div className="rounded-2xl border border-ink-200 p-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 flex items-center justify-between gap-2">
        <span className="font-medium text-ink-900">{value}</span>
        <Button variant="ghost" size="sm" onClick={onEdit} aria-label={t("review.editField", { field: label })}>
          {t("common.edit")}
        </Button>
      </dd>
    </div>
  );
}
