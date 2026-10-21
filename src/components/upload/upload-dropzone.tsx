"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Camera, FileText, Loader2, Sparkles, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useI18n } from "@/components/providers/i18n-provider";
import { useActiveProfile } from "@/components/providers/profile-provider";
import { ErrorState } from "@/components/health/states";
import { uploadRecordAction } from "@/lib/actions/records";
import { formatBytes, isAllowedType } from "@/lib/uploads/limits";
import { cn } from "@/lib/utils";

/** Samples let a judge (or a curious user) run the whole pipeline with no file. */
const SAMPLES = [
  { key: "prescription", labelKey: "recordType.PRESCRIPTION", emoji: "💊", title: "prescription" },
  { key: "blood-report", labelKey: "recordType.LAB_REPORT", emoji: "🧪", title: "blood-report" },
  { key: "lipid-profile", labelKey: "recordType.LAB_REPORT", emoji: "🫀", title: "lipid-profile" },
  { key: "diabetes-panel", labelKey: "recordType.LAB_REPORT", emoji: "🍬", title: "diabetes-panel" },
] as const;

function createMinimalPdf(label: string): string {
  const safeLabel = label.replace(/[()\\]/g, "");
  const stream = `BT /F1 12 Tf 40 740 Td (${safeLabel}) Tj ET\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
}

export function UploadDropzone() {
  const { t, easyRead } = useI18n();
  const { activeProfile } = useActiveProfile();
  const router = useRouter();

  const [file, setFile] = React.useState<File | null>(null);
  const [sampleKey, setSampleKey] = React.useState<string | null>(null);
  const [recordType, setRecordType] = React.useState<string>("AUTO");
  const [recordDate, setRecordDate] = React.useState<string>("");
  const [isDragging, setIsDragging] = React.useState(false);
  const [processing, setProcessing] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = React.useTransition();

  const configuredMaxMb = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 10);
  const maxMb = Number.isFinite(configuredMaxMb) && configuredMaxMb > 0 ? Math.min(configuredMaxMb, 25) : 10;
  const showDemoSamples = process.env.NEXT_PUBLIC_OCR_PROVIDER?.trim().toLowerCase() === "mock";

  const acceptFile = (candidate: File | null) => {
    setError(null);
    if (!candidate) return;
    if (!isAllowedType(candidate.type, candidate.name)) {
      setError(t("upload.invalidType"));
      return;
    }
    if (candidate.size > maxMb * 1024 * 1024) {
      setError(t("upload.tooLarge", { size: maxMb }));
      return;
    }
    setSampleKey(null);
    setFile(candidate);
  };

  /** Create a valid, non-clinical PDF carrier for the explicitly enabled mock demo. */
  const makeSampleFile = (key: string): File => {
    const body = createMinimalPdf(`PARIKSHAN SYNTHETIC DEMO SAMPLE ${key}`);
    return new File([body], `sample-${key}-${activeProfile.name.replace(/\s+/g, "-").toLowerCase()}.pdf`, {
      type: "application/pdf",
    });
  };

  const runPipeline = (payloadFile: File, payloadSample: string | null) => {
    setError(null);
    setProcessing(true);

    const formData = new FormData();
    formData.set("file", payloadFile);
    formData.set("profileId", activeProfile.id);
    if (payloadSample) formData.set("sampleKey", payloadSample);
    if (recordType !== "AUTO") formData.set("recordType", recordType);
    if (recordDate) formData.set("recordDate", recordDate);

    startTransition(async () => {
      let result: Awaited<ReturnType<typeof uploadRecordAction>>;
      try {
        result = await uploadRecordAction({ ok: false }, formData);
      } catch {
        setProcessing(false);
        setError(t("error.ocrFailed"));
        return;
      }
      setProcessing(false);

      if (!result.ok || !result.recordId) {
        const errorCopy: Record<string, string> = {
          INVALID_TYPE: t("upload.invalidType"),
          TOO_LARGE: t("upload.tooLarge", { size: maxMb }),
          FORBIDDEN: t("error.forbidden"),
          INVALID_DOCUMENT: t("upload.invalidDocument"),
          UNSUPPORTED_DOCUMENT: t("upload.invalidType"),
          MIME_MISMATCH: t("upload.mimeMismatch"),
          IMAGE_DIMENSIONS_INVALID: t("upload.invalidDocument"),
          IMAGE_TOO_LARGE: t("upload.imageTooLarge"),
          PDF_ENCRYPTED: t("upload.encryptedPdf"),
          PDF_TOO_MANY_PAGES: t("upload.tooManyPages"),
          OCR_EMPTY: t("upload.ocrNoText"),
          OCR_PROVIDER_UNAVAILABLE: t("upload.ocrUnavailable"),
          DEMO_OCR_DISABLED: t("upload.ocrUnavailable"),
        };
        setError(errorCopy[result.error ?? ""] ?? t("error.ocrFailed"));
        return;
      }

      toast.success(t("processing.done"));
      router.push(`/records/${result.recordId}?review=1`);
    });
  };

  const handleSubmit = () => {
    if (!file && !sampleKey) {
      setError(t("upload.invalidType"));
      return;
    }
    const payloadFile = file ?? makeSampleFile(sampleKey ?? "blood-report");
    runPipeline(payloadFile, sampleKey);
  };

  // ── Processing state ─────────────────────────────────────────────────────
  if (processing || isPending) {
    return (
      <Card aria-live="polite">
        <CardContent className="space-y-5 py-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="relative flex size-16 items-center justify-center rounded-full bg-brand-50">
              <span aria-hidden="true" className="absolute inset-0 animate-[pulse-ring_1.8s_ease-out_infinite] rounded-full bg-brand-200" />
              <Loader2 className="size-8 animate-spin text-brand-600" aria-hidden="true" />
            </span>
            <h2 className="text-xl font-semibold text-ink-900">{t("processing.title")}</h2>
            <p className="max-w-md text-sm text-muted">{t("processing.pleaseWait")}</p>
          </div>

          <Progress value={null} aria-label={t("processing.title")} />
          <p className="text-center text-xs text-muted">{t("processing.reading")}</p>
        </CardContent>
      </Card>
    );
  }

  // ── Upload form ──────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {error && (
        <ErrorState
          title={t("error.ocrFailed")}
          description={error}
          onRetry={() => {
            setError(null);
            setFile(null);
            setSampleKey(null);
          }}
          retryLabel={t("common.tryAgain")}
          secondaryLabel={t("common.uploadAnotherFile")}
          secondaryHref="/upload"
        />
      )}

      <Card>
        <CardContent className="space-y-4">
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              acceptFile(event.dataTransfer.files?.[0] ?? null);
            }}
            className={cn(
              "flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed p-6 text-center transition-colors sm:p-10",
              isDragging ? "border-brand-400 bg-brand-50" : "border-ink-300 bg-ink-50/40",
            )}
          >
            <span aria-hidden="true" className="text-4xl">
              📄
            </span>
            <p className="text-lg font-semibold text-ink-900">{t("upload.dropHere")}</p>
            <p className="text-sm text-muted">{t("upload.supported", { size: maxMb })}</p>

            <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
              <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
                <UploadCloud aria-hidden="true" />
                {t("upload.chooseFile")}
              </Button>
              <Button type="button" variant="secondary" onClick={() => cameraInputRef.current?.click()}>
                <Camera aria-hidden="true" />
                {t("upload.useCamera")}
              </Button>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              className="sr-only"
              aria-label={t("upload.chooseFile")}
              onChange={(event) => acceptFile(event.target.files?.[0] ?? null)}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/jpeg,image/png"
              capture="environment"
              className="sr-only"
              aria-label={t("upload.useCamera")}
              onChange={(event) => acceptFile(event.target.files?.[0] ?? null)}
            />

            <p className="text-xs text-muted a11y-hide">{t("upload.dropzoneHint")}</p>
          </div>

          {file && (
            <div className="flex items-center gap-3 rounded-2xl border border-brand-200 bg-brand-50 p-3">
              <FileText className="size-5 shrink-0 text-brand-700" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink-900">{file.name}</p>
                <p className="text-xs text-muted">
                  {t("upload.fileReady")} · {formatBytes(file.size)}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("upload.removeFile")}
                onClick={() => setFile(null)}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="recordType">{t("upload.recordType")}</Label>
              <Select value={recordType} onValueChange={setRecordType}>
                <SelectTrigger id="recordType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AUTO">{t("common.all")} — {t("review.documentType")}</SelectItem>
                  <SelectItem value="PRESCRIPTION">{t("recordType.PRESCRIPTION")}</SelectItem>
                  <SelectItem value="LAB_REPORT">{t("recordType.LAB_REPORT")}</SelectItem>
                  <SelectItem value="DOCTOR_VISIT">{t("recordType.DOCTOR_VISIT")}</SelectItem>
                  <SelectItem value="DISCHARGE_SUMMARY">{t("recordType.DISCHARGE_SUMMARY")}</SelectItem>
                  <SelectItem value="VACCINATION">{t("recordType.VACCINATION")}</SelectItem>
                  <SelectItem value="IMAGING">{t("recordType.IMAGING")}</SelectItem>
                  <SelectItem value="OTHER">{t("recordType.OTHER")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="recordDate">{t("upload.recordDateLabel")}</Label>
              <Input
                id="recordDate"
                type="date"
                value={recordDate}
                onChange={(event) => setRecordDate(event.target.value)}
                max={new Date().toISOString().slice(0, 10)}
              />
            </div>
          </div>

          <Button type="button" size="lg" className="w-full" onClick={handleSubmit} disabled={!file && !sampleKey}>
            <Sparkles aria-hidden="true" />
            {t("upload.process")}
          </Button>
        </CardContent>
      </Card>

      {/* Synthetic shortcuts exist only in explicit mock mode, never in normal uploads. */}
      {showDemoSamples && <Card className="border-dashed">
        <CardContent className="space-y-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-ink-900">
              <Sparkles className="size-5 text-brand-600" aria-hidden="true" />
              {t("landing.tryDemo")}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {t("disclaimer.demoNote")}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {SAMPLES.map((sample) => (
              <Button
                key={sample.key}
                type="button"
                variant={sampleKey === sample.key ? "primary" : "secondary"}
                onClick={() => {
                  setSampleKey(sample.key);
                  setFile(null);
                  setError(null);
                }}
                className="justify-start"
                aria-pressed={sampleKey === sample.key}
              >
                <span aria-hidden="true">{sample.emoji}</span>
                <span className="truncate text-sm">{t(sample.labelKey)}</span>
              </Button>
            ))}
          </div>
          {sampleKey && (
            <p className="text-sm text-brand-700">
              {t("upload.fileReady")}: {sampleKey} — {t("upload.processing")}
            </p>
          )}
        </CardContent>
      </Card>}

      {easyRead && <p className="text-sm text-muted">{t("upload.hintSize")}</p>}
    </div>
  );
}
